import { chooseDungeonSkill, createDungeon, dungeonUltReady, isDungeonOver, rerollDungeonOffer, stepDungeon, useDungeonUltimate } from '../core/dungeon/engine';
import { synergiesUnlockedBy } from '../core/dungeon/rules';
import type { GameConfig } from '../core/model/config';
import { SKILL_IDS, type DungeonInit, type DungeonState, type SkillId } from '../core/model/dungeon';
import { nextFloat, type RngState } from '../core/rng';

/**
 * 도전 던전 자동 플레이어 — 밸런스 시뮬레이터와 밸런스 회귀 테스트가 같이 쓴다.
 * 스킬은 엔진이 제시한 셋 중에서만 고르고 다시 뽑기도 남은 횟수만큼만 쓴다 (엔진 API 가 막는다)
 */

/** 제시된 스킬 중 하나 또는 다시 뽑기 */
export type PickFn = (s: Readonly<DungeonState>, rng: RngState, cfg: GameConfig) => SkillId | 'reroll';
/** 지금 필살기를 쓸까 — 게이지가 다 찼을 때만 묻는다 */
export type UltFn = (s: Readonly<DungeonState>, rng: RngState, cfg: GameConfig, mem: UltMemory) => boolean;

export interface UltMemory {
  /** 게이지가 다 찬 시각 · 그 뒤 기다릴 시간 (무작위 사용) */
  readySince: number | null;
  wait: number;
  /** 지금 보고 있는 보스 예고 (시작 시각) · 반응할 시각 · 놓쳤는가 */
  cast: number | null;
  reactAt: number;
  missed: boolean;
}

const pickRandom = (offer: readonly SkillId[], rng: RngState) => offer[Math.floor(nextFloat(rng) * offer.length)]!;

/** 선택지에서 점수가 가장 높은 스킬 (같으면 무작위) */
function best(offer: readonly SkillId[], score: (id: SkillId) => number, rng: RngState): { id: SkillId; score: number } {
  let top: SkillId[] = [];
  let topScore = -Infinity;
  for (const id of offer) {
    const v = score(id);
    if (v > topScore) {
      top = [id];
      topScore = v;
    } else if (v === topScore) top.push(id);
  }
  return { id: pickRandom(top, rng), score: topScore };
}

/** 이 스킬이 들어가는 시너지 수 — 첫 선택에서 조합을 넓게 열어 둘 스킬 */
const synergyReach = (id: SkillId, cfg: GameConfig) => Object.values(cfg.dungeon.synergies).filter((s) => s.skills.includes(id)).length;

/** 우선순위 목록 앞쪽부터 */
const byPriority =
  (order: readonly SkillId[]): PickFn =>
  (s, rng) =>
    best(s.offer!, (id) => -order.indexOf(id), rng).id;

export const PICKS = {
  /** 아무거나 — 규칙을 모르는 사람 */
  무작위: ((s, rng) => pickRandom(s.offer!, rng)) as PickFn,
  /**
   * 시너지를 노린다 — 새 시너지를 켜는 스킬 > 가진 스킬 올리기 > 형태와 어울리는 스킬 > 시너지가 많은 스킬.
   * 2 웨이브부터 노릴 것이 하나도 없으면 다시 뽑는다
   */
  시너지: ((s, rng, cfg) => {
    const affinity = s.form ? cfg.dungeon.forms[s.form]?.affinity : undefined;
    const owned = (id: SkillId) => (s.skills[id] ?? 0) > 0;
    const pick = best(s.offer!, (id) => (synergiesUnlockedBy(id, s.skills, cfg).length > 0 ? 8 : 0) + (owned(id) ? 4 : 0) + (id === affinity ? 2 : 0) + synergyReach(id, cfg) * 0.1, rng);
    return s.wave > 0 && pick.score < 1 && s.rerolls > 0 ? 'reroll' : pick.id;
  }) as PickFn,
  /** 보호막 · 연쇄 번개(기절) · 독 순으로 버티는 조합 */
  방어: byPriority(['shield', 'chain', 'poison', 'frenzy', 'split', 'fireburst']),
  /** 화염 폭발 · 분열 · 연쇄 번개 순으로 몰아치는 조합. 보호막은 마지막 */
  공격: byPriority(['fireburst', 'split', 'chain', 'frenzy', 'poison', 'shield']),
};

/** 스킬 하나만 몰아 올린다 — 나오면 그것, 아니면 가진 스킬, 그것도 없으면 다시 뽑기 · 무작위 */
export function focusPick(target: SkillId): PickFn {
  return (s, rng) => {
    const offer = s.offer!;
    if (offer.includes(target)) return target;
    if ((s.skills[target] ?? 0) === 0 && s.rerolls > 0) return 'reroll';
    const owned = offer.filter((id) => (s.skills[id] ?? 0) > 0);
    return pickRandom(owned.length > 0 ? owned : offer, rng);
  };
}

/** 보스가 지금 막을 수 있는 큰 공격을 예고 중인가 (또는 경화 중인가) */
function bossThreat(s: Readonly<DungeonState>): { startedAt: number } | null {
  for (const m of s.monsters) {
    const b = m.boss;
    if (!b) continue;
    const kind = b.casting?.pattern.kind;
    if (b.casting && (kind === 'smash' || kind === 'breath' || kind === 'guard')) return { startedAt: b.casting.startedAt };
    if (b.guardUntil > s.now) return { startedAt: b.guardUntil - 1 };
  }
  return null;
}

/**
 * 보스가 있으면 예고를 기다렸다 쓰고, 일반 웨이브는 적이 셋 이상이거나 위험할 때 쓴다.
 * reactMs = 예고를 보고 누르기까지 걸리는 시간 [최소, 최대], miss = 예고를 놓칠 확률
 */
export function timedUlt(reactMs: readonly [number, number], miss: number): UltFn {
  return (s, rng, _cfg, mem) => {
    const sl = s.slime;
    if (s.monsters.some((m) => m.boss)) {
      const threat = bossThreat(s);
      if (!threat) return sl.hp < sl.stats.maxHp * 0.2;
      if (mem.cast !== threat.startedAt) {
        mem.cast = threat.startedAt;
        mem.reactAt = Math.max(s.now, threat.startedAt) + reactMs[0] + nextFloat(rng) * (reactMs[1] - reactMs[0]);
        mem.missed = nextFloat(rng) < miss;
      }
      return !mem.missed && s.now >= mem.reactAt;
    }
    return s.monsters.length >= 3 || sl.hp < sl.stats.maxHp * 0.35;
  };
}

export const ULTS = {
  /** 차는 대로 바로 */
  즉시: (() => true) as UltFn,
  /** 다 차고 0~8초 뒤 아무 때나 — 예고를 보지 않는 사람 */
  무작위: ((s, rng, _cfg, mem) => {
    if (mem.readySince === null) {
      mem.readySince = s.now;
      mem.wait = nextFloat(rng) * 8000;
    }
    return s.now >= mem.readySince + mem.wait;
  }) as UltFn,
  /** 예고를 보고 0.3~1.1초 뒤에 누른다, 10% 는 놓친다 — 규칙을 익힌 사람 */
  적절: timedUlt([300, 1100], 0.1),
  /** 예고 즉시 · 놓치지 않는다 */
  완벽: timedUlt([0, 0], 0),
  안씀: (() => false) as UltFn,
};

export interface RunResult {
  state: DungeonState;
  /** 고른 순서 */
  picks: SkillId[];
  rerolls: number;
}

export interface RunOptions {
  stepMs?: number;
  /** 이만큼 깨고 포기한다 (실패 보상 파밍 점검용) */
  stopAfterWaves?: number;
  /**
   * 첫 내려찍기 가르침 — 도움이 켜진 판에서 처음 내려찍기를 예고할 때 필살기가 차 있으면 게임이 멈추고 버튼을 짚어 준다.
   * 그때는 누구나 누른다고 본다
   */
  teach?: boolean;
}

/** 한 판을 끝까지 돈다. 같은 init · 전략 · botSeed 면 결과가 같다 */
export function runDungeon(init: DungeonInit, cfg: GameConfig, pick: PickFn, ult: UltFn, botSeed: number, opts: RunOptions = {}): RunResult {
  const { stepMs = 100, stopAfterWaves, teach = false } = opts;
  const rng: RngState = { s: botSeed | 0 };
  const { state } = createDungeon(init, cfg);
  const mem: UltMemory = { readySince: null, wait: 0, cast: null, reactAt: 0, missed: false };
  const picks: SkillId[] = [];
  let rerolls = 0;
  let taught = false;
  for (let guard = 0; guard < 200_000 && !isDungeonOver(state); guard++) {
    if (stopAfterWaves !== undefined && state.wavesCleared >= stopAfterWaves) {
      state.phase = 'failed';
      break;
    }
    if (teach && state.assist && !taught && dungeonUltReady(state, cfg) && state.monsters.some((m) => m.boss?.casting?.pattern.kind === 'smash')) {
      taught = true;
      useDungeonUltimate(state, cfg);
      mem.readySince = null;
    }
    if (state.phase === 'choosing') {
      const choice = pick(state, rng, cfg);
      if (choice === 'reroll' && rerollDungeonOffer(state, cfg)) {
        rerolls += 1;
        continue;
      }
      const id = choice === 'reroll' ? state.offer![0]! : choice;
      if (!chooseDungeonSkill(state, id, cfg)) throw new Error(`제시되지 않은 스킬을 골랐다: ${id}`);
      picks.push(id);
      continue;
    }
    if (dungeonUltReady(state, cfg) && state.phase === 'fighting' && state.monsters.length > 0) {
      if (ult(state, rng, cfg, mem) && useDungeonUltimate(state, cfg)) {
        mem.readySince = null;
      }
    }
    stepDungeon(state, stepMs, cfg);
  }
  return { state, picks, rerolls };
}

/** 전략 이름 → 함수 (단일 집중은 「집중:split」 꼴) */
export function pickByName(name: string): PickFn {
  if (name.startsWith('집중:')) {
    const id = name.slice(3) as SkillId;
    if (!SKILL_IDS.includes(id)) throw new Error(`모르는 스킬: ${id}`);
    return focusPick(id);
  }
  const fn = PICKS[name as keyof typeof PICKS];
  if (!fn) throw new Error(`모르는 선택 전략: ${name}`);
  return fn;
}

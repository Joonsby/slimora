/**
 * 도전 던전 밸런스 시뮬레이터 — 자동 플레이어로 스테이지 S 를 막 깬 진행을 만들고, 그 힘으로 추천 단계 · 한 단계 위를 시드마다 돌린다.
 *   npm run sim:dungeon            (스테이지 2 · 6 · 12 · 24 · 40, 시드 24개)
 *   npm run sim:dungeon -- 2 10    (스테이지 2 · 10 만)
 * 선택 전략: 무작위 · 시너지 우선. 필살기: 보스 예고에 맞춰 쓰기(잘 씀) · 차는 대로 쓰기(막 씀). 시간은 ×1 전투 시간 (선택 시간 제외)
 */
import { chooseDungeonSkill, createDungeon, isDungeonOver, stepDungeon, useDungeonUltimate, waveCount } from '../src/core/dungeon/engine';
import { activeSynergies, synergiesUnlockedBy } from '../src/core/dungeon/rules';
import type { DungeonState, SkillId } from '../src/core/model/dungeon';
import type { ProgressState } from '../src/core/model/progress';
import { difficultyOf, dungeonGains, dungeonInit, dungeonPower, recommendedLevel } from '../src/core/progression/dungeon';
import { nextFloat } from '../src/core/rng';
import { gameConfig as cfg } from '../src/data';
import { autoPlay } from '../src/dev/autoPlay';

const stages = process.argv.slice(2).map(Number).filter((n) => n > 0);
const STAGES = stages.length > 0 ? stages : [2, 6, 12, 24, 40];
const SEEDS = 24;
const STEP = 100;

type Pick = (s: DungeonState, offer: readonly SkillId[], rng: { s: number }) => SkillId;
const PICKS: Record<string, Pick> = {
  무작위: (_s, offer, rng) => offer[Math.floor(nextFloat(rng) * offer.length)]!,
  시너지: (s, offer) => offer.find((id) => synergiesUnlockedBy(id, s.skills, cfg).length > 0) ?? offer.find((id) => (s.skills[id] ?? 0) > 0) ?? offer[0]!,
};
type Ult = (s: DungeonState) => boolean;
const ULTS: Record<string, Ult> = {
  잘씀: (s) => {
    const boss = s.monsters.find((m) => m.boss)?.boss;
    if (boss) return boss.casting?.pattern.kind === 'smash' || boss.casting?.pattern.kind === 'breath' || boss.guardUntil > s.now;
    return s.monsters.length >= 3;
  },
  막씀: () => true,
};

function runOnce(p: ProgressState, level: number, seed: number, pick: Pick, ult: Ult): DungeonState {
  const rng = { s: seed * 7919 };
  const { state } = createDungeon(dungeonInit(p, level, seed, cfg), cfg);
  for (let guard = 0; guard < 60_000 && !isDungeonOver(state); guard++) {
    if (state.phase === 'choosing') chooseDungeonSkill(state, pick(state, state.offer!, rng), cfg);
    if (state.ult.charge >= cfg.dungeon.ultimate.max && ult(state)) useDungeonUltimate(state, cfg);
    stepDungeon(state, STEP, cfg);
  }
  return state;
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function table(p: ProgressState, level: number) {
  const rows = [];
  for (const [pickName, pick] of Object.entries(PICKS)) {
    for (const [ultName, ult] of Object.entries(ULTS)) {
      const results = Array.from({ length: SEEDS }, (_, i) => runOnce(p, level, i + 1, pick, ult));
      const cleared = results.filter((s) => s.phase === 'cleared');
      const failed = results.filter((s) => s.phase !== 'cleared');
      const waves = results.map((s) => s.wavesCleared);
      const summary = (s: DungeonState) => ({ level, waves: s.wavesCleared, cleared: s.phase === 'cleared', bossKills: s.record.bossKills, rewards: s.rewards, synergies: [] });
      rows.push({
        선택: pickName,
        필살기: ultName,
        클리어: `${Math.round((cleared.length / SEEDS) * 100)}%`,
        평균웨이브: avg(waves).toFixed(1),
        '5웨이브돌파': `${Math.round((waves.filter((w) => w >= 5).length / SEEDS) * 100)}%`,
        클리어시간: cleared.length ? mmss(avg(cleared.map((s) => s.now))) : '-',
        실패시간: failed.length ? mmss(avg(failed.map((s) => s.now))) : '-',
        시너지수: avg(results.map((s) => activeSynergies(s.skills, cfg).length)).toFixed(1),
        골드: Math.round(avg(results.map((s) => s.rewards.gold))),
        결정: avg(results.map((s) => dungeonGains(p, summary(s), cfg).crystals)).toFixed(1),
      });
    }
  }
  console.table(rows);
}

for (const stage of STAGES) {
  const started = Date.now();
  const r = await autoPlay(cfg, { maxGameMs: 600 * 60_000, retryAfterMs: 20_000, stepMs: 250, speed: 3, seed: 1, untilStage: stage, evolveTo: 'flame', recruit: true, ultimate: true });
  const p = r.progress;
  const recommended = recommendedLevel(p, cfg);
  console.log(`\n■ 스테이지 ${stage} 를 깬 직후 (${mmss(r.elapsedMs)} · 공격 ${p.slime.upgrades.attack} · HP ${p.slime.upgrades.maxHp} · 형태 ${p.slime.form ?? '없음'} · 용병 ${p.mercenaries.party.join('+') || '없음'})`);
  // 추천 단계와, 그 단계를 깨면 열리는 한 단계 위
  for (const level of [recommended, recommended + 1]) {
    const power = dungeonPower(p, level, cfg);
    console.log(`  ${level}단계 — 세기 ${power.toFixed(2)} (${difficultyOf(power)})`);
    table(p, level);
  }
  console.log(`  (웨이브 ${waveCount(cfg)} · 계산 ${((Date.now() - started) / 1000).toFixed(0)}초)`);
}

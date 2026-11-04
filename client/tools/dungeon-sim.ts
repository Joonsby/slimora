/**
 * 도전 던전 밸런스 시뮬레이터. 자동 플레이어로 스테이지 S 를 막 깬 진행을 만들고, 그 힘으로 던전을 전략별로 돌린다.
 *   npm run sim:dungeon                                   전체 (스테이지 2 · 6 · 12 · 24 · 40, 시드 200)
 *   npm run sim:dungeon -- --stages 2,6 --seeds 400      일부만
 *   npm run sim:dungeon -- --only core,economy           구역만 (core focus skills synergy waves research economy calibrate forms)
 *   npm run sim:dungeon -- --json out.json               집계를 파일로
 *
 * 같은 조건끼리는 공통 시드를 쓴다 — 시드 i 의 던전 시드 · 자동 플레이어 시드가 모든 조건에서 같다.
 * 시간은 ×1 전투 시간이다. 「분당」 값은 스킬 선택 · 시작 · 결과에 PICK_MS · OVERHEAD_MS 를 더한 추정 시간으로 나눈다.
 * 전략 정의는 src/dev/dungeonBot.ts. 시뮬레이션 승률은 사람의 승률이 아니다 — 실제 플레이 테스트 전까지 참고값.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createBattle, stepBattle } from '../src/core/battle/engine';
import { activeSynergies } from '../src/core/dungeon/rules';
import { summarizeDungeon } from '../src/core/dungeon/engine';
import { SKILL_IDS, SYNERGY_IDS } from '../src/core/model/dungeon';
import type { FormId } from '../src/core/model/ids';
import type { ProgressState } from '../src/core/model/progress';
import { slimeBonus } from '../src/core/progression/bonus';
import { crystalRate, difficultyOf, dungeonGains, dungeonInit, dungeonPower, recommendedLevel } from '../src/core/progression/dungeon';
import { partyAllies } from '../src/core/progression/mercenary';
import { seedFrom } from '../src/core/rng';
import { deriveSlimeStats } from '../src/core/stats';
import { gameConfig as cfg } from '../src/data';
import { autoPlay } from '../src/dev/autoPlay';
import { pickByName, runDungeon, ULTS, type RunResult } from '../src/dev/dungeonBot';

// ── 인자 ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const STAGES = (opt('stages') ?? '2,6,12,24,40').split(',').map(Number).filter((n) => n > 0);
const SEEDS = Number(opt('seeds') ?? 200);
const ONLY = new Set((opt('only') ?? 'core,focus,skills,synergy,waves,research,economy,calibrate,forms').split(','));
const JSON_OUT = opt('json');
/** 설정을 덮어써 실험한다 — JSON 문자열이나 파일 경로. 객체는 합치고 배열은 바꾼다 */
const PATCH = opt('patch');
if (PATCH) {
  const patch = JSON.parse(existsSync(PATCH) ? readFileSync(PATCH, 'utf8') : PATCH);
  const merge = (t: Record<string, unknown>, p: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(p)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object') merge(t[k] as Record<string, unknown>, v as Record<string, unknown>);
      else t[k] = v;
    }
  };
  merge(cfg as unknown as Record<string, unknown>, patch);
  console.log(`설정 덮어쓰기: ${JSON.stringify(patch)}`);
}
const CACHE = opt('cache') ?? `${process.env.TEMP ?? '/tmp'}/slimora-sim-cache-${cfg.configVersion}.json`;
/** 스킬 한 번 고르는 데 쓰는 시간 · 한 판의 시작 · 결과 화면 (추정) */
const PICK_MS = 5000;
const OVERHEAD_MS = 6000;

// ── 통계 ──────────────────────────────────────────────────

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
/** 95% 윌슨 구간 */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const rate = (k: number, n: number) => {
  if (n === 0) return '-';
  const [lo, hi] = wilson(k, n);
  return `${pct(k / n)} (${pct(lo)}~${pct(hi)})`;
};
const ratio = (k: number, n: number) => (n === 0 ? '-' : pct(k / n));

function table(rows: Record<string, string | number>[]): void {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]!);
  console.log(`| ${cols.join(' | ')} |`);
  console.log(`| ${cols.map(() => '---').join(' | ')} |`);
  for (const r of rows) console.log(`| ${cols.map((c) => String(r[c] ?? '')).join(' | ')} |`);
}

// ── 실행 ─────────────────────────────────────────────────

interface Cond {
  pick: string;
  ult: keyof typeof ULTS;
  /** 처음 깨는 사람의 도움 — 없으면 진행대로 (1단계 · 첫 클리어 전이면 켜짐) */
  assist?: boolean;
  /** 도움이 켜진 판의 첫 내려찍기 가르침 (기본 켜짐) */
  teach?: boolean;
}

function runMany(p: ProgressState, level: number, cond: Cond, seeds = SEEDS, stopAfterWaves?: number): RunResult[] {
  const pick = pickByName(cond.pick);
  const ult = ULTS[cond.ult];
  return Array.from({ length: seeds }, (_, i) => {
    const init = dungeonInit(p, level, seedFrom(0xd0, level, i), cfg);
    if (cond.assist !== undefined) init.assist = cond.assist;
    return runDungeon(init, cfg, pick, ult, seedFrom(0xb07, i), { stopAfterWaves, teach: cond.teach ?? true });
  });
}

interface Agg {
  n: number;
  clears: number;
  clearMs: number[];
  /** 보스 웨이브에 도착한 판 · 거기서 쓰러진 판 */
  boss5: [number, number];
  boss10: [number, number];
  waves: number;
  diedAt: number[];
  casts: { smash: number; guard: number; breath: number };
  countered: { smash: number; guard: number; breath: number };
  missed: number;
  ultimates: number;
  gold: number;
  crystals: number;
  /** 추정 실제 시간 합계 */
  realMs: number;
  killedBy: Record<string, number>;
  absorb: number;
}

function aggregate(p: ProgressState, runs: RunResult[]): Agg {
  const a: Agg = { n: runs.length, clears: 0, clearMs: [], boss5: [0, 0], boss10: [0, 0], waves: 0, diedAt: Array(11).fill(0), casts: { smash: 0, guard: 0, breath: 0 }, countered: { smash: 0, guard: 0, breath: 0 }, missed: 0, ultimates: 0, gold: 0, crystals: 0, realMs: 0, killedBy: {}, absorb: 0 };
  for (const { state: s, picks } of runs) {
    const cleared = s.phase === 'cleared';
    if (cleared) {
      a.clears += 1;
      a.clearMs.push(s.now);
    } else {
      a.diedAt[Math.min(10, s.wavesCleared + 1)]! += 1;
      const by = s.record.killedBy ?? '포기';
      a.killedBy[by] = (a.killedBy[by] ?? 0) + 1;
    }
    if (s.wavesCleared >= 4) {
      a.boss5[0] += 1;
      if (s.wavesCleared === 4 && !cleared) a.boss5[1] += 1;
    }
    if (s.wavesCleared >= 9) {
      a.boss10[0] += 1;
      if (s.wavesCleared === 9 && !cleared) a.boss10[1] += 1;
    }
    a.waves += s.wavesCleared;
    for (const k of ['smash', 'guard', 'breath'] as const) {
      a.casts[k] += s.record.casts[k] ?? 0;
      a.countered[k] += s.record.countered[k] ?? 0;
    }
    a.missed += s.record.missed;
    a.ultimates += s.record.ultimates;
    a.gold += s.rewards.gold;
    a.absorb += Object.values(dungeonGains(p, summarizeDungeon(s), cfg).absorb).reduce<number>((n, v) => n + (v ?? 0), 0);
    a.crystals +=dungeonGains(p, summarizeDungeon(s), cfg).crystals;
    a.realMs += s.now + picks.length * PICK_MS + OVERHEAD_MS;
  }
  return a;
}

function row(name: Record<string, string>, a: Agg): Record<string, string | number> {
  return {
    ...name,
    클리어: rate(a.clears, a.n),
    평균시간: a.clearMs.length ? mmss(mean(a.clearMs)) : '-',
    중앙시간: a.clearMs.length ? mmss(median(a.clearMs)) : '-',
    평균웨이브: (a.waves / a.n).toFixed(1),
    '5보스실패': ratio(a.boss5[1], a.boss5[0]),
    '10보스실패': ratio(a.boss10[1], a.boss10[0]),
    차단: ratio(a.countered.smash, a.casts.smash),
    경화파괴: ratio(a.countered.guard, a.casts.guard),
    숨결약화: ratio(a.countered.breath, a.casts.breath),
    필살기횟수: (a.ultimates / a.n).toFixed(1),
  };
}

// ── 진행 만들기 (캐시) ──────────────────────────────────

async function progressAt(stage: number): Promise<{ p: ProgressState; ms: number }> {
  const cache: Record<string, { p: ProgressState; ms: number }> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  if (cache[stage]) return cache[stage]!;
  const r = await autoPlay(cfg, { maxGameMs: 600 * 60_000, retryAfterMs: 20_000, stepMs: 250, speed: 3, seed: 1, untilStage: stage, evolveTo: 'flame', recruit: true, ultimate: true });
  cache[stage] = { p: r.progress, ms: r.elapsedMs };
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache));
  return cache[stage]!;
}

/** 같은 진행으로 사냥터(최고 스테이지)를 10분 사냥한 골드 · 흡수 (분당). 필살기 없이 자동 사냥 */
function huntRate(p: ProgressState): { gold: number; absorb: number } {
  const bonus = slimeBonus(p, cfg);
  const battle = createBattle({ stageId: Math.max(1, p.stage.highestCleared), mode: 'farm', slime: deriveSlimeStats(p.slime, cfg, bonus), seed: 99, goldMul: bonus.gold, allies: partyAllies(p.mercenaries, cfg) }, cfg);
  let gold = 0;
  let absorb = 0;
  const minutes = 10;
  for (let t = 0; t < minutes * 60_000; t += 100) {
    for (const e of stepBattle(battle, 100, cfg)) {
      if (e.type === 'monsterKilled') {
        gold += e.gold;
        absorb += e.absorb;
      }
    }
  }
  return { gold: gold / minutes, absorb: absorb / minutes };
}

/** 형태별 보정 — 그 형태의 전선에서 몇 단계 위까지 볼까 */
const FORM_STEPS = (opt('formSteps') ?? '0,1').split(',').map(Number);
/** 세기가 이 값 이상인 가장 높은 단계를 전선으로 본다 */
const FRONTIER = Number(opt('frontier') ?? 0.95);
function frontierLevel(p: ProgressState): number {
  let level = 1;
  while (level < cfg.dungeon.levels.count && dungeonPower(p, level + 1, cfg) >= FRONTIER) level++;
  return level;
}
/** 그 단계 아래는 모두 깼다 (그 단계가 열린다) */
const clearedBelow = (p: ProgressState, level: number): ProgressState => ({ ...p, dungeon: { ...p.dungeon, cleared: Math.max(p.dungeon.cleared, level - 1) } });

const withResearch = (p: ProgressState, research: Record<string, number>): ProgressState => ({ ...p, dungeon: { ...p.dungeon, research } });
const RESEARCH_SETS: Record<string, Record<string, number>> = {
  없음: {},
  중간: { jelly: 2, spark: 2, fate: 1 },
  최대: Object.fromEntries(cfg.dungeon.research.map((r) => [r.id, r.maxLevel])),
};

const CORE: Cond[] = [
  { pick: '무작위', ult: '무작위' },
  { pick: '무작위', ult: '적절' },
  { pick: '시너지', ult: '무작위' },
  { pick: '시너지', ult: '적절' },
  { pick: '무작위', ult: '즉시' },
  { pick: '무작위', ult: '안씀' },
  { pick: '방어', ult: '적절' },
  { pick: '공격', ult: '적절' },
  { pick: '시너지', ult: '완벽' },
];

const out: Record<string, unknown> = { configVersion: cfg.configVersion, seeds: SEEDS };

for (const stage of STAGES) {
  const started = Date.now();
  const { p: base, ms } = await progressAt(stage);
  // 전선 = 세기가 FRONTIER 이상인 가장 높은 단계. 그 아래는 다 깼다고 본다 (스테이지 2 는 첫 판 — 아무것도 안 깼다)
  const frontier = frontierLevel(base);
  const levels = [frontier, frontier - 1].filter((l) => l >= 1);
  console.log(`\n## 스테이지 ${stage} 를 깬 직후 — 본편 ${mmss(ms)} · 공격 ${base.slime.upgrades.attack} · HP ${base.slime.upgrades.maxHp} · 형태 ${base.slime.form ?? '없음'} · 용병 ${base.mercenaries.party.join('+') || '없음'} · 전선 ${frontier}단계`);
  const stageOut: Record<string, unknown> = { frontier };
  out[`stage${stage}`] = stageOut;

  for (const level of levels) {
    const p = clearedBelow(base, level);
    const rec = recommendedLevel(p, cfg);
    const power = dungeonPower(p, level, cfg);
    console.log(`\n### ${level}단계 — 세기 ${power.toFixed(2)} (${difficultyOf(power, cfg)}) · 이 진행의 추천 ${rec}단계 · 결정 ×${crystalRate(p, level, cfg)}`);
    const levelOut: Record<string, unknown> = { power };
    stageOut[`L${level}`] = levelOut;
    const cache = new Map<string, RunResult[]>();
    const runsOf = (c: Cond) => {
      const key = `${c.pick}/${c.ult}/${c.assist}/${c.teach}`;
      if (!cache.has(key)) cache.set(key, runMany(p, level, c));
      return cache.get(key)!;
    };

    if (ONLY.has('core')) {
      const assisted = dungeonInit(p, level, 0, cfg).assist;
      const conds: Cond[] = assisted ? [...CORE, ...CORE.slice(0, 4).map((c) => ({ ...c, assist: false }))] : CORE;
      if (assisted) console.log('(처음 깨는 사람 — 도움 켜짐. 「도움 끔」 행은 같은 판을 도움 없이)');
      const rows = conds.map((c) => row({ 선택: c.pick, 필살기: c.assist === false ? `${c.ult} · 도움 끔` : c.ult }, aggregate(p, runsOf(c))));
      table(rows);
      levelOut.core = rows;
    }
    if (ONLY.has('focus') && level === frontier) {
      console.log('\n단일 스킬 집중 (필살기 적절)');
      const rows = SKILL_IDS.map((id) => {
        const a = aggregate(p, runsOf({ pick: `집중:${id}`, ult: '적절' }));
        return { 스킬: cfg.dungeon.skills[id].name, 클리어: rate(a.clears, a.n), 평균웨이브: (a.waves / a.n).toFixed(1), '5보스실패': ratio(a.boss5[1], a.boss5[0]), '10보스실패': ratio(a.boss10[1], a.boss10[0]) };
      });
      table(rows);
      levelOut.focus = rows;
    }
    if (ONLY.has('skills') && level === frontier) {
      for (const c of [CORE[1]!, CORE[3]!]) {
        const runs = runsOf(c);
        const picks = runs.reduce((n, r) => n + r.picks.length, 0);
        console.log(`\n스킬별 (${c.pick} · ${c.ult}) — 선택 빈도는 전체 선택 중 비율, 승률은 그 스킬을 끝까지 가진 판의 클리어율`);
        const rows = SKILL_IDS.map((id) => {
          const own = runs.filter((r) => (r.state.skills[id] ?? 0) > 0);
          const max = runs.filter((r) => (r.state.skills[id] ?? 0) >= 3);
          return {
            스킬: cfg.dungeon.skills[id].name,
            선택빈도: ratio(runs.reduce((n, r) => n + r.picks.filter((x) => x === id).length, 0), picks),
            보유율: ratio(own.length, runs.length),
            보유시승률: rate(own.filter((r) => r.state.phase === 'cleared').length, own.length),
            미보유시승률: rate(runs.filter((r) => !(r.state.skills[id] ?? 0) && r.state.phase === 'cleared').length, runs.length - own.length),
            '3단계도달': ratio(max.length, runs.length),
          };
        });
        table(rows);
        levelOut[`skills ${c.pick}/${c.ult}`] = rows;
      }
    }
    if (ONLY.has('synergy') && level === frontier) {
      for (const c of [CORE[1]!, CORE[3]!]) {
        const runs = runsOf(c);
        console.log(`\n시너지별 (${c.pick} · ${c.ult}) — 등장 = 그 시너지가 켜진 판의 비율`);
        const none = runs.filter((r) => activeSynergies(r.state.skills, cfg).length === 0);
        const rows = [
          ...SYNERGY_IDS.map((id) => {
            const on = runs.filter((r) => r.state.synergies.includes(id));
            return { 시너지: cfg.dungeon.synergies[id].name, 등장: ratio(on.length, runs.length), 승률: rate(on.filter((r) => r.state.phase === 'cleared').length, on.length) };
          }),
          { 시너지: '(시너지 없음)', 등장: ratio(none.length, runs.length), 승률: rate(none.filter((r) => r.state.phase === 'cleared').length, none.length) },
        ];
        table(rows);
        levelOut[`synergy ${c.pick}/${c.ult}`] = rows;
      }
    }
    if (ONLY.has('waves') && level === frontier) {
      console.log('\n쓰러진 웨이브 분포 (전체 판 중 비율) · 쓰러뜨린 공격');
      const rows = CORE.slice(0, 4).map((c) => {
        const a = aggregate(p, runsOf(c));
        const r: Record<string, string> = { 조건: `${c.pick}/${c.ult}` };
        for (let w = 1; w <= 10; w++) r[`W${w}`] = a.diedAt[w] ? pct(a.diedAt[w]! / a.n) : '';
        r.원인 = Object.entries(a.killedBy)
          .sort((x, y) => y[1] - x[1])
          .map(([k, v]) => `${k} ${v}`)
          .join(' · ');
        return r;
      });
      table(rows);
      levelOut.waves = rows;
    }
    if (ONLY.has('research') && level === frontier) {
      console.log('\n연구 단계별 (같은 시드)');
      const rows = Object.entries(RESEARCH_SETS).flatMap(([name, research]) =>
        [CORE[1]!, CORE[3]!].map((c) => {
          const q = withResearch(p, research);
          const a = aggregate(q, runMany(q, level, c));
          return { 연구: name, 조건: `${c.pick}/${c.ult}`, 세기: dungeonPower(q, level, cfg).toFixed(2), 클리어: rate(a.clears, a.n), 평균웨이브: (a.waves / a.n).toFixed(1) };
        }),
      );
      table(rows);
      levelOut.research = rows;
    }
    if (ONLY.has('economy') && level === frontier) {
      const hunt = huntRate(p);
      const a = aggregate(p, runsOf(CORE[3]!));
      const b = aggregate(p, runsOf(CORE[1]!));
      const quit = aggregate(p, runMany(p, level, CORE[3]!, SEEDS, 4));
      const easy = Math.max(1, level - 3);
      const l1 = aggregate(clearedBelow(base, easy), runMany(clearedBelow(base, easy), easy, CORE[3]!));
      const perMin = (x: number, m: number) => (x / (m / 60_000)).toFixed(1);
      console.log(`\n경제 — 사냥터(스테이지 ${p.stage.highestCleared}) 자동 사냥 골드 ${hunt.gold.toFixed(0)}/분 · 흡수 ${hunt.absorb.toFixed(1)}/분`);
      const econ = (name: string, x: Agg) => ({
        경우: name,
        '골드/분': perMin(x.gold, x.realMs),
        '사냥 대비': `${((x.gold / (x.realMs / 60_000) / hunt.gold) * 100).toFixed(0)}%`,
        '흡수 사냥 대비': `${((x.absorb / (x.realMs / 60_000) / hunt.absorb) * 100).toFixed(0)}%`,
        '결정/판': (x.crystals / x.n).toFixed(1),
        '결정/분': perMin(x.crystals, x.realMs),
        '한 판': mmss(x.realMs / x.n),
      });
      const rows = [econ(`${level}단계 시너지/적절`, a), econ(`${level}단계 무작위/적절`, b), econ(`${level}단계 4웨이브 포기 반복`, quit), econ(`${easy}단계 시너지/적절 (쉬운 단계 반복 · 결정 ×${crystalRate(p, easy, cfg)})`, l1)];
      table(rows);
      levelOut.economy = { hunt, rows };
    }
    console.log(`(계산 ${((Date.now() - started) / 1000).toFixed(0)}초)`);
  }
}

// ── 추천 보정: 세기 → 실제 클리어율 ─────────────────────

if (ONLY.has('calibrate')) {
  console.log('\n## 추천 보정 — 세기별 실제 클리어율 (시드 절반)');
  const points: { stage: number; level: number; power: number; basic: number; good: number }[] = [];
  for (const stage of STAGES) {
    const { p: base } = await progressAt(stage);
    const f = frontierLevel(base);
    for (const level of [f - 2, f - 1, f, f + 1].filter((l) => l >= 1 && l <= cfg.dungeon.levels.count)) {
      const p = clearedBelow(base, level);
      const n = Math.max(40, Math.floor(SEEDS / 2));
      const basic = aggregate(p, runMany(p, level, CORE[1]!, n));
      const good = aggregate(p, runMany(p, level, CORE[3]!, n));
      points.push({ stage, level, power: dungeonPower(p, level, cfg), basic: basic.clears / basic.n, good: good.clears / good.n });
    }
  }
  points.sort((x, y) => x.power - y.power);
  table(points.map((q) => ({ 스테이지: q.stage, 단계: q.level, 세기: q.power.toFixed(2), 표시: difficultyOf(q.power, cfg), '무작위/적절': pct(q.basic), '시너지/적절': pct(q.good) })));
  out.calibrate = points;
}

// ── 형태별 ──────────────────────────────────────────────

if (ONLY.has('forms')) {
  for (const stage of STAGES.filter((s) => s >= 12)) {
    const { p: base } = await progressAt(stage);
    if (!base.slime.form) continue;
    console.log(`\n## 형태별 — 스테이지 ${stage} 진행, 형태만 바꿔 그 형태의 전선 · 한 단계 위 (세기 보정 맞추기)`);
    const rows = (['flame', 'vampire', 'iron'] as FormId[]).flatMap((form) => {
      const q0: ProgressState = { ...base, slime: { ...base.slime, form, unlockedForms: [...new Set([...base.slime.unlockedForms, form])] } };
      const f = frontierLevel(q0);
      return FORM_STEPS.map((k) => f + k).flatMap((level) => {
        const q = clearedBelow(q0, level);
        return [CORE[1]!, CORE[3]!].map((c) => {
          const a = aggregate(q, runMany(q, level, c));
          return { 형태: cfg.dungeon.forms[form]?.name ?? form, 단계: level, 조건: `${c.pick}/${c.ult}`, 세기: dungeonPower(q, level, cfg).toFixed(2), 클리어: rate(a.clears, a.n), 평균웨이브: (a.waves / a.n).toFixed(1) };
        });
      });
    });
    table(rows);
    out[`forms${stage}`] = rows;
  }
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
  console.log(`\n→ ${JSON_OUT}`);
}

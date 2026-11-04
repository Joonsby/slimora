/**
 * 기존 TypeScript 엔진으로 Unity(C#) 회귀 테스트 벡터를 만든다.
 * 실행: client 폴더에서  npx tsx ../unity/tools/export-vectors.ts
 * 결과: unity/Slimora/Assets/Slimora/Resources/Vectors/{config,rng,monsters,battles}.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBattle, stepBattle, ultimateReady, useUltimate } from '../../client/src/core/battle/engine';
import type { BattleEvent, BattleState } from '../../client/src/core/model/battle';
import { partyAllies } from '../../client/src/core/progression/mercenary';
import { nextFloat, seedFrom } from '../../client/src/core/rng';
import { deriveMonsterStats, deriveSlimeStats, monsterAbsorb, monsterGold } from '../../client/src/core/stats';
import { gameConfig as cfg } from '../../client/src/data';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'Slimora', 'Assets', 'Slimora', 'Resources', 'Vectors');
mkdirSync(out, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(join(out, name), JSON.stringify(data));

// 1) 엔진이 읽는 설정 — 장 데이터를 편 결과를 그대로 넘긴다 (C# 은 조립 규칙을 다시 짜지 않는다)
write('config.json', { configVersion: cfg.configVersion, balance: cfg.balance, monsters: cfg.monsters, stages: cfg.stages, mercenaries: cfg.mercenaries });

// 2) 난수
const rng = [1, 7, 42, -1, 2147483647, -2147483648, 123456789].map((seed) => {
  const s = { s: seed | 0 };
  return { seed, values: Array.from({ length: 64 }, () => nextFloat(s)) };
});
const seeds = [[1], [1, 2], [0, 0, 0], [200, 7, 99999], [-5, 3.7, 1e9]].map((parts) => ({ parts, value: seedFrom(...parts) }));
write('rng.json', { rng, seeds });

// 3) 몬스터 능력치 · 보상
const monsterStages = [1, 2, 5, 9, 10, 37, 100, 163, 200];
write(
  'monsters.json',
  cfg.monsters.flatMap((m) => monsterStages.map((stage) => ({ monster: m.id, stage, stats: deriveMonsterStats(m.id, stage, cfg), gold: monsterGold(m.id, stage, cfg), absorb: monsterAbsorb(m.id, stage, cfg) }))),
);

// 4) 전투 — 같은 입력으로 이벤트 열과 최종 상태가 같아야 한다
const fmt = (n: number) => String(n);
export function eventLine(e: BattleEvent): string {
  switch (e.type) {
    case 'monsterSpawned':
      return `spawn|${fmt(e.at)}|${e.defId}|${e.seq}|${e.maxHp}|${e.boss}`;
    case 'attack':
      return `attack|${fmt(e.at)}|${e.by}`;
    case 'damage':
      return `damage|${fmt(e.at)}|${e.to}|${e.amount}|${e.crit}|${e.source}|${e.reducedBy}|${e.heavy === true}`;
    case 'ultimate':
      return `ultimate|${fmt(e.at)}|${e.amount}|${e.interrupted}`;
    case 'allyAttack':
      return `ally|${fmt(e.at)}|${e.index}|${e.id}`;
    case 'heal':
      return `heal|${fmt(e.at)}|${e.to}|${e.amount}|${e.source}`;
    case 'burnApplied':
      return `burn|${fmt(e.at)}|${e.to}|${e.stacks}`;
    case 'heavyWarning':
      return `heavyWarning|${fmt(e.at)}|${e.by}`;
    case 'enraged':
      return `enraged|${fmt(e.at)}|${e.side}`;
    case 'monsterKilled':
      return `killed|${fmt(e.at)}|${e.defId}|${e.family}|${e.seq}|${e.gold}|${e.absorb}`;
    case 'slimeDied':
      return `slimeDied|${fmt(e.at)}`;
    case 'respawned':
      return `respawned|${fmt(e.at)}`;
    case 'stageCleared':
      return `cleared|${fmt(e.at)}|${e.stageId}`;
    case 'challengeFailed':
      return `failed|${fmt(e.at)}|${e.stageId}|${e.reason}`;
  }
}

export function stateLine(s: BattleState): string {
  return [s.now, s.phase, s.phaseUntil, s.kills, s.slime.hp, s.monster?.hp ?? -1, s.monster?.defId ?? '-', s.bossDue, s.bossEndsAt ?? -1, s.rng.s, s.seq, s.ultimate.charge].map(String).join('|');
}

/** FNV-1a 32bit (UTF-16 코드 단위) — C# 쪽과 같은 식 */
function hash(lines: string[]): number {
  let h = 0x811c9dc5;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      h ^= line.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 10;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const DTS = [16, 17, 33, 50, 250, 1000, 7];
const stages = [1, 2, 3, 5, 6, 9, 10, 11, 20, 25, 50, 73, 100, 137, 150, 199, 200];
const parties: string[][] = [[], ['pip'], ['pebble', 'ember'], ['shade', 'wyvern'], ['goldy', 'moss']];
const cases: unknown[] = [];
let index = 0;
for (const stage of stages) {
  for (const mode of ['challenge', 'farm'] as const) {
    for (const party of parties) {
      index++;
      // 스테이지에 맞춘 강화 — 이기기도 지기도 하도록 단계를 흔든다
      const lv = Math.max(0, Math.round(stage * (0.9 + (index % 5) * 0.12)));
      const slime = deriveSlimeStats({ upgrades: { attack: lv, maxHp: lv, critChance: Math.min(20, Math.floor(lv / 4)) }, absorption: {}, form: null }, cfg);
      const owned = Object.fromEntries(party.map((id, i) => [id, 1 + ((index + i) % 6)]));
      const allies = partyAllies({ owned, party }, cfg);
      const seed = seedFrom(stage, index, mode === 'farm' ? 1 : 0);
      const init = { stageId: stage, mode, slime, seed, goldMul: 1 + (index % 3) * 0.25, allies, ...(index % 4 === 0 ? { ultimateCharge: 100 } : {}) };
      const b = createBattle(init, cfg);
      const lines: string[] = [];
      const ultAt: number[] = [];
      let step = 0;
      while (b.now < 120_000 && b.phase !== 'cleared' && b.phase !== 'failed') {
        const dt = DTS[(step + index) % DTS.length]!;
        for (const e of stepBattle(b, dt, cfg)) lines.push(eventLine(e));
        // 필살기는 정해진 step 에서만 — C# 도 같은 step 에 누른다
        if (step % 37 === 11 && ultimateReady(b, cfg)) {
          const ev = useUltimate(b, cfg);
          if (ev) {
            ultAt.push(step);
            for (const e of ev) lines.push(eventLine(e));
          }
        }
        step++;
      }
      cases.push({ id: index, init, steps: step, ultSteps: ultAt, eventCount: lines.length, hash: hash(lines), final: stateLine(b), ...(index <= 12 ? { lines } : {}) });
    }
  }
}
write('battles.json', { dts: DTS, ultEvery: 37, ultPhase: 11, limitMs: 120_000, cases });
console.log(`벡터 ${cases.length}건 → ${out}`);

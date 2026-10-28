/**
 * 밸런스 시뮬레이터 — 화면 없이 실제 전투 엔진을 돌린다.
 *   npm run sim
 */
import { createBattle, isFinished, stepBattle } from '../src/core/battle/engine';
import { findMonster } from '../src/core/lookup';
import { getUpgradeCost } from '../src/core/progression/upgrades';
import { deriveMonsterStats, deriveSlimeStats, monsterGold } from '../src/core/stats';
import { gameConfig as cfg } from '../src/data';
import { autoPlay } from '../src/dev/autoPlay';

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const attackDef = cfg.upgrades.find((u) => u.id === 'attack')!;
const goldToLevel = (level: number) => Array.from({ length: level }, (_, i) => getUpgradeCost(attackDef, i)).reduce((a, b) => a + b, 0);

console.log('\n■ 스테이지별 몬스터');
console.table(
  cfg.stages.map((st) => {
    const id = st.spawns[0]!.monster;
    const m = deriveMonsterStats(id, st.id, cfg);
    return {
      스테이지: st.id,
      몬스터: findMonster(cfg, id).name,
      HP: m.maxHp,
      공격력: m.attack,
      '간격(ms)': m.attackIntervalMs,
      피해감소: m.damageReduction,
      '골드/처치': monsterGold(id, st.id, cfg),
      처치목표: st.killsToClear,
    };
  }),
);

console.log('■ 처음부터 도전해 깨는 데 필요한 최소 공격력 레벨 (시드 5개 모두 성공 기준)');
console.table(
  cfg.stages.map((st) => {
    for (let level = 0; level <= 300; level++) {
      const slime = deriveSlimeStats({ upgrades: { attack: level } }, cfg);
      const runs = [1, 2, 3, 4, 5].map((seed) => {
        const battle = createBattle({ stageId: st.id, mode: 'challenge', slime, seed }, cfg);
        while (!isFinished(battle) && battle.now < 600_000) stepBattle(battle, 1000, cfg);
        return { cleared: battle.phase === 'cleared', time: battle.now, hpLeft: battle.slime.hp / slime.maxHp };
      });
      if (runs.every((r) => r.cleared)) {
        return {
          스테이지: st.id,
          공격력레벨: level,
          공격력: slime.attack,
          누적골드: goldToLevel(level),
          클리어시간: mmss(Math.max(...runs.map((r) => r.time))),
          '최저 남은HP': `${Math.round(Math.min(...runs.map((r) => r.hpLeft)) * 100)}%`,
        };
      }
    }
    return { 스테이지: st.id, 공격력레벨: '300 초과' };
  }),
);

console.log('■ 자동 플레이 (가장 싼 강화부터 즉시 구매 · 실패 후 30초 사냥하고 재도전 · 배속 ×1)');
const results = await Promise.all([1, 2, 3].map((seed) => autoPlay(cfg, { maxGameMs: 3 * 3600_000, retryAfterMs: 30_000, seed })));
console.table(
  results.map((r, i) => ({
    시드: i + 1,
    ...Object.fromEntries(cfg.stages.map((st) => [`${st.id} 클리어`, r.clearedAtMs[st.id] ? mmss(r.clearedAtMs[st.id]!) : '-'])),
    실패: r.failures,
    사망: r.deaths,
    '강화 (공격·HP·치명)': `${r.upgrades.attack}·${r.upgrades.maxHp}·${r.upgrades.critChance}`,
  })),
);

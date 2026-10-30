/**
 * 밸런스 시뮬레이터 — 화면 없이 실제 전투 엔진을 돌린다. 앞 두 장(20 스테이지)을 자세히 본다.
 *   npm run sim          (장기 진행은 npm run sim:long)
 */
import { createBattle, isFinished, stepBattle } from '../src/core/battle/engine';
import { findMonster } from '../src/core/lookup';
import type { ProgressState } from '../src/core/model/progress';
import { getUpgradeCost } from '../src/core/progression/upgrades';
import { deriveMonsterStats, deriveSlimeStats, monsterGold } from '../src/core/stats';
import { gameConfig as cfg } from '../src/data';
import { autoPlay } from '../src/dev/autoPlay';

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const attackDef = cfg.upgrades.find((u) => u.id === 'attack')!;
const goldToLevel = (level: number) => Array.from({ length: level }, (_, i) => getUpgradeCost(attackDef, i)).reduce((a, b) => a + b, 0);
const EARLY = 20;
const early = cfg.stages.slice(0, EARLY);

console.log('\n■ 스테이지별 몬스터 (1~20, 그 뒤는 장 보스 스테이지만)');
console.table(
  cfg.stages.filter((st) => st.id <= EARLY || st.boss).map((st) => {
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
  early.map((st) => {
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

// 첫 진화 조건 (GAME_DESIGN 4-8): 3 스테이지 클리어 + 한 계열 흡수 200. 진화 자체는 5B 에서 구현
const evolutionReady = (p: ProgressState) => p.stage.highestCleared >= 3 && Object.values(p.slime.absorption).some((n) => n >= 200);

console.log('■ 자동 플레이 (가장 싼 강화부터 즉시 구매 · 실패 후 30초 사냥하고 재도전 · 배속 ×1)');
console.log('  20 스테이지를 깬 뒤에는 그 자리에서 사냥을 계속하며 첫 진화 조건 도달 시각을 잰다');
const results = await Promise.all([1, 2, 3].map((seed) => autoPlay(cfg, { maxGameMs: 3 * 3600_000, retryAfterMs: 30_000, seed, untilStage: EARLY, watch: evolutionReady })));
console.table(
  results.map((r, i) => ({
    시드: i + 1,
    ...Object.fromEntries(early.filter((st) => st.id % 2 === 0).map((st) => [`${st.id} 클리어`, r.clearedAtMs[st.id] ? mmss(r.clearedAtMs[st.id]!) : '-'])),
    '진화 조건': r.watchHitAtMs ? mmss(r.watchHitAtMs) : '-',
    실패: r.failures,
    '강화 (공·HP·치)': `${r.upgrades.attack}·${r.upgrades.maxHp}·${r.upgrades.critChance}`,
    '흡수 (박·골·화)': cfg.families.map((f) => r.absorption[f.id] ?? 0).join('·'),
  })),
);

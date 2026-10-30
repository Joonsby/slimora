import type { GameConfig } from '../core/model/config';
import { EFFECT_KINDS, type EffectSpec } from '../core/model/effects';

/** 설정의 형태·범위·참조를 검사한다. 문제가 없으면 빈 배열 */
export function validateConfig(cfg: GameConfig): string[] {
  const errors: string[] = [];
  const check = (cond: boolean, msg: string) => {
    if (!cond) errors.push(msg);
  };
  const positive = (v: unknown, path: string) => check(typeof v === 'number' && Number.isFinite(v) && v > 0, `${path}: 양수여야 함 (${String(v)})`);
  const ratio = (v: unknown, path: string) => check(typeof v === 'number' && v >= 0 && v <= 1, `${path}: 0~1 이어야 함 (${String(v)})`);
  const posInt = (v: unknown, path: string) => check(Number.isInteger(v) && (v as number) >= 1, `${path}: 1 이상 정수여야 함 (${String(v)})`);

  check(typeof cfg.configVersion === 'string' && cfg.configVersion.length > 0, 'configVersion 없음');

  const { slimeBase, caps, battle, stageScaling } = cfg.balance;
  positive(slimeBase.maxHp, 'slimeBase.maxHp');
  positive(slimeBase.attack, 'slimeBase.attack');
  posInt(slimeBase.attackIntervalMs, 'slimeBase.attackIntervalMs');
  ratio(slimeBase.critChance, 'slimeBase.critChance');
  check(slimeBase.critMultiplier >= 1, 'slimeBase.critMultiplier: 1 이상이어야 함');
  ratio(caps.damageReduction, 'caps.damageReduction');
  check(caps.damageReduction < 1, 'caps.damageReduction: 1 미만이어야 함 (무적 방지)');
  ratio(caps.lifesteal, 'caps.lifesteal');
  ratio(caps.critChance, 'caps.critChance');
  posInt(battle.spawnDelayMs, 'battle.spawnDelayMs');
  posInt(battle.deathDelayMs, 'battle.deathDelayMs');
  posInt(battle.burnTickMs, 'battle.burnTickMs');
  ratio(battle.regenOnKillRatio, 'battle.regenOnKillRatio');
  for (const key of ['hpBase', 'atkBase', 'powerGrowth', 'goldBase', 'goldGrowth'] as const) {
    positive(stageScaling[key], `stageScaling.${key}`);
  }
  posInt(stageScaling.absorbStep, 'stageScaling.absorbStep');
  positive(cfg.balance.level?.divisor, 'level.divisor');
  check(typeof cfg.balance.level?.statBonusPerLevel === 'number' && cfg.balance.level.statBonusPerLevel >= 0, 'level.statBonusPerLevel: 0 이상이어야 함');
  positive(cfg.balance.evolution?.switchCostBase, 'evolution.switchCostBase');
  check(cfg.balance.evolution?.switchCostGrowth >= 1, 'evolution.switchCostGrowth: 1 이상이어야 함');
  posInt(cfg.balance.evolution?.pauseMs, 'evolution.pauseMs');

  const familyIds = uniqueIds(cfg.families.map((f) => f.id), 'families', errors);
  const monsterIds = uniqueIds(cfg.monsters.map((m) => m.id), 'monsters', errors);

  for (const m of cfg.monsters) {
    const p = `monsters.${m.id}`;
    check(familyIds.has(m.family), `${p}.family: 없는 계열 '${m.family}'`);
    positive(m.hpMul, `${p}.hpMul`);
    positive(m.atkMul, `${p}.atkMul`);
    posInt(m.attackIntervalMs, `${p}.attackIntervalMs`);
    positive(m.goldMul, `${p}.goldMul`);
    positive(m.absorbMul, `${p}.absorbMul`);
    m.effects.forEach((e, i) => validateEffect(e, `${p}.effects[${i}]`, errors));
  }

  uniqueIds(cfg.traits.map((t) => t.family), 'traits', errors);
  for (const t of cfg.traits) {
    const p = `traits.${t.family}`;
    check(familyIds.has(t.family), `${p}: 없는 계열 '${t.family}'`);
    check(t.tiers.length > 0, `${p}.tiers: 비어 있음`);
    t.tiers.forEach((tier, i) => {
      positive(tier.minAbsorb, `${p}.tiers[${i}].minAbsorb`);
      if (i > 0) check(tier.minAbsorb > t.tiers[i - 1]!.minAbsorb, `${p}.tiers[${i}].minAbsorb: 앞 단계보다 커야 함`);
      tier.effects.forEach((e, j) => validateEffect(e, `${p}.tiers[${i}].effects[${j}]`, errors));
    });
  }

  cfg.stages.forEach((s, i) => {
    const p = `stages[${i}]`;
    check(s.id === i + 1, `${p}.id: 1부터 빈틈없이 이어져야 함 (${s.id})`);
    posInt(s.chapter, `${p}.chapter`);
    check(typeof s.scene === 'string' && s.scene.length > 0, `${p}.scene: 비어 있음`);
    posInt(s.killsToClear, `${p}.killsToClear`);
    check(s.spawns.length > 0, `${p}.spawns: 비어 있음`);
    for (const sp of s.spawns) {
      check(monsterIds.has(sp.monster), `${p}.spawns: 없는 몬스터 '${sp.monster}'`);
      positive(sp.weight, `${p}.spawns.${sp.monster}.weight`);
    }
    if (s.boss) {
      check(monsterIds.has(s.boss.monster), `${p}.boss: 없는 몬스터 '${s.boss.monster}'`);
      posInt(s.boss.timeLimitMs, `${p}.boss.timeLimitMs`);
    }
  });
  check(cfg.stages.length > 0, 'stages: 비어 있음');

  uniqueIds(cfg.forms.map((f) => f.id), 'forms', errors);
  for (const f of cfg.forms) {
    const p = `forms.${f.id}`;
    check(familyIds.has(f.family), `${p}.family: 없는 계열 '${f.family}'`);
    positive(f.requires.absorb, `${p}.requires.absorb`);
    check(cfg.stages.some((s) => s.id === f.requires.stageCleared), `${p}.requires.stageCleared: 없는 스테이지 ${f.requires.stageCleared}`);
    positive(f.hpMul, `${p}.hpMul`);
    positive(f.atkMul, `${p}.atkMul`);
    check(f.mastery.length > 0, `${p}.mastery: 비어 있음`);
    f.mastery.forEach((m, i) => {
      positive(m.minAbsorb, `${p}.mastery[${i}].minAbsorb`);
      if (i > 0) check(m.minAbsorb > f.mastery[i - 1]!.minAbsorb, `${p}.mastery[${i}].minAbsorb: 앞 단계보다 커야 함`);
      m.effects.forEach((e, j) => validateEffect(e, `${p}.mastery[${i}].effects[${j}]`, errors));
    });
  }

  uniqueIds(cfg.upgrades.map((u) => u.id), 'upgrades', errors);
  for (const u of cfg.upgrades) {
    const p = `upgrades.${u.id}`;
    positive(u.perLevel, `${p}.perLevel`);
    positive(u.cost.base, `${p}.cost.base`);
    check(u.cost.growth > 1, `${p}.cost.growth: 1 보다 커야 함`);
    check(u.maxLevel === null || (Number.isInteger(u.maxLevel) && u.maxLevel >= 1), `${p}.maxLevel: null 또는 1 이상 정수`);
  }

  return errors;
}

function validateEffect(e: EffectSpec, path: string, errors: string[]) {
  if (!EFFECT_KINDS.includes(e.kind)) {
    errors.push(`${path}: 모르는 효과 '${String((e as { kind: unknown }).kind)}'`);
    return;
  }
  const inRange = (v: number, name: string) => {
    if (!(v >= 0 && v <= 1)) errors.push(`${path}.${name}: 0~1 이어야 함 (${v})`);
  };
  switch (e.kind) {
    case 'lifesteal':
    case 'damageReduction':
      inRange(e.ratio, 'ratio');
      break;
    case 'burnOnHit':
      inRange(e.chance, 'chance');
      if (!(e.dpsRatio > 0)) errors.push(`${path}.dpsRatio: 양수여야 함`);
      if (!(Number.isInteger(e.durationMs) && e.durationMs > 0)) errors.push(`${path}.durationMs: 양의 정수여야 함`);
      if (!(Number.isInteger(e.maxStacks) && e.maxStacks >= 1)) errors.push(`${path}.maxStacks: 1 이상 정수여야 함`);
      break;
    case 'heavyAttack':
      if (!(Number.isInteger(e.every) && e.every >= 2)) errors.push(`${path}.every: 2 이상 정수여야 함`);
      if (!(e.multiplier > 1)) errors.push(`${path}.multiplier: 1 보다 커야 함`);
      break;
    case 'enrage':
      if (!(e.hpBelowRatio > 0 && e.hpBelowRatio < 1)) errors.push(`${path}.hpBelowRatio: 0~1 사이여야 함`);
      if (!(e.attackIntervalMul > 0 && e.attackIntervalMul < 1)) errors.push(`${path}.attackIntervalMul: 0~1 사이여야 함`);
      break;
  }
}

function uniqueIds(ids: string[], label: string, errors: string[]): Set<string> {
  const set = new Set<string>();
  for (const id of ids) {
    if (set.has(id)) errors.push(`${label}: 중복 id '${id}'`);
    set.add(id);
  }
  return set;
}

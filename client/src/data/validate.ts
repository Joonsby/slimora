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

  const familyIds = uniqueIds(cfg.families.map((f) => f.id), 'families', errors);
  const monsterIds = uniqueIds(cfg.monsters.map((m) => m.id), 'monsters', errors);

  for (const m of cfg.monsters) {
    const p = `monsters.${m.id}`;
    check(familyIds.has(m.family), `${p}.family: 없는 계열 '${m.family}'`);
    positive(m.hpMul, `${p}.hpMul`);
    positive(m.atkMul, `${p}.atkMul`);
    posInt(m.attackIntervalMs, `${p}.attackIntervalMs`);
    positive(m.goldMul, `${p}.goldMul`);
    m.effects.forEach((e, i) => validateEffect(e, `${p}.effects[${i}]`, errors));
  }

  cfg.stages.forEach((s, i) => {
    const p = `stages[${i}]`;
    check(s.id === i + 1, `${p}.id: 1부터 빈틈없이 이어져야 함 (${s.id})`);
    posInt(s.chapter, `${p}.chapter`);
    posInt(s.killsToClear, `${p}.killsToClear`);
    check(s.spawns.length > 0, `${p}.spawns: 비어 있음`);
    for (const sp of s.spawns) {
      check(monsterIds.has(sp.monster), `${p}.spawns: 없는 몬스터 '${sp.monster}'`);
      positive(sp.weight, `${p}.spawns.${sp.monster}.weight`);
    }
  });
  check(cfg.stages.length > 0, 'stages: 비어 있음');

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

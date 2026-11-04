import { SLOTS } from '../core/dungeon/engine';
import type { GameConfig } from '../core/model/config';
import { SKILL_IDS, SYNERGY_IDS, type UltimateSpec } from '../core/model/dungeon';
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
  const offline = cfg.balance.offline;
  posInt(offline?.minAwayMs, 'offline.minAwayMs');
  check(offline?.capMs >= offline?.minAwayMs, 'offline.capMs: minAwayMs 이상이어야 함');
  check(offline?.efficiency > 0 && offline?.efficiency <= 1, 'offline.efficiency: 0 초과 1 이하');
  posInt(offline?.simMs, 'offline.simMs');
  check(offline?.adMultiplier >= 1, 'offline.adMultiplier: 1 이상이어야 함');

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

  const chapterIds = new Set(cfg.chapters.map((c) => c.id));
  check(chapterIds.size === cfg.chapters.length, 'chapters: 중복 id');
  cfg.stages.forEach((s, i) => {
    const p = `stages[${i}]`;
    check(s.id === i + 1, `${p}.id: 1부터 빈틈없이 이어져야 함 (${s.id})`);
    check(chapterIds.has(s.chapter), `${p}.chapter: 없는 장 ${s.chapter}`);
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

  const prestige = cfg.balance.prestige;
  check(cfg.stages.some((s) => s.id === prestige?.unlockStage), `prestige.unlockStage: 없는 스테이지 ${prestige?.unlockStage}`);
  positive(prestige?.essenceBase, 'prestige.essenceBase');
  check(prestige?.essenceGrowth >= 1, 'prestige.essenceGrowth: 1 이상이어야 함');
  uniqueIds(cfg.legacy.map((l) => l.id), 'legacy', errors);
  for (const l of cfg.legacy) {
    const p = `legacy.${l.id}`;
    check(['attack', 'maxHp', 'gold', 'offlineHours'].includes(l.stat), `${p}.stat: 모르는 값 '${l.stat}'`);
    positive(l.perLevel, `${p}.perLevel`);
    positive(l.cost.base, `${p}.cost.base`);
    check(l.cost.growth >= 1, `${p}.cost.growth: 1 이상이어야 함`);
    check(l.maxLevel === null || (Number.isInteger(l.maxLevel) && l.maxLevel >= 1), `${p}.maxLevel: null 또는 1 이상 정수`);
  }

  const { gacha, gems, party } = cfg.balance;
  posInt(gacha?.single, 'gacha.single');
  posInt(gacha?.ten, 'gacha.ten');
  posInt(gacha?.maxLevel, 'gacha.maxLevel');
  check(gacha?.maxedRefund >= 0, 'gacha.maxedRefund: 0 이상');
  const rarities = ['common', 'rare', 'legendary'] as const;
  check(Math.abs(rarities.reduce((sum, r) => sum + (gacha?.rates[r] ?? 0), 0) - 1) < 1e-9, 'gacha.rates: 합이 1 이어야 함');
  for (const r of rarities) check(cfg.mercenaries.some((m) => m.rarity === r), `mercenaries: ${r} 등급이 하나도 없음`);
  for (const key of ['starter', 'firstClearBase', 'firstClearPerStage', 'rebirth', 'adReward', 'adDailyLimit'] as const) check(Number.isInteger(gems?.[key]) && gems[key] >= 0, `gems.${key}: 0 이상 정수`);
  posInt(party?.slots, 'party.slots');
  check(party?.supportPerLevel >= 0 && party?.passivePerLevel >= 0, 'party.*PerLevel: 0 이상');
  uniqueIds(cfg.mercenaries.map((m) => m.id), 'mercenaries', errors);
  for (const m of cfg.mercenaries) {
    const p = `mercenaries.${m.id}`;
    check(rarities.includes(m.rarity), `${p}.rarity: 모르는 등급 '${m.rarity}'`);
    positive(m.support.power, `${p}.support.power`);
    posInt(m.support.intervalMs, `${p}.support.intervalMs`);
    check(['attack', 'maxHp', 'gold', 'critChance', 'damageReduction'].includes(m.passive.stat), `${p}.passive.stat: 모르는 값 '${m.passive.stat}'`);
    positive(m.passive.value, `${p}.passive.value`);
  }

  validateUltimate(cfg.balance.ultimate, 'balance.ultimate', errors);
  validateDungeon(cfg, monsterIds, errors);

  uniqueIds(cfg.shop.map((s) => s.sku), 'shop', errors);
  for (const s of cfg.shop) {
    const p = `shop.${s.sku}`;
    check(/^[a-z0-9_]+$/.test(s.sku), `${p}.sku: 영문 소문자 · 숫자 · _ 만`);
    check(s.kind === 'consumable' || s.kind === 'once', `${p}.kind: consumable 또는 once`);
    check(s.gems > 0 || s.essence > 0 || s.adPass, `${p}: 주는 것이 없음`);
    check(s.bonus >= 0 && s.bonus <= s.gems, `${p}.bonus: 0 ~ gems`);
    posInt(s.priceKrw, `${p}.priceKrw`);
  }

  return errors;
}

function validateUltimate(u: UltimateSpec | undefined, path: string, errors: string[]) {
  if (!u) {
    errors.push(`${path}: 없음`);
    return;
  }
  const check = (cond: boolean, msg: string) => {
    if (!cond) errors.push(`${path}.${msg}`);
  };
  check(u.max > 0, 'max: 양수여야 함');
  check(u.start >= 0 && u.start <= u.max, 'start: 0 ~ max');
  check(u.perSecond >= 0 && u.perKill >= 0, 'perSecond · perKill: 0 이상');
  check(u.damageMul > 0, 'damageMul: 양수여야 함');
  check(u.armorPierce >= 0 && u.armorPierce <= 1, 'armorPierce: 0~1');
  check(Number.isInteger(u.staggerMs) && u.staggerMs > 0, 'staggerMs: 양의 정수');
  check(u.staggerTakenMul >= 1, 'staggerTakenMul: 1 이상');
}

/** 도전 던전 — 웨이브 · 보스 · 스킬 · 시너지 · 형태 · 용병 연계 · 연구 */
function validateDungeon(cfg: GameConfig, monsterIds: Set<string>, errors: string[]) {
  const d = cfg.dungeon;
  if (!d) {
    errors.push('dungeon: 없음');
    return;
  }
  const check = (cond: boolean, msg: string) => {
    if (!cond) errors.push(`dungeon.${msg}`);
  };
  const posInt = (v: unknown) => Number.isInteger(v) && (v as number) >= 1;
  const ratio = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;
  const skillIds = new Set<string>(SKILL_IDS);
  const formIds = new Set(cfg.forms.map((f) => f.id));

  check(cfg.stages.some((s) => s.id === d.unlockStage), `unlockStage: 없는 스테이지 ${d.unlockStage}`);
  check(posInt(d.levels.count) && posInt(d.levels.refStageBase) && posInt(d.levels.refStageStep), 'levels: count · refStageBase · refStageStep 은 1 이상 정수');

  const w = d.waves;
  check(w.monsters.length > 0, 'waves.monsters: 비어 있음');
  w.monsters.forEach((n, i) => {
    const boss = w.bosses[String(i + 1)];
    if (boss) check(n === 0, `waves.monsters[${i}]: 보스 웨이브는 0`);
    else check(posInt(n), `waves.monsters[${i}]: 1 이상 정수`);
  });
  for (const [wave, id] of Object.entries(w.bosses)) {
    check(Number(wave) >= 1 && Number(wave) <= w.monsters.length, `waves.bosses.${wave}: 없는 웨이브`);
    check(id in d.bosses, `waves.bosses.${wave}: 없는 보스 '${id}'`);
  }
  check(posInt(w.maxOnField) && w.maxOnField <= SLOTS.length, `waves.maxOnField: 1 ~ ${SLOTS.length}`);
  check(w.hpMul > 0 && w.atkMul > 0 && w.intervalMul > 0 && w.hpPerWave >= 0 && w.atkPerWave >= 0, 'waves: 배율은 양수, 웨이브 상승은 0 이상');
  check(posInt(w.startMs) && posInt(w.gapMs) && posInt(w.clearDelayMs) && posInt(w.burst), 'waves: startMs · gapMs · clearDelayMs · burst 는 1 이상 정수');
  check(ratio(w.clearHeal) && ratio(w.regenOnKill), 'waves.clearHeal · regenOnKill: 0~1');

  check(d.picks.beforeWaves.every((n) => n >= 1 && n <= w.monsters.length), 'picks.beforeWaves: 없는 웨이브');
  check(posInt(d.picks.size) && Number.isInteger(d.picks.rerolls) && d.picks.rerolls >= 0, 'picks: size 는 1 이상, rerolls 는 0 이상 정수');
  validateUltimate(d.ultimate, 'dungeon.ultimate', errors);
  check(d.burn.dpsRatio > 0 && posInt(d.burn.durationMs) && posInt(d.burn.maxStacks), 'burn: dpsRatio 양수, durationMs · maxStacks 는 1 이상 정수');
  const r = d.rewards;
  check(r.goldMul > 0, 'rewards.goldMul: 양수');
  check([r.crystalsPerWave, r.crystalsPerBoss, r.crystalsClear, r.firstClearGems.base, r.firstClearGems.perLevel, r.synergyGems].every((n) => Number.isInteger(n) && n >= 0), 'rewards: 0 이상 정수');

  for (const id of SKILL_IDS) {
    const s = d.skills[id];
    if (!s) {
      errors.push(`dungeon.skills.${id}: 없음`);
      continue;
    }
    check(s.levels.length > 0, `skills.${id}.levels: 비어 있음`);
    s.levels.forEach((lv, i) => {
      const bad = Object.entries(lv).filter(([k, v]) => (typeof v === 'number' ? !(v >= 0) || (['every', 'jumps', 'extra', 'maxStacks', 'durationMs', 'cooldownMs'].includes(k) && !posInt(v)) : typeof v !== 'boolean'));
      check(bad.length === 0, `skills.${id}.levels[${i}]: 잘못된 값 ${bad.map(([k]) => k).join(', ')}`);
      if ('falloff' in lv) check(ratio(lv.falloff) && ratio(lv.stunChance), `skills.${id}.levels[${i}]: falloff · stunChance 는 0~1`);
      if ('ratio' in lv) check(ratio(lv.ratio) && ratio(lv.hpBelow), `skills.${id}.levels[${i}]: ratio · hpBelow 는 0~1`);
    });
  }
  for (const id of SYNERGY_IDS) {
    const s = d.synergies[id];
    if (!s) {
      errors.push(`dungeon.synergies.${id}: 없음`);
      continue;
    }
    check(s.skills.length === 2 && s.skills.every((k) => skillIds.has(k)) && s.skills[0] !== s.skills[1], `synergies.${id}.skills: 서로 다른 스킬 둘`);
  }
  for (const [id, f] of Object.entries(d.forms)) {
    check(formIds.has(id), `forms.${id}: 없는 형태`);
    check(skillIds.has(f.affinity), `forms.${id}.affinity: 없는 스킬 '${f.affinity}'`);
  }
  uniqueIds(d.links.map((l) => l.id), 'dungeon.links', errors);
  for (const l of d.links) {
    check(l.requires.length > 0, `links.${l.id}.requires: 비어 있음`);
    for (const req of l.requires) {
      check((req.form === undefined || formIds.has(req.form)) && (req.skill === undefined || skillIds.has(req.skill)) && (req.form !== undefined || req.skill !== undefined), `links.${l.id}.requires: 형태나 스킬 하나`);
    }
    check(['allyHeal', 'guardBoost', 'allyBurn', 'allySplit'].includes(l.effect.kind), `links.${l.id}.effect: 모르는 종류 '${l.effect.kind}'`);
  }
  for (const [id, b] of Object.entries(d.bosses)) {
    const p = `bosses.${id}`;
    check(monsterIds.has(b.monster), `${p}.monster: 없는 몬스터 '${b.monster}'`);
    check(b.hpMul > 0 && b.atkMul > 0, `${p}: hpMul · atkMul 양수`);
    check(posInt(b.attackIntervalMs) && posInt(b.firstPatternMs) && posInt(b.patternGapMs), `${p}: 간격은 1 이상 정수`);
    check(b.damageReduction >= 0 && b.damageReduction < 1, `${p}.damageReduction: 0 이상 1 미만`);
    check(b.enrage.hpBelowRatio > 0 && b.enrage.hpBelowRatio < 1 && b.enrage.gapMul > 0 && b.enrage.windupMul > 0, `${p}.enrage: 범위`);
    check(b.cycle.length > 0, `${p}.cycle: 비어 있음`);
    b.cycle.forEach((pt, i) => {
      check(posInt(pt.windupMs), `${p}.cycle[${i}].windupMs: 1 이상 정수`);
      if (pt.kind === 'smash') check(pt.mul > 0 && ratio(pt.hpRatio), `${p}.cycle[${i}]: mul 양수, hpRatio 0~1`);
      else if (pt.kind === 'breath') check(pt.mul > 0 && ratio(pt.hpRatio) && ratio(pt.weakenTo) && Number.isInteger(pt.burnStacks) && pt.burnStacks >= 0, `${p}.cycle[${i}]: mul 양수, hpRatio · weakenTo 0~1`);
      else if (pt.kind === 'guard') check(posInt(pt.durationMs) && pt.reduction > 0 && pt.reduction < 1, `${p}.cycle[${i}]: durationMs · reduction`);
      else if (pt.kind === 'summon') check(posInt(pt.count) && monsterIds.has(pt.monster), `${p}.cycle[${i}]: count · monster`);
      else errors.push(`dungeon.${p}.cycle[${i}]: 모르는 패턴`);
    });
  }
  uniqueIds(d.research.map((x) => x.id), 'dungeon.research', errors);
  for (const x of d.research) {
    check(['hp', 'charge', 'reroll', 'choice'].includes(x.stat), `research.${x.id}.stat: 모르는 값 '${x.stat}'`);
    check(x.perLevel > 0 && posInt(x.maxLevel) && x.cost.base > 0 && x.cost.growth >= 1, `research.${x.id}: perLevel · maxLevel · cost`);
  }
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

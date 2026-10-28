import { findMonster, findStage } from './lookup';
import type { CombatStats } from './model/battle';
import type { BalanceConfig, GameConfig } from './model/config';
import type { EffectSpec } from './model/effects';
import type { MonsterId, StageId } from './model/ids';
import type { SlimeProgress } from './model/progress';

/** 스테이지 기준 수치. overrides 가 있으면 공식 대신 쓴다 */
export function stageBase(cfg: GameConfig, stageId: StageId): { hp: number; atk: number; goldPerKill: number } {
  const stage = findStage(cfg, stageId);
  const sc = cfg.balance.stageScaling;
  const power = sc.powerGrowth ** (stageId - 1);
  return {
    hp: stage.overrides?.hp ?? sc.hpBase * power,
    atk: stage.overrides?.atk ?? sc.atkBase * power,
    goldPerKill: stage.overrides?.goldPerKill ?? sc.goldBase * sc.goldGrowth ** (stageId - 1),
  };
}

/** 같은 종류의 효과를 합치고 상한을 적용한다 */
export function applyEffects(base: CombatStats, effects: readonly EffectSpec[], caps: BalanceConfig['caps']): CombatStats {
  let lifesteal = base.lifesteal;
  let damageReduction = base.damageReduction;
  let burn = base.burn;
  for (const e of effects) {
    switch (e.kind) {
      case 'lifesteal':
        lifesteal += e.ratio;
        break;
      case 'damageReduction':
        damageReduction += e.ratio;
        break;
      case 'burnOnHit':
        burn = burn
          ? {
              chance: Math.min(1, burn.chance + e.chance),
              dpsRatio: Math.max(burn.dpsRatio, e.dpsRatio),
              durationMs: Math.max(burn.durationMs, e.durationMs),
              maxStacks: Math.max(burn.maxStacks, e.maxStacks),
            }
          : { chance: Math.min(1, e.chance), dpsRatio: e.dpsRatio, durationMs: e.durationMs, maxStacks: e.maxStacks };
        break;
    }
  }
  return {
    ...base,
    critChance: Math.min(caps.critChance, base.critChance),
    lifesteal: Math.min(caps.lifesteal, lifesteal),
    damageReduction: Math.min(caps.damageReduction, damageReduction),
    burn,
  };
}

export function deriveSlimeStats(slime: SlimeProgress, cfg: GameConfig): CombatStats {
  const b = cfg.balance.slimeBase;
  let attack = b.attack;
  for (const up of cfg.upgrades) {
    const level = slime.upgrades[up.id] ?? 0;
    switch (up.id) {
      case 'attack':
        attack += up.perLevel * level;
        break;
    }
  }
  return applyEffects(
    {
      maxHp: b.maxHp,
      attack,
      attackIntervalMs: b.attackIntervalMs,
      critChance: b.critChance,
      critMultiplier: b.critMultiplier,
      lifesteal: 0,
      damageReduction: 0,
      burn: null,
    },
    [],
    cfg.balance.caps,
  );
}

export function deriveMonsterStats(monsterId: MonsterId, stageId: StageId, cfg: GameConfig): CombatStats {
  const m = findMonster(cfg, monsterId);
  const base = stageBase(cfg, stageId);
  return applyEffects(
    {
      maxHp: Math.max(1, Math.round(base.hp * m.hpMul)),
      attack: Math.max(1, Math.round(base.atk * m.atkMul)),
      attackIntervalMs: m.attackIntervalMs,
      critChance: 0,
      critMultiplier: 1,
      lifesteal: 0,
      damageReduction: 0,
      burn: null,
    },
    m.effects,
    cfg.balance.caps,
  );
}

export function monsterGold(monsterId: MonsterId, stageId: StageId, cfg: GameConfig): number {
  const m = findMonster(cfg, monsterId);
  return Math.max(1, Math.round(stageBase(cfg, stageId).goldPerKill * m.goldMul));
}

using System;
using System.Collections.Generic;

namespace Slimora.Core.Legacy
{
    /// <summary>core/stats.ts 의 몬스터 쪽 · core/battle/damage.ts 를 옮긴 것</summary>
    public static class LegacyStats
    {
        public struct StageBase { public double Hp, Atk, GoldPerKill, AbsorbPerKill; }

        public static StageBase Base(LegacyConfig cfg, int stageId)
        {
            var stage = cfg.FindStage(stageId);
            var sc = cfg.StageScaling;
            double power = Math.Pow(sc.PowerGrowth, stageId - 1);
            return new StageBase
            {
                Hp = stage.HpOverride ?? sc.HpBase * power,
                Atk = stage.AtkOverride ?? sc.AtkBase * power,
                GoldPerKill = stage.GoldOverride ?? sc.GoldBase * Math.Pow(sc.GoldGrowth, stageId - 1),
                AbsorbPerKill = stage.AbsorbOverride ?? 1 + Math.Floor((stageId - 1) / sc.AbsorbStep),
            };
        }

        public static CombatStats ApplyEffects(CombatStats b, IEnumerable<EffectSpec> effects, Caps caps)
        {
            double lifesteal = b.Lifesteal, dr = b.DamageReduction;
            BurnSpec burn = b.Burn;
            HeavySpec heavy = b.HeavyAttack;
            EnrageSpec enrage = b.Enrage;
            foreach (var e in effects)
            {
                switch (e.Kind)
                {
                    case EffectKind.Lifesteal: lifesteal += e.Ratio; break;
                    case EffectKind.DamageReduction: dr += e.Ratio; break;
                    case EffectKind.BurnOnHit:
                        burn = burn != null
                            ? new BurnSpec { Chance = Math.Min(1, burn.Chance + e.Chance), DpsRatio = Math.Max(burn.DpsRatio, e.DpsRatio), DurationMs = Math.Max(burn.DurationMs, e.DurationMs), MaxStacks = Math.Max(burn.MaxStacks, e.MaxStacks) }
                            : new BurnSpec { Chance = Math.Min(1, e.Chance), DpsRatio = e.DpsRatio, DurationMs = e.DurationMs, MaxStacks = e.MaxStacks };
                        break;
                    case EffectKind.HeavyAttack:
                        heavy = heavy != null ? new HeavySpec { Every = Math.Min(heavy.Every, e.Every), Multiplier = Math.Max(heavy.Multiplier, e.Multiplier) } : new HeavySpec { Every = e.Every, Multiplier = e.Multiplier };
                        break;
                    case EffectKind.Enrage:
                        enrage = enrage != null
                            ? new EnrageSpec { HpBelowRatio = Math.Max(enrage.HpBelowRatio, e.HpBelowRatio), AttackIntervalMul = Math.Min(enrage.AttackIntervalMul, e.AttackIntervalMul) }
                            : new EnrageSpec { HpBelowRatio = e.HpBelowRatio, AttackIntervalMul = e.AttackIntervalMul };
                        break;
                }
            }
            var s = b.Clone();
            s.CritChance = Math.Min(caps.CritChance, b.CritChance);
            s.Lifesteal = Math.Min(caps.Lifesteal, lifesteal);
            s.DamageReduction = Math.Min(caps.DamageReduction, dr);
            s.Burn = burn;
            s.HeavyAttack = heavy;
            s.Enrage = enrage;
            return s;
        }

        public static CombatStats DeriveMonsterStats(string monsterId, int stageId, LegacyConfig cfg)
        {
            var m = cfg.FindMonster(monsterId);
            var b = Base(cfg, stageId);
            return ApplyEffects(new CombatStats
            {
                MaxHp = Math.Max(1, JsMath.Round(b.Hp * m.HpMul)),
                Attack = Math.Max(1, JsMath.Round(b.Atk * m.AtkMul)),
                AttackIntervalMs = m.AttackIntervalMs,
                CritChance = 0,
                CritMultiplier = 1,
            }, m.Effects, cfg.Caps);
        }

        public static double MonsterGold(string monsterId, int stageId, LegacyConfig cfg) =>
            Math.Max(1, JsMath.Round(Base(cfg, stageId).GoldPerKill * cfg.FindMonster(monsterId).GoldMul));

        public static double MonsterAbsorb(string monsterId, int stageId, LegacyConfig cfg) =>
            Math.Max(1, JsMath.Round(Base(cfg, stageId).AbsorbPerKill * cfg.FindMonster(monsterId).AbsorbMul));
    }

    public struct HitResult { public double Amount; public bool Crit; public double ReducedBy; }

    public sealed class BurnState { public double Stacks, DpsPerStack, EndsAt, NextTickAt; }

    public static class Damage
    {
        /// <summary>최종피해 = max(1, floor(공격력 × 치명타배율 × 강타배율 × (1 − 피해감소)))</summary>
        public static HitResult ComputeHit(CombatStats attacker, CombatStats defender, double critRoll, double heavyMultiplier = 1)
        {
            bool crit = critRoll < attacker.CritChance;
            double raw = attacker.Attack * (crit ? attacker.CritMultiplier : 1) * heavyMultiplier;
            double amount = Math.Max(1, Math.Floor(raw * (1 - defender.DamageReduction)));
            return new HitResult { Amount = amount, Crit = crit, ReducedBy = Math.Max(0, Math.Floor(raw) - amount) };
        }

        public static double Lifesteal(double damage, double ratio) => Math.Floor(damage * ratio);

        public static double BurnTick(BurnState burn, double tickMs) => Math.Max(1, Math.Floor(burn.Stacks * burn.DpsPerStack * tickMs / 1000));

        public static BurnState ApplyBurn(BurnState current, BurnSpec spec, double attackerAttack, double now, double tickMs)
        {
            double dps = attackerAttack * spec.DpsRatio;
            if (current == null) return new BurnState { Stacks = 1, DpsPerStack = dps, EndsAt = now + spec.DurationMs, NextTickAt = now + tickMs };
            return new BurnState { Stacks = Math.Min(spec.MaxStacks, current.Stacks + 1), DpsPerStack = Math.Max(current.DpsPerStack, dps), EndsAt = now + spec.DurationMs, NextTickAt = current.NextTickAt };
        }
    }
}

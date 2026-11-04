using System;
using System.Collections.Generic;

namespace Slimora.Core.Legacy
{
    // core/battle/engine.ts 를 한 줄씩 옮긴 본편 전투. 행동을 예정 시각 순서로 처리하므로 dt 를 어떻게 나눠도 결과가 같다.
    // 회귀 기준은 CoreTests/vectors/battles.json (TS 엔진 출력) 이다 — 고치면 벡터와 다시 맞춰 본다

    public enum Side { Slime, Monster }
    public enum BattleMode { Challenge, Farm }
    public enum BattlePhase { Spawning, Fighting, SlimeDown, Cleared, Failed }

    public class UnitState
    {
        public CombatStats Stats;
        public double Hp, NextAttackAt, Attacks;
        public BurnState Burn;
        public bool Enraged;
    }

    public sealed class MonsterState : UnitState
    {
        public string DefId, Family;
        public int Seq;
        public double Gold, Absorb;
        public bool IsBoss;
    }

    public sealed class AllyStats { public string Id; public double Power, IntervalMs; }
    public sealed class AllyState { public string Id; public double Power, IntervalMs, NextAttackAt; }

    public sealed class BattleState
    {
        public double Now;
        public int StageId;
        public BattleMode Mode;
        public BattlePhase Phase;
        public double PhaseUntil, Kills, KillsToClear;
        public UnitState Slime;
        public MonsterState Monster;
        public bool BossDue;
        public double? BossEndsAt;
        public RngState Rng;
        public int Seq;
        public double GoldMul;
        public List<AllyState> Allies = new List<AllyState>();
        public double UltCharge, UltChargedAt;
    }

    public enum EventType { MonsterSpawned, Attack, Damage, Ultimate, AllyAttack, Heal, BurnApplied, HeavyWarning, Enraged, MonsterKilled, SlimeDied, Respawned, StageCleared, ChallengeFailed }

    public sealed class BattleEvent
    {
        public EventType Type;
        public double At;
        public Side Side; // by / to / side
        public double Amount, ReducedBy, MaxHp, Gold, Absorb, Stacks;
        public bool Crit, Heavy, Boss, Interrupted;
        public string Source, DefId, Family, Id, Reason;
        public int Seq, Index, StageId;

        static string S(Side s) => s == Side.Slime ? "slime" : "monster";
        static string B(bool b) => b ? "true" : "false";
        static string N(double v) => JsMath.Str(v);

        /// <summary>tools/export-vectors.ts 의 eventLine 과 같은 형식</summary>
        public string ToLine()
        {
            switch (Type)
            {
                case EventType.MonsterSpawned: return $"spawn|{N(At)}|{DefId}|{Seq}|{N(MaxHp)}|{B(Boss)}";
                case EventType.Attack: return $"attack|{N(At)}|{S(Side)}";
                case EventType.Damage: return $"damage|{N(At)}|{S(Side)}|{N(Amount)}|{B(Crit)}|{Source}|{N(ReducedBy)}|{B(Heavy)}";
                case EventType.Ultimate: return $"ultimate|{N(At)}|{N(Amount)}|{B(Interrupted)}";
                case EventType.AllyAttack: return $"ally|{N(At)}|{Index}|{Id}";
                case EventType.Heal: return $"heal|{N(At)}|{S(Side)}|{N(Amount)}|{Source}";
                case EventType.BurnApplied: return $"burn|{N(At)}|{S(Side)}|{N(Stacks)}";
                case EventType.HeavyWarning: return $"heavyWarning|{N(At)}|{S(Side)}";
                case EventType.Enraged: return $"enraged|{N(At)}|{S(Side)}";
                case EventType.MonsterKilled: return $"killed|{N(At)}|{DefId}|{Family}|{Seq}|{N(Gold)}|{N(Absorb)}";
                case EventType.SlimeDied: return $"slimeDied|{N(At)}";
                case EventType.Respawned: return $"respawned|{N(At)}";
                case EventType.StageCleared: return $"cleared|{N(At)}|{StageId}";
                case EventType.ChallengeFailed: return $"failed|{N(At)}|{StageId}|{Reason}";
            }
            throw new InvalidOperationException();
        }
    }

    public sealed class BattleInit
    {
        public int StageId;
        public BattleMode Mode;
        public CombatStats Slime;
        public int Seed;
        public double GoldMul = 1;
        public List<AllyStats> Allies = new List<AllyStats>();
        public double? UltimateCharge;
    }

    public static class StageBattle
    {
        enum Act { Spawn, Revive, SlimeBurn, MonsterBurn, SlimeAttack, MonsterAttack, BossTimeout, AllyAttack }

        const int MaxActionsPerStep = 100_000;

        public static BattleState Create(BattleInit init, LegacyConfig cfg)
        {
            var stage = cfg.FindStage(init.StageId);
            var u = cfg.Ultimate;
            var s = new BattleState
            {
                Now = 0,
                StageId = init.StageId,
                Mode = init.Mode,
                Phase = BattlePhase.Spawning,
                PhaseUntil = cfg.Battle.SpawnDelayMs,
                KillsToClear = stage.KillsToClear,
                Slime = new UnitState { Stats = init.Slime.Clone(), Hp = init.Slime.MaxHp },
                Rng = new RngState(init.Seed),
                GoldMul = init.GoldMul,
                UltCharge = Math.Min(u.Max, Math.Max(0, init.UltimateCharge ?? u.Start)),
            };
            foreach (var a in init.Allies) s.Allies.Add(new AllyState { Id = a.Id, Power = a.Power, IntervalMs = a.IntervalMs });
            return s;
        }

        public static bool UltimateReady(BattleState s, LegacyConfig cfg) => s.UltCharge >= cfg.Ultimate.Max;
        public static bool IsFinished(BattleState s) => s.Phase == BattlePhase.Cleared || s.Phase == BattlePhase.Failed;

        /// <summary>필살기. 게이지가 덜 찼거나 몬스터가 없으면 null</summary>
        public static List<BattleEvent> UseUltimate(BattleState s, LegacyConfig cfg)
        {
            var u = cfg.Ultimate;
            var m = s.Monster;
            if (s.Phase != BattlePhase.Fighting || m == null || s.UltCharge < u.Max) return null;
            double at = s.Now;
            var events = new List<BattleEvent>();
            s.UltCharge = 0;
            var heavy = m.Stats.HeavyAttack;
            bool interrupted = heavy != null && (m.Attacks + 1) % heavy.Every == 0;
            if (interrupted)
            {
                m.Attacks = 0;
                m.NextAttackAt = Math.Max(m.NextAttackAt, at + u.StaggerMs);
            }
            double amount = Math.Max(1, Math.Floor(s.Slime.Stats.Attack * u.DamageMul * (1 - m.Stats.DamageReduction * (1 - u.ArmorPierce))));
            events.Add(new BattleEvent { Type = EventType.Ultimate, At = at, Amount = amount, Interrupted = interrupted });
            m.Hp = Math.Max(0, m.Hp - amount);
            events.Add(new BattleEvent { Type = EventType.Damage, At = at, Side = Side.Monster, Amount = amount, Source = "ultimate" });
            CheckEnrage(m, Side.Monster, at, events);
            if (m.Hp <= 0) OnDeath(s, Side.Monster, cfg, events);
            return events;
        }

        static void ChargeUltimate(BattleState s, double t, LegacyConfig cfg)
        {
            var u = cfg.Ultimate;
            if (s.Phase == BattlePhase.Fighting && t > s.UltChargedAt) s.UltCharge = Math.Min(u.Max, s.UltCharge + u.PerSecond * (t - s.UltChargedAt) / 1000);
            s.UltChargedAt = t;
        }

        public static List<BattleEvent> Step(BattleState s, double dtMs, LegacyConfig cfg)
        {
            var events = new List<BattleEvent>();
            double until = s.Now + Math.Max(0, dtMs);
            for (int i = 0; ; i++)
            {
                if (i >= MaxActionsPerStep) throw new InvalidOperationException("전투 행동이 너무 많다 — 공격 간격 설정을 확인");
                if (!NextAction(s, out double at, out Act act, out int index) || at > until) break;
                ChargeUltimate(s, at, cfg);
                s.Now = at;
                Perform(s, act, cfg, events, index);
            }
            ChargeUltimate(s, until, cfg);
            s.Now = until;
            return events;
        }

        /// <summary>같은 시각이면 화상 틱 → 슬라임 공격 → 몬스터 공격 → 보스 시간 초과 → 용병 순</summary>
        static bool NextAction(BattleState s, out double at, out Act act, out int index)
        {
            at = 0; act = Act.Spawn; index = 0;
            switch (s.Phase)
            {
                case BattlePhase.Spawning: at = s.PhaseUntil; act = Act.Spawn; return true;
                case BattlePhase.SlimeDown: at = s.PhaseUntil; act = Act.Revive; return true;
                case BattlePhase.Fighting:
                    {
                        var m = s.Monster;
                        if (m == null) return false;
                        bool found = false;
                        double best = 0;
                        Act bestAct = Act.Spawn;
                        var candidates = new (double? t, Act a)[]
                        {
                            (s.Slime.Burn?.NextTickAt, Act.SlimeBurn),
                            (m.Burn?.NextTickAt, Act.MonsterBurn),
                            (s.Slime.NextAttackAt, Act.SlimeAttack),
                            (m.NextAttackAt, Act.MonsterAttack),
                            (m.IsBoss ? s.BossEndsAt : null, Act.BossTimeout),
                        };
                        foreach (var (t, a) in candidates)
                        {
                            if (t.HasValue && (!found || t.Value < best)) { best = t.Value; bestAct = a; found = true; }
                        }
                        for (int i = 0; i < s.Allies.Count; i++)
                        {
                            if (!found || s.Allies[i].NextAttackAt < best) { best = s.Allies[i].NextAttackAt; bestAct = Act.AllyAttack; index = i; found = true; }
                        }
                        at = best;
                        act = bestAct;
                        return found;
                    }
                default: return false;
            }
        }

        static void Perform(BattleState s, Act act, LegacyConfig cfg, List<BattleEvent> events, int index)
        {
            switch (act)
            {
                case Act.AllyAttack: AllyAttack(s, index, cfg, events); break;
                case Act.Spawn: Spawn(s, cfg, events); break;
                case Act.Revive: Revive(s, cfg, events); break;
                case Act.SlimeBurn: BurnTick(s, Side.Slime, cfg, events); break;
                case Act.MonsterBurn: BurnTick(s, Side.Monster, cfg, events); break;
                case Act.SlimeAttack: Attack(s, Side.Slime, cfg, events); break;
                case Act.MonsterAttack: Attack(s, Side.Monster, cfg, events); break;
                case Act.BossTimeout:
                    s.Monster = null;
                    s.Slime.Burn = null;
                    s.BossEndsAt = null;
                    s.Phase = BattlePhase.Failed;
                    events.Add(new BattleEvent { Type = EventType.ChallengeFailed, At = s.Now, StageId = s.StageId, Reason = "timeout" });
                    break;
            }
        }

        static UnitState UnitOf(BattleState s, Side side) => side == Side.Slime ? s.Slime : (UnitState)s.Monster ?? throw new InvalidOperationException("몬스터가 없는데 몬스터 행동이 예정됨");

        static void Spawn(BattleState s, LegacyConfig cfg, List<BattleEvent> events)
        {
            var stage = cfg.FindStage(s.StageId);
            var boss = s.BossDue && stage.Boss != null ? stage.Boss : null;
            string defId = boss != null ? boss.Monster : PickSpawn(stage, Rng.NextFloat(s.Rng));
            var def = cfg.FindMonster(defId);
            var stats = LegacyStats.DeriveMonsterStats(defId, s.StageId, cfg);
            int seq = ++s.Seq;
            s.Monster = new MonsterState
            {
                Stats = stats,
                Hp = stats.MaxHp,
                NextAttackAt = s.Now + stats.AttackIntervalMs,
                DefId = defId,
                Family = def.Family,
                Seq = seq,
                Gold = JsMath.Round(LegacyStats.MonsterGold(defId, s.StageId, cfg) * s.GoldMul),
                Absorb = LegacyStats.MonsterAbsorb(defId, s.StageId, cfg),
                IsBoss = boss != null,
            };
            if (boss != null)
            {
                s.BossDue = false;
                s.BossEndsAt = s.Now + boss.TimeLimitMs;
            }
            s.Slime.NextAttackAt = s.Now + s.Slime.Stats.AttackIntervalMs;
            for (int i = 0; i < s.Allies.Count; i++) s.Allies[i].NextAttackAt = s.Now + s.Allies[i].IntervalMs * (0.6 + 0.2 * i);
            s.Phase = BattlePhase.Fighting;
            events.Add(new BattleEvent { Type = EventType.MonsterSpawned, At = s.Now, DefId = defId, Seq = seq, MaxHp = stats.MaxHp, Boss = boss != null });
        }

        static string PickSpawn(StageDef stage, double roll)
        {
            double total = 0;
            foreach (var sp in stage.Spawns) total += sp.Weight;
            double target = roll * total;
            foreach (var sp in stage.Spawns)
            {
                target -= sp.Weight;
                if (target < 0) return sp.Monster;
            }
            return stage.Spawns[stage.Spawns.Count - 1].Monster;
        }

        static void Attack(BattleState s, Side side, LegacyConfig cfg, List<BattleEvent> events)
        {
            Side defSide = side == Side.Slime ? Side.Monster : Side.Slime;
            var attacker = UnitOf(s, side);
            var defender = UnitOf(s, defSide);
            double at = s.Now;

            attacker.NextAttackAt += attacker.Stats.AttackIntervalMs;
            attacker.Attacks += 1;
            var heavySpec = attacker.Stats.HeavyAttack;
            bool heavy = heavySpec != null && attacker.Attacks % heavySpec.Every == 0;
            double critRoll = attacker.Stats.CritChance > 0 ? Rng.NextFloat(s.Rng) : 1;
            var hit = Damage.ComputeHit(attacker.Stats, defender.Stats, critRoll, heavy ? heavySpec.Multiplier : 1);
            events.Add(new BattleEvent { Type = EventType.Attack, At = at, Side = side });

            defender.Hp = Math.Max(0, defender.Hp - hit.Amount);
            events.Add(new BattleEvent { Type = EventType.Damage, At = at, Side = defSide, Amount = hit.Amount, Crit = hit.Crit, Source = "hit", ReducedBy = hit.ReducedBy, Heavy = heavy });
            CheckEnrage(defender, defSide, at, events);

            if (attacker.Stats.Lifesteal > 0) Heal(attacker, Damage.Lifesteal(hit.Amount, attacker.Stats.Lifesteal), side, "lifesteal", at, events);

            var burn = attacker.Stats.Burn;
            if (burn != null && defender.Hp > 0 && Rng.NextFloat(s.Rng) < burn.Chance)
            {
                defender.Burn = Damage.ApplyBurn(defender.Burn, burn, attacker.Stats.Attack, at, cfg.Battle.BurnTickMs);
                events.Add(new BattleEvent { Type = EventType.BurnApplied, At = at, Side = defSide, Stacks = defender.Burn.Stacks });
            }

            if (defender.Hp <= 0)
            {
                OnDeath(s, defSide, cfg, events);
                return;
            }
            if (heavySpec != null && (attacker.Attacks + 1) % heavySpec.Every == 0) events.Add(new BattleEvent { Type = EventType.HeavyWarning, At = at, Side = side });
        }

        static void AllyAttack(BattleState s, int index, LegacyConfig cfg, List<BattleEvent> events)
        {
            var ally = s.Allies[index];
            var m = s.Monster;
            double at = s.Now;
            ally.NextAttackAt += ally.IntervalMs;
            var stats = s.Slime.Stats.Clone();
            stats.Attack = Math.Max(1, JsMath.Round(s.Slime.Stats.Attack * ally.Power));
            stats.CritChance = 0;
            var hit = Damage.ComputeHit(stats, m.Stats, 1);
            events.Add(new BattleEvent { Type = EventType.AllyAttack, At = at, Index = index, Id = ally.Id });
            m.Hp = Math.Max(0, m.Hp - hit.Amount);
            events.Add(new BattleEvent { Type = EventType.Damage, At = at, Side = Side.Monster, Amount = hit.Amount, Source = "ally", ReducedBy = hit.ReducedBy });
            CheckEnrage(m, Side.Monster, at, events);
            if (m.Hp <= 0) OnDeath(s, Side.Monster, cfg, events);
        }

        static void CheckEnrage(UnitState unit, Side side, double at, List<BattleEvent> events)
        {
            var e = unit.Stats.Enrage;
            if (e == null || unit.Enraged || unit.Hp <= 0 || unit.Hp > unit.Stats.MaxHp * e.HpBelowRatio) return;
            unit.Enraged = true;
            var st = unit.Stats.Clone();
            st.AttackIntervalMs = Math.Max(1, JsMath.Round(unit.Stats.AttackIntervalMs * e.AttackIntervalMul));
            unit.Stats = st;
            events.Add(new BattleEvent { Type = EventType.Enraged, At = at, Side = side });
        }

        static void BurnTick(BattleState s, Side side, LegacyConfig cfg, List<BattleEvent> events)
        {
            var unit = UnitOf(s, side);
            var burn = unit.Burn;
            if (burn == null) return;
            double tickMs = cfg.Battle.BurnTickMs;
            double amount = Damage.BurnTick(burn, tickMs);
            unit.Hp = Math.Max(0, unit.Hp - amount);
            events.Add(new BattleEvent { Type = EventType.Damage, At = s.Now, Side = side, Amount = amount, Source = "burn" });
            CheckEnrage(unit, side, s.Now, events);
            burn.NextTickAt += tickMs;
            if (burn.NextTickAt > burn.EndsAt) unit.Burn = null;
            if (unit.Hp <= 0) OnDeath(s, side, cfg, events);
        }

        static void Heal(UnitState unit, double amount, Side side, string source, double at, List<BattleEvent> events)
        {
            double healed = Math.Min(amount, unit.Stats.MaxHp - unit.Hp);
            if (healed <= 0 || unit.Hp <= 0) return;
            unit.Hp += healed;
            events.Add(new BattleEvent { Type = EventType.Heal, At = at, Side = side, Amount = healed, Source = source });
        }

        static void OnDeath(BattleState s, Side side, LegacyConfig cfg, List<BattleEvent> events)
        {
            double at = s.Now;
            var b = cfg.Battle;
            if (side == Side.Monster)
            {
                var m = s.Monster;
                events.Add(new BattleEvent { Type = EventType.MonsterKilled, At = at, DefId = m.DefId, Family = m.Family, Seq = m.Seq, Gold = m.Gold, Absorb = m.Absorb });
                s.Kills += 1;
                s.Monster = null;
                s.UltCharge = Math.Min(cfg.Ultimate.Max, s.UltCharge + cfg.Ultimate.PerKill);
                s.Slime.Burn = null;
                Heal(s.Slime, Math.Floor(s.Slime.Stats.MaxHp * b.RegenOnKillRatio), Side.Slime, "regen", at, events);
                if (m.IsBoss) s.BossEndsAt = null;
                bool goalMet = s.Mode == BattleMode.Challenge && s.Kills >= s.KillsToClear;
                if (goalMet && !m.IsBoss && cfg.FindStage(s.StageId).Boss != null)
                {
                    s.BossDue = true;
                    s.Phase = BattlePhase.Spawning;
                    s.PhaseUntil = at + b.SpawnDelayMs;
                }
                else if (goalMet)
                {
                    s.Phase = BattlePhase.Cleared;
                    events.Add(new BattleEvent { Type = EventType.StageCleared, At = at, StageId = s.StageId });
                }
                else
                {
                    s.Phase = BattlePhase.Spawning;
                    s.PhaseUntil = at + b.SpawnDelayMs;
                }
                return;
            }
            events.Add(new BattleEvent { Type = EventType.SlimeDied, At = at });
            s.Monster = null;
            s.Slime.Burn = null;
            s.Phase = BattlePhase.SlimeDown;
            s.PhaseUntil = at + b.DeathDelayMs;
        }

        static void Revive(BattleState s, LegacyConfig cfg, List<BattleEvent> events)
        {
            if (s.Mode == BattleMode.Challenge)
            {
                s.Phase = BattlePhase.Failed;
                s.BossDue = false;
                s.BossEndsAt = null;
                events.Add(new BattleEvent { Type = EventType.ChallengeFailed, At = s.Now, StageId = s.StageId, Reason = "death" });
                return;
            }
            s.Slime.Hp = s.Slime.Stats.MaxHp;
            events.Add(new BattleEvent { Type = EventType.Respawned, At = s.Now });
            s.Phase = BattlePhase.Spawning;
            s.PhaseUntil = s.Now + cfg.Battle.SpawnDelayMs;
        }

        public static string StateLine(BattleState s)
        {
            string N(double v) => JsMath.Str(v);
            string phase = s.Phase switch { BattlePhase.Spawning => "spawning", BattlePhase.Fighting => "fighting", BattlePhase.SlimeDown => "slimeDown", BattlePhase.Cleared => "cleared", _ => "failed" };
            return string.Join("|", new[]
            {
                N(s.Now), phase, N(s.PhaseUntil), N(s.Kills), N(s.Slime.Hp), N(s.Monster?.Hp ?? -1), s.Monster?.DefId ?? "-",
                s.BossDue ? "true" : "false", N(s.BossEndsAt ?? -1), s.Rng.S.ToString(System.Globalization.CultureInfo.InvariantCulture), s.Seq.ToString(), N(s.UltCharge),
            });
        }
    }
}

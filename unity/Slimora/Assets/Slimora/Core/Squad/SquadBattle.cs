using System;
using System.Collections.Generic;

namespace Slimora.Core.Squad
{
    // 리뉴얼 프로토타입 전투 — 슬라임 + 용병 2 vs 적 여러 마리. 역할마다 고르는 대상과 하는 일이 다르다.
    // 본편 엔진과 같은 방식(예정 시각 순 처리 · 시드 난수)이라 dt 를 어떻게 나눠도 결과가 같다

    public enum Role { Slime, Tank, Striker, Mage, Healer, Grunt, Brute, Caster }
    public enum Team { Ally, Enemy }
    public enum SquadPhase { Fighting, Won, Lost }

    public sealed class UnitDef
    {
        public string Id, Name, Tint, Desc;
        public Role Role;
        public double Hp, Atk, IntervalMs, Dr, Crit, CritMul = 1, Aoe, Heal, HeavyEvery, HeavyMul = 1;
        public bool Taunt;

        public static UnitDef FromJson(object o) => new UnitDef
        {
            Id = J.Str(o, "id"), Name = J.Str(o, "name"), Tint = J.Str(o, "tint", "#ffffff"), Desc = J.Str(o, "desc", ""),
            Role = (Role)Enum.Parse(typeof(Role), J.Str(o, "role"), true),
            Hp = J.Num(o, "hp"), Atk = J.Num(o, "atk"), IntervalMs = J.Num(o, "intervalMs"),
            Dr = J.Num(o, "dr", 0), Crit = J.Num(o, "crit", 0), CritMul = J.Num(o, "critMul", 1),
            Aoe = J.Num(o, "aoe", 0), Heal = J.Num(o, "heal", 0),
            HeavyEvery = J.Num(o, "heavyEvery", 0), HeavyMul = J.Num(o, "heavyMul", 1), Taunt = J.Bool(o, "taunt"),
        };
    }

    public sealed class WaveDef { public string Name; public List<string> Enemies = new List<string>(); }

    public sealed class SquadConfig
    {
        public string Version;
        public double TimeLimitMs, LevelStat, StartJitter;
        public int PartySlots;
        public double UltMax, UltStart, UltPerSecond, UltPerKill, UltMul, UltArmorPierce, UltStaggerMs;
        public double WaveStat, GoldBase, GoldGrowth, UpgradeBase, UpgradeGrowth;
        public UnitDef Slime;
        public readonly List<UnitDef> Mercs = new List<UnitDef>();
        public readonly Dictionary<string, UnitDef> Enemies = new Dictionary<string, UnitDef>();
        public readonly List<WaveDef> Waves = new List<WaveDef>();

        public UnitDef Merc(string id) => Mercs.Find(m => m.Id == id) ?? throw new ArgumentException("없는 용병: " + id);

        public static SquadConfig FromJson(string text)
        {
            var root = MiniJson.Parse(text);
            var r = J.Get(root, "rules");
            var u = J.Get(root, "ultimate");
            var g = J.Get(root, "growth");
            var c = new SquadConfig
            {
                Version = J.Str(root, "version", "?"),
                TimeLimitMs = J.Num(r, "timeLimitMs"), PartySlots = (int)J.Num(r, "partySlots"), LevelStat = J.Num(r, "levelStat"), StartJitter = J.Num(r, "startJitter"),
                UltMax = J.Num(u, "max"), UltStart = J.Num(u, "start"), UltPerSecond = J.Num(u, "perSecond"), UltPerKill = J.Num(u, "perKill"),
                UltMul = J.Num(u, "mul"), UltArmorPierce = J.Num(u, "armorPierce"), UltStaggerMs = J.Num(u, "staggerMs"),
                WaveStat = J.Num(g, "waveStat"), GoldBase = J.Num(g, "goldBase"), GoldGrowth = J.Num(g, "goldGrowth"),
                UpgradeBase = J.Num(g, "upgradeBase"), UpgradeGrowth = J.Num(g, "upgradeGrowth"),
                Slime = UnitDef.FromJson(J.Get(root, "slime")),
            };
            foreach (var m in J.Arr(J.Get(root, "mercs"))) c.Mercs.Add(UnitDef.FromJson(m));
            foreach (var e in J.Arr(J.Get(root, "enemies"))) { var d = UnitDef.FromJson(e); c.Enemies[d.Id] = d; }
            foreach (var w in J.Arr(J.Get(root, "waves")))
            {
                var wd = new WaveDef { Name = J.Str(w, "name") };
                foreach (var id in J.Arr(J.Get(w, "enemies"))) wd.Enemies.Add((string)id);
                c.Waves.Add(wd);
            }
            return c;
        }

        /// <summary>웨이브 보상과 강화 비용 — 성장 루프용</summary>
        public double WaveGold(int wave) => Math.Floor(GoldBase * Math.Pow(GoldGrowth, wave - 1));
        public double UpgradeCost(int level) => Math.Floor(UpgradeBase * Math.Pow(UpgradeGrowth, level - 1));
    }

    public sealed class Unit
    {
        public int Index;
        public Team Team;
        public UnitDef Def;
        public double MaxHp, Hp, Atk, IntervalMs, NextActAt, Attacks;
        public bool Alive => Hp > 0;
        public Role Role => Def.Role;
        /// <summary>다음 공격이 강타 — 예고 중이다</summary>
        public bool HeavyNext => Def.HeavyEvery > 0 && (Attacks + 1) % Def.HeavyEvery == 0;
    }

    public enum SquadEventType { Spawned, Hit, Heal, Died, HeavyWarning, Ultimate, Interrupted, Won, Lost }

    public sealed class SquadEvent
    {
        public SquadEventType Type;
        public double At, Amount;
        public int Actor = -1, Target = -1;
        public bool Crit, Heavy, Aoe;
        public override string ToString() => $"{Type}|{At}|{Actor}>{Target}|{Amount}|{(Crit ? "C" : "")}{(Heavy ? "H" : "")}{(Aoe ? "A" : "")}";
    }

    public sealed class SquadSetup
    {
        public int Wave = 1;
        public int SlimeLevel = 1;
        public List<string> Party = new List<string>();
        public int MercLevel = 1;
        public int Seed;
    }

    public sealed class SquadState
    {
        public double Now;
        public SquadPhase Phase = SquadPhase.Fighting;
        public int Wave;
        public readonly List<Unit> Units = new List<Unit>();
        public RngState Rng;
        public double UltCharge, UltChargedAt;
        public double DamageDealt, DamageTaken;

        public IEnumerable<Unit> Team(Team t) { foreach (var u in Units) if (u.Team == t) yield return u; }
        public Unit Slime => Units[0];
    }

    public static class SquadBattle
    {
        const int MaxActionsPerStep = 100_000;

        public static SquadState Create(SquadSetup setup, SquadConfig cfg)
        {
            if (setup.Party.Count > cfg.PartySlots || new HashSet<string>(setup.Party).Count != setup.Party.Count) throw new ArgumentException("편성이 잘못됐다");
            if (setup.Wave < 1 || setup.Wave > cfg.Waves.Count) throw new ArgumentException("없는 웨이브: " + setup.Wave);
            var s = new SquadState { Wave = setup.Wave, Rng = new RngState(setup.Seed), UltCharge = cfg.UltStart };
            void Add(UnitDef d, Team team, double mul)
            {
                var u = new Unit { Index = s.Units.Count, Team = team, Def = d, MaxHp = JsMath.Round(d.Hp * mul), Atk = JsMath.Round(d.Atk * mul), IntervalMs = d.IntervalMs };
                u.Hp = u.MaxHp;
                u.NextActAt = JsMath.Round(d.IntervalMs * (1 - cfg.StartJitter + cfg.StartJitter * Rng.NextFloat(s.Rng)));
                s.Units.Add(u);
            }
            Add(cfg.Slime, Team.Ally, 1 + cfg.LevelStat * (setup.SlimeLevel - 1));
            foreach (var id in setup.Party) Add(cfg.Merc(id), Team.Ally, 1 + cfg.LevelStat * (setup.MercLevel - 1));
            double wm = Math.Pow(cfg.WaveStat, setup.Wave - 1);
            foreach (var id in cfg.Waves[setup.Wave - 1].Enemies) Add(cfg.Enemies[id], Team.Enemy, wm);
            return s;
        }

        public static bool UltReady(SquadState s, SquadConfig cfg) => s.Phase == SquadPhase.Fighting && s.Slime.Alive && s.UltCharge >= cfg.UltMax;

        public static List<SquadEvent> Step(SquadState s, double dtMs, SquadConfig cfg)
        {
            var ev = new List<SquadEvent>();
            double until = s.Now + Math.Max(0, dtMs);
            for (int i = 0; s.Phase == SquadPhase.Fighting; i++)
            {
                if (i >= MaxActionsPerStep) throw new InvalidOperationException("행동이 너무 많다");
                Unit next = null;
                foreach (var u in s.Units) if (u.Alive && (next == null || u.NextActAt < next.NextActAt)) next = u;
                double at = next?.NextActAt ?? double.MaxValue;
                if (at > cfg.TimeLimitMs && cfg.TimeLimitMs <= until)
                {
                    Charge(s, cfg.TimeLimitMs, cfg);
                    s.Now = cfg.TimeLimitMs;
                    s.Phase = SquadPhase.Lost;
                    ev.Add(new SquadEvent { Type = SquadEventType.Lost, At = s.Now });
                    return ev;
                }
                if (next == null || at > until) break;
                Charge(s, at, cfg);
                s.Now = at;
                Act(s, next, cfg, ev);
            }
            Charge(s, until, cfg);
            if (s.Phase == SquadPhase.Fighting) s.Now = until;
            return ev;
        }

        static void Charge(SquadState s, double t, SquadConfig cfg)
        {
            if (s.Phase == SquadPhase.Fighting && t > s.UltChargedAt) s.UltCharge = Math.Min(cfg.UltMax, s.UltCharge + cfg.UltPerSecond * (t - s.UltChargedAt) / 1000);
            s.UltChargedAt = Math.Max(s.UltChargedAt, t);
        }

        /// <summary>필살기 — 모든 적에게 큰 피해. 강타를 예고 중인 적은 끊기고 휘청인다</summary>
        public static List<SquadEvent> UseUltimate(SquadState s, SquadConfig cfg)
        {
            if (!UltReady(s, cfg)) return null;
            var ev = new List<SquadEvent>();
            s.UltCharge = 0;
            var slime = s.Slime;
            ev.Add(new SquadEvent { Type = SquadEventType.Ultimate, At = s.Now, Actor = slime.Index });
            foreach (var e in new List<Unit>(s.Team(Team.Enemy)))
            {
                if (!e.Alive) continue;
                if (e.HeavyNext)
                {
                    e.Attacks = 0;
                    e.NextActAt = Math.Max(e.NextActAt, s.Now + cfg.UltStaggerMs);
                    ev.Add(new SquadEvent { Type = SquadEventType.Interrupted, At = s.Now, Actor = slime.Index, Target = e.Index });
                }
                double amount = Math.Max(1, Math.Floor(slime.Atk * cfg.UltMul * (1 - e.Def.Dr * (1 - cfg.UltArmorPierce))));
                DealDamage(s, slime, e, amount, false, false, true, cfg, ev);
            }
            return ev;
        }

        static void Act(SquadState s, Unit u, SquadConfig cfg, List<SquadEvent> ev)
        {
            u.NextActAt += u.IntervalMs;
            switch (u.Role)
            {
                case Role.Healer:
                    {
                        Unit hurt = null;
                        foreach (var a in s.Team(Team.Ally)) if (a.Alive && a.Hp < a.MaxHp && (hurt == null || a.Hp / a.MaxHp < hurt.Hp / hurt.MaxHp)) hurt = a;
                        if (hurt != null)
                        {
                            double healed = Math.Min(hurt.MaxHp - hurt.Hp, Math.Floor(u.Atk * u.Def.Heal));
                            hurt.Hp += healed;
                            ev.Add(new SquadEvent { Type = SquadEventType.Heal, At = s.Now, Actor = u.Index, Target = hurt.Index, Amount = healed });
                            return;
                        }
                        Strike(s, u, Front(s, Team.Enemy), cfg, ev);
                        return;
                    }
                case Role.Mage:
                    {
                        foreach (var e in new List<Unit>(s.Team(Team.Enemy)))
                        {
                            if (!e.Alive || s.Phase != SquadPhase.Fighting) continue;
                            double amount = Math.Max(1, Math.Floor(u.Atk * u.Def.Aoe * (1 - e.Def.Dr)));
                            DealDamage(s, u, e, amount, false, false, true, cfg, ev);
                        }
                        return;
                    }
                case Role.Striker:
                    {
                        Unit target = null;
                        foreach (var e in s.Team(Team.Enemy)) if (e.Alive && e.Role == Role.Caster && (target == null || e.Hp < target.Hp)) target = e;
                        if (target == null) foreach (var e in s.Team(Team.Enemy)) if (e.Alive && (target == null || e.Hp < target.Hp)) target = e;
                        Strike(s, u, target, cfg, ev);
                        return;
                    }
                case Role.Caster:
                    {
                        // 도발을 무시하고 HP 가 가장 낮은 아군을 노린다
                        Unit target = null;
                        foreach (var a in s.Team(Team.Ally)) if (a.Alive && (target == null || a.Hp < target.Hp)) target = a;
                        Strike(s, u, target, cfg, ev);
                        return;
                    }
                case Role.Grunt:
                case Role.Brute:
                    {
                        Unit target = null;
                        foreach (var a in s.Team(Team.Ally)) if (a.Alive && a.Def.Taunt) { target = a; break; }
                        Strike(s, u, target ?? Front(s, Team.Ally), cfg, ev);
                        return;
                    }
                default:
                    Strike(s, u, Front(s, u.Team == Team.Ally ? Team.Enemy : Team.Ally), cfg, ev);
                    return;
            }
        }

        static Unit Front(SquadState s, Team t)
        {
            foreach (var u in s.Team(t)) if (u.Alive) return u;
            return null;
        }

        static void Strike(SquadState s, Unit u, Unit target, SquadConfig cfg, List<SquadEvent> ev)
        {
            if (target == null) return;
            u.Attacks += 1;
            bool heavy = u.Def.HeavyEvery > 0 && u.Attacks % u.Def.HeavyEvery == 0;
            bool crit = u.Def.Crit > 0 && Rng.NextFloat(s.Rng) < u.Def.Crit;
            double raw = u.Atk * (crit ? u.Def.CritMul : 1) * (heavy ? u.Def.HeavyMul : 1);
            double amount = Math.Max(1, Math.Floor(raw * (1 - target.Def.Dr)));
            DealDamage(s, u, target, amount, crit, heavy, false, cfg, ev);
            if (u.Alive && u.HeavyNext && s.Phase == SquadPhase.Fighting) ev.Add(new SquadEvent { Type = SquadEventType.HeavyWarning, At = s.Now, Actor = u.Index });
        }

        static void DealDamage(SquadState s, Unit from, Unit to, double amount, bool crit, bool heavy, bool aoe, SquadConfig cfg, List<SquadEvent> ev)
        {
            double dealt = Math.Min(amount, to.Hp);
            to.Hp -= dealt;
            if (to.Team == Team.Enemy) s.DamageDealt += dealt; else s.DamageTaken += dealt;
            ev.Add(new SquadEvent { Type = SquadEventType.Hit, At = s.Now, Actor = from.Index, Target = to.Index, Amount = amount, Crit = crit, Heavy = heavy, Aoe = aoe });
            if (to.Alive) return;
            ev.Add(new SquadEvent { Type = SquadEventType.Died, At = s.Now, Target = to.Index });
            if (to.Team == Team.Enemy) s.UltCharge = Math.Min(cfg.UltMax, s.UltCharge + cfg.UltPerKill);
            bool anyEnemy = false, anyAlly = false;
            foreach (var u in s.Units) { if (!u.Alive) continue; if (u.Team == Team.Enemy) anyEnemy = true; else anyAlly = true; }
            if (!anyEnemy) { s.Phase = SquadPhase.Won; ev.Add(new SquadEvent { Type = SquadEventType.Won, At = s.Now }); }
            else if (!anyAlly) { s.Phase = SquadPhase.Lost; ev.Add(new SquadEvent { Type = SquadEventType.Lost, At = s.Now }); }
        }
    }
}

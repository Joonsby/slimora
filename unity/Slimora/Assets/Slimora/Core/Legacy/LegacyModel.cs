using System;
using System.Collections.Generic;

namespace Slimora.Core.Legacy
{
    // TypeScript core/model/battle.ts · config.ts 의 본편 전투 부분을 옮긴 것. 이름과 필드 순서를 원본에 맞춘다

    public sealed class BurnSpec
    {
        public double Chance, DpsRatio, DurationMs, MaxStacks;
        public BurnSpec Clone() => (BurnSpec)MemberwiseClone();
    }

    public sealed class HeavySpec { public double Every, Multiplier; }
    public sealed class EnrageSpec { public double HpBelowRatio, AttackIntervalMul; }

    /// <summary>효과를 합산·상한 적용한 수치. 엔진은 이것만 본다</summary>
    public sealed class CombatStats
    {
        public double MaxHp, Attack, AttackIntervalMs, CritChance, CritMultiplier, Lifesteal, DamageReduction;
        public BurnSpec Burn;
        public HeavySpec HeavyAttack;
        public EnrageSpec Enrage;
        public CombatStats Clone() => (CombatStats)MemberwiseClone();

        public static CombatStats FromJson(object o)
        {
            var s = new CombatStats
            {
                MaxHp = J.Num(o, "maxHp"),
                Attack = J.Num(o, "attack"),
                AttackIntervalMs = J.Num(o, "attackIntervalMs"),
                CritChance = J.Num(o, "critChance"),
                CritMultiplier = J.Num(o, "critMultiplier"),
                Lifesteal = J.Num(o, "lifesteal"),
                DamageReduction = J.Num(o, "damageReduction"),
            };
            var b = J.Get(o, "burn");
            if (b != null) s.Burn = new BurnSpec { Chance = J.Num(b, "chance"), DpsRatio = J.Num(b, "dpsRatio"), DurationMs = J.Num(b, "durationMs"), MaxStacks = J.Num(b, "maxStacks") };
            var h = J.Get(o, "heavyAttack");
            if (h != null) s.HeavyAttack = new HeavySpec { Every = J.Num(h, "every"), Multiplier = J.Num(h, "multiplier") };
            var e = J.Get(o, "enrage");
            if (e != null) s.Enrage = new EnrageSpec { HpBelowRatio = J.Num(e, "hpBelowRatio"), AttackIntervalMul = J.Num(e, "attackIntervalMul") };
            return s;
        }
    }

    public enum EffectKind { Lifesteal, DamageReduction, BurnOnHit, HeavyAttack, Enrage }

    public sealed class EffectSpec
    {
        public EffectKind Kind;
        public double Ratio, Chance, DpsRatio, DurationMs, MaxStacks, Every, Multiplier, HpBelowRatio, AttackIntervalMul;

        public static EffectSpec FromJson(object o)
        {
            string kind = J.Str(o, "kind");
            var e = new EffectSpec();
            switch (kind)
            {
                case "lifesteal": e.Kind = EffectKind.Lifesteal; e.Ratio = J.Num(o, "ratio"); break;
                case "damageReduction": e.Kind = EffectKind.DamageReduction; e.Ratio = J.Num(o, "ratio"); break;
                case "burnOnHit":
                    e.Kind = EffectKind.BurnOnHit; e.Chance = J.Num(o, "chance"); e.DpsRatio = J.Num(o, "dpsRatio");
                    e.DurationMs = J.Num(o, "durationMs"); e.MaxStacks = J.Num(o, "maxStacks"); break;
                case "heavyAttack": e.Kind = EffectKind.HeavyAttack; e.Every = J.Num(o, "every"); e.Multiplier = J.Num(o, "multiplier"); break;
                case "enrage": e.Kind = EffectKind.Enrage; e.HpBelowRatio = J.Num(o, "hpBelowRatio"); e.AttackIntervalMul = J.Num(o, "attackIntervalMul"); break;
                default: throw new FormatException("모르는 효과: " + kind);
            }
            return e;
        }
    }

    public sealed class MonsterDef
    {
        public string Id, Family, Name;
        public double HpMul, AtkMul, AttackIntervalMs, GoldMul, AbsorbMul;
        public List<EffectSpec> Effects = new List<EffectSpec>();
    }

    public sealed class SpawnDef { public string Monster; public double Weight; }
    public sealed class BossDef { public string Monster; public double TimeLimitMs; }

    public sealed class StageDef
    {
        public int Id, Chapter;
        public string Name;
        public List<SpawnDef> Spawns = new List<SpawnDef>();
        public double KillsToClear;
        public BossDef Boss;
        public double? HpOverride, AtkOverride, GoldOverride, AbsorbOverride;
    }

    public sealed class BattleBalance { public double SpawnDelayMs, RegenOnKillRatio, DeathDelayMs, BurnTickMs; }
    public sealed class UltimateBalance { public double Max, Start, PerSecond, PerKill, DamageMul, ArmorPierce, StaggerMs; }
    public sealed class Caps { public double DamageReduction, Lifesteal, CritChance; }
    public sealed class StageScaling { public double HpBase, AtkBase, PowerGrowth, GoldBase, GoldGrowth, AbsorbStep; }

    /// <summary>본편 전투가 읽는 설정. tools/export-vectors.ts 가 내보낸 config.json (장 데이터를 편 결과) 을 그대로 읽는다</summary>
    public sealed class LegacyConfig
    {
        public string ConfigVersion;
        public BattleBalance Battle;
        public UltimateBalance Ultimate;
        public Caps Caps;
        public StageScaling StageScaling;
        public readonly Dictionary<string, MonsterDef> Monsters = new Dictionary<string, MonsterDef>();
        public readonly Dictionary<int, StageDef> Stages = new Dictionary<int, StageDef>();

        public StageDef FindStage(int id) => Stages.TryGetValue(id, out var s) ? s : throw new ArgumentException("없는 스테이지: " + id);
        public MonsterDef FindMonster(string id) => Monsters.TryGetValue(id, out var m) ? m : throw new ArgumentException("없는 몬스터: " + id);

        public static LegacyConfig FromJson(string text)
        {
            object root = MiniJson.Parse(text);
            var bal = J.Get(root, "balance");
            var b = J.Get(bal, "battle");
            var u = J.Get(bal, "ultimate");
            var c = J.Get(bal, "caps");
            var sc = J.Get(bal, "stageScaling");
            var cfg = new LegacyConfig
            {
                ConfigVersion = J.Str(root, "configVersion", "?"),
                Battle = new BattleBalance { SpawnDelayMs = J.Num(b, "spawnDelayMs"), RegenOnKillRatio = J.Num(b, "regenOnKillRatio"), DeathDelayMs = J.Num(b, "deathDelayMs"), BurnTickMs = J.Num(b, "burnTickMs") },
                Ultimate = new UltimateBalance { Max = J.Num(u, "max"), Start = J.Num(u, "start"), PerSecond = J.Num(u, "perSecond"), PerKill = J.Num(u, "perKill"), DamageMul = J.Num(u, "damageMul"), ArmorPierce = J.Num(u, "armorPierce"), StaggerMs = J.Num(u, "staggerMs") },
                Caps = new Caps { DamageReduction = J.Num(c, "damageReduction"), Lifesteal = J.Num(c, "lifesteal"), CritChance = J.Num(c, "critChance") },
                StageScaling = new StageScaling { HpBase = J.Num(sc, "hpBase"), AtkBase = J.Num(sc, "atkBase"), PowerGrowth = J.Num(sc, "powerGrowth"), GoldBase = J.Num(sc, "goldBase"), GoldGrowth = J.Num(sc, "goldGrowth"), AbsorbStep = J.Num(sc, "absorbStep") },
            };
            foreach (var m in J.Arr(J.Get(root, "monsters")))
            {
                var def = new MonsterDef
                {
                    Id = J.Str(m, "id"), Family = J.Str(m, "family"), Name = J.Str(m, "name"),
                    HpMul = J.Num(m, "hpMul"), AtkMul = J.Num(m, "atkMul"), AttackIntervalMs = J.Num(m, "attackIntervalMs"),
                    GoldMul = J.Num(m, "goldMul"), AbsorbMul = J.Num(m, "absorbMul"),
                };
                foreach (var e in J.Arr(J.Get(m, "effects"))) def.Effects.Add(EffectSpec.FromJson(e));
                cfg.Monsters[def.Id] = def;
            }
            foreach (var s in J.Arr(J.Get(root, "stages")))
            {
                var st = new StageDef { Id = (int)J.Num(s, "id"), Chapter = (int)J.Num(s, "chapter"), Name = J.Str(s, "name"), KillsToClear = J.Num(s, "killsToClear") };
                foreach (var sp in J.Arr(J.Get(s, "spawns"))) st.Spawns.Add(new SpawnDef { Monster = J.Str(sp, "monster"), Weight = J.Num(sp, "weight") });
                var boss = J.Get(s, "boss");
                if (boss != null) st.Boss = new BossDef { Monster = J.Str(boss, "monster"), TimeLimitMs = J.Num(boss, "timeLimitMs") };
                var o = J.Get(s, "overrides");
                if (o != null)
                {
                    if (J.Has(o, "hp")) st.HpOverride = J.Num(o, "hp");
                    if (J.Has(o, "atk")) st.AtkOverride = J.Num(o, "atk");
                    if (J.Has(o, "goldPerKill")) st.GoldOverride = J.Num(o, "goldPerKill");
                    if (J.Has(o, "absorbPerKill")) st.AbsorbOverride = J.Num(o, "absorbPerKill");
                }
                cfg.Stages[st.Id] = st;
            }
            return cfg;
        }
    }
}

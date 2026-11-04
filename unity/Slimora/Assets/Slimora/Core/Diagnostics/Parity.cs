using System;
using System.Collections.Generic;
using System.Linq;
using Slimora.Core.Legacy;

namespace Slimora.Core.Diagnostics
{
    /// <summary>
    /// TS 엔진이 만든 벡터(tools/export-vectors.ts)와 이 C# 엔진의 결과를 비교한다.
    /// dotnet(CoreTests) 과 Unity 실행 파일(WebGL 포함) 양쪽에서 같은 코드로 돈다 — 플랫폼마다 수학 라이브러리가 달라 따로 확인해야 한다
    /// </summary>
    public sealed class ParityReport
    {
        public int Rng, Monsters, Battles, Events;
        public readonly List<string> Failures = new List<string>();
        public bool Ok => Failures.Count == 0;
        public string Summary => $"난수 {Rng} · 몬스터 {Monsters} · 전투 {Battles}건(이벤트 {Events}) — " + (Ok ? "전부 일치" : $"불일치 {Failures.Count}");
    }

    public static class Parity
    {
        public static ParityReport Run(string configJson, string rngJson, string monstersJson, string battlesJson)
        {
            var r = new ParityReport();
            void Check(bool ok, string what) { if (!ok) r.Failures.Add(what); }
            var cfg = LegacyConfig.FromJson(configJson);

            var rng = MiniJson.Parse(rngJson);
            foreach (var c in J.Arr(J.Get(rng, "rng")))
            {
                var s = new RngState(JsMath.ToInt32(J.Num(c, "seed")));
                foreach (var v in J.Arr(J.Get(c, "values"))) { r.Rng++; Check(Rng.NextFloat(s) == (double)v, "rng seed " + J.Num(c, "seed")); }
            }
            foreach (var c in J.Arr(J.Get(rng, "seeds")))
            {
                var parts = J.Arr(J.Get(c, "parts")).Select(p => (double)p).ToArray();
                r.Rng++;
                Check(Rng.SeedFrom(parts) == (uint)J.Num(c, "value"), "seedFrom " + string.Join(",", parts));
            }

            foreach (var c in J.Arr(MiniJson.Parse(monstersJson)))
            {
                r.Monsters++;
                string id = J.Str(c, "monster");
                int stage = (int)J.Num(c, "stage");
                var want = CombatStats.FromJson(J.Get(c, "stats"));
                var got = LegacyStats.DeriveMonsterStats(id, stage, cfg);
                string tag = id + "@" + stage;
                Check(got.MaxHp == want.MaxHp && got.Attack == want.Attack && got.AttackIntervalMs == want.AttackIntervalMs, $"{tag} hp/atk {got.MaxHp}/{got.Attack} ≠ {want.MaxHp}/{want.Attack}");
                Check(got.Lifesteal == want.Lifesteal && got.DamageReduction == want.DamageReduction, tag + " 흡혈/감소");
                Check((got.Burn == null) == (want.Burn == null) && (got.HeavyAttack == null) == (want.HeavyAttack == null) && (got.Enrage == null) == (want.Enrage == null), tag + " 효과");
                Check(LegacyStats.MonsterGold(id, stage, cfg) == J.Num(c, "gold") && LegacyStats.MonsterAbsorb(id, stage, cfg) == J.Num(c, "absorb"), tag + " 보상");
            }

            var root = MiniJson.Parse(battlesJson);
            var dts = J.Arr(J.Get(root, "dts")).Select(d => (double)d).ToArray();
            int ultEvery = (int)J.Num(root, "ultEvery"), ultPhase = (int)J.Num(root, "ultPhase");
            double limit = J.Num(root, "limitMs");
            foreach (var c in J.Arr(J.Get(root, "cases")))
            {
                int index = (int)J.Num(c, "id");
                var init = InitFromJson(J.Get(c, "init"));
                var b = StageBattle.Create(init, cfg);
                var lines = new List<string>();
                int step = 0;
                while (b.Now < limit && !StageBattle.IsFinished(b))
                {
                    double dt = dts[(step + index) % dts.Length];
                    foreach (var e in StageBattle.Step(b, dt, cfg)) lines.Add(e.ToLine());
                    if (step % ultEvery == ultPhase && StageBattle.UltimateReady(b, cfg))
                    {
                        var ev = StageBattle.UseUltimate(b, cfg);
                        if (ev != null) foreach (var e in ev) lines.Add(e.ToLine());
                    }
                    step++;
                }
                r.Battles++;
                r.Events += lines.Count;
                string tag = $"전투 #{index} (스테이지 {init.StageId} {init.Mode})";
                if (J.Has(c, "lines"))
                {
                    var want = J.Arr(J.Get(c, "lines")).Cast<string>().ToList();
                    int i = 0;
                    while (i < Math.Min(want.Count, lines.Count) && want[i] == lines[i]) i++;
                    Check(i == want.Count && i == lines.Count, $"{tag} {i}번째 이벤트부터 다름: TS「{(i < want.Count ? want[i] : "끝")}」 C#「{(i < lines.Count ? lines[i] : "끝")}」");
                }
                Check(lines.Count == (int)J.Num(c, "eventCount"), $"{tag} 이벤트 수 {lines.Count} ≠ {J.Num(c, "eventCount")}");
                Check(Hash(lines) == (uint)J.Num(c, "hash"), tag + " 이벤트 해시");
                Check(step == (int)J.Num(c, "steps"), tag + " step 수");
                string fin = StageBattle.StateLine(b);
                Check(fin == J.Str(c, "final"), $"{tag} 최종 상태 TS「{J.Str(c, "final")}」 C#「{fin}」");
            }
            return r;
        }

        static BattleInit InitFromJson(object ji)
        {
            var init = new BattleInit
            {
                StageId = (int)J.Num(ji, "stageId"),
                Mode = J.Str(ji, "mode") == "farm" ? BattleMode.Farm : BattleMode.Challenge,
                Slime = CombatStats.FromJson(J.Get(ji, "slime")),
                Seed = JsMath.ToInt32(J.Num(ji, "seed")),
                GoldMul = J.Num(ji, "goldMul", 1),
                UltimateCharge = J.Has(ji, "ultimateCharge") ? J.Num(ji, "ultimateCharge") : (double?)null,
            };
            foreach (var a in J.Arr(J.Get(ji, "allies"))) init.Allies.Add(new AllyStats { Id = J.Str(a, "id"), Power = J.Num(a, "power"), IntervalMs = J.Num(a, "intervalMs") });
            return init;
        }

        /// <summary>FNV-1a 32bit (UTF-16 코드 단위) — export-vectors.ts 의 hash 와 같다</summary>
        public static uint Hash(IEnumerable<string> lines)
        {
            unchecked
            {
                uint h = 0x811c9dc5;
                foreach (var line in lines)
                {
                    foreach (char ch in line) { h ^= ch; h *= 0x01000193; }
                    h ^= 10; h *= 0x01000193;
                }
                return h;
            }
        }
    }
}

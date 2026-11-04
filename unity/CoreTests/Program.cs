using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Slimora.Core;
using Slimora.Core.Legacy;
using Slimora.Core.Squad;

// 1부: TS 엔진 벡터와 C# 엔진 결과 비교 (실패하면 종료 코드 1)
// 2부: 분대 전투 시뮬레이션 — 편성 · 필살기 타이밍이 결과를 바꾸는지
static class Program
{
    static string Root => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
    static int failures;

    static void Check(bool ok, string what)
    {
        if (ok) return;
        failures++;
        if (failures <= 20) Console.WriteLine("  ✗ " + what);
    }

    static int Main(string[] args)
    {
        string vec = Path.Combine(Root, "Slimora", "Assets", "Slimora", "Resources", "Vectors");
        Console.WriteLine("== 1부: TS ↔ C# 회귀 ==");
        string Read(string n) => File.ReadAllText(Path.Combine(vec, n));
        var report = Slimora.Core.Diagnostics.Parity.Run(Read("config.json"), Read("rng.json"), Read("monsters.json"), Read("battles.json"));
        foreach (var f in report.Failures.Take(20)) Console.WriteLine("  ✗ " + f);
        failures += report.Failures.Count;
        failures += NumFmt.Check(Path.Combine(Root, "CoreTests", "numfmt.tsv"));
        Console.WriteLine("회귀: " + report.Summary);

        Console.WriteLine();
        Console.WriteLine("== 2부: 분대 전투 시뮬레이션 ==");
        var squad = SquadConfig.FromJson(File.ReadAllText(Path.Combine(Root, "Slimora", "Assets", "Slimora", "Resources", "squad.json")));
        SquadChecks(squad);
        SquadReport(squad, args.Contains("--full") ? 200 : 200);
        return failures == 0 ? 0 : 1;
    }

    // ---------- 2부 ----------

    static readonly string[][] Comps = BuildComps();
    static string[][] BuildComps()
    {
        var ids = new[] { "pebble", "shade", "wyvern", "drop" };
        var list = new List<string[]>();
        for (int i = 0; i < ids.Length; i++) for (int j = i + 1; j < ids.Length; j++) list.Add(new[] { ids[i], ids[j] });
        return list.ToArray();
    }

    static string CompName(SquadConfig cfg, string[] comp) => string.Join("+", comp.Select(id => cfg.Merc(id).Name.Split(' ').Last()));

    enum UltPolicy { Never, Asap, Smart }

    static SquadState RunSquad(SquadConfig cfg, SquadSetup setup, UltPolicy policy, double dt = 50)
    {
        var s = SquadBattle.Create(setup, cfg);
        while (s.Phase == SquadPhase.Fighting)
        {
            SquadBattle.Step(s, dt, cfg);
            if (!SquadBattle.UltReady(s, cfg) || policy == UltPolicy.Never) continue;
            int alive = s.Team(Team.Enemy).Count(e => e.Alive);
            bool telegraph = s.Team(Team.Enemy).Any(e => e.Alive && e.HeavyNext);
            if (policy == UltPolicy.Asap || telegraph || alive >= 3) SquadBattle.UseUltimate(s, cfg);
        }
        return s;
    }

    static void SquadChecks(SquadConfig cfg)
    {
        // dt 를 어떻게 나눠도 같은 결과
        foreach (var dt in new[] { 7.0, 16.0, 333.0, 5000.0 })
        {
            var a = SquadBattle.Create(new SquadSetup { Wave = 7, SlimeLevel = 9, Party = { "pebble", "drop" }, Seed = 77 }, cfg);
            var b = SquadBattle.Create(new SquadSetup { Wave = 7, SlimeLevel = 9, Party = { "pebble", "drop" }, Seed = 77 }, cfg);
            var la = new List<string>(); var lb = new List<string>();
            while (a.Phase == SquadPhase.Fighting) la.AddRange(SquadBattle.Step(a, 16, cfg).Select(e => e.ToString()));
            while (b.Phase == SquadPhase.Fighting) lb.AddRange(SquadBattle.Step(b, dt, cfg).Select(e => e.ToString()));
            Check(la.SequenceEqual(lb), $"분대 전투 dt {dt} 분할 결과가 다름");
        }
        Console.WriteLine("분대 전투: dt 분할 불변 확인 (7 · 16 · 333 · 5000ms)");
    }

    /// <summary>웨이브마다 각 편성이 승률 50% 에 닿는 최소 슬라임 레벨 — 낮을수록 그 웨이브에 강한 편성</summary>
    static void SquadReport(SquadConfig cfg, int seeds)
    {
        Console.WriteLine($"시드 {seeds}개 · 필살기 Smart 정책 · 용병 레벨 = 슬라임 레벨");
        Console.WriteLine("웨이브별 「승률 50% 에 필요한 최소 슬라임 레벨」 (낮을수록 강함)");
        Console.Write("웨이브".PadRight(14));
        foreach (var c in Comps) Console.Write(CompName(cfg, c).PadRight(11));
        Console.WriteLine();
        var best = new Dictionary<string, int>();
        for (int w = 1; w <= cfg.Waves.Count; w++)
        {
            Console.Write($"{w} {cfg.Waves[w - 1].Name}".PadRight(14));
            var need = new List<int>();
            foreach (var comp in Comps)
            {
                int lv = 1;
                for (; lv <= 40; lv++)
                {
                    int wins = 0;
                    for (int seed = 0; seed < seeds; seed++)
                    {
                        var setup = new SquadSetup { Wave = w, SlimeLevel = lv, MercLevel = lv, Seed = (int)Rng.SeedFrom(w, lv, seed) };
                        setup.Party.AddRange(comp);
                        if (RunSquad(cfg, setup, UltPolicy.Smart).Phase == SquadPhase.Won) wins++;
                    }
                    if (wins * 2 >= seeds) break;
                }
                need.Add(lv);
                Console.Write(lv.ToString().PadRight(11));
            }
            int min = need.Min();
            string winners = string.Join(",", Comps.Where((c, i) => need[i] == min).Select(c => CompName(cfg, c)));
            foreach (var wname in winners.Split(',')) best[wname] = best.TryGetValue(wname, out var n) ? n + 1 : 1;
            Console.WriteLine($"  최강: {winners} · 최약 대비 {need.Max() - min}레벨 차");
        }
        Console.WriteLine("웨이브 최강 횟수: " + string.Join(" · ", best.OrderByDescending(kv => kv.Value).Select(kv => $"{kv.Key} {kv.Value}")));

        // 필살기 타이밍 — 같은 편성 · 같은 레벨에서 승률 비교
        Console.WriteLine();
        Console.WriteLine("필살기 정책별 승률 (W5 Lv10 · W7 Lv18)");
        foreach (var (w, lv) in new[] { (5, 10), (7, 18) })
        {
            foreach (var comp in new[] { new[] { "pebble", "drop" }, new[] { "shade", "wyvern" } })
            {
                Console.Write($"  W{w} Lv{lv} {CompName(cfg, comp)}: ");
                foreach (var pol in new[] { UltPolicy.Never, UltPolicy.Asap, UltPolicy.Smart })
                {
                    int wins = 0;
                    for (int seed = 0; seed < seeds; seed++)
                    {
                        var setup = new SquadSetup { Wave = w, SlimeLevel = lv, MercLevel = lv, Seed = (int)Rng.SeedFrom(w, lv, seed, 9) };
                        setup.Party.AddRange(comp);
                        if (RunSquad(cfg, setup, pol).Phase == SquadPhase.Won) wins++;
                    }
                    Console.Write($"{pol} {100 * wins / seeds}%  ");
                }
                Console.WriteLine();
            }
        }
    }
}

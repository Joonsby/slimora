using System;
using System.IO;
using Slimora.Core;

// JsMath.Str 를 node 의 String(n) 과 직접 비교한다 (임의 값 수천 개)
static class NumFmt
{
    public static int Check(string path)
    {
        int bad = 0, n = 0;
        foreach (var line in File.ReadAllLines(path))
        {
            var parts = line.Split('\t');
            double v = BitConverter.Int64BitsToDouble(long.Parse(parts[0]));
            string got = JsMath.Str(v);
            n++;
            if (got != parts[1]) { if (bad++ < 5) Console.WriteLine($"  ✗ 숫자 표기 {parts[1]} ≠ {got}"); }
        }
        Console.WriteLine($"숫자 표기: {n}개 비교 · 불일치 {bad}");
        return bad;
    }
}

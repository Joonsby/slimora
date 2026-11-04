using System;
using System.Numerics;

namespace Slimora.Core
{
    /// <summary>mulberry32 — TypeScript core/rng.ts 와 비트 단위로 같다. 상태를 객체에 두어 전투 상태와 함께 복제·저장한다</summary>
    public sealed class RngState
    {
        public int S;
        public RngState(int seed) { S = seed; }
        public RngState Clone() => new RngState(S);
    }

    public static class Rng
    {
        public static double NextFloat(RngState rng)
        {
            unchecked
            {
                rng.S = rng.S + 0x6d2b79f5;
                uint t = (uint)rng.S;
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }

        /// <summary>여러 정수를 32bit 시드 하나로 섞는다 (FNV-1a). JS 의 Math.trunc(p) | 0 을 따른다</summary>
        public static uint SeedFrom(params double[] parts)
        {
            unchecked
            {
                uint h = 0x811c9dc5;
                foreach (double p in parts)
                {
                    uint v = (uint)JsMath.ToInt32(Math.Truncate(p));
                    for (int i = 0; i < 4; i++)
                    {
                        h ^= v & 0xff;
                        h *= 0x01000193;
                        v >>= 8;
                    }
                }
                return h;
            }
        }
    }

    /// <summary>JavaScript 수치 함수와 결과를 맞추기 위한 도우미</summary>
    public static class JsMath
    {
        /// <summary>Math.round — 0.5 는 +∞ 쪽 (C# 기본은 은행원 반올림이라 다르다)</summary>
        public static double Round(double x)
        {
            if (double.IsNaN(x) || double.IsInfinity(x)) return x;
            double f = Math.Floor(x);
            return x - f >= 0.5 ? f + 1 : f;
        }

        /// <summary>ToInt32 — 2^32 로 나눈 나머지를 부호 있는 32bit 로</summary>
        public static int ToInt32(double x)
        {
            if (double.IsNaN(x) || double.IsInfinity(x)) return 0;
            double m = Math.Truncate(x) % 4294967296.0;
            if (m < 0) m += 4294967296.0;
            return unchecked((int)(uint)m);
        }

        /// <summary>String(number) — 회귀 비교용. JS 는 1e21 미만 · 1e-7 이상이면 지수 없이 쓴다 (C# "R" 은 1e15 부터 지수)</summary>
        public static string Str(double x)
        {
            if (x == 0) return "0";
            if (double.IsNaN(x)) return "NaN";
            if (double.IsInfinity(x)) return x > 0 ? "Infinity" : "-Infinity";
            // 런타임의 ToString 은 믿지 않는다 (.NET Core "R" = 최단, Mono "R" = 17자리 · "G16" 반올림 부정확).
            // 정확한 십진 전개에서 되읽어 같은 double 이 되는 가장 짧은 자릿수를 직접 찾는다 (ECMAScript Number::toString 과 같은 결과)
            bool neg = x < 0;
            ShortestDigits(Math.Abs(x), out string digits, out int n);
            int k = digits.Length;
            string body;
            if (k <= n && n <= 21) body = digits + new string('0', n - k);
            else if (0 < n && n <= 21) body = digits.Substring(0, n) + "." + digits.Substring(n);
            else if (-6 < n && n <= 0) body = "0." + new string('0', -n) + digits;
            else body = digits.Substring(0, 1) + (k > 1 ? "." + digits.Substring(1) : "") + "e" + (n - 1 >= 0 ? "+" : "-") + Math.Abs(n - 1);
            return neg ? "-" + body : body;
        }

        /// <summary>x &gt; 0 의 최단 왕복 자릿수. 값 = 0.digits × 10^n</summary>
        static void ShortestDigits(double x, out string digits, out int n)
        {
            long bits = BitConverter.DoubleToInt64Bits(x);
            int be = (int)((bits >> 52) & 0x7ff);
            long frac = bits & 0xfffffffffffffL;
            BigInteger m = be == 0 ? frac : frac | (1L << 52);
            int e2 = be == 0 ? -1074 : be - 1075;
            // 반올림 구간 [x − 아래 반 간격, x + 위 반 간격] 을 2^(e2−2) 단위 정수로. 2의 거듭제곱이면 아래 간격이 절반
            BigInteger lo = be > 1 && frac == 0 ? 4 * m - 1 : 4 * m - 2, hi = 4 * m + 2;
            bool inclusive = m.IsEven;
            // 정확한 십진 전개: x = exact × 10^E
            BigInteger exact = e2 >= 0 ? m << e2 : m * BigInteger.Pow(5, -e2);
            int E = e2 >= 0 ? 0 : e2;
            string all = exact.ToString(System.Globalization.CultureInfo.InvariantCulture);
            for (int p = 1; p <= all.Length; p++)
            {
                BigInteger c = BigInteger.Parse(all.Substring(0, p), System.Globalization.CultureInfo.InvariantCulture);
                if (p < all.Length && all[p] >= '5')
                {
                    // 정확히 반이면 짝수 쪽 (명세: 가까운 후보가 둘이면 짝수)
                    bool tie = all[p] == '5' && all.Substring(p + 1).TrimEnd('0').Length == 0;
                    if (!tie || !c.IsEven) c += 1;
                }
                int q = E + (all.Length - p);
                if (!Within(c, q, lo, hi, e2 - 2, inclusive)) continue;
                string s = c.ToString(System.Globalization.CultureInfo.InvariantCulture);
                // 올림으로 자릿수가 늘었으면 (999 → 1000) 그만큼 지수를 옮긴다
                int len = s.Length;
                string trimmed = s.TrimEnd('0');
                digits = trimmed.Length == 0 ? "0" : trimmed;
                n = q + len;
                return;
            }
            digits = all.TrimEnd('0');
            n = E + all.Length;
        }

        /// <summary>lo·2^b ≤ c·10^q ≤ hi·2^b (inclusive 가 아니면 등호 제외)</summary>
        static bool Within(BigInteger c, int q, BigInteger lo, BigInteger hi, int b, bool inclusive)
        {
            BigInteger left = c, scaleR = 1;
            if (q >= 0) left *= BigInteger.Pow(10, q); else scaleR *= BigInteger.Pow(10, -q);
            if (b >= 0) scaleR <<= b; else left <<= -b;
            BigInteger l = lo * scaleR, h = hi * scaleR;
            int a = left.CompareTo(l), z = left.CompareTo(h);
            return inclusive ? a >= 0 && z <= 0 : a > 0 && z < 0;
        }
    }
}

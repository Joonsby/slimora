using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Slimora.Core
{
    /// <summary>
    /// 엔진 의존 없는 작은 JSON 파서. 객체 = Dictionary&lt;string, object&gt;, 배열 = List&lt;object&gt;, 수 = double.
    /// 규칙 계층이 UnityEngine.JsonUtility 없이 기존 JSON 밸런스 데이터를 그대로 읽게 한다
    /// </summary>
    public static class MiniJson
    {
        public static object Parse(string text)
        {
            int i = 0;
            object v = Value(text, ref i);
            Skip(text, ref i);
            if (i != text.Length) throw new FormatException($"JSON 뒤에 남은 글자: {i}");
            return v;
        }

        static void Skip(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        static object Value(string s, ref int i)
        {
            Skip(s, ref i);
            if (i >= s.Length) throw new FormatException("JSON 이 끝났다");
            char c = s[i];
            switch (c)
            {
                case '{':
                    {
                        var obj = new Dictionary<string, object>();
                        i++;
                        Skip(s, ref i);
                        if (s[i] == '}') { i++; return obj; }
                        while (true)
                        {
                            Skip(s, ref i);
                            string key = Str(s, ref i);
                            Skip(s, ref i);
                            if (s[i++] != ':') throw new FormatException($"':' 가 없다: {i}");
                            obj[key] = Value(s, ref i);
                            Skip(s, ref i);
                            char d = s[i++];
                            if (d == '}') return obj;
                            if (d != ',') throw new FormatException($"',' 가 없다: {i}");
                        }
                    }
                case '[':
                    {
                        var list = new List<object>();
                        i++;
                        Skip(s, ref i);
                        if (s[i] == ']') { i++; return list; }
                        while (true)
                        {
                            list.Add(Value(s, ref i));
                            Skip(s, ref i);
                            char d = s[i++];
                            if (d == ']') return list;
                            if (d != ',') throw new FormatException($"',' 가 없다: {i}");
                        }
                    }
                case '"':
                    return Str(s, ref i);
                case 't': i += 4; return true;
                case 'f': i += 5; return false;
                case 'n': i += 4; return null;
                default:
                    {
                        int start = i;
                        while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
                        return double.Parse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture);
                    }
            }
        }

        static string Str(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException($"문자열이 아니다: {i}");
            i++;
            var sb = new StringBuilder();
            while (true)
            {
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: sb.Append(e); break;
                }
            }
        }
    }

    /// <summary>파싱된 JSON 을 읽는 짧은 도우미</summary>
    public static class J
    {
        public static Dictionary<string, object> Obj(object o) => (Dictionary<string, object>)o;
        public static List<object> Arr(object o) => (List<object>)o;
        public static object Get(object o, string key) => Obj(o).TryGetValue(key, out var v) ? v : null;
        public static bool Has(object o, string key) => Obj(o).TryGetValue(key, out var v) && v != null;
        public static double Num(object o, string key) => (double)Obj(o)[key];
        public static double Num(object o, string key, double fallback) => Has(o, key) ? (double)Obj(o)[key] : fallback;
        public static string Str(object o, string key) => (string)Obj(o)[key];
        public static string Str(object o, string key, string fallback) => Has(o, key) ? (string)Obj(o)[key] : fallback;
        public static bool Bool(object o, string key, bool fallback = false) => Has(o, key) ? (bool)Obj(o)[key] : fallback;
    }
}

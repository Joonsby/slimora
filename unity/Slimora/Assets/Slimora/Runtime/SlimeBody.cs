using UnityEngine;

namespace Slimora.View
{
    /// <summary>
    /// 말랑한 슬라임 몸체. 테두리 정점마다 반지름 스프링을 두고, 몸 전체에는 세로 눌림 스프링을 둔다.
    /// 가로 폭은 면적이 유지되도록 세로 눌림에서 계산한다. 바닥은 평평하게 눌려 앉은 모양이 된다.
    /// 트랜스폼 확대·축소가 아니라 메시 정점을 매 프레임 다시 계산한다
    /// </summary>
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public sealed class SlimeBody : MonoBehaviour
    {
        public int segments = 32;
        public float radius = 0.55f;
        public float outline = 0.045f;
        public Color color = new Color(0.37f, 0.88f, 0.54f);
        public Color outlineColor = new Color(0.08f, 0.12f, 0.16f);
        [Tooltip("테두리 정점 스프링")] public float rimStiffness = 160f, rimDamping = 11f, rimNeighbor = 0.3f;
        [Tooltip("몸 전체 눌림 스프링")] public float squashStiffness = 120f, squashDamping = 9f;
        [Tooltip("바닥 높이 (반지름 비율). 이 아래는 눌려 평평해진다")] public float floor = 0.62f;

        float[] off, vel;
        float sy = 1, vsy, lean, vlean, flash, alpha = 1, restSy = 1;
        Mesh mesh;
        Vector3[] verts;
        Color[] colors;
        float breathe;

        /// <summary>현재 세로 눌림 · 가로 폭 · 기울기 — 눈 · 광택 위치를 맞추는 데 쓴다</summary>
        public float ScaleY => sy;
        public float ScaleX => Mathf.Min(1.7f, 1f / Mathf.Pow(Mathf.Max(0.2f, sy), 0.85f));
        public float Lean => lean;
        public float Alpha => alpha;

        void Awake() => Build();

        void Build()
        {
            off = new float[segments];
            vel = new float[segments];
            int n = 1 + segments * 2;
            verts = new Vector3[n];
            colors = new Color[n];
            var tris = new int[segments * 3 + segments * 6];
            int t = 0;
            // 바깥 테두리 띠를 먼저 그려 몸체가 위에 덮이게 한다
            for (int i = 0; i < segments; i++)
            {
                int a = 1 + i, b = 1 + (i + 1) % segments, oa = 1 + segments + i, ob = 1 + segments + (i + 1) % segments;
                tris[t++] = a; tris[t++] = oa; tris[t++] = b;
                tris[t++] = b; tris[t++] = oa; tris[t++] = ob;
            }
            for (int i = 0; i < segments; i++)
            {
                tris[t++] = 0; tris[t++] = 1 + (i + 1) % segments; tris[t++] = 1 + i;
            }
            mesh = new Mesh { name = "SlimeBody" };
            mesh.MarkDynamic();
            mesh.vertices = verts;
            mesh.colors = colors;
            mesh.triangles = tris;
            GetComponent<MeshFilter>().sharedMesh = mesh;
            breathe = Random.value * 10f;
            Rebuild();
        }

        /// <summary>dir 쪽에서 맞았다 — 그쪽 테두리가 움푹 들어가고 몸이 출렁인다</summary>
        public void Impulse(Vector2 dir, float strength)
        {
            dir = dir.sqrMagnitude > 0 ? dir.normalized : Vector2.up;
            for (int i = 0; i < segments; i++)
            {
                float a = i * Mathf.PI * 2f / segments;
                float d = Mathf.Cos(a) * dir.x + Mathf.Sin(a) * dir.y;
                vel[i] -= strength * Mathf.Max(0, d) * 6f;
                vel[i] += strength * Mathf.Max(0, -d) * 2f;
            }
            vlean += -dir.x * strength * 4f;
        }

        /// <summary>양수 = 눌림(착지 · 준비 동작), 음수 = 늘어남(도약 · 돌진)</summary>
        public void Squash(float amount) => vsy -= amount * 9f;
        public void Shear(float amount) => vlean += amount * 6f;
        public void Flash(float amount = 1f) => flash = Mathf.Max(flash, amount);
        public void SetAlpha(float a) => alpha = a;
        /// <summary>쉬는 세로 비율 — 쓰러지면 납작하게 퍼진다</summary>
        public void SetRest(float y) => restSy = y;

        void LateUpdate()
        {
            float dt = Mathf.Min(Time.deltaTime, 1f / 30f);
            // 두 번 나눠 적분해 프레임이 들쭉날쭉해도 덜 튄다
            for (int k = 0; k < 2; k++) Integrate(dt * 0.5f);
            flash = Mathf.MoveTowards(flash, 0, dt * 5f);
            Rebuild();
        }

        void Integrate(float dt)
        {
            breathe += dt;
            float target = restSy * (1f + 0.035f * Mathf.Sin(breathe * 2.4f));
            vsy += ((target - sy) * squashStiffness - vsy * squashDamping) * dt;
            sy = Mathf.Clamp(sy + vsy * dt, 0.12f, 1.9f);
            vlean += (-lean * squashStiffness * 0.8f - vlean * squashDamping) * dt;
            lean = Mathf.Clamp(lean + vlean * dt, -0.6f, 0.6f);
            for (int i = 0; i < segments; i++)
            {
                float l = off[(i - 1 + segments) % segments], r = off[(i + 1) % segments];
                float f = -off[i] * rimStiffness + ((l + r) * 0.5f - off[i]) * rimStiffness * rimNeighbor - vel[i] * rimDamping;
                vel[i] += f * dt;
            }
            for (int i = 0; i < segments; i++) off[i] = Mathf.Clamp(off[i] + vel[i] * dt, -0.45f, 0.45f);
        }

        void Rebuild()
        {
            float sx = ScaleX;
            float bottom = -radius * floor;
            Color top = Color.Lerp(color, Color.white, 0.28f), body = color, edge = Color.Lerp(color, Color.black, 0.25f);
            Color Fx(Color c) { c = Color.Lerp(c, Color.white, flash * 0.85f); c.a *= alpha; return c; }
            verts[0] = new Vector3(0, (bottom + radius * sy) * 0.35f, 0);
            colors[0] = Fx(Color.Lerp(top, body, 0.3f));
            for (int i = 0; i < segments; i++)
            {
                float a = i * Mathf.PI * 2f / segments;
                float r = radius * (1f + off[i]);
                float x = Mathf.Cos(a) * r * sx, y = Mathf.Sin(a) * r * sy;
                // 바닥에 눌린 부분은 평평하게, 눌린 만큼 옆으로 조금 퍼진다
                if (y < bottom) { x *= 1f + (bottom - y) / radius * 0.35f; y = bottom; }
                x += lean * (y - bottom);
                verts[1 + i] = new Vector3(x, y, 0);
                float h = Mathf.InverseLerp(bottom, radius * sy, y);
                colors[1 + i] = Fx(Color.Lerp(edge, top, h * 0.9f));
                Vector2 n = new Vector2(Mathf.Cos(a) * sy, Mathf.Sin(a) * sx).normalized;
                verts[1 + segments + i] = new Vector3(x + n.x * outline, Mathf.Max(bottom - outline, y + n.y * outline), 0);
                colors[1 + segments + i] = Fx(outlineColor);
            }
            mesh.vertices = verts;
            mesh.colors = colors;
            mesh.RecalculateBounds();
        }

        /// <summary>몸 위쪽 기준점 (x 비율, y 비율) 을 현재 변형에 맞춘 로컬 좌표로</summary>
        public Vector3 Anchor(float fx, float fy)
        {
            float bottom = -radius * floor;
            float y = Mathf.Lerp(bottom, radius * sy, fy);
            return new Vector3(fx * radius * ScaleX + lean * (y - bottom), y, 0);
        }
    }
}

using UnityEngine;

namespace Slimora.View
{
    /// <summary>
    /// 유닛 하나의 표현. 위치 연출(도약 · 돌진 · 넉백)은 여기서, 몸의 변형은 SlimeBody 가 맡는다.
    /// 규칙은 모른다 — BattleDirector 가 엔진 이벤트를 받아 이 메서드들을 부른다
    /// </summary>
    public sealed class UnitView : MonoBehaviour
    {
        public SlimeBody body;
        public SpriteRenderer shadow, eyeL, eyeR, shine, hpBack, hpFill, telegraph, badge;

        Vector3 home;
        Vector3 offset;
        float hopAt, hopT = -1, lungeT = -1, knockT = -1, deathT = -1, blinkAt, blinkT = -1, telegraphOn;
        Vector3 lungeDir, knockDir;
        float hp = 1, hpShown = 1;
        bool dead;
        int baseOrder;

        public Vector3 Home => home;
        public Vector3 Center => transform.position + Vector3.up * body.radius * 0.2f;

        public void Setup(Color color, float size, Vector3 position, Color badgeColor, bool showBadge)
        {
            home = position;
            transform.position = position;
            transform.localScale = Vector3.one * size;
            body.color = color;
            badge.color = badgeColor;
            badge.enabled = showBadge;
            hopAt = Time.time + Random.Range(0.2f, 1.6f);
            blinkAt = Time.time + Random.Range(1f, 4f);
            baseOrder = Mathf.RoundToInt(-position.y * 10f) + 100;
            var mr = body.GetComponent<MeshRenderer>();
            mr.sortingOrder = baseOrder;
            shadow.sortingOrder = baseOrder - 1;
            foreach (var s in new[] { eyeL, eyeR, shine }) s.sortingOrder = baseOrder + 1;
            badge.sortingOrder = baseOrder + 2;
            telegraph.sortingOrder = baseOrder - 2;
            hpBack.sortingOrder = 500;
            hpFill.sortingOrder = 501;
            telegraph.enabled = false;
        }

        public void SetHp(float ratio) => hp = Mathf.Clamp01(ratio);

        /// <summary>공격 — 준비(눌림) → 돌진(늘어남) → 복귀. 대상 방향으로 짧게 뛰어든다</summary>
        public void Lunge(Vector3 target, float reach = 0.55f)
        {
            if (dead) return;
            Vector3 d = target - home;
            lungeDir = d.magnitude > 0.01f ? d.normalized * Mathf.Min(reach * d.magnitude, 1.6f) : Vector3.up;
            lungeT = 0;
            body.Squash(0.35f);
        }

        /// <summary>제자리 시전 (광역 · 치료) — 크게 눌렸다가 위로 솟는다</summary>
        public void Cast()
        {
            if (dead) return;
            lungeDir = Vector3.up * 0.25f;
            lungeT = 0;
            body.Squash(0.5f);
        }

        public void Hit(Vector3 from, bool heavy, bool crit)
        {
            if (dead) return;
            Vector3 d = (transform.position - from);
            d.z = 0;
            knockDir = d.sqrMagnitude > 0 ? d.normalized : Vector3.down;
            knockT = 0;
            float s = heavy ? 1.6f : crit ? 1.2f : 0.8f;
            body.Impulse(-knockDir, s);
            body.Squash(heavy ? 0.6f : 0.25f);
            body.Flash(heavy || crit ? 1f : 0.7f);
        }

        public void Healed()
        {
            if (dead) return;
            body.Squash(-0.35f);
            body.Flash(0.4f);
        }

        public void SetTelegraph(bool on) => telegraphOn = on ? 1 : 0;

        public void Die()
        {
            dead = true;
            deathT = 0;
            telegraphOn = 0;
            body.SetRest(0.22f);
            body.Squash(0.8f);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            offset = Vector3.zero;

            if (!dead && hopT < 0 && lungeT < 0 && Time.time >= hopAt) { hopT = 0; body.Squash(0.3f); }
            if (hopT >= 0)
            {
                // 0~0.12 준비(눌림) · 0.12~0.42 체공 · 착지 순간 눌림
                hopT += dt;
                if (hopT > 0.12f && hopT - dt <= 0.12f) body.Squash(-0.45f);
                float air = Mathf.InverseLerp(0.12f, 0.42f, hopT);
                if (hopT > 0.12f && hopT < 0.42f) offset.y += Mathf.Sin(air * Mathf.PI) * 0.22f;
                if (hopT >= 0.42f) { body.Squash(0.55f); body.Impulse(Vector2.down, 0.4f); hopT = -1; hopAt = Time.time + Random.Range(1.4f, 2.8f); }
            }

            if (lungeT >= 0)
            {
                lungeT += dt;
                if (lungeT > 0.09f && lungeT - dt <= 0.09f) { body.Squash(-0.7f); body.Shear(-lungeDir.x * 0.25f); }
                float k = lungeT < 0.09f ? -0.08f * (lungeT / 0.09f)
                    : lungeT < 0.17f ? Mathf.Lerp(-0.08f, 1f, (lungeT - 0.09f) / 0.08f)
                    : Mathf.Lerp(1f, 0f, Mathf.SmoothStep(0, 1, (lungeT - 0.17f) / 0.22f));
                offset += lungeDir * k;
                if (lungeT > 0.17f && lungeT - dt <= 0.17f) body.Squash(0.45f);
                if (lungeT >= 0.39f) lungeT = -1;
            }

            if (knockT >= 0)
            {
                knockT += dt;
                offset += knockDir * 0.22f * Mathf.Exp(-knockT * 12f) * Mathf.Min(1, knockT * 40f);
                if (knockT > 0.5f) knockT = -1;
            }

            if (deathT >= 0)
            {
                deathT += dt;
                body.SetAlpha(Mathf.Clamp01(1.4f - deathT));
                shadow.color = new Color(0, 0, 0, 0.25f * Mathf.Clamp01(1.2f - deathT));
            }

            transform.position = home + offset;

            // 눈 · 광택은 변형된 몸 위의 기준점을 따라간다
            float a = body.Alpha;
            bool eyesOpen = !dead;
            if (eyesOpen && blinkT < 0 && Time.time >= blinkAt) blinkT = 0;
            float blink = 1;
            if (blinkT >= 0) { blinkT += dt; blink = Mathf.Abs(Mathf.Cos(blinkT * Mathf.PI / 0.14f)); if (blinkT > 0.14f) { blinkT = -1; blinkAt = Time.time + Random.Range(2f, 5f); } }
            eyeL.transform.localPosition = body.Anchor(-0.32f, 0.62f);
            eyeR.transform.localPosition = body.Anchor(0.32f, 0.62f);
            Vector3 es = new Vector3(0.13f * body.ScaleX, 0.2f * body.ScaleY * (dead ? 0.15f : blink), 1);
            eyeL.transform.localScale = eyeR.transform.localScale = es;
            eyeL.color = eyeR.color = new Color(0.08f, 0.1f, 0.14f, a);
            shine.transform.localPosition = body.Anchor(-0.42f, 0.84f);
            shine.transform.localScale = new Vector3(0.22f * body.ScaleX, 0.13f * body.ScaleY, 1);
            shine.color = new Color(1, 1, 1, 0.75f * a);
            badge.transform.localPosition = body.Anchor(0.62f, 0.95f);
            badge.color = new Color(badge.color.r, badge.color.g, badge.color.b, a);
            shadow.transform.localScale = new Vector3(1.05f * body.ScaleX - offset.y * 0.8f, 0.28f, 1);
            shadow.transform.position = home + new Vector3(offset.x, -body.radius * body.floor * transform.localScale.y - 0.02f, 0);

            // HP 바 — 줄어든 만큼 잠깐 남겨 두었다가 따라간다
            hpShown = Mathf.MoveTowards(hpShown, hp, dt * 0.8f);
            float w = 1.1f;
            hpBack.enabled = hpFill.enabled = !dead;
            hpBack.transform.position = home + new Vector3(0, body.radius * transform.localScale.y * 1.35f + 0.18f, 0);
            hpBack.transform.localScale = new Vector3(w, 0.13f, 1);
            hpFill.transform.position = hpBack.transform.position + new Vector3(-w * (1 - hp) * 0.5f, 0, 0);
            hpFill.transform.localScale = new Vector3(w * hp, 0.09f, 1);
            hpFill.color = hp > 0.5f ? new Color(0.45f, 0.9f, 0.45f) : hp > 0.25f ? new Color(1f, 0.8f, 0.3f) : new Color(1f, 0.35f, 0.3f);

            // 강타 예고 — 발밑 붉은 고리가 맥박친다
            telegraph.enabled = telegraphOn > 0 && !dead;
            if (telegraph.enabled)
            {
                float p = 0.5f + 0.5f * Mathf.Sin(Time.time * 14f);
                telegraph.transform.position = home + new Vector3(0, -body.radius * body.floor * transform.localScale.y, 0);
                telegraph.transform.localScale = new Vector3(1.9f + p * 0.25f, 0.7f + p * 0.1f, 1) * transform.localScale.x;
                telegraph.color = new Color(1f, 0.25f, 0.2f, 0.45f + 0.4f * p);
                if (Random.value < dt * 6f) body.Impulse(Random.insideUnitCircle, 0.15f);
            }
        }
    }
}

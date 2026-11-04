using UnityEngine;
using UnityEngine.UI;

namespace Slimora.View
{
    /// <summary>피해 · 치료 숫자. 월드 좌표를 따라 떠오르며 사라진다</summary>
    public sealed class DamagePopup : MonoBehaviour
    {
        public Text text;
        Vector3 world;
        float t, life = 0.9f, punch;
        Camera cam;
        RectTransform rt, layer;

        public void Show(Camera camera, RectTransform parent, Vector3 worldPos, string s, Color c, float size)
        {
            cam = camera;
            layer = parent;
            rt = (RectTransform)transform;
            world = worldPos + new Vector3(Random.Range(-0.25f, 0.25f), 0, 0);
            text.text = s;
            text.color = c;
            text.fontSize = Mathf.RoundToInt(size);
            t = 0;
            punch = 1;
            gameObject.SetActive(true);
            Place();
        }

        public bool Busy => gameObject.activeSelf;

        void Update()
        {
            t += Time.deltaTime;
            if (t >= life) { gameObject.SetActive(false); return; }
            world += Vector3.up * Time.deltaTime * 1.4f * (1 - t / life);
            punch = Mathf.MoveTowards(punch, 0, Time.deltaTime * 6f);
            var c = text.color;
            c.a = t < life * 0.6f ? 1 : 1 - (t - life * 0.6f) / (life * 0.4f);
            text.color = c;
            Place();
        }

        void Place()
        {
            Vector2 screen = cam.WorldToScreenPoint(world);
            RectTransformUtility.ScreenPointToLocalPointInRectangle(layer, screen, null, out var local);
            rt.anchoredPosition = local;
            rt.localScale = Vector3.one * (1 + punch * 0.5f);
        }
    }
}

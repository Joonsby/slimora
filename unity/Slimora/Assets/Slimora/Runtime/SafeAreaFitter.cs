using UnityEngine;
using UnityEngine.UI;

namespace Slimora.View
{
    /// <summary>Screen.safeArea 에 맞춰 UI 루트를 줄인다 (노치 · 홈 표시줄 · 앱인토스 상단 바)</summary>
    public sealed class SafeAreaFitter : MonoBehaviour
    {
        Rect last;
        [Tooltip("앱인토스 우측 상단 닫기 버튼 등 플랫폼 UI 를 피하는 추가 여백 (캔버스 단위)")] public float extraTop = 0;

        void Update()
        {
            Rect r = Screen.safeArea;
            if (r == last) return;
            last = r;
            // 9:16 보다 넓은 화면(태블릿 · 데스크톱)은 높이 기준으로 맞춰 UI 가 넘치지 않게 한다
            var scaler = GetComponentInParent<UnityEngine.UI.CanvasScaler>();
            if (scaler != null) scaler.matchWidthOrHeight = (float)Screen.width / Screen.height > 1080f / 1920f ? 1f : 0f;
            var rt = (RectTransform)transform;
            Vector2 min = r.position, max = r.position + r.size;
            min.x /= Screen.width; min.y /= Screen.height;
            max.x /= Screen.width; max.y /= Screen.height;
            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = new Vector2(0, -extraTop);
        }
    }

}

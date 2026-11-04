using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Slimora.View
{
    /// <summary>화면 UI 참조 묶음. 씬 생성기(SlimoraBuilder)가 채운다</summary>
    public sealed class Hud : MonoBehaviour
    {
        public RectTransform safeArea;
        public Text waveText, goldText, statusText, diagText, hintText;
        public Button startButton, upgradeButton, speedButton, ultButton, resultButton;
        public Text startLabel, upgradeLabel, speedLabel, resultTitle, resultBody, resultButtonLabel;
        public Image ultFill, ultGlow;
        public GameObject resultPanel, formationPanel;
        public List<MercCard> cards = new List<MercCard>();
        public RectTransform popupLayer;
        public DamagePopup popupPrefab;
    }

    [System.Serializable]
    public sealed class MercCard
    {
        public Button button;
        public Image swatch, frame;
        public Text name, role, desc;
    }

}

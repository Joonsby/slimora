using System.IO;
using System.Linq;
using Slimora.Core.Diagnostics;
using Slimora.View;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace Slimora.EditorTools
{
    /// <summary>
    /// 프로토타입 씬 · 프리팹 · 임시 아트 · 플레이어 설정을 코드로 만든다. 손으로 만든 씬과 달리 다시 돌리면 같은 결과가 나온다.
    /// 배치 실행: Unity -batchmode -projectPath unity/Slimora -executeMethod Slimora.EditorTools.SlimoraBuilder.BuildAll -quit
    /// </summary>
    public static class SlimoraBuilder
    {
        const string Root = "Assets/Slimora";
        const string ArtDir = Root + "/Art/Generated";
        const string PrefabDir = Root + "/Prefabs";
        const string ScenePath = Root + "/Scenes/Battle.unity";
        const string FontPath = Root + "/Fonts/NotoSansKR.ttf";

        static Font font;
        static Sprite circle, soft, ring, rounded, pixel, gradient;

        [MenuItem("Slimora/1. 씬 · 프리팹 다시 만들기")]
        public static void BuildAll()
        {
            Directory.CreateDirectory(ArtDir);
            Directory.CreateDirectory(PrefabDir);
            Directory.CreateDirectory(Root + "/Scenes");
            GenerateArt();
            font = AssetDatabase.LoadAssetAtPath<Font>(FontPath) ?? throw new System.Exception("폰트가 없다: " + FontPath);
            var mat = CreateMaterial();
            var unit = CreateUnitPrefab(mat);
            var popup = CreatePopupPrefab();
            CreateScene(unit, popup);
            ConfigurePlayer();
            AssetDatabase.SaveAssets();
            Debug.Log("[Slimora] 씬 · 프리팹 생성 완료");
        }

        [MenuItem("Slimora/2. 규칙 회귀 검사 (에디터)")]
        public static void RunParity()
        {
            string T(string n) => File.ReadAllText($"{Root}/Resources/Vectors/{n}.json");
            var r = Parity.Run(T("config"), T("rng"), T("monsters"), T("battles"));
            Debug.Log("[Slimora] 에디터(Mono) 규칙 회귀: " + r.Summary);
            foreach (var f in r.Failures.Take(10)) Debug.LogWarning("[Slimora] " + f);
            if (Application.isBatchMode && !r.Ok) EditorApplication.Exit(2);
        }

        [MenuItem("Slimora/3. WebGL 빌드")]
        public static void BuildWebGL()
        {
            ConfigurePlayer();
            var opts = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "Builds", "WebGL")),
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(opts);
            var s = report.summary;
            Debug.Log($"[Slimora] WebGL 빌드 {s.result} · {s.totalSize / 1024f / 1024f:0.0}MB · {s.totalTime.TotalSeconds:0}초 · 오류 {s.totalErrors} → {opts.locationPathName}");
            if (Application.isBatchMode && s.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) EditorApplication.Exit(3);
        }

        // ---------- 임시 아트 (규격 정의 전 자리표시) ----------

        static void GenerateArt()
        {
            circle = Tex("circle", 128, (x, y) => Disk(x, y, 1f));
            soft = Tex("soft", 128, (x, y) => { float d = Mathf.Sqrt(x * x + y * y); return new Color(1, 1, 1, Mathf.Clamp01(1 - d) * Mathf.Clamp01(1 - d)); });
            ring = Tex("ring", 128, (x, y) => { float d = Mathf.Sqrt(x * x + y * y); return new Color(1, 1, 1, Mathf.Clamp01(1 - Mathf.Abs(d - 0.8f) / 0.14f)); });
            pixel = Tex("pixel", 8, (x, y) => Color.white);
            rounded = Tex("rounded", 96, (x, y) =>
            {
                float r = 0.45f, ax = Mathf.Max(0, Mathf.Abs(x) - (1 - r)), ay = Mathf.Max(0, Mathf.Abs(y) - (1 - r));
                float d = Mathf.Sqrt(ax * ax + ay * ay) / r;
                return new Color(1, 1, 1, Mathf.Clamp01((1 - d) * 24f));
            }, new Vector4(40, 40, 40, 40));
            gradient = Tex("gradient", 64, (x, y) =>
            {
                float t = (y + 1) * 0.5f;
                return Color.Lerp(new Color(0.09f, 0.13f, 0.2f), new Color(0.2f, 0.32f, 0.36f), t);
            });
        }

        static Color Disk(float x, float y, float r)
        {
            float d = Mathf.Sqrt(x * x + y * y);
            return new Color(1, 1, 1, Mathf.Clamp01((r - d) * 48f));
        }

        static Sprite Tex(string name, int size, System.Func<float, float, Color> f, Vector4 border = default)
        {
            string path = $"{ArtDir}/{name}.png";
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                    tex.SetPixel(x, y, f((x + 0.5f) / size * 2 - 1, (y + 0.5f) / size * 2 - 1));
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            var imp = (TextureImporter)AssetImporter.GetAtPath(path);
            imp.textureType = TextureImporterType.Sprite;
            imp.spriteImportMode = SpriteImportMode.Single;
            imp.spritePixelsPerUnit = size;
            imp.spriteBorder = border;
            imp.mipmapEnabled = false;
            imp.alphaIsTransparency = true;
            imp.textureCompression = TextureImporterCompression.Uncompressed;
            imp.wrapMode = TextureWrapMode.Clamp;
            imp.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }

        static Material CreateMaterial()
        {
            string path = Root + "/Art/SlimeBody.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(Shader.Find("Sprites/Default"));
                AssetDatabase.CreateAsset(mat, path);
            }
            return mat;
        }

        // ---------- 프리팹 ----------

        static SpriteRenderer Sr(Transform parent, string name, Sprite sprite, Color color, Vector3 pos, Vector3 scale)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.color = color;
            return sr;
        }

        static UnitView CreateUnitPrefab(Material mat)
        {
            var root = new GameObject("Unit");
            var view = root.AddComponent<UnitView>();
            view.shadow = Sr(root.transform, "Shadow", soft, new Color(0, 0, 0, 0.25f), Vector3.zero, new Vector3(1, 0.3f, 1));
            view.telegraph = Sr(root.transform, "Telegraph", ring, new Color(1, 0.25f, 0.2f, 0.8f), Vector3.zero, new Vector3(1.9f, 0.7f, 1));
            var body = new GameObject("Body");
            body.transform.SetParent(root.transform, false);
            body.AddComponent<MeshFilter>();
            body.AddComponent<MeshRenderer>().sharedMaterial = mat;
            view.body = body.AddComponent<SlimeBody>();
            view.eyeL = Sr(root.transform, "EyeL", circle, Color.black, Vector3.zero, Vector3.one * 0.15f);
            view.eyeR = Sr(root.transform, "EyeR", circle, Color.black, Vector3.zero, Vector3.one * 0.15f);
            view.shine = Sr(root.transform, "Shine", soft, Color.white, Vector3.zero, Vector3.one * 0.2f);
            view.badge = Sr(root.transform, "RoleBadge", circle, Color.white, Vector3.zero, Vector3.one * 0.26f);
            view.hpBack = Sr(root.transform, "HpBack", pixel, new Color(0, 0, 0, 0.6f), Vector3.zero, Vector3.one);
            view.hpFill = Sr(root.transform, "HpFill", pixel, Color.green, Vector3.zero, Vector3.one);
            var prefab = PrefabUtility.SaveAsPrefabAsset(root, PrefabDir + "/Unit.prefab");
            Object.DestroyImmediate(root);
            return prefab.GetComponent<UnitView>();
        }

        static DamagePopup CreatePopupPrefab()
        {
            var go = new GameObject("Popup", typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.sizeDelta = new Vector2(520, 110);
            var text = go.AddComponent<Text>();
            text.font = font;
            text.alignment = TextAnchor.MiddleCenter;
            text.fontStyle = FontStyle.Bold;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.raycastTarget = false;
            var outline = go.AddComponent<Outline>();
            outline.effectColor = new Color(0, 0, 0, 0.85f);
            outline.effectDistance = new Vector2(3, -3);
            var popup = go.AddComponent<DamagePopup>();
            popup.text = text;
            go.SetActive(false);
            var prefab = PrefabUtility.SaveAsPrefabAsset(go, PrefabDir + "/Popup.prefab");
            Object.DestroyImmediate(go);
            return prefab.GetComponent<DamagePopup>();
        }

        // ---------- 씬 ----------

        static RectTransform Ui(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax, Vector2 pos, Vector2 size, Vector2? pivot = null)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.pivot = pivot ?? new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
            return rt;
        }

        static Image Img(RectTransform rt, Sprite sprite, Color color, bool sliced = false)
        {
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = sprite;
            img.color = color;
            img.type = sliced ? Image.Type.Sliced : Image.Type.Simple;
            return img;
        }

        static Text Txt(Transform parent, string name, string s, int size, Color color, TextAnchor align, Vector2 anchorMin, Vector2 anchorMax, Vector2 pos, Vector2 sizeDelta, FontStyle style = FontStyle.Normal)
        {
            var rt = Ui(name, parent, anchorMin, anchorMax, pos, sizeDelta);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = font;
            t.text = s;
            t.fontSize = size;
            t.color = color;
            t.alignment = align;
            t.fontStyle = style;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            t.lineSpacing = 1.05f;
            return t;
        }

        static Button Btn(RectTransform rt, Color color, out Text label, string s, int size)
        {
            var img = Img(rt, rounded, color, true);
            var b = rt.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            var cb = b.colors;
            cb.disabledColor = new Color(0.55f, 0.55f, 0.55f, 0.6f);
            cb.pressedColor = new Color(0.8f, 0.8f, 0.8f);
            b.colors = cb;
            label = Txt(rt, "Label", s, size, Color.white, TextAnchor.MiddleCenter, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, FontStyle.Bold);
            return b;
        }

        static void CreateScene(UnitView unitPrefab, DamagePopup popupPrefab)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.orthographicSize = 9.6f;
            cam.transform.position = new Vector3(0, 0.4f, -10);
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.09f, 0.13f, 0.2f);

            var bg = new GameObject("Background").AddComponent<SpriteRenderer>();
            bg.sprite = gradient;
            bg.transform.localScale = new Vector3(40, 40, 1);
            bg.sortingOrder = -100;
            // 바닥 — 아군 · 적이 서는 땅을 옅게 구분한다
            foreach (var (y, w, a) in new[] { (-2.2f, 11f, 0.10f), (3.4f, 10f, 0.07f) })
            {
                var g = new GameObject("Ground").AddComponent<SpriteRenderer>();
                g.sprite = soft;
                g.color = new Color(0.7f, 0.9f, 0.8f, a);
                g.transform.position = new Vector3(0, y, 0);
                g.transform.localScale = new Vector3(w, 3.2f, 1);
                g.sortingOrder = -90;
            }

            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));

            var canvasGo = new GameObject("Canvas", typeof(RectTransform));
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.matchWidthOrHeight = 0f;
            canvasGo.AddComponent<GraphicRaycaster>();
            var hud = canvasGo.AddComponent<Hud>();

            var safe = Ui("SafeArea", canvasGo.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            safe.gameObject.AddComponent<SafeAreaFitter>();
            hud.safeArea = safe;

            hud.popupLayer = Ui("Popups", safe, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            hud.popupPrefab = popupPrefab;

            // 상단 — 오른쪽 위는 앱인토스 닫기 버튼 자리라 비워 둔다
            var top = Ui("TopBar", safe, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -24), new Vector2(-48, 150), new Vector2(0.5f, 1));
            Img(top, rounded, new Color(0, 0, 0, 0.35f), true);
            hud.waveText = Txt(top, "Wave", "웨이브", 44, Color.white, TextAnchor.UpperLeft, new Vector2(0, 0), new Vector2(1, 1), new Vector2(40, -20), new Vector2(-300, -30), FontStyle.Bold);
            ((RectTransform)hud.waveText.transform).pivot = new Vector2(0, 1);
            ((RectTransform)hud.waveText.transform).anchorMin = new Vector2(0, 1);
            ((RectTransform)hud.waveText.transform).anchorMax = new Vector2(1, 1);
            ((RectTransform)hud.waveText.transform).sizeDelta = new Vector2(-280, 60);
            ((RectTransform)hud.waveText.transform).anchoredPosition = new Vector2(36, -18);
            hud.goldText = Txt(top, "Gold", "골드 0", 38, new Color(1f, 0.84f, 0.35f), TextAnchor.UpperLeft, new Vector2(0, 1), new Vector2(1, 1), new Vector2(36, -84), new Vector2(-280, 50), FontStyle.Bold);
            ((RectTransform)hud.goldText.transform).pivot = new Vector2(0, 1);

            hud.hintText = Txt(safe, "Hint", "", 34, new Color(0.85f, 0.92f, 1f), TextAnchor.MiddleCenter, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -220), new Vector2(-80, 60));
            hud.statusText = Txt(safe, "Status", "", 36, Color.white, TextAnchor.MiddleCenter, new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 740), new Vector2(-460, 60), FontStyle.Bold);

            // 필살기 · 배속 — 편성 패널 바로 위, 엄지가 닿는 자리
            var ult = Ui("Ultimate", safe, new Vector2(1, 0), new Vector2(1, 0), new Vector2(-130, 790), new Vector2(210, 210));
            hud.ultGlow = Img(Ui("Glow", ult, Vector2.zero, Vector2.one, Vector2.zero, new Vector2(60, 60)), soft, new Color(1, 0.9f, 0.3f, 0));
            var ultBg = Img(ult, circle, new Color(0.12f, 0.14f, 0.2f, 0.95f));
            hud.ultFill = Img(Ui("Fill", ult, Vector2.zero, Vector2.one, Vector2.zero, new Vector2(-20, -20)), circle, new Color(1f, 0.78f, 0.25f));
            hud.ultFill.type = Image.Type.Filled;
            hud.ultFill.fillMethod = Image.FillMethod.Radial360;
            hud.ultFill.fillOrigin = (int)Image.Origin360.Bottom;
            Img(Ui("Inner", ult, Vector2.zero, Vector2.one, Vector2.zero, new Vector2(-52, -52)), circle, new Color(0.14f, 0.16f, 0.24f));
            hud.ultButton = ult.gameObject.AddComponent<Button>();
            hud.ultButton.targetGraphic = ultBg;
            Txt(ult, "Label", "필살기", 36, Color.white, TextAnchor.MiddleCenter, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, FontStyle.Bold);

            hud.speedButton = Btn(Ui("Speed", safe, new Vector2(0, 0), new Vector2(0, 0), new Vector2(110, 770), new Vector2(150, 100)), new Color(0.25f, 0.3f, 0.42f), out hud.speedLabel, "×1", 40);

            // 편성 패널
            var panel = Ui("Formation", safe, new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 16), new Vector2(-32, 660), new Vector2(0.5f, 0));
            Img(panel, rounded, new Color(0.96f, 0.97f, 1f, 0.97f), true);
            hud.formationPanel = panel.gameObject;
            Txt(panel, "Title", "편성 — 용병 2명 선택", 36, new Color(0.15f, 0.18f, 0.25f), TextAnchor.MiddleLeft, new Vector2(0, 1), new Vector2(1, 1), new Vector2(40, -44), new Vector2(-80, 56), FontStyle.Bold);
            for (int i = 0; i < 4; i++)
            {
                float w = 236, gap = 14, x0 = -(w * 4 + gap * 3) / 2 + w / 2;
                var cardRt = Ui("Card" + i, panel, new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(x0 + i * (w + gap), -250), new Vector2(w, 320));
                var card = new MercCard();
                card.frame = Img(cardRt, rounded, new Color(1, 1, 1, 0.15f), true);
                var inner = Ui("Inner", cardRt, Vector2.zero, Vector2.one, Vector2.zero, new Vector2(-12, -12));
                var innerImg = Img(inner, rounded, new Color(0.17f, 0.2f, 0.28f), true);
                innerImg.raycastTarget = false;
                card.button = cardRt.gameObject.AddComponent<Button>();
                card.button.targetGraphic = card.frame;
                card.swatch = Img(Ui("Swatch", inner, new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -62), new Vector2(84, 84)), circle, Color.white);
                card.swatch.raycastTarget = false;
                card.name = Txt(inner, "Name", "", 30, Color.white, TextAnchor.MiddleCenter, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -136), new Vector2(-10, 44), FontStyle.Bold);
                card.role = Txt(inner, "Role", "", 28, Color.white, TextAnchor.MiddleCenter, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -178), new Vector2(-10, 40), FontStyle.Bold);
                card.desc = Txt(inner, "Desc", "", 24, new Color(0.8f, 0.85f, 0.95f), TextAnchor.UpperCenter, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -238), new Vector2(-24, 90));
                hud.cards.Add(card);
            }
            hud.upgradeButton = Btn(Ui("Upgrade", panel, new Vector2(0, 0), new Vector2(0, 0), new Vector2(270, 110), new Vector2(480, 160)), new Color(0.36f, 0.42f, 0.62f), out hud.upgradeLabel, "슬라임 강화", 34);
            hud.startButton = Btn(Ui("Start", panel, new Vector2(1, 0), new Vector2(1, 0), new Vector2(-270, 110), new Vector2(480, 160)), new Color(0.06f, 0.62f, 0.46f), out hud.startLabel, "전투 시작", 44);

            hud.diagText = Txt(safe, "Diag", "", 22, new Color(0.6f, 0.85f, 0.65f), TextAnchor.MiddleCenter, new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 690), new Vector2(-60, 36));

            // 결과
            var result = Ui("Result", safe, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            Img(result, pixel, new Color(0, 0, 0, 0.6f));
            var box = Ui("Box", result, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 120), new Vector2(880, 640));
            Img(box, rounded, new Color(0.97f, 0.98f, 1f), true);
            hud.resultTitle = Txt(box, "Title", "승리!", 84, new Color(0.12f, 0.16f, 0.24f), TextAnchor.MiddleCenter, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -110), new Vector2(-60, 120), FontStyle.Bold);
            hud.resultBody = Txt(box, "Body", "", 38, new Color(0.25f, 0.3f, 0.4f), TextAnchor.UpperCenter, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -290), new Vector2(-90, 220));
            hud.resultButton = Btn(Ui("Next", box, new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 110), new Vector2(560, 150)), new Color(0.06f, 0.62f, 0.46f), out hud.resultButtonLabel, "다음", 44);
            hud.resultPanel = result.gameObject;

            var director = new GameObject("BattleDirector").AddComponent<BattleDirector>();
            director.hud = hud;
            director.unitPrefab = unitPrefab;
            director.cam = cam;

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        // ---------- 플레이어 설정 ----------

        static void ConfigurePlayer()
        {
            PlayerSettings.companyName = "Joonsby";
            PlayerSettings.productName = "슬라임 용병단 Proto";
            PlayerSettings.bundleVersion = "0.0.1";
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.allowedAutorotateToLandscapeLeft = false;
            PlayerSettings.allowedAutorotateToLandscapeRight = false;
            PlayerSettings.colorSpace = ColorSpace.Gamma;
            PlayerSettings.runInBackground = false;
            // Unity 6 는 Personal 도 스플래시를 끌 수 있다 — 첫 화면까지 시간을 줄인다
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.WebGL.template = "PROJECT:Slimora";
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.nameFilesAsHashes = false;
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL, ManagedStrippingLevel.Low);
        }
    }
}

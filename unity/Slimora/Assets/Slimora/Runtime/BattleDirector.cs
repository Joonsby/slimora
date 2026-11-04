using System;
using System.Collections.Generic;
using System.Linq;
using Slimora.Core;
using Slimora.Core.Diagnostics;
using Slimora.Core.Squad;
using UnityEngine;

namespace Slimora.View
{
    /// <summary>
    /// 프로토타입 진행. 편성 → 전투 → 결과 를 돌고, 매 프레임 규칙 엔진(SquadBattle)을 진행해 나온 이벤트를 연출로 바꾼다.
    /// 전투 결과는 엔진만 정한다 — 연출이 늦거나 빨라도 승패 · 수치는 바뀌지 않는다
    /// </summary>
    public sealed class BattleDirector : MonoBehaviour
    {
        public Hud hud;
        public UnitView unitPrefab;
        public Camera cam;

        static readonly Dictionary<Role, (string label, Color color)> RoleInfo = new Dictionary<Role, (string, Color)>
        {
            { Role.Tank, ("탱커", new Color(0.55f, 0.6f, 0.68f)) },
            { Role.Striker, ("암살", new Color(0.55f, 0.4f, 0.95f)) },
            { Role.Mage, ("광역", new Color(1f, 0.5f, 0.25f)) },
            { Role.Healer, ("치유", new Color(0.35f, 0.75f, 1f)) },
        };

        SquadConfig cfg;
        SquadState state;
        readonly List<UnitView> views = new List<UnitView>();
        readonly List<DamagePopup> popups = new List<DamagePopup>();
        Progress progress;
        int speed = 1;
        bool fighting;
        float endDelay = -1;

        [Serializable]
        sealed class Progress
        {
            public int v = 1;
            public int wave = 1, level = 1, best = 0;
            public double gold;
            public List<string> party = new List<string> { "pebble", "shade" };
        }

        const string SaveKey = "slimora.proto.v1";

        void Start()
        {
            Application.targetFrameRate = 60;
            cfg = SquadConfig.FromJson(Resources.Load<TextAsset>("squad").text);
            progress = Load();
            hud.startButton.onClick.AddListener(StartFight);
            hud.upgradeButton.onClick.AddListener(Upgrade);
            hud.speedButton.onClick.AddListener(() => { speed = speed == 1 ? 2 : 1; Refresh(); });
            hud.ultButton.onClick.AddListener(Ultimate);
            hud.resultButton.onClick.AddListener(CloseResult);
            for (int i = 0; i < hud.cards.Count && i < cfg.Mercs.Count; i++)
            {
                var def = cfg.Merc(cfg.Mercs[i].Id);
                var card = hud.cards[i];
                string id = def.Id;
                card.name.text = def.Name;
                card.role.text = RoleInfo[def.Role].label;
                card.role.color = RoleInfo[def.Role].color;
                card.desc.text = def.Desc;
                card.swatch.color = Hex(def.Tint);
                card.button.onClick.AddListener(() => ToggleMerc(id));
            }
            hud.resultPanel.SetActive(false);
            RunDiagnostics();
            Preview();
            Refresh();
        }

        // ---------- 진행 · 저장 ----------

        Progress Load()
        {
            try
            {
                string json = PlayerPrefs.GetString(SaveKey, "");
                if (string.IsNullOrEmpty(json)) return new Progress();
                var p = JsonUtility.FromJson<Progress>(json);
                // 깨졌거나 범위를 벗어난 값은 버리고 새로 시작 — 진행을 잘못 키우지 않는다
                bool valid = p != null && p.v == 1 && p.wave >= 1 && p.wave <= cfg.Waves.Count && p.level >= 1 && p.level <= 99 && p.gold >= 0 && !double.IsNaN(p.gold)
                    && p.party != null && p.party.Count <= cfg.PartySlots && p.party.Distinct().Count() == p.party.Count && p.party.All(id => cfg.Mercs.Any(m => m.Id == id));
                return valid ? p : new Progress();
            }
            catch (Exception e)
            {
                Debug.LogWarning("저장 불러오기 실패 — 새로 시작: " + e.Message);
                return new Progress();
            }
        }

        void Save()
        {
            try
            {
                PlayerPrefs.SetString(SaveKey, JsonUtility.ToJson(progress));
                PlayerPrefs.Save();
            }
            catch (Exception e) { Debug.LogWarning("저장 실패: " + e.Message); }
        }

        void OnApplicationPause(bool paused) { if (paused) Save(); }

        void ToggleMerc(string id)
        {
            if (fighting) return;
            if (progress.party.Contains(id)) progress.party.Remove(id);
            else if (progress.party.Count < cfg.PartySlots) progress.party.Add(id);
            else { progress.party.RemoveAt(0); progress.party.Add(id); }
            Save();
            Preview();
            Refresh();
        }

        void Upgrade()
        {
            double cost = cfg.UpgradeCost(progress.level);
            if (fighting || progress.gold < cost) return;
            progress.gold -= cost;
            progress.level++;
            Save();
            Preview();
            views[0].Healed();
            Refresh();
        }

        // ---------- 전투 ----------

        SquadSetup Setup(int seed)
        {
            var s = new SquadSetup { Wave = progress.wave, SlimeLevel = progress.level, MercLevel = progress.level, Seed = seed };
            s.Party.AddRange(progress.party);
            return s;
        }

        /// <summary>편성 화면 — 전투 전 상태로 유닛을 세워 둔다</summary>
        void Preview()
        {
            state = SquadBattle.Create(Setup(0), cfg);
            SpawnViews();
            hud.statusText.text = "용병 2명을 골라 편성하세요";
            hud.hintText.text = WaveHint();
        }

        void StartFight()
        {
            if (fighting) return;
            int seed = (int)Rng.SeedFrom(progress.wave, progress.level, Environment.TickCount);
            state = SquadBattle.Create(Setup(seed), cfg);
            SpawnViews();
            fighting = true;
            endDelay = -1;
            hud.statusText.text = "전투 중";
            Refresh();
        }

        void Ultimate()
        {
            if (!fighting || state == null) return;
            var ev = SquadBattle.UseUltimate(state, cfg);
            if (ev == null) return;
            views[0].Cast();
            ShakeCamera(0.25f);
            Play(ev);
        }

        void Update()
        {
            if (fighting && state != null)
            {
                if (state.Phase == SquadPhase.Fighting)
                {
                    var ev = SquadBattle.Step(state, Time.deltaTime * 1000.0 * speed, cfg);
                    Play(ev);
                }
                else
                {
                    if (endDelay < 0) endDelay = 1.1f;
                    endDelay -= Time.deltaTime;
                    if (endDelay <= 0) Finish();
                }
            }
            UpdateUlt();
            UpdateCamera();
        }

        void Play(List<SquadEvent> events)
        {
            foreach (var e in events)
            {
                switch (e.Type)
                {
                    case SquadEventType.Hit:
                        {
                            var from = views[e.Actor];
                            var to = views[e.Target];
                            var actor = state.Units[e.Actor];
                            if (e.Aoe) { if (actor.Role != Role.Slime || !IsUlt(e)) from.Cast(); }
                            else from.Lunge(to.Home);
                            to.Hit(from.Home, e.Heavy, e.Crit);
                            to.SetHp((float)(state.Units[e.Target].Hp / state.Units[e.Target].MaxHp));
                            bool enemy = state.Units[e.Target].Team == Team.Enemy;
                            Color c = e.Heavy ? new Color(1f, 0.3f, 0.25f) : e.Crit ? new Color(1f, 0.85f, 0.2f) : enemy ? Color.white : new Color(1f, 0.55f, 0.5f);
                            Popup(to.Center, (e.Crit ? "치명 " : e.Heavy ? "강타 " : "") + Mathf.RoundToInt((float)e.Amount), c, e.Heavy || e.Crit ? 64 : 46);
                            if (e.Heavy) ShakeCamera(0.35f);
                            break;
                        }
                    case SquadEventType.Heal:
                        views[e.Actor].Cast();
                        views[e.Target].Healed();
                        views[e.Target].SetHp((float)(state.Units[e.Target].Hp / state.Units[e.Target].MaxHp));
                        Popup(views[e.Target].Center, "+" + Mathf.RoundToInt((float)e.Amount), new Color(0.45f, 1f, 0.55f), 48);
                        break;
                    case SquadEventType.HeavyWarning:
                        views[e.Actor].SetTelegraph(true);
                        break;
                    case SquadEventType.Interrupted:
                        views[e.Target].SetTelegraph(false);
                        Popup(views[e.Target].Center + Vector3.up * 0.6f, "끊김!", new Color(0.6f, 0.9f, 1f), 60);
                        break;
                    case SquadEventType.Ultimate:
                        Popup(views[e.Actor].Center + Vector3.up * 0.8f, "슬라임 대폭발!", new Color(1f, 0.9f, 0.4f), 66);
                        break;
                    case SquadEventType.Died:
                        views[e.Target].Die();
                        break;
                }
            }
            // 강타 예고는 엔진 상태 그대로 보여 준다
            foreach (var u in state.Units) views[u.Index].SetTelegraph(u.Alive && u.HeavyNext);
            Refresh();
        }

        bool IsUlt(SquadEvent e) => e.Actor == 0 && e.Aoe;

        void Finish()
        {
            fighting = false;
            bool won = state.Phase == SquadPhase.Won;
            hud.statusText.text = "";
            hud.resultPanel.SetActive(true);
            if (won)
            {
                double gold = cfg.WaveGold(progress.wave);
                progress.gold += gold;
                progress.best = Math.Max(progress.best, progress.wave);
                hud.resultTitle.text = "승리!";
                hud.resultBody.text = $"골드 +{gold:0}\n{Math.Round(state.Now / 1000)}초 만에 정리했어요";
                hud.resultButtonLabel.text = progress.wave < cfg.Waves.Count ? "다음 웨이브" : "처음부터 다시";
                progress.wave = progress.wave < cfg.Waves.Count ? progress.wave + 1 : 1;
            }
            else
            {
                double consolation = Math.Floor(cfg.WaveGold(progress.wave) * 0.3);
                progress.gold += consolation;
                hud.resultTitle.text = "패배";
                hud.resultBody.text = DefeatHint() + $"\n(골드 +{consolation:0})";
                hud.resultButtonLabel.text = "편성 다시 하기";
            }
            Save();
            Refresh();
        }

        void CloseResult()
        {
            hud.resultPanel.SetActive(false);
            Preview();
            Refresh();
        }

        /// <summary>진 이유 — 남은 적과 편성을 보고 다음에 해 볼 것을 하나 고른다</summary>
        string DefeatHint()
        {
            var enemies = state.Team(Team.Enemy).Where(e => e.Alive).ToList();
            bool has(Role r) => state.Team(Team.Ally).Any(a => a.Role == r);
            if (state.Phase == SquadPhase.Lost && state.Now >= cfg.TimeLimitMs) return "시간이 다 됐어요. 피해를 더 낼 편성이 필요해요";
            if (enemies.Any(e => e.Role == Role.Caster) && !has(Role.Striker)) return "주술사가 약한 아군부터 노려요.\n그림자 박쥐는 주술사를 먼저 처치해요";
            if (enemies.Count(e => e.Role == Role.Grunt) >= 3 && !has(Role.Tank)) return "박쥐 떼가 슬라임에게 몰려요.\n조약돌 골렘이 앞에서 대신 맞아 줘요";
            if (enemies.Count(e => e.Role == Role.Grunt) >= 3 && !has(Role.Mage)) return "적이 많을 땐 불꽃 와이번의 광역 공격이 좋아요";
            if (enemies.Any(e => e.Role == Role.Brute) && !has(Role.Tank)) return "골렘의 강타는 조약돌 골렘이 대신 맞아 줄 수 있어요.\n붉은 고리가 보이면 필살기로 끊어 보세요";
            if (!has(Role.Healer)) return "오래 버티려면 물방울 슬라임의 치료가 도움이 돼요";
            return "슬라임을 강화한 뒤 다시 도전해 보세요";
        }

        string WaveHint()
        {
            var w = cfg.Waves[progress.wave - 1];
            var kinds = w.Enemies.Select(id => cfg.Enemies[id]).GroupBy(d => d.Name).Select(g => g.Count() > 1 ? $"{g.Key} ×{g.Count()}" : g.Key);
            return "등장: " + string.Join(" · ", kinds);
        }

        // ---------- 표시 ----------

        void SpawnViews()
        {
            foreach (var v in views) Destroy(v.gameObject);
            views.Clear();
            var allies = state.Team(Team.Ally).ToList();
            var enemies = state.Team(Team.Enemy).ToList();
            var pos = new Dictionary<int, Vector3>();
            // 탱커는 앞줄 가운데, 나머지는 뒤로 비켜 선다
            var tank = allies.FirstOrDefault(a => a.Role == Role.Tank);
            var rest = allies.Where(a => a != tank).ToList();
            if (tank != null) pos[tank.Index] = new Vector3(0, -0.6f, 0);
            float[] xs = rest.Count == 1 ? new[] { 0f } : rest.Count == 2 ? new[] { -1.7f, 1.7f } : new[] { -2.6f, 0f, 2.6f };
            for (int i = 0; i < rest.Count; i++) pos[rest[i].Index] = new Vector3(xs[i], tank != null ? -2.4f : -1.6f, 0);
            var melee = enemies.Where(e => e.Role != Role.Caster).ToList();
            var back = enemies.Where(e => e.Role == Role.Caster).ToList();
            Row(melee, 2.6f, pos);
            Row(back, 4.6f, pos);
            foreach (var u in state.Units)
            {
                var v = Instantiate(unitPrefab, transform);
                v.name = u.Def.Name;
                float size = u.Role == Role.Brute ? 1.7f : u.Role == Role.Tank ? 1.3f : u.Role == Role.Slime ? 1.15f : u.Role == Role.Grunt ? 0.75f : 1f;
                bool badge = RoleInfo.ContainsKey(u.Role);
                v.Setup(Hex(u.Def.Tint), size, pos[u.Index], badge ? RoleInfo[u.Role].color : Color.clear, badge);
                v.SetHp(1);
                views.Add(v);
            }
        }

        static void Row(List<Unit> units, float y, Dictionary<int, Vector3> pos)
        {
            float gap = units.Count > 4 ? 1.35f : 1.9f;
            for (int i = 0; i < units.Count; i++) pos[units[i].Index] = new Vector3((i - (units.Count - 1) / 2f) * gap, y + (i % 2) * 0.35f, 0);
        }

        void Popup(Vector3 world, string text, Color c, float size)
        {
            var p = popups.FirstOrDefault(x => !x.Busy);
            if (p == null)
            {
                p = Instantiate(hud.popupPrefab, hud.popupLayer);
                popups.Add(p);
            }
            p.Show(cam, hud.popupLayer, world, text, c, size);
        }

        void Refresh()
        {
            var w = cfg.Waves[progress.wave - 1];
            hud.waveText.text = $"웨이브 {progress.wave}/{cfg.Waves.Count} · {w.Name}";
            hud.goldText.text = $"골드 {progress.gold:0}";
            double cost = cfg.UpgradeCost(progress.level);
            hud.upgradeLabel.text = $"슬라임 강화 Lv{progress.level}→{progress.level + 1}\n골드 {cost:0}";
            hud.upgradeButton.interactable = !fighting && progress.gold >= cost;
            hud.startButton.interactable = !fighting;
            hud.startLabel.text = fighting ? "전투 중…" : "전투 시작";
            hud.speedLabel.text = "×" + speed;
            for (int i = 0; i < hud.cards.Count && i < cfg.Mercs.Count; i++)
            {
                bool on = progress.party.Contains(cfg.Mercs[i].Id);
                hud.cards[i].frame.color = on ? new Color(1f, 0.82f, 0.3f) : new Color(1, 1, 1, 0.15f);
                hud.cards[i].button.interactable = !fighting;
            }
        }

        void UpdateUlt()
        {
            if (state == null) return;
            float r = (float)(state.UltCharge / cfg.UltMax);
            hud.ultFill.fillAmount = r;
            bool ready = fighting && SquadBattle.UltReady(state, cfg);
            hud.ultButton.interactable = ready;
            bool telegraph = fighting && state.Team(Team.Enemy).Any(e => e.Alive && e.HeavyNext);
            hud.ultGlow.color = new Color(1f, telegraph ? 0.3f : 0.9f, 0.3f, ready ? 0.55f + 0.35f * Mathf.Sin(Time.time * (telegraph ? 16f : 6f)) : 0);
        }

        // ---------- 카메라 흔들림 ----------
        float shake;
        Vector3 camHome;

        void ShakeCamera(float amount) => shake = Mathf.Max(shake, amount);

        Vector3 lastScreen;

        /// <summary>전투 영역(월드 y −3.4 ~ 5.4, x ±3.4)이 상단 바와 하단 패널 사이 띠에 들어가게 카메라를 맞춘다</summary>
        void FitCamera()
        {
            var canvas = hud.GetComponent<Canvas>();
            float canvasH = Screen.height / Mathf.Max(0.01f, canvas.scaleFactor);
            float bottom = Mathf.Clamp01(900f / canvasH), top = 1f - Mathf.Clamp01(310f / canvasH);
            if (top - bottom < 0.2f) { bottom = 0.3f; top = 0.9f; }
            const float yMin = -3.4f, yMax = 5.4f, halfW = 3.4f;
            float size = (yMax - yMin) / (2f * (top - bottom));
            float aspect = (float)Screen.width / Screen.height;
            size = Mathf.Max(size, halfW / aspect);
            cam.orthographicSize = size;
            float camY = yMin - size * (2f * bottom - 1f);
            camHome = new Vector3(0, camY, -10);
        }

        void UpdateCamera()
        {
            var now = new Vector3(Screen.width, Screen.height, hud.GetComponent<Canvas>().scaleFactor);
            if (now != lastScreen) { lastScreen = now; FitCamera(); }
            shake = Mathf.MoveTowards(shake, 0, Time.deltaTime * 1.5f);
            cam.transform.position = camHome + (Vector3)(UnityEngine.Random.insideUnitCircle * shake * 0.35f);
        }

        // ---------- 진단 ----------

        /// <summary>이 플랫폼(에디터 Mono · WebGL IL2CPP 등)에서 규칙 계층이 TS 엔진과 같은 답을 내는지 확인한다</summary>
        void RunDiagnostics()
        {
            try
            {
                string T(string n) => Resources.Load<TextAsset>("Vectors/" + n).text;
                var t0 = Time.realtimeSinceStartup;
                var r = Parity.Run(T("config"), T("rng"), T("monsters"), T("battles"));
                float ms = (Time.realtimeSinceStartup - t0) * 1000f;
                string line = $"규칙 회귀({Application.platform}): {r.Summary} · {ms:0}ms";
                hud.diagText.text = line;
                hud.diagText.color = r.Ok ? new Color(0.6f, 0.85f, 0.65f) : new Color(1f, 0.45f, 0.4f);
                Debug.Log("[Slimora] " + line);
                foreach (var f in r.Failures.Take(10)) Debug.LogWarning("[Slimora] " + f);
            }
            catch (Exception e)
            {
                hud.diagText.text = "규칙 회귀 실행 실패: " + e.Message;
                Debug.LogException(e);
            }
        }

        static Color Hex(string hex) => ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.white;
    }
}

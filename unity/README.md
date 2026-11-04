# unity/ — 슬라임 용병단 Unity 전환 작업 영역

기존 게임(`client/`)은 건드리지 않는다. 분석과 전략은 [docs/UNITY_MIGRATION.md](../docs/UNITY_MIGRATION.md).

## 실행

| 무엇 | 명령 (저장소 루트 기준) |
|---|---|
| TS 엔진으로 회귀 벡터 다시 뽑기 | `cd client && npx tsx ../unity/tools/export-vectors.ts` |
| 규칙 계층 회귀 + 분대 시뮬레이션 (Unity 없이) | `"<Unity>/Editor/Data/DotNetSdk/dotnet.exe" run -c Release --project unity/CoreTests` |
| 씬 · 프리팹 다시 만들기 | Unity 메뉴 `Slimora/1` 또는 `-executeMethod Slimora.EditorTools.SlimoraBuilder.BuildAll` |
| 에디터(Mono)에서 회귀 | `Slimora/2` · `…SlimoraBuilder.RunParity` (불일치면 종료 코드 2) |
| WebGL 빌드 | `Slimora/3` · `…SlimoraBuilder.BuildWebGL` → `unity/Builds/WebGL` |
| 빌드 결과 띄우기 | `node unity/tools/serve-webgl.mjs 8090` |

`<Unity>` = `C:\Program Files\Unity\Hub\Editor\6000.6.8f1`. 별도 .NET SDK 설치 없이 Unity 동봉 SDK(8.0.318)를 쓴다.

## 프로토타입 규칙 (squad.json)

슬라임 + 용병 2 (4종 중) vs 웨이브 7개. 역할마다 고르는 대상이 다르다.

| 역할 | 용병 | 하는 일 |
|---|---|---|
| 탱커 | 조약돌 골렘 | 도발 — 근접 적(박쥐 · 골렘)이 대신 친다. 피해감소 30% |
| 암살 | 그림자 박쥐 | 주술사 → 없으면 HP 낮은 적. 치명 30% × 2 |
| 광역 | 불꽃 와이번 | 모든 적에게 피해 |
| 치유 | 물방울 슬라임 | 가장 다친 아군 치료, 모두 멀쩡하면 공격 |

| 적 | 하는 일 |
|---|---|
| 박쥐 | 약하고 빠른 근접, 떼로 나온다 |
| 바위 골렘 | 3번째 공격마다 강타(×2.6) — 직전에 붉은 고리로 예고. 필살기로 끊으면 휘청 |
| 화염 주술사 | **도발 무시** — HP 가 가장 낮은 아군을 노린다 |

필살기(슬라임 대폭발): 모든 적에게 공격력 × 2.2, 예고 중인 강타를 끊는다.

## 폰트

`Assets/Slimora/Fonts/NotoSansKR.ttf` = Windows 에 들어 있는 Noto Sans KR VF (SIL Open Font License 1.1, 재배포 가능).
출시 전 OFL 전문을 함께 넣고, 쓰는 글자만 남긴 정적 폰트(TMP SDF)로 바꿔 용량을 줄인다 — 지금은 10MB 원본 그대로다.

# 슬라임 용병단 (가칭)

앱인토스에 낼 세로형 2D 방치형 RPG. 슬라임이 몬스터를 자동으로 사냥하고, 무엇을 사냥했느냐에 따라 진화한다.

| 문서 | 내용 |
|---|---|
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | 게임 규칙 · 확정된 결정 D1~D12 · 수치 초안 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 계층 구조 · 타입 · 전투 루프 · 저장 |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 단계별 계획과 진행 현황 |

## 현재 상태 — 첫 플레이 가능 프로토타입 (2026-10-28)

**자동 전투 → 처치 → 골드 · 흡수 → 강화 · 특성 · 진화 → 보스** 루프를 브라우저에서 플레이할 수 있다.
15 스테이지 · 보스 2종 · 진화 3형태까지 들어 있다 (2026-10-29).

## 실행

Node 20 이상이 필요하다 (개발은 Node 24 에서 했다).

```bash
npm install              # client 의존성까지 설치된다
npm run dev              # http://localhost:5173
npm run dev -- --host    # 같은 와이파이의 휴대폰에서 접속할 때
```

앱은 `client/` 에 있다. 루트 `package.json` 은 명령을 `client` 로 넘기기만 하므로 `cd client` 후 실행해도 같다.

| 명령 | 하는 일 |
|---|---|
| `npm test` | 단위 테스트 (Vitest, 115개) |
| `npm run lint` | ESLint — 계층 간 의존 규칙도 여기서 검사한다 |
| `npm run typecheck` | TypeScript 검사 (앱 · 도구 두 설정) |
| `npm run build` | 타입 검사 후 `dist/` 로 빌드하고, 앱인토스 업로드용 `client/slimora.ait` 까지 만든다 |
| `npm run deploy` | `.ait` 를 앱인토스에 업로드 (먼저 `npx ait token add` 로 API 키 등록) |
| `npm run preview` | 빌드 결과를 띄워 본다 (http://localhost:4173) |
| `npm run sim` | 밸런스 시뮬레이터 — 화면 없이 실제 전투 엔진을 돌려 표로 출력 |
| `npm run store-assets` | 앱인토스 콘솔용 로고 · 썸네일 · 스크린샷을 `store-assets/` 에 생성 (먼저 `npm run build`, Chrome 필요) |
| `npm run android-icons` | 안드로이드 런처 아이콘 · 스플래시 PNG 를 `client/android/app/src/main/res/` 에 생성 (Chrome 필요) |

## 안드로이드 빌드 (원스토어)

같은 웹 빌드를 Capacitor 로 감싸 안드로이드 앱으로 만든다. 설정은 `client/capacitor.config.ts`, 네이티브 프로젝트는 `client/android/` 에 있다.
**Android Studio** 를 먼저 설치한다 (SDK 와 JDK 21 이 같이 들어온다).

```bash
npm run build:android    # 타입 검사 → dist/ 빌드 → client/android 로 복사 (.ait 는 만들지 않는다)
npm run open:android     # Android Studio 로 연다
```

Android Studio 에서 **Build > Generate Signed App Bundle / APK** 로 서명된 파일을 만든다.

- **키스토어(.jks)와 비밀번호를 잃어버리면 같은 앱으로 업데이트를 낼 수 없다.** 저장소 밖 두 곳 이상에 백업한다
- `appId`(`com.slimora.game`)는 원스토어 신규 앱 등록 때 입력하는 패키지명과 같아야 한다. 등록 후에는 바꿀 수 없다
- 앱 아이콘 · 스플래시는 `store-assets/src/android-icon.html` 에서 그린다. 고친 뒤 `client` 에서 `npm run android-icons` 로 `res/` 의 PNG 를 다시 만든다 (Chrome 필요)
- 원스토어가 APK 와 AAB 중 무엇을 받는지는 원스토어 개발자 콘솔에서 확인한다
- 업데이트를 낼 때마다 `client/android/app/build.gradle` 의 `versionCode` 를 올린다

## 조작

| 위치 | 기능 |
|---|---|
| HUD 스테이지 이름 | 사냥터 선택 시트 |
| HUD `도전 ▶` | 사냥 중일 때 다음 스테이지에 도전 |
| HUD `자동 ON/OFF` | 클리어하면 다음 스테이지로 자동 진행 |
| HUD `×1/×2/×3` | 전투 배속 (설정에 저장된다) |
| HUD `Lv` · 하단 `흡수` | 흡수 시트 — 슬라임 레벨, 계열별 흡수량과 특성 단계 |
| 하단 `강화` | 공격력 · 최대 HP · 치명타 확률. **길게 누르면 연속 구매** |
| 하단 `사냥터` | 클리어한 스테이지는 사냥, 바로 다음 스테이지는 도전 |
| 전투 로그 | 누르면 최근 30줄로 펼친다 |

## 이번에 구현한 것

| 항목 | 내용 |
|---|---|
| 프로젝트 | Vite 8 + React 19 + TypeScript 6 · Phaser 3.90 · Zustand 5 · Vitest 5 |
| 전투 엔진 | 순수 TS (`src/core/battle`). 행동을 예정 시각 순서로 처리해 프레임 속도와 무관하게 결과가 같다 |
| 몬스터 3종 | 박쥐(빠름 · 흡혈 20%) · 골렘(단단함 · 피해감소 30%) · 화염 드래곤(화상, 피해감소 무시) |
| 전투 규칙 | 자동 공격 · 치명타 5%(×1.5) · 처치 시 HP 10% 회복 · 사망 2초 후 재등장 또는 후퇴 |
| 스테이지 | 1~15, 2개 장 (계열 순환). 도전 / 사냥 / 실패 시 최고 클리어 스테이지로 후퇴 + 자동진행 OFF |
| 보스 | 7 거대 골렘(피해감소 40% · 4타마다 강타, 45초) · 15 고대 화염룡(공격마다 화상 · HP 50% 이하 격노, 60초). 시간 초과도 실패 |
| 진화 | 흡혈 · 철갑 · 화염 슬라임. 한 계열 흡수 200 + 3 스테이지 클리어로 해금, 처음은 무료 · 해금한 형태로 돌아갈 때 골드. 숙련 5단계(그 계열 흡수량). 보스전 중에는 불가 |
| 성장 | 골드 강화 3종 — 공격력 +3 · 최대 HP +25 (비용 `floor(10 × 1.13^레벨)`) · 치명타 확률 +0.5%p (비용 `floor(50 × 1.2^레벨)`, 최대 50레벨) |
| 배속 | ×1 / ×2 / ×3 정식 기능 (GAME_DESIGN D13) |
| 흡수 | 처치한 몬스터 계열을 흡수(처치당 `1 + floor((스테이지−1)/4)`). 계열별 특성 3단계(50 · 300 · 1,000) — 박쥐 흡혈 · 골렘 피해감소 · 화염 화상. 흡수 총합으로 슬라임 레벨(레벨당 기본 HP · 공격력 +2%). 슬라임이 가장 많이 흡수한 계열 색으로 물든다 |
| 테마 | 앱인토스 라이트 모드 기준 — UI 는 밝게, 전투 화면만 어두운 게임 아트 |
| 화면 | 세로 모바일 레이아웃 (360px 까지 확인). 임시 그래픽은 도형으로 그린 텍스처 |
| 저장 | localStorage. 10초 간격 + 클리어/실패 즉시 + 화면을 떠날 때 즉시. 체크섬 + 직전 저장본 백업 |
| 서버 저장 | 토스 앱 안에서만 [slimora-api](https://github.com/Joonsby/slimora-api) 에도 올린다 — 최대 30초 간격 + 화면을 떠날 때 즉시. 기기 저장으로 먼저 시작하고 뒤에서 맞추며, 두 쪽이 다르면 누적 획득 골드가 많은 쪽을 남긴다. 원스토어 앱 · 브라우저는 기기 저장만 |
| 테스트 | 전투 계산 · 진행 규칙 · 저장 · 세션 통합 · 밸런스 불변식 |

## 설계 대비 이번에 하지 않았거나 다르게 한 것

| 항목 | 상태 |
|---|---|
| 밸런스 | 고대 화염룡은 설계 초안 수치로는 깰 수 없어 낮췄다 (GAME_DESIGN 5장). 전체 페이스는 Phase 8 |
| 오프라인 보상 | Phase 7. 다만 저장에 `lastActiveAt` 을 이미 기록한다 |
| 앱인토스 SDK | 3.9.0 설치 · `.ait` 빌드까지 (appName 은 임시 `slimora`). 서버 저장 로그인(`User.createAnonymousKeyAuthCode`)만 붙였고, Safe Area 등 나머지 SDK 기능은 아직. 배포 준비 상태는 [docs/APPS_IN_TOSS.md](docs/APPS_IN_TOSS.md) |

## 설정값 조정

밸런스는 `client/src/data/*.json` 만 고치면 된다. 코드는 건드리지 않는다.

| 파일 | 내용 |
|---|---|
| `balance.json` | 슬라임 기본값 · 상한 · 전투 상수 · 스테이지 스케일링 · `configVersion` |
| `monsters.json` | 몬스터 배율 · 공격 간격 · 효과 (`lifesteal` · `damageReduction` · `burnOnHit` · `heavyAttack` · `enrage`) |
| `stages.json` | 스테이지 이름 · 장 · 출현 몬스터 · 처치 목표 · `boss` (보스 · 제한시간) · `overrides` (공식 대신 직접 지정) |
| `forms.json` | 진화 형태 — 요건 · 기본 보정 · 숙련 단계 효과 · 외형 |
| `upgrades.json` | 강화 종류 · 레벨당 증가량 · 비용 공식 |
| `families.json` | 계열 이름 · 색 (슬라임 물들기에도 쓰인다) |
| `traits.json` | 계열별 특성 단계 문턱과 효과 |

수치를 바꾸면 `configVersion` 을 올리고 `npm test` 와 `npm run sim` 으로 확인한다.
설정이 잘못되면 테스트가 실패하고, 앱은 화면에 설정 오류를 띄운다.

현재 수치로 자동 플레이(가장 싼 강화부터 즉시 구매)를 돌리면 ×1 배속에서 **약 5분**에 6 스테이지, 14~17분에 보스1(7)을 깬다.
보스2(15)는 흡혈 약 2시간 30분 · 화염 2시간 40분 · 철갑 4시간 30분 · 진화 안 함 8시간 (오프라인 보상 없이).
설계 목표(보스1 약 40분 · 보스2 3~5일, 오프라인 포함)보다 빠르다 — Phase 8 에서 맞춘다.
첫 진화 조건(3 스테이지 클리어 + 한 계열 흡수 200)에는 약 8분 45초에 닿는다 (목표 10~15분).
공격력만 있던 때는 골렘 스테이지(2 · 5)가 벽이었는데, 최대 HP 강화가 들어오면서 벽이 사라졌다.

## 폴더 구조

```
client/src/
├─ core/          게임 규칙 (순수 TS). React · Phaser · Zustand · Date.now · Math.random 금지
├─ data/          설정 JSON + 검증기
├─ session/       GameSession — 엔진 구동 · 커맨드 적용 · 스테이지 전환 · 저장 시점
├─ store/         Zustand 스토어 (React 가 읽는 상태)
├─ persistence/   저장소 구현 (localStorage · 메모리 · 서버 저장 API)
├─ platform/      시계 · 화면 가시성 · 토스 로그인 코드 · 안드로이드 뒤로가기
├─ game/          Phaser 전투 장면 (계산 없이 그리기만)
├─ ui/            React 화면
├─ dev/           자동 플레이어 (밸런스 점검용)
├─ testing/       테스트 픽스처
└─ main.tsx       조립 지점
```

계층 간 import 규칙은 `eslint.config.js` 가 강제한다 (ARCHITECTURE 3장).

## 저장 데이터

브라우저 localStorage 의 `slime-merc:save` (현재본) · `slime-merc:save:prev` (직전 성공본).
처음부터 다시 하려면 개발자 도구 콘솔에서 아래를 실행하고 새로고침한다.

```js
['slime-merc:save', 'slime-merc:save:prev'].forEach((k) => localStorage.removeItem(k));
```

토스 앱 안에서는 같은 저장을 서버에도 둔다 (`client/src/session/cloudSync.ts`). 개발 서버에서 토스 없이 시험하려면
slimora-api 를 `DEV_AUTH=true` · `CORS_ORIGINS=http://localhost:5173` 으로 띄우고(기본 포트 3000), 그 서버를 가리키도록 `client/.env.development.local` 에 아래를 넣는다 (운영 빌드에는 들어가지 않는다).

```
VITE_SAVE_API_URL=http://localhost:3000
VITE_SAVE_DEV_USER=tester
```

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-28 | 설계 문서 3종 작성, 결정 D1~D12 확정 |
| 2026-10-28 | 첫 플레이 가능 프로토타입 — 전투 엔진 · 몬스터 3종 · 스테이지 1~6 · 공격력 강화 · 배속 · 저장/복원 · 테스트 65개 |
| 2026-10-28 | 최대 HP · 치명타 강화 추가, 배속 정식 기능 확정(D13), 앱인토스 배포 준비 상태 점검 |
| 2026-10-28 | 흡수 · 특성 · 슬라임 레벨 (Phase 5A), 저장 형식 v2, UI 라이트 테마 |
| 2026-10-28 | 앱인토스 콘솔용 이미지 (로고 2종 · 썸네일 · 스크린샷 세로 4장 × 2규격 · 가로 1장)와 생성 스크립트 |
| 2026-10-29 | 진화 3형태 (Phase 5B) · 15 스테이지 · 보스 2종 (Phase 6), 저장 형식 v3, Capacitor 안드로이드 프로젝트 |
| 2026-10-29 | 안드로이드 아이콘 · 스플래시, 앱 ID `com.slimora.game` 확정, 토스 로그인 기반 서버 저장 |

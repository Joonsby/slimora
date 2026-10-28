# 슬라임 용병단 (가칭)

앱인토스에 낼 세로형 2D 방치형 RPG. 슬라임이 몬스터를 자동으로 사냥하고, 무엇을 사냥했느냐에 따라 진화한다.

| 문서 | 내용 |
|---|---|
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | 게임 규칙 · 확정된 결정 D1~D12 · 수치 초안 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 계층 구조 · 타입 · 전투 루프 · 저장 |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 단계별 계획과 진행 현황 |

## 현재 상태 — 첫 플레이 가능 프로토타입 (2026-10-28)

**자동 전투 → 처치 → 골드 → 공격력 강화 → 더 강한 스테이지** 루프를 브라우저에서 플레이할 수 있다.
흡수 · 진화는 아직 없다 (다음 단계).

## 실행

Node 20 이상이 필요하다 (개발은 Node 24 에서 했다).

```bash
cd client
npm install
npm run dev              # http://localhost:5173
npm run dev -- --host    # 같은 와이파이의 휴대폰에서 접속할 때
```

| 명령 | 하는 일 |
|---|---|
| `npm test` | 단위 테스트 (Vitest, 65개) |
| `npm run lint` | ESLint — 계층 간 의존 규칙도 여기서 검사한다 |
| `npm run typecheck` | TypeScript 검사 (앱 · 도구 두 설정) |
| `npm run build` | 타입 검사 후 `dist/` 로 빌드 |
| `npm run preview` | 빌드 결과를 띄워 본다 (http://localhost:4173) |
| `npm run sim` | 밸런스 시뮬레이터 — 화면 없이 실제 전투 엔진을 돌려 표로 출력 |

## 조작

| 위치 | 기능 |
|---|---|
| HUD 스테이지 이름 | 사냥터 선택 시트 |
| HUD `도전 ▶` | 사냥 중일 때 다음 스테이지에 도전 |
| HUD `자동 ON/OFF` | 클리어하면 다음 스테이지로 자동 진행 |
| HUD `×1/×2/×3` | 전투 배속 |
| 하단 `강화` | 공격력 강화. **길게 누르면 연속 구매** |
| 하단 `사냥터` | 클리어한 스테이지는 사냥, 바로 다음 스테이지는 도전 |
| 전투 로그 | 누르면 최근 30줄로 펼친다 |

## 이번에 구현한 것

| 항목 | 내용 |
|---|---|
| 프로젝트 | Vite 8 + React 19 + TypeScript 6 · Phaser 3.90 · Zustand 5 · Vitest 5 |
| 전투 엔진 | 순수 TS (`src/core/battle`). 행동을 예정 시각 순서로 처리해 프레임 속도와 무관하게 결과가 같다 |
| 몬스터 3종 | 박쥐(빠름 · 흡혈 20%) · 골렘(단단함 · 피해감소 30%) · 화염 드래곤(화상, 피해감소 무시) |
| 전투 규칙 | 자동 공격 · 치명타 5%(×1.5) · 처치 시 HP 10% 회복 · 사망 2초 후 재등장 또는 후퇴 |
| 스테이지 | 1~6 (계열 순환). 도전 / 사냥 / 실패 시 최고 클리어 스테이지로 후퇴 + 자동진행 OFF |
| 성장 | 골드로 공격력 강화 (레벨당 +3, 비용 `floor(10 × 1.13^레벨)`) |
| 화면 | 세로 모바일 레이아웃 (360px 까지 확인). 임시 그래픽은 도형으로 그린 텍스처 |
| 저장 | localStorage. 10초 간격 + 클리어/실패 즉시 + 화면을 떠날 때 즉시. 체크섬 + 직전 저장본 백업 |
| 테스트 | 전투 계산 · 진행 규칙 · 저장 · 세션 통합 · 밸런스 불변식 |

## 설계 대비 이번에 하지 않았거나 다르게 한 것

| 항목 | 상태 |
|---|---|
| 최대 HP · 치명타 강화 | 이번 범위가 「공격력 강화」라 데이터에서 뺐다. 코드는 강화 종류가 늘어나도 데이터만 추가하면 되게 되어 있다 |
| 스테이지 7~15 · 보스 2종 | 보스는 IMPLEMENTATION_PLAN Phase 6. 사냥터 시트에 「다음 업데이트」로 표시 |
| 흡수 · 특성 · 진화 · 슬라임 레벨 | 다음 단계. 하단 메뉴에 자리만 있다 |
| 오프라인 보상 | Phase 7. 다만 저장에 `lastActiveAt` 을 이미 기록한다 |
| **전투 배속 ×1/×2/×3** | **설계에 없던 기능.** 요청의 「전투 속도」를 배속으로 해석해 넣었다. 활성 플레이 수입이 배수로 늘어나므로 정식 기능으로 둘지는 결정이 필요하다 (GAME_DESIGN D13) |

## 설정값 조정

밸런스는 `client/src/data/*.json` 만 고치면 된다. 코드는 건드리지 않는다.

| 파일 | 내용 |
|---|---|
| `balance.json` | 슬라임 기본값 · 상한 · 전투 상수 · 스테이지 스케일링 · `configVersion` |
| `monsters.json` | 몬스터 배율 · 공격 간격 · 효과 (`lifesteal` · `damageReduction` · `burnOnHit`) |
| `stages.json` | 스테이지 이름 · 출현 몬스터 · 처치 목표 · `overrides` (공식 대신 직접 지정) |
| `upgrades.json` | 강화 종류 · 레벨당 증가량 · 비용 공식 |
| `families.json` | 계열 이름 · 색 |

수치를 바꾸면 `configVersion` 을 올리고 `npm test` 와 `npm run sim` 으로 확인한다.
설정이 잘못되면 테스트가 실패하고, 앱은 화면에 설정 오류를 띄운다.

현재 수치로 자동 플레이(살 수 있으면 즉시 강화)를 돌리면 ×1 배속에서 **약 8분**에 6 스테이지를 모두 깬다.
골렘 스테이지(2 · 5)가 벽이고, 5 스테이지가 6 스테이지보다 높은 공격력을 요구한다 — 피해감소 때문이며, 설계상 화염 진화가 이 벽을 넘는 수단이다.

## 폴더 구조

```
client/src/
├─ core/          게임 규칙 (순수 TS). React · Phaser · Zustand · Date.now · Math.random 금지
├─ data/          설정 JSON + 검증기
├─ session/       GameSession — 엔진 구동 · 커맨드 적용 · 스테이지 전환 · 저장 시점
├─ store/         Zustand 스토어 (React 가 읽는 상태)
├─ persistence/   저장소 구현 (localStorage · 메모리)
├─ platform/      시계 · 화면 가시성 (앱인토스 SDK 를 붙일 자리)
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

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-28 | 설계 문서 3종 작성, 결정 D1~D12 확정 |
| 2026-10-28 | 첫 플레이 가능 프로토타입 — 전투 엔진 · 몬스터 3종 · 스테이지 1~6 · 공격력 강화 · 배속 · 저장/복원 · 테스트 65개 |

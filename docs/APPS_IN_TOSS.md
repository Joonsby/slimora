# 앱인토스 배포 준비 상태

| 항목 | 내용 |
|---|---|
| 점검일 | 2026-10-28 |
| 기준 | 앱인토스 개발자센터 공식 문서 (`https://developers-apps-in-toss.toss.im`, 아래 `D/` 로 줄임) · SDK `@apps-in-toss/web-framework` 3.9.0 |
| 대상 | `client/` 2026-10-28 프로토타입 (SDK 미연동) |
| 관련 문서 | [ARCHITECTURE.md](ARCHITECTURE.md) 13장 · [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 9 |

## 1. 결론 — 지금은 배포할 수 없다

| 막는 것 | 성격 |
|---|---|
| SDK 를 붙이지 않아 업로드용 `.ait` 번들을 만들 수 없다 | 개발 |
| 게임 출시 체크리스트의 **사용자 식별키 발급 · 저장**을 하지 않는다 | 개발 |
| 게임은 **등급분류 증빙**을 반드시 내야 한다 | 사용자 (행정) |
| 콘솔 앱 등록 · 로고 · 썸네일이 없다 | 사용자 (행정 · 에셋) |

기술 스택(Vite · React 19 · Phaser · CSR 단독 · 서버 없음)은 걸림돌이 아니다. SSR 금지 · `eval` 금지 · iframe 금지 조건도 이미 지키고 있다.

---

## 2. 사용자가 직접 해야 하는 것

개발로 대신할 수 없는 일이다. 등급분류에 시간이 걸리므로 개발과 **병행**한다.

| 순서 | 할 일 | 근거 |
|---|---|---|
| 1 | 앱인토스 콘솔 가입 (만 19세 이상, 본인 명의 토스 앱) → 워크스페이스 생성 | D/guide/operation/console-workspace |
| 2 | 앱 등록 — 유형 **「게임」**. 이때 정하는 `appName` 은 **나중에 바꿀 수 없고**, 설정 파일 값과 다르면 업로드가 안 된다 | 같음 |
| 3 | **게임 등급분류.** 스토어 출시 이력이 없으므로 게임물관리위원회(GRAC)에 직접 신청 — 스토어명 「기타-앱인토스」, 심의 약 10~15일, 수수료 있음 | 같음 5-3 · 토스 공식 블로그 2025-11-07 (`toss.im/apps-in-toss/blog/game_rating_classification`) |
| 4 | 에셋 — 로고 600×600 PNG (각진 정사각형, 배경 필수, 라이트 · 다크 양쪽에서 보일 것) · 썸네일 1932×828 PNG · 상세 설명 · 고객문의 이메일 | D/guide/operation/console-workspace · D/design/consumer-ux-guide |
| 5 | 토스 앱 QR 테스트 **최소 1회** (안 하면 검토 요청 불가) → 검토 요청 → 출시 | D/guide/operation/console-workspace · D/guide/operation/deploy |

사업자 등록은 **출시 자체에는 필요 없다.** 토스 로그인 · 인앱 결제 · 토스페이 · 프로모션을 쓸 때 필요하다 (D/guide/operation/register-business).

---

## 3. 개발 작업

### 3-1. 반려 사유가 되는 것

| 요건 | 근거 | 지금 | 할 일 |
|---|---|---|---|
| SDK 3.x 설치 · `npx ait init` · `apps-in-toss.config.ts` (`appName` · `brand.primaryColor` · `webBundleDir: 'dist'`) · 빌드에 `ait build` | D/documentation/integration/sdk-3.x · D/documentation/sdk/v3 | 없음 | 설치 · 설정. **2.x 의 `granite.config.ts` 는 쓰지 않는다** |
| 사용자 식별키를 받아 저장해야 게임이 시작된다 — 게임 전용 `getUserKeyForGame` (서버 · 동의 불필요, 앱 재설치 · 기기 변경에도 같은 키) | D/checklist/app-game · D/documentation/common/authentication/hash-key | `installId` 만 있음 | `TossPlatform` 에서 발급 · 저장 |
| 우측 상단 닫기(X) 버튼과 **게임 버튼이 겹치면 반려**. X 위치: `right + 10`, `top + 5`(iOS) / `top + 10`(Android) | D/documentation/common/screen/safe-area | **겹친다** — HUD 첫 줄 오른쪽에 골드 · 「도전 ▶」 | HUD 우측 상단을 비운다 |
| Safe Area 침범 금지 (Dynamic Island 포함) | D/checklist/app-game | CSS `env(safe-area-inset-*)` 만 사용 | SDK `SafeArea` 값으로 교체 |
| 인게임 화면 **풀스크린, 레터박스 금지** | D/checklist/app-game · D/design/consumer-ux-guide | `.app { max-width: 480px }` — 넓은 기기에서 좌우 여백 | 폭 제한 제거 또는 배경으로 채움 |
| 배경음 · 효과음 · 햅틱 등 **필요한 사운드 기능 적용**, 사운드가 있으면 On/Off, 백그라운드 전환 시 즉시 정지 · 복귀 시 재개 | D/checklist/app-game | 무음 (`noAudio`) | 효과음 최소 세트 + On/Off 설정 권장. 무음으로 통과하는지는 문서로 판단 불가 |
| 다크 모드 미지원 — **라이트 모드 기준으로 개발 · 디자인** | D/guide/faq | 어두운 고정 테마 | 결정 필요 (4장) |
| Android 백버튼 → 뒤로가기 또는 종료 | D/checklist/app-game · D/documentation/common/screen/event (`backEvent`) | 처리 없음 | 열린 시트가 있으면 닫기 |
| 닫기 버튼 · 종료 확인 모달 | D/documentation/common/navigationbar | 없음 | SDK 가 제공 (게임은 종료 확인 모달도 자동). 게임은 `navigationBar.transparentBackground: true` 권장 |
| SDK API 를 짧은 간격으로 과도하게 호출하지 않는다 | D/checklist/app-game · D/intro/guide | 해당 없음 | 저장을 SDK `Storage` 로 옮길 때 10초 저장 주기를 재검토 |

### 3-2. 이미 충족

| 요건 | 근거 |
|---|---|
| CSR 만 사용 (SSR 금지) · 외부 코드 실행(`eval`) 없음 · 외부 도메인 iframe 없음 | D/checklist/app-game |
| 진입 즉시 바텀시트 자동 노출 없음 (시트는 버튼으로만 열림) | 같음 |
| 핀치 줌 막음 (viewport meta) | D/documentation/integration/props |
| React 19 호환 (공식 게임 샘플이 React 19) | `github.com/toss/apps-in-toss-examples` |
| 번들 100MB 이하 — 현재 `dist` 약 1.5MB | D/guide/operation/console-workspace |
| 같은 기기에서 재접속 시 진행 유지 (localStorage) | D/checklist/app-game |

### 3-3. 실기기에서만 확인할 수 있는 것

10초 안에 첫 화면 · 조작 반응 2초 이내 · 메모리 급증 없음 · 세로 고정 동작 · 백그라운드 전환 시 `visibilitychange` / `pagehide` 가 실제로 오는지 (웹 전용 이벤트 버스 `appsInTossEvent` 에는 현재 등록된 이벤트가 없다).

---

## 4. 결정이 필요한 것

| 항목 | 선택지 | 의견 |
|---|---|---|
| **테마** | ① UI(HUD · 메뉴 · 시트)를 라이트 톤으로 바꾸고 전투 화면 아트만 어둡게 ② 지금처럼 전부 어둡게 두고 심사 판단을 받는다 | ①. FAQ 가 「라이트 모드 기준」을 명시한다. 게임 아트까지 금지하는지는 문서에 없다 |
| **사운드** | ① 효과음 몇 개 + On/Off ② 무음 유지 | ①. 체크리스트 첫 묶음이 사운드다 |
| **저장소** | ① localStorage 유지 ② SDK `Storage` ③ 서버 저장 | ① 또는 ② (아래). 서버는 인앱 결제 · 랭킹을 넣을 때 |

저장소 사실관계 (D/documentation/common/file-storage/storage):

- localStorage 는 origin 단위다. 실서비스 `https://<appName>.apps.tossmini.com` 과 QR 테스트 `https://<appName>.private-apps.tossmini.com` 은 **서로 공유되지 않는다.** 출시 버전끼리는 업데이트해도 유지된다
- SDK `Storage` 는 문자열 키-값, 용량 제한 없음, **토스 앱을 지우면 함께 지워진다**
- 어느 쪽이든 **기기를 바꾸면 이어지지 않는다.** 인앱 결제를 넣으면 「기기를 바꿔도 구매 아이템 유지」가 체크리스트 항목이라 사실상 서버가 필요하다
- 지금 구조에서는 `SaveRepository` 구현 하나를 갈아끼우면 된다 (ARCHITECTURE 6 · 9장)

---

## 5. 장기 설계에 영향을 주는 사실

| 사실 | 영향 | 근거 |
|---|---|---|
| 미니앱 이용자는 **만 19세 이상** · Android 7+ · iOS 16+ | 대상 연령이 성인이다 | D/guide/faq |
| 로그인은 토스 로그인만 허용 (서버 mTLS · 사업자 등록 필요) | 게임은 식별키로 충분 — 로그인 없이 시작 | D/intro/guide · D/documentation/common/authentication/toss-login |
| 광고는 앱인토스 광고(전면 · 보상형 · 배너)만, 외부 광고 네트워크 금지. 「광고 보고 이어하기」가 공식 예시 | D13 배속이나 오프라인 보상 2배를 보상형 광고로 붙일 수 있다 | D/guide/monetization/in-app-ad |
| 디지털 상품은 인앱 결제만 (앱마켓 15% + 토스 5%) | 유료화 시 서버 필수 | D/guide/monetization/in-app-payment |
| `Environment.getServerTime` 으로 서버 시각을 받을 수 있다 | 오프라인 보상의 시계 조작 대응(GAME_DESIGN 4-11)을 서버 없이 할 수 있다 | D/documentation/sdk/domains-api/environment |
| Phaser · Canvas · WebGL 을 제한하는 조항은 없다 (Unity WebGL 공식 지원) | 엔진 교체 불필요. iOS 메모리 부족 시 흰 화면 주의 | D/guide/faq · D/guide/operation/toss |

---

## 6. 확인하지 못한 것

| 항목 | 내용 |
|---|---|
| 문서끼리 어긋남 | ① 게임 내비게이션 바 지정: 내비게이션 바 문서는 2.x 방식(`webViewProps.type: 'game'`), 3.x 에서는 `type` 이 없어졌고 공식 샘플에도 없다 — 콘솔 앱 유형으로 정해지는 것으로 보이나 명시 없음 ② 게임 식별 함수: 식별키 문서 · 공식 샘플은 `getUserKeyForGame`, v3 대응표는 `User.getAnonymousKey` — 샘플을 따른다 ③ 검토 기간: 콘솔 가이드 영업일 3~7일 / FAQ 1~2일 |
| 문서에 없음 | Vite 8 · TypeScript 6 과 SDK 도구 호환성 (공식 샘플은 Vite 6 · TS 5.7) · 토스 앱 삭제나 「미니앱 용량 삭제」 후 localStorage 유지 여부 · 토스 WebView 의 `env(safe-area-inset-*)` 값 · 무음 게임 · 어두운 테마의 심사 통과 여부 · 리더보드 등록 필수 여부 · 비사업자 개인의 GRAC 신청 가능 여부와 수수료 |
| 로그인이 필요해 못 본 것 | 콘솔 안의 실제 입력 화면 |

공식 문서는 게임의 개발부터 출시까지 약 2~4주로 안내한다.

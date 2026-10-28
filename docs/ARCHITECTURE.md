# 슬라임 용병단 (가칭) — 아키텍처

| 항목 | 내용 |
|---|---|
| 문서 상태 | 설계 초안 (2026-10-28) · 코드 미착수 |
| 범위 | 프론트엔드 로컬 MVP + 서버 · 앱인토스 연동을 위한 접점 |
| 관련 문서 | [GAME_DESIGN.md](GAME_DESIGN.md) (규칙 · 결정 D1~D12) · [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |

게임 규칙은 GAME_DESIGN 이 기준이다. 이 문서는 그 규칙을 **어떤 구조로 담는지**만 다룬다.

---

## 1. 원칙 → 구조 결정

| # | 원칙 | 구조로 어떻게 지키나 |
|---|---|---|
| 1 | 게임 규칙 ↔ UI 분리 | 규칙은 `core/` 에만 있다. React · Phaser 는 결과를 그리기만 한다 |
| 2 | 전투 계산이 Phaser 에 종속되지 않음 | 전투 엔진은 순수 TS 함수. Phaser 는 엔진이 낸 **이벤트를 구독**한다 |
| 3 | 몬스터 · 스킬 · 진화는 설정 데이터 | `data/*.json`. 코드가 아는 것은 효과 **종류** 5개뿐 (GAME_DESIGN 4-3) |
| 4 | 테스트 가능한 순수 함수 중심 | 엔진 · 진행 규칙 모두 입력 → 출력. 시간과 난수는 주입한다 |
| 5 | 밸런스를 코드 수정 없이 | 수치는 전부 JSON. 스테이지별 직접 지정(`overrides`)도 가능 |
| 6 | 저장소 교체 가능 | `SaveRepository` 인터페이스. 로컬 → 플랫폼 → 서버 순으로 갈아끼운다 |
| 7 | 모바일 · 터치 우선 | 세로 고정 레이아웃, React DOM 으로 HUD · 메뉴 (터치 영역 · 글자 렌더링이 캔버스보다 낫다) |
| 8 | 불필요한 추상화 금지 | 클래스 계층 · DI 컨테이너 · ECS 없음. 효과는 `switch`, 이벤트는 30줄짜리 직접 구현 이미터 |
| 9 | 조작 대비 서버 검증 | 진행 변경은 전부 **커맨드**로만 일어난다 → 나중에 같은 커맨드를 서버가 검증 (10장) |
| 10 | 외부 라이브러리 최소화 | 런타임 의존성은 React · Phaser · Zustand 뿐. 설정 검증 · 난수 · 이미터는 직접 작성 |

---

## 2. 구조 개요

```
┌──────────────────────────── 브라우저 (앱인토스 WebView) ────────────────────────────┐
│                                                                                    │
│   ui/ (React)                     game/ (Phaser)                                   │
│   HUD · 메뉴 · 시트 · 모달           BattleScene · 슬라임/몬스터 뷰 · 이펙트              │
│      │ 읽기: store 구독               │ update(delta) 마다 session.tick()             │
│      │ 쓰기: session.dispatch()       │ 이벤트 구독 → 애니메이션                       │
│      ▼                               ▼                                             │
│   store/ (Zustand)  ◀── 갱신 ──  session/ (GameSession)  ── 저장 ──▶ persistence/     │
│   진행 상태 · UI 상태              엔진 · 진행 · 스테이지 흐름 · 저장 조정     (localStorage)│
│                                      │                               platform/     │
│                                      ▼                               (시계·가시성)   │
│                                   core/  ◀── data/ (JSON 설정)                      │
│                                   전투 엔진 · 진행 규칙 · 능력치 계산 · 오프라인 계산        │
└────────────────────────────────────────────────────────────────────────────────────┘
```

| 계층 | 하는 일 | 하지 않는 일 |
|---|---|---|
| `core/` | 전투 시뮬레이션, 강화 · 흡수 · 진화 규칙, 능력치 계산, 오프라인 보상 계산 | 렌더링, 저장, 현재 시각 읽기, `Math.random` |
| `data/` | 밸런스 · 콘텐츠 JSON, 설정 검증기 | 로직 |
| `session/` | 엔진 구동, 커맨드 적용, 스테이지 흐름, 저장 시점, 오프라인 보상 발동 | 규칙 판단 (core 에 위임) |
| `store/` | React 가 읽는 상태 보관 | 규칙 |
| `game/` | 전투 장면 그리기 | 수치 계산 |
| `ui/` | 화면 · 입력 | 수치 계산 (core 의 선택자 호출) |
| `persistence/` | 저장 데이터 직렬화 · 마이그레이션 · 저장소 구현 | 규칙 |
| `platform/` | 시계 · 화면 가시성 · (나중에) 앱인토스 SDK | 규칙 |

---

## 3. 의존 규칙

```
ui ──────┐
game ────┼──▶ session ──▶ core ◀── data
store ◀──┘       │
                 ├──▶ persistence ──▶ core (타입만)
                 └──▶ platform
main.tsx = 조립 지점 (모든 것을 생성해 연결)
```

- **`core/` 는 아무것도 import 하지 않는다** — React · Phaser · Zustand · 다른 `src/` 폴더 모두 금지
- `core/` 에서 `Date.now()` · `Math.random()` 금지. 시각은 인자로, 난수는 시드 RNG 로
- `game/` 과 `ui/` 는 서로 import 하지 않는다. 둘 다 `session` · `store` 를 통해서만 만난다
- 강제 방법: ESLint `no-restricted-imports` (폴더별 override) + `no-restricted-properties` (`Math.random`, `Date.now`). 설정 파일 하나로 끝나는 수준이라 별도 도구는 쓰지 않는다

---

## 4. 폴더 구조

```
slime-mercenaries/
├─ docs/                          # 설계 문서 (이 문서)
├─ README.md                      # 실행 방법 · 현재 상태 · 변경 이력
├─ client/                        # Vite + React + TS (2026-10-28 프로토타입)
│  ├─ index.html  package.json  vite.config.ts  tsconfig*.json
│  ├─ eslint.config.js            # 의존 규칙 강제
│  ├─ src/
│  │  ├─ main.tsx                 # 조립 지점: config · store · repo · platform → session → <App/>
│  │  ├─ core/                    # ★ 순수 게임 규칙
│  │  │  ├─ model/                # 타입: ids · effects · config · progress · battle · commands
│  │  │  ├─ battle/               # engine (step · phase 전이) · damage (피해 · 흡혈 · 화상 계산)
│  │  │  ├─ progression/          # applyCommand (강화 · 흡수 · 스테이지 진행/후퇴) · absorption (레벨 · 특성) · upgrades · initial
│  │  │  ├─ stats.ts              # deriveSlimeStats · deriveMonsterStats (효과 합산 · 상한)
│  │  │  ├─ lookup.ts             # 설정 조회
│  │  │  ├─ rng.ts                # mulberry32 시드 난수
│  │  │  └─ result.ts             # Result<T, E>
│  │  ├─ data/                    # ★ 설정 데이터
│  │  │  ├─ balance.json  families.json  monsters.json  stages.json  upgrades.json  traits.json
│  │  │  ├─ index.ts              # JSON 을 GameConfig 하나로 묶음
│  │  │  └─ validate.ts           # 참조 무결성 · 범위 검사 (테스트 · 앱 시작 시 실행)
│  │  ├─ session/
│  │  │  ├─ GameSession.ts        # 엔진 구동 · 커맨드 적용 · 전투 교체 · 저장 시점
│  │  │  ├─ saveData.ts           # SaveDataV1 · 마이그레이션 · 정규화
│  │  │  ├─ settings.ts           # 배속 등 사용자 설정
│  │  │  └─ ports.ts              # SaveRepository · PlatformAdapter 인터페이스
│  │  ├─ store/gameStore.ts       # zustand/vanilla 스토어
│  │  ├─ persistence/             # LocalStorageSaveRepository (체크섬 · 백업 칸) · MemorySaveRepository · checksum
│  │  ├─ platform/WebPlatform.ts  # Date.now · visibilitychange. SDK 단계에서 TossPlatform 추가
│  │  ├─ game/                    # Phaser: createGame · BattleScene · textures (임시 도형) · DamageTextPool · slimeColor (흡수 색)
│  │  ├─ ui/                      # React: App · Hud · BattleView · BattleLog · BottomMenu · 시트 · battleLogFeed
│  │  ├─ dev/autoPlay.ts          # 자동 플레이어 (밸런스 점검 · 불변식 테스트)
│  │  └─ testing/fixtures.ts      # 테스트 픽스처
│  └─ tools/balance-sim.ts        # 헤드리스 밸런스 시뮬레이터 (npm run sim)
└─ server/                        # 백엔드 단계에서 생성 (Spring Boot)
```

다음 단계에서 생길 것: `core/progression` 의 진화, `core/idle` (오프라인 계산), `data/forms.json`,
`dev/` 개발 패널, `test-vectors/` (Java 와 공유할 규칙 사례).

- 테스트는 대상 옆에 `*.test.ts` 로 둔다
- 설정을 JSON 으로 둔 이유: 비개발자도 고칠 수 있고, 나중에 서버에서 내려받는 원격 설정으로 바꾸기 쉽다. 대신 타입 검사가 약하므로 `validate.ts` 를 테스트에서 돌려 보완한다

---

## 5. 핵심 타입

MVP 전체를 기준으로 한 설계다. **현재 코드는 이 중 프로토타입 범위만 구현했다** — 실제 정의는 `client/src/core/model/` 이 기준이다.
프로토타입에서 다르게 정한 점: 커맨드는 `challengeFailed` · `recordDeath` 로 스테이지 후퇴와 사망 통계를 나눴고(스테이지 흐름이 `applyCommand` 안에 있다),
보스 효과(`heavyAttack` · `enrage`)와 형태 · 특성은 아직 없다.

### 5-1. 식별자 · 효과

```ts
// core/model/ids.ts
export type FamilyId = string;   // 'bat' | 'golem' | 'fire' — 데이터가 정의, 검증기가 참조 확인
export type MonsterId = string;
export type FormId = string;     // 'base' | 'vampire' | 'iron' | 'flame'
export type StageId = number;    // 1..15
export type UpgradeId = 'attack' | 'maxHp' | 'critChance';  // 코드가 아는 능력치라 유니온

// core/model/effects.ts — 코드가 아는 효과 종류는 이 5개뿐
export type EffectSpec =
  | { kind: 'lifesteal'; ratio: number }
  | { kind: 'damageReduction'; ratio: number }
  | { kind: 'burnOnHit'; chance: number; dpsRatio: number; durationMs: number; maxStacks: number }
  | { kind: 'heavyAttack'; every: number; multiplier: number }
  | { kind: 'enrage'; hpBelowRatio: number; attackIntervalMul: number };
```

계열 · 형태 ID 를 유니온이 아닌 `string` 으로 둔 이유: 계열을 하나 더 늘릴 때 데이터와 시각 프리셋만 추가하면 되게 하려고. 오타는 `validate.ts` 가 잡는다.

### 5-2. 설정 (`GameConfig`)

```ts
// core/model/config.ts
export interface GameConfig {
  configVersion: string;            // 밸런스 버전. 저장 데이터에 함께 기록 (서버 검증 기준)
  balance: BalanceConfig;
  families: FamilyDef[];
  monsters: MonsterDef[];
  stages: StageDef[];
  forms: FormDef[];
  traits: TraitDef[];
  upgrades: UpgradeDef[];
}

export interface BalanceConfig {
  slimeBase: { maxHp: number; attack: number; attackIntervalMs: number; critChance: number; critMultiplier: number };
  caps: { damageReduction: number; lifesteal: number; critChance: number };
  level: { divisor: number; statBonusPerLevel: number };          // level = 1 + floor(sqrt(total / divisor))
  battle: { spawnDelayMs: number; regenOnKillRatio: number; deathDelayMs: number; burnTickMs: number };
  stageScaling: { hpBase: number; atkBase: number; powerGrowth: number; goldBase: number; goldGrowth: number; absorbStep: number };
  formSwitch: { base: number; growthPerStage: number };           // 전환 비용
  offline: { minAwayMs: number; maxMs: number; efficiency: number; sampleMs: number };
}

export interface FamilyDef { id: FamilyId; name: string; color: string }   // color: 기본 슬라임 물들기

export interface MonsterDef {
  id: MonsterId;
  family: FamilyId;
  name: string;
  hpMul: number; atkMul: number; attackIntervalMs: number;
  goldMul: number; absorbMul: number;
  effects: EffectSpec[];
  boss?: { timeLimitMs: number };
  visual: { preset: string; tint: string; scale: number };        // preset 은 game/visuals 에 있는 키
}

export interface StageDef {
  id: StageId;
  chapter: number;
  name: string;
  spawns: { monster: MonsterId; weight: number }[];
  killsToClear: number;
  boss?: MonsterId;                                                // 처치 목표를 채우면 등장
  overrides?: Partial<{ hp: number; atk: number; goldPerKill: number; absorbPerKill: number }>;
}

export type Requirement =
  | { type: 'absorb'; family: FamilyId; amount: number }
  | { type: 'stageCleared'; stage: StageId };

export interface FormDef {
  id: FormId;
  name: string;
  family: FamilyId | null;                                         // base 는 null
  requirements: Requirement[];
  statMods: { hpMul: number; atkMul: number };
  levels: { minAbsorb: number; effects: EffectSpec[] }[];          // 숙련 Lv1..5
  visual: { preset: string; tint: string };
}

export interface TraitDef { family: FamilyId; tiers: { minAbsorb: number; effects: EffectSpec[] }[] }

export interface UpgradeDef {
  id: UpgradeId;
  perLevel: number;                                                // attack +3 · maxHp +25 · critChance +0.005
  maxLevel: number | null;
  cost: { base: number; growth: number };                          // floor(base × growth^lv)
}
```

### 5-3. 진행 상태 (`ProgressState`) — 저장 대상

```ts
// core/model/progress.ts
export interface ProgressState {
  gold: number;
  slime: SlimeProgress;          // 슬라임에 딸린 것은 여기에 모은다 → 다수화(용병단) 시 배열로 마이그레이션
  stage: StageProgress;
  lifetime: LifetimeStats;
}

export interface SlimeProgress {
  upgrades: Record<UpgradeId, number>;     // 레벨
  absorption: Record<FamilyId, number>;    // 누적치. 절대 줄지 않는다 (D2)
  currentForm: FormId;                     // 'base' 로 시작
  unlockedForms: FormId[];                 // 한 번이라도 진화한 형태
}

export interface StageProgress {
  highestCleared: number;                  // 0 = 없음
  current: StageId;
  mode: BattleMode;                        // 'challenge' | 'farm'
  autoAdvance: boolean;
}

export interface LifetimeStats {           // 통계 · 서버 검증 보조 · 플레이테스트 지표
  kills: Record<FamilyId, number>;
  goldEarned: number;
  deaths: number;
  evolutions: number;
  huntingSwitches: number;
}
```

**저장하지 않는 계산값**: 슬라임 레벨 · 특성 단계 · 형태 숙련 · 형태 상태(LOCKED/AVAILABLE). 전부 `absorption` 과 `highestCleared` 에서 매번 계산한다. 저장해 두면 둘이 어긋나는 버그가 생긴다.

### 5-4. 전투

```ts
// core/model/battle.ts
export interface CombatStats {                 // 효과를 합산 · 상한 적용한 '평탄한' 수치. 엔진은 이것만 본다
  maxHp: number;
  attack: number;
  attackIntervalMs: number;
  critChance: number;
  critMultiplier: number;
  lifesteal: number;
  damageReduction: number;
  burn: { chance: number; dpsRatio: number; durationMs: number; maxStacks: number } | null;
  heavyAttack: { every: number; multiplier: number } | null;
  enrage: { hpBelowRatio: number; attackIntervalMul: number } | null;
}

export type Side = 'slime' | 'monster';
export type BattleMode = 'challenge' | 'farm';
export type BattlePhase = 'spawning' | 'fighting' | 'slimeDown' | 'cleared' | 'failed';

export interface BurnState { stacks: number; dpsPerStack: number; endsAt: number; nextTickAt: number }

export interface UnitState {
  stats: CombatStats;
  hp: number;
  nextAttackAt: number;          // 엔진 시각 (ms)
  attackCount: number;
  burn: BurnState | null;
  enraged: boolean;
}

export interface MonsterState extends UnitState { defId: MonsterId; family: FamilyId; seq: number; isBoss: boolean }

export interface BattleState {
  now: number;                   // 엔진 시각 (ms). 실제 시각과 무관
  stageId: StageId;
  mode: BattleMode;
  phase: BattlePhase;
  phaseUntil: number;            // spawning · slimeDown 이 끝나는 시각
  kills: number;                 // 이번 진입 후 처치 수
  slime: UnitState;
  monster: MonsterState | null;
  bossDeadline: number | null;
  rng: RngState;
  seq: number;                   // 몬스터 일련번호
}

export type BattleEvent =
  | { type: 'monsterSpawned'; at: number; defId: MonsterId; seq: number; maxHp: number; isBoss: boolean }
  | { type: 'attack'; at: number; by: Side; heavy: boolean }
  | { type: 'heavyWindup'; at: number }
  | { type: 'damage'; at: number; to: Side; amount: number; crit: boolean; source: 'hit' | 'burn'; reducedBy: number }
  | { type: 'heal'; at: number; to: Side; amount: number; source: 'lifesteal' | 'regen' }
  | { type: 'burnApplied'; at: number; to: Side; stacks: number }
  | { type: 'enraged'; at: number }
  | { type: 'monsterKilled'; at: number; defId: MonsterId; family: FamilyId; gold: number; absorb: number }
  | { type: 'slimeDied'; at: number }
  | { type: 'respawned'; at: number }
  | { type: 'stageCleared'; at: number; stageId: StageId }
  | { type: 'bossTimeout'; at: number };

// core/battle/engine.ts
export interface BattleInit { stageId: StageId; mode: BattleMode; slime: CombatStats; seed: number }
export function createBattle(init: BattleInit, cfg: GameConfig): BattleState;
export function stepBattle(state: BattleState, dtMs: number, cfg: GameConfig): BattleEvent[];  // state 를 제자리 갱신
export function applySlimeStats(state: BattleState, stats: CombatStats): void;                   // HP 비율 유지
export function continueAsFarm(state: BattleState): void;                                         // 클리어 후 이어서 파밍

// core/rng.ts
export interface RngState { s: number }                      // mulberry32 상태 (32bit)
export function nextFloat(rng: RngState): number;            // [0, 1), rng.s 갱신
export function seedFrom(...parts: number[]): number;
```

**전투 상태는 제자리 갱신(mutation)** 한다. 엔진만 소유하는 객체이고 프레임마다 복사할 이유가 없다.
테스트는 「같은 입력 → 같은 이벤트 목록」 비교로 충분하다. 반면 진행 상태(`ProgressState`)는 Zustand 와 맞추기 위해 **불변**으로 다룬다.

### 5-5. 커맨드 · 결과 · 선택자

```ts
// core/model/commands.ts — 진행 상태는 오직 이 커맨드로만 바뀐다
export type GameCommand =
  | { type: 'grantBattleReward'; gold: number; absorb: Partial<Record<FamilyId, number>>; kills: Partial<Record<FamilyId, number>> }
  | { type: 'purchaseUpgrade'; upgrade: UpgradeId }
  | { type: 'evolve'; form: FormId }
  | { type: 'stageCleared'; stage: StageId }
  | { type: 'enterStage'; stage: StageId; mode: BattleMode }
  | { type: 'setAutoAdvance'; on: boolean }
  | { type: 'recordDeath' }
  | { type: 'claimOffline'; reward: OfflineReward };

export interface CommandContext { now: number; inBossFight: boolean }

export type RuleError =
  | { code: 'NOT_ENOUGH_GOLD'; need: number; have: number }
  | { code: 'MAX_LEVEL' }
  | { code: 'FORM_LOCKED'; missing: Requirement[] }
  | { code: 'ALREADY_CURRENT' }
  | { code: 'STAGE_LOCKED' }
  | { code: 'BUSY_IN_BOSS' };

// core/result.ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// core/progression/applyCommand.ts
export function applyCommand(s: ProgressState, c: GameCommand, cfg: GameConfig, ctx: CommandContext): Result<ProgressState, RuleError>;

// 선택자 — UI 와 session 이 부른다. 전부 순수 함수
export function deriveSlimeStats(slime: SlimeProgress, cfg: GameConfig): CombatStats;
export function deriveMonsterStats(monster: MonsterId, stage: StageId, cfg: GameConfig): CombatStats;
export function getSlimeLevel(slime: SlimeProgress, cfg: GameConfig): number;
export function getUpgradeCost(id: UpgradeId, level: number, cfg: GameConfig): number;
export function getFormStatuses(p: ProgressState, cfg: GameConfig): FormStatus[];
export function previewForm(p: ProgressState, form: FormId, cfg: GameConfig): { before: CombatStats; after: CombatStats };

export interface FormStatus {
  form: FormId;
  state: 'locked' | 'available' | 'unlocked' | 'current';
  requirements: { req: Requirement; met: boolean; current: number }[];
  costGold: number;              // 첫 진화는 0
  mastery: number;               // 숙련 0..5
}

// core/idle
export interface IdleRate { goldPerSec: number; absorbPerSec: Record<FamilyId, number>; killsPerSec: number; deathsPerHour: number }
export interface OfflineReward { awayMs: number; creditedMs: number; gold: number; absorb: Record<FamilyId, number>; stage: StageId }
export function estimateIdleRate(p: ProgressState, stage: StageId, cfg: GameConfig, seed: number): IdleRate;
export function computeOfflineReward(p: ProgressState, awayMs: number, cfg: GameConfig, seed: number): OfflineReward | null;
```

### 5-6. 세션 · 포트

```ts
// session/ports.ts
export interface SaveRepository {
  load(): Promise<LoadResult>;
  save(envelope: SaveEnvelope): Promise<void>;
  clear(): Promise<void>;
}
export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; envelope: SaveEnvelope; fromBackup: boolean }
  | { status: 'corrupt'; raw: string };

export interface PlatformAdapter {
  now(): number;                                                   // 시각 출처. 서버 단계에서 서버 시각 보정
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
  vibrate?(kind: 'light' | 'success'): void;
}

// session/GameSession.ts
export class GameSession {
  constructor(deps: { config: GameConfig; store: GameStore; repo: SaveRepository; platform: PlatformAdapter });
  start(): Promise<void>;                                          // 로드 → 마이그레이션 → 오프라인 보상 계산 → 전투 시작
  tick(deltaMs: number): void;                                     // Phaser update 에서 호출
  dispatch(cmd: GameCommand): Result<ProgressState, RuleError>;    // UI 의 유일한 쓰기 경로
  onBattleEvents(listener: (events: BattleEvent[]) => void): () => void;
  battleView(): Readonly<BattleState>;                             // Phaser 가 HP 바 등을 그릴 때 읽기 전용으로
  challengeNext(): void;
  selectHuntingStage(stage: StageId): void;
  pauseFor(ms: number): void;                                      // 진화 연출 동안 전투 정지
}
```

---

## 6. 전투 루프

### 6-1. 시간 모델

- 엔진은 **예정 시각 순서**로 행동을 처리한다. 프레임마다 「무엇이 일어날 차례인가」를 보고 그 시각으로 시계를 옮긴다
- 그래서 `step(200ms)` 와 `step(100ms) + step(100ms)` 의 결과가 **같다** (분할 불변). 프레임 속도가 흔들려도 결과가 같고, 오프라인 계산은 큰 dt 로 빠르게 돌린다
- 한 프레임의 dt 는 최대 250ms 로 자른다. 그보다 긴 공백(백그라운드 전환 등)은 전투로 따라잡지 않고 **오프라인 보상 경로**로 처리한다

### 6-2. step 알고리즘

```
stepBattle(state, dt):
  until = state.now + dt
  events = []
  loop:
    (t, action) = 다음 예정 행동 중 가장 이른 것      ← 아래 표
    if 없음 or t > until: break
    state.now = t
    action 실행 → state 갱신, events 에 추가
    사망 · 클리어 · 시간초과 판정 → phase 전이
  state.now = until
  return events
```

| phase | 예정 행동 후보 (같은 시각이면 이 순서) |
|---|---|
| `spawning` | 등장 완료 (`phaseUntil`) |
| `fighting` | 화상 틱 (슬라임 · 몬스터) → 슬라임 공격 → 몬스터 공격 → 보스 시간초과 |
| `slimeDown` | 부활 (`phaseUntil`) |
| `cleared` · `failed` | 없음 — 종료 상태. 다음은 session 이 정한다 |

### 6-3. phase 전이

```
               등장 대기 경과
   spawning ─────────────────▶ fighting
      ▲                          │
      │                          ├─ 몬스터 HP ≤ 0 ─▶ 처치 처리 (보상 이벤트 · 처치 회복)
      │                          │     ├─ 파밍이거나 목표 미달 ─────────────▶ spawning
      │                          │     ├─ 도전 · 목표 달성 · 보스 스테이지 ──▶ spawning (보스)
      │                          │     └─ 도전 · 목표 달성 (또는 보스 처치) ─▶ cleared
      │                          ├─ 슬라임 HP ≤ 0 ─▶ 도전: failed / 파밍: slimeDown
      │                          └─ 보스 deadline ──▶ failed
      └──── 부활 대기 경과 ──── slimeDown
```

### 6-4. 한 프레임의 흐름

```
Phaser BattleScene.update(time, delta)
  └─ session.tick(delta)
       ├─ events = stepBattle(battle, min(delta, 250))
       ├─ monsterKilled  → dispatch(grantBattleReward)  → store 갱신 → React HUD
       ├─ stageCleared / challengeFailed → applyCommand 가 다음 스테이지 · 모드 결정 (GAME_DESIGN 4-10) → 전투 교체
       ├─ 형태 상태가 바뀌었으면 (AVAILABLE 새로 생김) → store.ui 에 알림
       └─ listeners(events)
            ├─ BattleScene : 공격 모션 · 피해 숫자 · 화상 표시 · 사망 연출
            └─ battleLog   : 문장으로 바꿔 store.log 에 (250ms 묶음)
```

- Phaser 는 **아무것도 계산하지 않는다.** HP 바는 `session.battleView()` 를 읽어 매 프레임 보간해서 그린다
- 형태별 시각 차이는 이벤트의 `source`(`lifesteal` · `burn`)와 `formPresets` 로 표현한다

### 6-5. 결정성

- 같은 `(설정, 초기 상태, 시드, dt 열)` → 같은 이벤트. 테스트로 보장한다
- 전투 시드 = `seedFrom(세션 시드, 스테이지, 진입 횟수)`. 세션 시드는 앱 시작 시 한 번 만든다 (이건 `platform` 쪽)
- 오프라인 계산 시드 = `seedFrom(lastActiveAt)` — 같은 저장 데이터면 같은 보상이 나온다. 서버가 같은 계산을 다시 돌려 검증할 수 있다

### 6-6. 헤드리스 재사용

같은 `stepBattle` 이 화면 없이 세 곳에서 쓰인다.

| 용도 | 방법 |
|---|---|
| 오프라인 보상 | 사냥터에서 120초를 돌려 초당 골드 · 흡수량 산출 |
| 밸런스 시뮬레이터 | `tools/balance-sim.ts` — 스테이지 × 형태 × 강화 수준 조합을 돌려 CSV (클리어 시간 · 사망률 · 보스 남은 시간) |
| 테스트 | 규칙 단위 테스트 · 밸런스 불변식 |

---

## 7. 흡수 · 진화 구현

GAME_DESIGN 4-7 · 4-8 의 규칙을 코드로 옮기는 방식이다.

**저장하는 것은 두 개뿐**: `currentForm`, `unlockedForms`. 나머지 상태는 계산한다.

```
formState(form):
  if form == currentForm                       → 'current'
  if form ∈ unlockedForms                      → 'unlocked'
  if 모든 requirements 충족                     → 'available'
  else                                         → 'locked'
```

**`evolve` 커맨드 검사 순서**

```
evolve(form):
  ctx.inBossFight                → BUSY_IN_BOSS
  form == currentForm            → ALREADY_CURRENT
  formState(form) == 'locked'    → FORM_LOCKED(미충족 요건)
  cost = form ∈ unlockedForms ? switchCost(highestCleared) : 0
  gold < cost                    → NOT_ENOUGH_GOLD
  ok → gold −= cost, currentForm = form, unlockedForms ∪= {form}, lifetime.evolutions += 1
```

**진화 후 반영 (session)**: `deriveSlimeStats` → `applySlimeStats(battle, stats)` (HP 비율 유지) → `pauseFor(2000)` 동안 진화 연출.

**능력치 계산 순서** (`deriveSlimeStats`)

```
1. 기본값 (balance.slimeBase)
2. 레벨 보너스         × (1 + level × statBonusPerLevel)
3. 강화                + upgrades × perLevel
4. 형태 기본 보정       × statMods
5. 효과 수집            특성 단계 효과 (3계열) + 현재 형태의 숙련 단계 효과
6. 효과 합산 · 상한     GAME_DESIGN 4-3 합산 규칙
→ CombatStats
```

**불변식** (테스트로 고정)

- `absorption` 의 어떤 값도 커맨드 적용 후 줄지 않는다
- `available` 은 다음 커맨드 이후에도 `locked` 로 돌아가지 않는다
- `currentForm ∈ unlockedForms ∪ {'base'}`

---

## 8. 상태 관리 (Zustand)

| 데이터 | 위치 | 갱신 빈도 | 이유 |
|---|---|---|---|
| `ProgressState` | store | 처치마다 (~1Hz) | React 화면이 읽고, 저장 대상 |
| `BattleState` | session (엔진) | 매 프레임 | 렌더링 빈도의 데이터. store 에 넣으면 React 가 초당 60번 다시 그린다 |
| HUD 요약 (스테이지 · 모드 · 보스 남은 초) | store | 상태 변화 시 + 보스 타이머 1Hz | |
| 전투 로그 (최근 30) | store | 최대 4Hz 묶음 | |
| UI 상태 (열린 시트 · 모달 · 진화 알림) | store | 사용자 입력 | |

- `zustand/vanilla` 로 스토어를 만들어 session(React 밖)에서도 쓰고, React 에서는 훅으로 구독한다
- 컴포넌트는 **필요한 조각만** 구독한다: `useGame(s => s.progress.gold)`
- React 컴포넌트는 store 를 직접 고치지 않는다. 쓰기는 `session.dispatch(cmd)` 하나뿐

---

## 9. 저장

### 9-1. 저장하는 것 · 하지 않는 것

| 저장 | 저장 안 함 |
|---|---|
| `ProgressState` 전체 · `lastActiveAt` · 설정(소리 등) · `installId` | 전투 상태 (불러오면 현재 스테이지를 처음부터) · 계산값 (레벨 · 숙련 · 형태 상태) · 전투 로그 |

### 9-2. 형식

```ts
// session/ports.ts — 저장소와 주고받는 단위
export interface SaveEnvelope {
  schemaVersion: number;          // 저장 형식 버전 (마이그레이션 기준)
  configVersion: string;          // 저장 당시 밸런스 버전
  savedAt: number;
  data: unknown;                  // 버전마다 모양이 달라 읽는 쪽(saveData.ts)이 마이그레이션 · 정규화
}
// 체크섬은 저장소 구현의 몫이다. LocalStorage 에는 { checksum: FNV-1a(JSON(envelope)), envelope } 로 들어간다

// session/saveData.ts — 현재 SCHEMA_VERSION 2 (v1 → v2: slime.absorption 추가)
export interface SaveData {
  installId: string;              // crypto.randomUUID(). 나중에 서버 계정과 연결
  createdAt: number;
  lastActiveAt: number;           // 오프라인 보상 기준
  progress: ProgressState;
  settings: GameSettings;         // 프로토타입: { battleSpeed }. 소리 · 진동 등은 생길 때 추가
}
```

### 9-3. 저장 시점

| 언제 | 방식 |
|---|---|
| 진행이 바뀌면 | 더티 표시 → **최대 10초 간격**으로 저장 (처치가 계속되므로 디바운스가 아니라 스로틀) |
| 진화 · 스테이지 클리어 · 오프라인 보상 수령 | 즉시 |
| 화면이 가려질 때 (`visibilitychange` hidden · `pagehide`) | 즉시 + `lastActiveAt` 갱신 |

### 9-4. 불러오기

```
load()
 ├─ empty   → 새 게임
 ├─ ok      → checksum 확인 → schemaVersion 이 낮으면 단계별 migrate → 검증
 │            → 오프라인 보상 계산 (lastActiveAt) → 전투 시작
 └─ corrupt → 백업 슬롯으로 재시도 → 그것도 실패하면 손상본을 별도 키에 보관하고 새 게임
```

- localStorage 키: `slime-merc:save` (현재) · `slime-merc:save:prev` (직전 성공본). 새 저장이 성공해야 이전 것을 `prev` 로 넘긴다
- 마이그레이션: `migrations/v1-to-v2.ts` 처럼 한 단계씩. **예전 버전의 저장 샘플 JSON 을 테스트 픽스처로 영구 보관**한다

### 9-5. 시간

- `lastActiveAt` 은 `platform.now()` 로 기록한다
- 복귀 시 `away = now − lastActiveAt`. **음수면 0** 으로 보고 `lastActiveAt` 을 현재로 맞춘다 (시계를 되돌린 경우)
- 앞으로 돌리는 조작은 8시간 상한이 피해를 제한한다. 근본 해결은 서버 시각 (10장)

---

## 10. 서버 확장 대비

### 10-1. 단계별 신뢰 모델

| 단계 | 저장 | 신뢰 | 언제 |
|---|---|---|---|
| 1. 로컬 (지금) | localStorage | 클라이언트 전부 신뢰 | MVP 검증 |
| 2. 클라우드 저장 | 서버에 스냅샷 | 클라이언트 신뢰 + 상한 검사 | **공개 출시 전 필수** (GAME_DESIGN R10) |
| 3. 서버 권위 | 서버가 커맨드 검증 후 반영 | 서버만 신뢰 | 포인트 보상 · 랭킹 등 실제 가치가 생길 때 |

### 10-2. 지금 해두는 것

- **진행 변경은 전부 커맨드** — 3단계에서는 같은 커맨드를 서버로 보내면 된다. 처치 보상은 저장 주기 단위로 묶어서 보낸다
- **`configVersion` 을 저장에 기록** — 서버가 어떤 밸런스 기준으로 검증할지 안다
- **오프라인 보상이 결정적** — 서버가 같은 시드로 다시 계산해 비교할 수 있다
- **`lifetime` 통계** — 「처치 수 대비 골드」 같은 타당성 검사의 재료

### 10-3. 검증 방식

| 항목 | 2단계 (상한 검사) | 3단계 (서버 권위) |
|---|---|---|
| 골드 획득 | 경과시간 × 스테이지 이론 최대 골드/초 × 여유율 이하인가 | 서버가 보상 계산 |
| 오프라인 시간 | 서버 시각 기준으로 재계산 | 동일 |
| 강화 · 진화 | 같은 규칙으로 서버 재실행 | 동일 |
| 스테이지 클리어 | 능력치 대비 타당한가 (시뮬레이터) | 동일 |

규칙을 Java 로 한 번 더 구현하게 되면 두 구현이 어긋날 위험이 있다. 그래서 `test-vectors/*.json` 에
「상태 + 커맨드 → 기대 상태」 사례를 쌓아 두고, 지금은 Vitest, 나중엔 JUnit 이 **같은 파일**로 검사한다.

### 10-4. 서버 테이블 초안 (MySQL 8 · Flyway)

```
player          (id PK, toss_user_key UNIQUE, created_at)
player_save     (player_id PK, schema_version, config_version, data JSON, revision, updated_at)
progress_event  (id PK, player_id, type, payload JSON, client_at, server_at)    -- 감사 로그 · 검증
```

`revision` 으로 낙관적 잠금 — 두 기기에서 동시에 저장하면 뒤에 온 쪽이 충돌을 받는다.

---

## 11. 성능 (모바일 WebView)

**목표**

| 항목 | 목표 |
|---|---|
| 프레임 | 60fps 목표, 중급 안드로이드 WebView 에서 최소 30fps |
| 메모리 | 15분 플레이 동안 JS 힙이 계속 늘지 않음 |
| 전투 step | 프레임당 1ms 미만 |
| 오프라인 계산 | 50ms 미만 (120초 시뮬레이션) |
| 첫 화면 | 4G 에서 3초 이내 — Phaser 가 번들 대부분이라 Phase 1 에서 크기를 재고 판단 |

**방법**

- Phaser: 피해 숫자 · 입자 **객체 풀링**, 텍스처 아틀라스, 동시 입자 수 상한, `update` 안에서 객체 생성 금지
- 캔버스 크기는 전투 영역만. DPR 은 최대 2 로 제한 (고해상도 대응 방식은 Phase 3 실기기에서 확정)
- 화면이 가려지면 Phaser 루프 정지 · 저장. 복귀 시 오프라인 경로
- React: 조각 구독, 전투 로그 묶음 갱신, HUD 는 값이 바뀔 때만
- 저사양 대비 30fps 제한 옵션을 설정에 둔다

---

## 12. 테스트 전략

| 층 | 도구 | 무엇을 |
|---|---|---|
| 규칙 단위 | Vitest | 피해 공식 · 치명타(시드) · 흡혈 · 피해감소 상한 · 화상 중첩/갱신/감소무시 · 강타 · 격노 · 처치 회복 · 사망 · 클리어 · 보스 시간초과 |
| 엔진 성질 | Vitest | **결정성** (같은 시드 → 같은 이벤트) · **분할 불변** (dt 를 어떻게 쪼개도 같음) · HP 는 0 ~ 최대 HP · 피해는 1 이상 |
| 진행 규칙 | Vitest | 골드 부족 · 최대 레벨 · 진화 검사 순서 · 전환 비용 · 흡수 비감소 · 형태 상태 단방향 |
| 설정 검증 | Vitest | `validate.ts` — 참조(몬스터 · 계열 · 형태 · 스테이지) 존재, 비율 0~1, 스테이지 1..15 연속, 보스 스테이지에 제한시간, 비용 증가 |
| 밸런스 불변식 | Vitest + 시뮬레이터 | 기본 슬라임이 1 스테이지를 깬다 · 기대 강화 수준에서 모든 형태가 보스를 깬다 · 상성 표(GAME_DESIGN 4-6)의 ◎ 가 △ 보다 빠르다 · 형태 간 동일 투자 시 격차 X% 이내 |
| 저장 | Vitest | 마이그레이션 픽스처 · 손상 → 백업 복구 · 시계 역행 → 0 |
| 실기기 | 수동 체크리스트 | 안드로이드 · iOS WebView 에서 fps · 메모리 · 백그라운드 복귀 · 앱 강제 종료 후 저장 유지 |

Phaser · React 화면은 자동 테스트하지 않는다. 계산이 없으니 깨질 것이 적고, 실기기 확인이 더 정확하다.

---

## 13. 앱인토스 연동 지점

SDK 는 **공식 문서를 확인한 뒤 별도 단계**에서 붙인다. 지금은 붙일 자리만 정해 둔다.
**2026-10-28 공식 문서 점검 결과는 [APPS_IN_TOSS.md](APPS_IN_TOSS.md) 에 있다** — 아래 「확인할 것」 대부분의 답이 거기 있다
(플랫폼 저장소 `Storage` 존재 · 게임 식별키 `getUserKeyForGame` · 닫기 버튼 위치 · 라이트 모드 기준 등).

| 접점 | 지금 | SDK 단계 |
|---|---|---|
| `PlatformAdapter` | `WebPlatform` (Date.now · visibilitychange) | `TossPlatform` — 생명주기 이벤트 · 진동 등 |
| `SaveRepository` | `LocalStorageSaveRepository` | 플랫폼 저장소가 있으면 그 구현, 아니면 서버 저장 |
| 사용자 식별 | `installId` | 토스 사용자 키와 연결 |

**SDK 단계에서 공식 문서로 확인할 것** (지금은 알 수 없으므로 가정하지 않는다)

- WebView 의 localStorage 가 앱 업데이트 · 재설치 · 저장공간 정리 후에도 유지되는가, 플랫폼 저장 API 가 있는가
- 사용자 식별 방법과 서버 연동 시 인증 흐름
- 게임 카테고리 심사 기준 · 번들 크기나 성능 요건
- 상단 내비게이션 바 · 안전 영역 · 뒤로가기 처리
- 백그라운드 전환 · 복귀 이벤트
- 광고(보상형 등) · 결제 · 외부 링크 정책 — MVP 에는 없지만 장기 설계에 영향

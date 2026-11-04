import type { RngState } from '../rng';
import type { AllyStats, BurnState, CombatStats } from './battle';
import type { FamilyId, FormId, MonsterId, StageId } from './ids';

/** 도전 던전 — 10 웨이브 로그라이크. 수치는 data/dungeon.json, 코드는 스킬 · 시너지 · 보스 패턴의 종류만 안다 */

export type SkillId = 'fireburst' | 'chain' | 'split' | 'poison' | 'shield' | 'frenzy';
export const SKILL_IDS: readonly SkillId[] = ['fireburst', 'chain', 'split', 'poison', 'shield', 'frenzy'];

export type SynergyId = 'toxicBlast' | 'stormChain' | 'scatterBolt' | 'flameShield' | 'venomVolley';
export const SYNERGY_IDS: readonly SynergyId[] = ['toxicBlast', 'stormChain', 'scatterBolt', 'flameShield', 'venomVolley'];

/** 스킬 하나. levels[0] 이 1단계 */
export interface SkillDef<L> {
  name: string;
  /** 한 줄 소개 (선택 카드) */
  desc: string;
  color: string;
  levels: L[];
}

export interface SkillDefs {
  /** every 번째 공격마다 대상 둘레 radius 안의 적에게 공격력 × mul 폭발. burn 이면 화상 1중첩 */
  fireburst: SkillDef<{ every: number; mul: number; radius: number; burn: boolean }>;
  /** every 번째 공격마다 대상에서 가까운 적으로 jumps 번 튀는 번개. 튈 때마다 피해 × falloff, stunChance 로 기절 */
  chain: SkillDef<{ every: number; jumps: number; mul: number; falloff: number; stunChance: number; stunMs: number }>;
  /** 공격마다 분열탄 extra 개를 다른 적에게 (공격력 × mul) */
  split: SkillDef<{ extra: number; mul: number }>;
  /** 맞힐 때마다 독 1중첩 — 중첩당 초당 공격력 × dps, 피해감소 무시. spread 면 죽을 때 옆 적에게 옮는다 */
  poison: SkillDef<{ dps: number; durationMs: number; maxStacks: number; spread: boolean }>;
  /** HP 가 hpBelow 아래로 떨어지면 최대 HP × ratio 보호막 (cooldownMs 마다 한 번). shockwave > 0 이면 깨질 때 모든 적에게 공격력 × shockwave */
  shield: SkillDef<{ ratio: number; hpBelow: number; cooldownMs: number; shockwave: number }>;
  /** 처치마다 광폭 1중첩(최대 maxStacks, durationMs 유지), 큰 공격을 맞으면 최대 — 중첩당 공격 속도 · 피해 증가. lowHpFull 이면 HP 절반 이하에서 늘 최대 */
  frenzy: SkillDef<{ maxStacks: number; speed: number; damage: number; durationMs: number; lowHpFull: boolean }>;
}

/** 두 스킬을 함께 가지면 켜지는 추가 효과 */
export interface SynergyDef<P> {
  name: string;
  desc: string;
  skills: [SkillId, SkillId];
  params: P;
}

export interface SynergyDefs {
  /** 화염 폭발 + 독성 — 폭발이 독 stacks 중첩, 중독된 적은 폭발 피해 × (1 + bonus) */
  toxicBlast: SynergyDef<{ stacks: number; bonus: number }>;
  /** 연쇄 번개 + 광폭화 — 광폭 중첩 perStacks 마다 1번 더 튀고, 최대 중첩이면 매 공격 번개 */
  stormChain: SynergyDef<{ perStacks: number }>;
  /** 분열 + 연쇄 번개 — 분열탄이 chance 로 작은 번개(1번 튐, 공격력 × mul) */
  scatterBolt: SynergyDef<{ chance: number; mul: number }>;
  /** 보호막 + 화염 폭발 — 보호막이 깨지면 모든 적에게 공격력 × mul 화염 + 화상 burnStacks */
  flameShield: SynergyDef<{ mul: number; burnStacks: number }>;
  /** 분열 + 독성 — 분열탄의 독이 extraStacks 만큼 더 쌓인다 */
  venomVolley: SynergyDef<{ extraStacks: number }>;
}

/** 진화 형태가 던전에서 갖는 전투 방식. 있는 칸만 적용한다 */
export interface DungeonFormDef {
  name: string;
  desc: string;
  /** 선택지에 두 배로 잘 나오는 스킬 */
  affinity: SkillId;
  /** 처치하면 최대 HP × killHeal 회복 */
  killHeal?: number;
  /** 처치하면 다음 공격이 곧바로 나간다 */
  killHaste?: boolean;
  /** 필살기 피해 × ultHeal 만큼 회복 (최대 HP 의 절반까지) */
  ultHeal?: number;
  /** 받은 직격 피해 × thorns 를 때린 적에게 되돌린다 */
  thorns?: number;
  /** 필살기를 쓰면 최대 HP × ultShield 보호막 */
  ultShield?: number;
  /** 기본 공격이 대상 둘레 splashRadius 안에 공격력 × splash 화염 피해 */
  splash?: number;
  splashRadius?: number;
  /** 화상 입은 적이 죽으면 가장 가까운 적에게 화상이 옮는다 */
  burnSpread?: boolean;
  /** 필살기가 모든 적에게 화상 ultBurn 중첩 */
  ultBurn?: number;
}

/** 용병 × 형태 · 스킬 연계 */
export type MercLinkEffect =
  /** 용병 공격 피해 × ratio 만큼 슬라임 회복 */
  | { kind: 'allyHeal'; ratio: number }
  /** 보호막 · 철갑 반격이 (1 + ratio) 배 */
  | { kind: 'guardBoost'; ratio: number }
  /** 용병 공격이 화상 stacks 중첩 */
  | { kind: 'allyBurn'; stacks: number }
  /** 용병 공격도 분열탄 extra 개 (공격력 × 용병 비율 × mul) */
  | { kind: 'allySplit'; extra: number; mul: number };

export interface MercLinkDef {
  id: string;
  name: string;
  desc: string;
  /** 이 외형의 용병을 편성하면 */
  preset: string;
  /** 이 중 하나를 갖추면 켜진다 */
  requires: { form?: FormId; skill?: SkillId }[];
  effect: MercLinkEffect;
}

export type BossPattern =
  /** 내려찍기 — 예고 뒤 공격력 × mul + 슬라임 최대 HP × hpRatio. 예고 중 필살기로 차단 */
  | { kind: 'smash'; windupMs: number; mul: number; hpRatio: number }
  /** 화염 숨결 — 예고 뒤 공격력 × mul + 최대 HP × hpRatio + 화상. 예고 중 필살기를 쓰면 weakenTo 배로 약해진다 */
  | { kind: 'breath'; windupMs: number; mul: number; hpRatio: number; burnStacks: number; weakenTo: number }
  /** 경화 — durationMs 동안 받는 피해 × (1 − reduction). 필살기로 깬다 */
  | { kind: 'guard'; windupMs: number; durationMs: number; reduction: number }
  /** 부하 소환 — 예고 뒤 monster 를 count 마리 */
  | { kind: 'summon'; windupMs: number; count: number; monster: MonsterId };

export type BossPatternKind = BossPattern['kind'];

export interface DungeonBossDef {
  /** 그림 · 계열 */
  monster: MonsterId;
  name: string;
  /** 기준 스테이지 수치에 곱한다 */
  hpMul: number;
  atkMul: number;
  attackIntervalMs: number;
  damageReduction: number;
  firstPatternMs: number;
  /** 한 패턴이 끝나고 다음 예고까지 */
  patternGapMs: number;
  /** HP 가 hpBelowRatio 아래면 패턴 간격 · 예고 시간 × mul */
  enrage: { hpBelowRatio: number; gapMul: number; windupMul: number };
  cycle: BossPattern[];
}

export interface UltimateSpec {
  max: number;
  /** 시작 충전량 */
  start: number;
  /** 싸우는 동안 초당 충전 */
  perSecond: number;
  perKill: number;
  /** 맞을 때마다 (화상 제외). 던전만 쓴다 */
  perHurt?: number;
  /** 공격력 × damageMul. 피해감소는 armorPierce 만큼 무시 */
  damageMul: number;
  armorPierce: number;
  /** 차단 · 경화 파괴 뒤 경직 — 보스 패턴이 밀리고 받는 피해 × staggerTakenMul */
  staggerMs: number;
  staggerTakenMul: number;
}

export interface ResearchDef {
  id: string;
  name: string;
  /** hp = 던전 최대 HP 비율 · charge = 필살기 충전 비율 · reroll = 다시 뽑기 횟수 · choice = 선택지 수 */
  stat: 'hp' | 'charge' | 'reroll' | 'choice';
  perLevel: number;
  maxLevel: number;
  /** cost(lv) = ceil(base × growth^lv) 결정 */
  cost: { base: number; growth: number };
}

export interface DungeonConfig {
  /** 이 스테이지를 깨면 1 단계가 열린다 */
  unlockStage: StageId;
  /**
   * 단계 L 의 기준 스테이지 = refStageBase + refStageStep × (L − 1) (마지막 스테이지까지).
   * powerBase = 「적정」으로 보는 (슬라임 초당 피해 × 실질 HP) ÷ (기준 스테이지 HP × 공격력)
   */
  levels: { count: number; refStageBase: number; refStageStep: number; powerBase: number };
  waves: {
    /** 웨이브별 일반 몬스터 수 (보스 웨이브는 0) */
    monsters: number[];
    /** 웨이브 번호 → 보스 id */
    bosses: Record<string, string>;
    /** 일반 몬스터 = 기준 스테이지 몬스터 × hpMul · atkMul × (1 + perWave × (웨이브 − 1)) */
    hpMul: number;
    atkMul: number;
    hpPerWave: number;
    atkPerWave: number;
    /** 공격 간격 · 한 방 배율 (초당 피해는 같다) */
    intervalMul: number;
    /** 한 번에 싸우는 최대 수. 나머지는 자리가 나면 들어온다 */
    maxOnField: number;
    /** 웨이브 시작 후 처음 burst 마리는 곧바로, 나머지는 gapMs 마다 */
    startMs: number;
    burst: number;
    gapMs: number;
    clearDelayMs: number;
    /** 웨이브를 깨면 최대 HP × clearHeal 회복 */
    clearHeal: number;
    /** 처치하면 최대 HP × regenOnKill 회복 */
    regenOnKill: number;
  };
  /** 이 웨이브가 시작되기 전에 스킬을 고른다 */
  picks: { beforeWaves: number[]; size: number; rerolls: number };
  ultimate: UltimateSpec;
  /** 슬라임에게 화상 능력이 없을 때 스킬 · 연계가 거는 화상 */
  burn: { dpsRatio: number; durationMs: number; maxStacks: number };
  rewards: {
    /** 처치 골드 배율 */
    goldMul: number;
    crystalsPerWave: number;
    crystalsPerBoss: number;
    crystalsClear: number;
    /** 단계를 처음 깨면 보석 base + perLevel × (L − 1) */
    firstClearGems: { base: number; perLevel: number };
    /** 시너지를 처음 발견하면 보석 */
    synergyGems: number;
  };
  skills: SkillDefs;
  synergies: SynergyDefs;
  forms: Record<FormId, DungeonFormDef>;
  links: MercLinkDef[];
  bosses: Record<string, DungeonBossDef>;
  research: ResearchDef[];
}

// ── 전투 상태 ──────────────────────────────────────────────

export type DungeonPhase = 'choosing' | 'fighting' | 'waveClear' | 'cleared' | 'failed';

export interface DungeonInit {
  level: number;
  slime: CombatStats;
  /** 진화 형태 (던전 전투 방식) */
  form: FormId | null;
  allies: (AllyStats & { preset: string })[];
  seed: number;
  goldMul: number;
  /** 연구로 늘어난 값 */
  rerolls: number;
  offerSize: number;
  chargeMul: number;
}

export interface DungeonSlime {
  stats: CombatStats;
  hp: number;
  shield: number;
  /** 보호막을 다시 펼 수 있는 시각. 스킬이 없으면 null */
  shieldAt: number | null;
  nextAttackAt: number;
  attacks: number;
  burn: BurnState | null;
  /** 받는 피해의 1 미만 나머지 — 초반 작은 수치에서 「최소 1 피해」로 부풀지 않게 모은다 */
  hurtCarry: number;
  frenzy: number;
  frenzyUntil: number;
}

export interface BossState {
  id: string;
  /** 다음에 쓸 패턴 순서 */
  next: number;
  nextAt: number;
  casting: { pattern: BossPattern; startedAt: number; impactAt: number; weakened: boolean } | null;
  guardUntil: number;
  guardReduction: number;
  staggerUntil: number;
  enraged: boolean;
}

export interface DungeonMonster {
  seq: number;
  defId: MonsterId;
  family: FamilyId;
  stats: CombatStats;
  hp: number;
  /** 대열 자리 (0 = 맨 앞) */
  slot: number;
  nextAttackAt: number;
  attacks: number;
  enraged: boolean;
  burn: BurnState | null;
  poison: BurnState | null;
  stunUntil: number;
  gold: number;
  absorb: number;
  boss: BossState | null;
}

export interface DungeonAlly extends AllyStats {
  preset: string;
  nextAttackAt: number;
}

export interface DungeonRewards {
  gold: number;
  kills: Partial<Record<FamilyId, number>>;
  absorb: Partial<Record<FamilyId, number>>;
}

export interface DungeonState {
  now: number;
  level: number;
  refStage: StageId;
  phase: DungeonPhase;
  /** waveClear 가 끝나는 시각 */
  phaseUntil: number;
  /** 지금(또는 다음) 웨이브. 첫 선택 전에는 0 */
  wave: number;
  wavesCleared: number;
  slime: DungeonSlime;
  monsters: DungeonMonster[];
  /** 이번 웨이브에 아직 안 나온 몬스터 (나올 시각 순) */
  queue: { defId: MonsterId; at: number; boss: string | null }[];
  allies: DungeonAlly[];
  skills: Partial<Record<SkillId, number>>;
  synergies: SynergyId[];
  offer: SkillId[] | null;
  rerolls: number;
  offerSize: number;
  /** 필살기 게이지. chargedAt = 마지막으로 충전을 계산한 시각, mul = 연구로 늘어난 충전 배율 */
  ult: { charge: number; chargedAt: number; mul: number };
  /** 플레이어가 고른 대상 */
  focus: number | null;
  form: FormId | null;
  rng: RngState;
  seq: number;
  kills: number;
  rewards: DungeonRewards;
  goldMul: number;
  /** 결과 화면용 — 피해 출처별 합계 · 필살기 횟수 · 차단 횟수 */
  record: { damage: Partial<Record<DamageSource, number>>; ultimates: number; blocked: number; bossKills: number };
}

export type DamageSource = 'hit' | 'split' | 'explosion' | 'lightning' | 'poison' | 'burn' | 'splash' | 'ally' | 'ultimate' | 'thorns' | 'shockwave';

export type DungeonEvent =
  | { type: 'dOffer'; at: number; skills: SkillId[]; rerolls: number }
  | { type: 'dSkill'; at: number; skill: SkillId; level: number }
  | { type: 'dSynergy'; at: number; synergy: SynergyId }
  | { type: 'dWave'; at: number; wave: number; boss: string | null }
  | { type: 'dWaveClear'; at: number; wave: number }
  | { type: 'dSpawn'; at: number; seq: number; defId: MonsterId; slot: number; maxHp: number; boss: string | null }
  | { type: 'dAttack'; at: number; target: number; split: number[] }
  | { type: 'dMonsterAttack'; at: number; seq: number }
  | { type: 'dHit'; at: number; seq: number; amount: number; crit: boolean; source: DamageSource }
  | { type: 'dHurt'; at: number; amount: number; absorbed: number; source: 'hit' | 'burn' | BossPatternKind; heavy: boolean }
  | { type: 'dExplosion'; at: number; seq: number; slot: number; radius: number; toxic: boolean }
  | { type: 'dLightning'; at: number; path: number[]; storm: boolean; mini: boolean }
  | { type: 'dStatus'; at: number; seq: number; status: 'poison' | 'burn' | 'stun'; stacks: number }
  | { type: 'dShield'; at: number; amount: number }
  | { type: 'dShieldBreak'; at: number; shockwave: boolean; flame: boolean }
  | { type: 'dFrenzy'; at: number; stacks: number }
  | { type: 'dHeal'; at: number; amount: number }
  | { type: 'dKilled'; at: number; seq: number; defId: MonsterId; family: FamilyId; gold: number; absorb: number; boss: boolean }
  | { type: 'dAllyAttack'; at: number; index: number; target: number }
  | { type: 'dUltReady'; at: number }
  | { type: 'dUltimate'; at: number; total: number; blocked: boolean; broke: boolean; weakened: boolean }
  | { type: 'dBossCast'; at: number; seq: number; pattern: BossPatternKind; impactAt: number; counter: 'block' | 'weaken' | 'break' | null }
  | { type: 'dBossImpact'; at: number; seq: number; pattern: BossPatternKind; weakened: boolean }
  | { type: 'dGuard'; at: number; seq: number; on: boolean }
  | { type: 'dEnraged'; at: number; seq: number }
  | { type: 'dCleared'; at: number }
  | { type: 'dFailed'; at: number };

/** 결과 — 진행 상태에 반영하는 커맨드의 재료 */
export interface DungeonSummary {
  level: number;
  /** 깬 웨이브 수 (0~10) */
  waves: number;
  cleared: boolean;
  bossKills: number;
  rewards: DungeonRewards;
  synergies: SynergyId[];
}

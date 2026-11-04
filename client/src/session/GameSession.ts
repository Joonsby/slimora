import { applySlimeStats, continueAsFarm, createBattle, isBossFight, isFinished, setAllies, setGoldMultiplier, stepBattle, ultimateReady, useUltimate } from '../core/battle/engine';
import { dungeonAdvice } from '../core/dungeon/advice';
import { snapshotDungeon } from '../core/dungeon/checkpoint';
import {
  chooseDungeonSkill,
  createDungeon,
  dungeonUltReady,
  isDungeonOver,
  rerollDungeonOffer,
  setDungeonFocus,
  stepDungeon,
  summarizeDungeon,
  useDungeonUltimate,
  waveCount,
} from '../core/dungeon/engine';
import { lastStageId } from '../core/lookup';
import { computeOfflineReward, type OfflineReward } from '../core/idle/offline';
import type { BattleEvent, BattleMode, BattleState } from '../core/model/battle';
import type { DungeonEvent, DungeonState, SkillId } from '../core/model/dungeon';
import { dungeonGains, dungeonInit, dungeonPower, isLevelUnlocked, type DungeonGains } from '../core/progression/dungeon';
import type { GameCommand, RuleError } from '../core/model/commands';
import type { GameConfig } from '../core/model/config';
import type { FormId, LegacyId, MercenaryId, StageId, UpgradeId } from '../core/model/ids';
import type { ProgressState } from '../core/model/progress';
import { diffGrowth, type GrowthChange } from '../core/progression/absorption';
import { applyCommand } from '../core/progression/applyCommand';
import { diffForms, type FormChange } from '../core/progression/forms';
import { slimeBonus } from '../core/progression/bonus';
import { partyAllies, summon as summonRule, type SummonPull } from '../core/progression/mercenary';
import { essenceForRebirth } from '../core/progression/prestige';
import { carryPurchases } from '../core/progression/shop';
import type { Result } from '../core/result';
import { seedFrom } from '../core/rng';
import { deriveSlimeStats, sameCombatStats } from '../core/stats';
import type { DungeonPause, DungeonResumeInfo, GameStore, Toast } from '../store/gameStore';
import type { PlatformAdapter, SaveEnvelope, SaveRepository } from './ports';
import { dungeonRunLost, newSaveData, restoreSaveData, toEnvelope, type SaveData } from './saveData';
import type { BattleSpeed, GameSettings } from './settings';

export type SessionEvent =
  | BattleEvent
  | GrowthChange
  | FormChange
  | { type: 'battleStarted'; at: number; stageId: StageId; mode: BattleMode }
  | { type: 'evolved'; at: number; form: FormId }
  /** bonus = 광고를 보고 더 받은 몫 */
  | { type: 'offlineReward'; at: number; gold: number; awayMs: number; bonus: boolean }
  | { type: 'rebirth'; at: number; count: number; essence: number }
  | { type: 'gemsGained'; at: number; amount: number; reason: 'firstClear' | 'rebirth' | 'ad' | 'dungeon' }
  | { type: 'partyChanged'; at: number }
  | { type: 'purchased'; at: number; sku: string; name: string }
  /** 사냥터 · 스테이지 전투의 필살기가 다 찼다 */
  | { type: 'ultimateReady'; at: number }
  | { type: 'dungeonStarted'; at: number; level: number }
  /** 던전이 끝나 결과를 반영했다 (결과 화면이 뜬다) */
  | { type: 'dungeonEnded'; at: number; level: number; cleared: boolean; waves: number }
  /** 결과 화면을 닫고 사냥터로 돌아왔다 */
  | { type: 'dungeonClosed'; at: number }
  /** 다시 실행했더니 진행 중이던 던전이 저장돼 있었다 (이어할지 묻는다) */
  | { type: 'dungeonRestored'; at: number; level: number; wave: number }
  /** 진행 중이던 던전 기록이 손상돼 버렸다 */
  | { type: 'dungeonRunLost'; at: number };
export type SessionListener = (events: readonly SessionEvent[]) => void;
export type DungeonListener = (events: readonly DungeonEvent[]) => void;
export type StartStatus = 'new' | 'restored' | 'recovered' | 'reset';

export interface SessionDeps {
  config: GameConfig;
  store: GameStore;
  repo: SaveRepository;
  platform: PlatformAdapter;
  seed?: number;
}

/** 던전 화면 요약(웨이브 · 선택 · 스킬)을 다시 계산할 이벤트 */
const HUD_EVENTS = new Set<DungeonEvent['type']>(['dOffer', 'dSkill', 'dSynergy', 'dWave', 'dWaveClear', 'dSpawn', 'dCleared', 'dFailed', 'dBossCast', 'dBossImpact', 'dGuard', 'dUltReady', 'dUltimate']);
/** 전투가 안정된 경계 — 고를 차례(다시 뽑기 포함) · 웨이브 시작(전장이 빔) · 웨이브 돌파. 여기서 체크포인트를 저장한다 */
const CHECKPOINT_EVENTS = new Set<DungeonEvent['type']>(['dOffer', 'dWave', 'dWaveClear']);
const NO_GAINS: DungeonGains = { crystals: 0, absorb: {}, firstClearGems: 0, newSynergies: [], synergyGems: 0, newBest: false };
const TOAST_MS = 2800;

/** 프레임 하나에서 진행할 최대 시간. 더 긴 공백은 따라잡지 않는다 */
export const MAX_FRAME_MS = 250;
export const SAVE_INTERVAL_MS = 10_000;

/** 엔진 구동 · 커맨드 적용 · 스테이지 전환 · 저장 시점을 조정한다. 규칙 판단은 core 에 맡긴다 */
export class GameSession {
  private battle: BattleState | null = null;
  private readonly listeners = new Set<SessionListener>();
  private readonly saveListeners = new Set<(envelope: SaveEnvelope) => void>();
  private readonly seed: number;
  private battleCount = 0;
  private meta: Pick<SaveData, 'installId' | 'createdAt'> = { installId: '', createdAt: 0 };
  private dirty = false;
  private lastSavedAt = 0;
  private unsubscribeVisibility: (() => void) | null = null;
  /** 다음 emit 에 실어 보낼 레벨 · 특성 · 형태 변화 */
  private growth: SessionEvent[] = [];
  /** 진화 연출 동안 전투를 멈춘다 (플랫폼 시각) */
  private pausedUntil = 0;
  /** 화면이 가려진 시각. 돌아오면 그 사이를 오프라인 보상으로 준다 */
  private hiddenAt: number | null = null;
  private offlineCount = 0;
  /** 도전 던전 한 판. 결과 화면을 닫을 때까지 남는다 (그동안 사냥터 전투는 멈춘다) */
  private dungeon: DungeonState | null = null;
  /**
   * 저장할 판의 사본 — 웨이브 경계 · 스킬 선택 때, 그리고 화면을 떠날 때 뜬다. 진행 상태와 같은 저장에 들어가
   * 보상과 어긋나지 않는다. 판이 끝나면(보상 반영) null
   */
  private checkpoint: DungeonState | null = null;
  /** 다시 실행했을 때 저장에서 되살린 판 — 이어할지 고르기 전까지 (그동안 사냥터도 멈춘다) */
  private pendingRun: DungeonState | null = null;
  /** 던전이 멈춘 이유. 엔진은 모른다 — 시간이 흐르지 않을 뿐이다 */
  private dungeonPause: DungeonPause | null = null;
  private dungeonCount = 0;
  private toastSeq = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly dungeonListeners = new Set<DungeonListener>();
  /** 사냥터 필살기가 다 찼던가 — 처음 찬 순간만 알린다 */
  private ultimateWasReady = false;

  constructor(private readonly deps: SessionDeps) {
    this.seed = deps.seed ?? Math.floor(Math.random() * 0xffffffff);
  }

  get config(): GameConfig {
    return this.deps.config;
  }

  async start(): Promise<StartStatus> {
    const { repo, platform, store, config } = this.deps;
    const now = platform.now();
    const loaded = await repo.load();

    let data: SaveData | null = null;
    let status: StartStatus = 'new';
    if (loaded.status === 'ok') {
      data = restoreSaveData(loaded.envelope, config);
      status = data ? (loaded.fromBackup ? 'recovered' : 'restored') : 'reset';
    } else if (loaded.status === 'corrupt') {
      status = 'reset';
    }
    data ??= newSaveData(config, now, globalThis.crypto.randomUUID());

    this.meta = { installId: data.installId, createdAt: data.createdAt };
    store.setState({ ready: true, progress: data.progress, settings: data.settings });
    this.lastSavedAt = now;
    this.startBattle();
    // 진행 중이던 던전 — 이어할지 묻는다. 읽지 못했으면 알리고 버린다 (진행 상태는 그대로)
    if (data.dungeonRun) this.setPendingRun(data.dungeonRun);
    else if (loaded.status === 'ok' && dungeonRunLost(loaded.envelope, data)) this.emit([{ type: 'dungeonRunLost', at: 0 }]);
    this.unsubscribeVisibility = platform.onVisibilityChange((visible) => {
      if (!visible) {
        this.hiddenAt ??= platform.now();
        this.suspendDungeon();
        void this.saveNow();
        return;
      }
      if (this.hiddenAt === null) return;
      const away = platform.now() - this.hiddenAt;
      this.hiddenAt = null;
      this.grantOffline(away);
    });
    // 저장이 있으면 마지막 활동 이후를 오프라인 보상으로
    if (loaded.status === 'ok' && status !== 'reset') this.grantOffline(now - data.lastActiveAt);
    if (status !== 'restored') await this.saveNow();
    return status;
  }

  dispose(): void {
    this.unsubscribeVisibility?.();
    this.listeners.clear();
    this.saveListeners.clear();
    this.dungeonListeners.clear();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  /** 매 프레임 호출 (게임 루프 한 곳에서). 던전 중이면 던전만 진행하고, 저장된 던전을 이어할지 고르는 동안은 아무것도 진행하지 않는다 */
  tick(frameMs: number): void {
    const dt = Math.min(Math.max(frameMs, 0), MAX_FRAME_MS) * this.deps.store.getState().settings.battleSpeed;
    if (this.dungeon) {
      if (!this.dungeonPause) this.tickDungeon(dt);
    } else if (!this.pendingRun) {
      const battle = this.battle;
      if (!battle || this.deps.platform.now() < this.pausedUntil) return;
      const battleEvents = stepBattle(battle, dt, this.deps.config);
      const after: SessionEvent[] = [];
      for (const e of battleEvents) this.handleBattleEvent(e, after);
      const events: SessionEvent[] = [...battleEvents, ...this.takeGrowth(), ...after];
      const ready = ultimateReady(battle, this.deps.config);
      if (ready && !this.ultimateWasReady) events.push({ type: 'ultimateReady', at: battle.now });
      this.ultimateWasReady = ready;
      if (events.length > 0) this.emit(events);
    }
    if (this.dirty && this.deps.platform.now() - this.lastSavedAt >= SAVE_INTERVAL_MS) void this.saveNow();
  }

  /** 필살기 — 던전이면 던전, 아니면 사냥터 전투. 게이지가 덜 찼거나 멈춘 중이면 false (첫 내려찍기 가르침 중에는 쓸 수 있다) */
  useUltimate(): boolean {
    const { config } = this.deps;
    if (this.dungeon) {
      if (this.dungeonPause && this.dungeonPause !== 'teach') return false;
      const events = useDungeonUltimate(this.dungeon, config);
      if (!events) return false;
      const used = events.find((e) => e.type === 'dUltimate');
      if (this.dungeonPause === 'teach') this.dungeonPause = null;
      // 처음 쓴 필살기 · 처음 끊은 큰 공격은 확실하게 알려 준다
      if (used?.blocked && !this.tutorialDone('block')) {
        this.completeTutorial('block');
        this.toast('차단 성공! 붉게 예고하는 큰 공격은 이렇게 끊을 수 있어요', 'good');
      } else if (!this.tutorialDone('dungeonUlt')) {
        this.completeTutorial('dungeonUlt');
        this.toast(used?.weakened ? '숨결 약화! 예고 중에 쓰면 큰 공격이 약해져요' : '필살기! 모든 적에게 큰 피해를 줘요', 'good');
      }
      this.afterDungeonEvents(events);
      this.updateDungeonHud();
      return true;
    }
    const battle = this.battle;
    const battleEvents = battle ? useUltimate(battle, config) : null;
    if (!battleEvents) return false;
    this.ultimateWasReady = false;
    // 사냥터에서도 처음 쓴 필살기 · 처음 끊은 강타는 알려 준다
    const used = battleEvents.find((e) => e.type === 'ultimate');
    if (used?.interrupted && !this.tutorialDone('fieldBlock')) {
      this.completeTutorial('fieldBlock');
      this.toast('강타 차단! 적이 힘을 모을 때 쓰면 공격을 끊어요', 'good');
    } else if (!this.tutorialDone('ultimate')) {
      this.toast('필살기! 게이지가 다시 차면 또 쓸 수 있어요', 'good');
    }
    this.completeTutorial('ultimate');
    const after: SessionEvent[] = [];
    for (const e of battleEvents) this.handleBattleEvent(e, after);
    this.emit([...battleEvents, ...this.takeGrowth(), ...after]);
    return true;
  }

  /** 지금 전투의 필살기 게이지 (화면이 자주 읽는다) */
  ultimateGauge(): { charge: number; max: number; usable: boolean } {
    const { config } = this.deps;
    const d = this.dungeon;
    if (d) {
      const max = config.dungeon.ultimate.max;
      const paused = this.dungeonPause !== null && this.dungeonPause !== 'teach';
      return { charge: d.ult.charge, max, usable: d.ult.charge >= max && d.phase === 'fighting' && d.monsters.length > 0 && !paused };
    }
    const b = this.battle;
    const max = config.balance.ultimate.max;
    if (!b) return { charge: 0, max, usable: false };
    return { charge: b.ultimate.charge, max, usable: b.ultimate.charge >= max && b.phase === 'fighting' && b.monster !== null };
  }

  // ── 도전 던전 ─────────────────────────────────────────

  /** 던전 한 판을 연다. 열리지 않은 단계거나 이미 던전 중이거나 이어할 판이 남아 있으면 false */
  startDungeon(level: number): boolean {
    const { config } = this.deps;
    if (this.dungeon || this.pendingRun || !isLevelUnlocked(this.progress(), level, config)) return false;
    const seed = seedFrom(this.seed, 0xd0, ++this.dungeonCount);
    const { state, events } = createDungeon(dungeonInit(this.progress(), level, seed, config, newRunId()), config);
    this.enterDungeon(state, events);
    return true;
  }

  /** 저장에서 되살린 판을 이어 한다. 싸우는 중이었으면 멈춘 채로 열어 준비할 틈을 준다 */
  resumeSavedDungeon(): boolean {
    const run = this.pendingRun;
    if (!run || this.dungeon) return false;
    this.pendingRun = null;
    this.deps.store.setState({ dungeonResume: null });
    this.enterDungeon(snapshotDungeon(run), []);
    if (run.phase !== 'choosing') this.dungeonPause = 'background';
    this.updateDungeonHud();
    return true;
  }

  /** 저장에서 되살린 판을 포기한다 — 그때까지 깬 웨이브와 처치 보상은 받는다 (결과 화면이 뜬다) */
  abandonSavedDungeon(): void {
    if (this.resumeSavedDungeon()) this.abandonDungeon();
  }

  /** 던전을 잠깐 멈춘다 (멈춤 버튼). 고르는 중이거나 끝났으면 false */
  pauseDungeon(): boolean {
    const d = this.dungeon;
    if (!d || isDungeonOver(d) || d.phase === 'choosing' || this.dungeonPause) return false;
    this.dungeonPause = 'user';
    this.updateDungeonHud();
    return true;
  }

  /** 멈춘 던전을 다시 진행한다. 첫 내려찍기 가르침을 넘기면 다시 가르치지 않는다 */
  continueDungeon(): void {
    if (!this.dungeonPause) return;
    if (this.dungeonPause === 'teach') this.completeTutorial('block');
    this.dungeonPause = null;
    this.updateDungeonHud();
  }

  private enterDungeon(state: DungeonState, events: readonly DungeonEvent[]): void {
    const { store } = this.deps;
    this.dungeon = state;
    this.checkpoint = snapshotDungeon(state);
    this.dungeonPause = null;
    store.setState({ sheet: 'none', dungeonResult: null });
    this.updateDungeonHud();
    this.emit([{ type: 'dungeonStarted', at: 0, level: state.level }]);
    this.emitDungeon(events);
    void this.saveNow();
  }

  /** 다시 실행했을 때 찾은 판 — 이어할지 묻는다 */
  private setPendingRun(run: DungeonState): void {
    this.pendingRun = run;
    this.deps.store.setState({ dungeonResume: resumeInfo(run, this.deps.config) });
    this.emit([{ type: 'dungeonRestored', at: 0, level: run.level, wave: Math.max(1, run.wave) }]);
  }

  /** 화면을 떠난다 — 지금 그대로를 체크포인트로 남기고(강제 종료 대비), 돌아오면 멈춘 채로 보여 준다 */
  private suspendDungeon(): void {
    const d = this.dungeon;
    if (!d || isDungeonOver(d)) return;
    this.checkpoint = snapshotDungeon(d);
    if (!this.dungeonPause && d.phase !== 'choosing') {
      this.dungeonPause = 'background';
      this.updateDungeonHud();
    }
  }

  chooseSkill(skill: SkillId): boolean {
    const events = this.dungeon ? chooseDungeonSkill(this.dungeon, skill, this.deps.config) : null;
    if (!events) return false;
    this.afterDungeonEvents(events);
    return true;
  }

  rerollSkills(): boolean {
    const events = this.dungeon ? rerollDungeonOffer(this.dungeon, this.deps.config) : null;
    if (!events) return false;
    this.afterDungeonEvents(events);
    return true;
  }

  /** 공격 대상을 고른다. null 이면 맨 앞 적. 멈춘 동안은 고를 수 없다 */
  focusMonster(seq: number | null): boolean {
    return this.dungeon !== null && !isDungeonOver(this.dungeon) && !this.dungeonPause && setDungeonFocus(this.dungeon, seq);
  }

  /** 포기 — 그때까지 깬 웨이브와 처치 보상은 받는다 */
  abandonDungeon(): void {
    const d = this.dungeon;
    if (!d || isDungeonOver(d)) return;
    d.phase = 'failed';
    this.finishDungeon(true);
  }

  /** 결과 화면을 닫고 사냥터로 돌아간다. again 이면 같은 단계를 바로 다시 연다 */
  closeDungeon(again = false): void {
    const d = this.dungeon;
    if (!d || !isDungeonOver(d)) return;
    this.dungeon = null;
    this.checkpoint = null;
    this.dungeonPause = null;
    this.deps.store.setState({ dungeon: null, dungeonResult: null });
    this.emit([{ type: 'dungeonClosed', at: 0 }]);
    if (again) this.startDungeon(d.level);
  }

  /** 던전 렌더링용 읽기 전용 뷰. 고치지 말 것 */
  dungeonView(): Readonly<DungeonState> | null {
    return this.dungeon;
  }

  onDungeonEvents(listener: DungeonListener): () => void {
    this.dungeonListeners.add(listener);
    return () => this.dungeonListeners.delete(listener);
  }

  private tickDungeon(dt: number): void {
    const d = this.dungeon!;
    if (isDungeonOver(d)) return;
    let events: DungeonEvent[];
    try {
      events = stepDungeon(d, dt, this.deps.config);
    } catch (e) {
      // 엔진이 멈추면 게임 전체가 멈춘다 — 그때까지의 보상으로 판을 끝낸다
      console.error('던전을 더 진행할 수 없어 판을 끝낸다', e);
      d.phase = 'failed';
      this.finishDungeon(true);
      return;
    }
    if (events.length > 0) this.afterDungeonEvents(events);
  }

  private afterDungeonEvents(events: readonly DungeonEvent[]): void {
    this.emitDungeon(events);
    if (events.some((e) => HUD_EVENTS.has(e.type))) this.updateDungeonHud();
    const d = this.dungeon;
    if (!d) return;
    if (isDungeonOver(d)) {
      if (!this.deps.store.getState().dungeonResult) this.finishDungeon(false);
      return;
    }
    this.teachBlock(events);
    if (events.some((e) => CHECKPOINT_EVENTS.has(e.type))) {
      this.checkpoint = snapshotDungeon(d);
      void this.saveNow();
    }
  }

  /**
   * 처음 보는 내려찍기 — 필살기가 차 있으면 멈추고 버튼을 짚어 준다 (그때 쓰면 끊긴다).
   * 차 있지 않으면 다음에 끊을 수 있다고만 알린다
   */
  private teachBlock(events: readonly DungeonEvent[]): void {
    if (this.dungeonPause || this.tutorialDone('block')) return;
    if (!events.some((e) => e.type === 'dBossCast' && e.pattern === 'smash')) return;
    if (dungeonUltReady(this.dungeon!, this.deps.config)) {
      this.dungeonPause = 'teach';
      this.updateDungeonHud();
    } else {
      this.toast('필살기가 다 차 있으면 이 내려찍기를 끊을 수 있어요', 'hint');
    }
  }

  /** 결과를 진행에 반영하고 결과 화면을 띄운다. 이미 반영한 판(다른 기기 · 이전 실행)이면 보상 없이 결과만 */
  private finishDungeon(abandoned: boolean): void {
    const d = this.dungeon!;
    const { config, store } = this.deps;
    const summary = summarizeDungeon(d);
    const before = this.progress();
    const gemsBefore = before.gems;
    const applied = this.apply({ type: 'finishDungeon', summary });
    if (!applied.ok) console.warn('던전 결과를 반영하지 못했다', applied.error);
    const gains = applied.ok ? dungeonGains(before, summary, config) : NO_GAINS;
    const advice = dungeonAdvice(summary, d.record, d.skills, d.synergies.length, dungeonPower(before, d.level, config), abandoned, config);
    this.checkpoint = null;
    this.dungeonPause = null;
    store.setState({ dungeonResult: { summary, gains, record: d.record, skills: d.skills, kills: d.kills, durationMs: d.now, abandoned, advice, claimed: applied.ok } });
    this.updateDungeonHud();
    const gained = this.progress().gems - gemsBefore;
    this.emit([
      ...this.takeGrowth(),
      { type: 'dungeonEnded', at: d.now, level: d.level, cleared: summary.cleared, waves: summary.waves },
      ...(gained > 0 ? [{ type: 'gemsGained' as const, at: d.now, amount: gained, reason: 'dungeon' as const }] : []),
    ]);
    void this.saveNow();
  }

  private updateDungeonHud(): void {
    const d = this.dungeon;
    const { config, store } = this.deps;
    if (!d) {
      store.setState({ dungeon: null });
      return;
    }
    const bossState = d.monsters.find((m) => m.boss)?.boss;
    store.setState({
      dungeon: {
        level: d.level,
        wave: d.wave,
        waves: waveCount(config),
        phase: d.phase,
        skills: d.skills,
        synergies: d.synergies,
        offer: d.offer,
        rerolls: d.rerolls,
        boss: bossState?.id ?? config.dungeon.waves.bosses[String(d.wave)] ?? null,
        casting: bossState?.casting?.pattern.kind ?? null,
        guard: bossState ? bossState.guardUntil > d.now : false,
        ultReady: d.ult.charge >= config.dungeon.ultimate.max,
        paused: this.dungeonPause,
      },
    });
  }

  private tutorialDone(step: string): boolean {
    return this.deps.store.getState().settings.tutorial.includes(step);
  }

  /** 잠깐 뜨는 안내 한 줄 */
  private toast(text: string, tone: Toast['tone']): void {
    const { store } = this.deps;
    const id = ++this.toastSeq;
    store.setState({ toast: { id, text, tone } });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      if (store.getState().toast?.id === id) store.setState({ toast: null });
    }, TOAST_MS);
  }

  private emitDungeon(events: readonly DungeonEvent[]): void {
    if (events.length === 0) return;
    for (const listener of this.dungeonListeners) listener(events);
  }

  /** UI 의 유일한 쓰기 경로 */
  dispatch(cmd: GameCommand): Result<ProgressState, RuleError> {
    const result = this.apply(cmd);
    if (!result.ok) return result;
    const events: SessionEvent[] = this.takeGrowth();
    if (cmd.type === 'enterStage') {
      const started = this.syncBattle();
      if (started) events.push(started);
    }
    if (events.length > 0) this.emit(events);
    return result;
  }

  purchaseUpgrade(upgrade: UpgradeId) {
    return this.dispatch({ type: 'purchaseUpgrade', upgrade });
  }

  challengeNext() {
    const { highestCleared } = this.progress().stage;
    return this.dispatch({ type: 'enterStage', stage: Math.min(highestCleared + 1, lastStageId(this.deps.config)), mode: 'challenge' });
  }

  huntAt(stage: StageId) {
    return this.dispatch({ type: 'enterStage', stage, mode: 'farm' });
  }

  setAutoAdvance(on: boolean) {
    return this.dispatch({ type: 'setAutoAdvance', on });
  }

  /** 진화하면 연출 시간만큼 전투를 멈춘다 */
  evolve(form: FormId) {
    const result = this.dispatch({ type: 'evolve', form, inBossFight: this.inBossFight() });
    if (result.ok) {
      this.pausedUntil = this.deps.platform.now() + this.deps.config.balance.evolution.pauseMs;
      this.emit([{ type: 'evolved', at: this.battle?.now ?? 0, form }]);
      void this.saveNow();
    }
    return result;
  }

  inBossFight(): boolean {
    return this.battle ? isBossFight(this.battle) : false;
  }

  /** 환생 — 진행을 처음으로 되돌리고 정수를 받는다. 새 1 스테이지 전투를 연다 */
  rebirth() {
    const essence = essenceForRebirth(this.progress(), this.deps.config);
    const gemsBefore = this.progress().gems;
    const result = this.apply({ type: 'rebirth' });
    if (result.ok) {
      this.growth = [];
      this.pausedUntil = 0;
      const started = this.startBattle();
      this.emit([
        { type: 'rebirth', at: 0, count: result.value.prestige.count, essence },
        { type: 'gemsGained', at: 0, amount: result.value.gems - gemsBefore, reason: 'rebirth' },
        started,
      ]);
      void this.saveNow();
    }
    return result;
  }

  purchaseLegacy(legacy: LegacyId) {
    return this.dispatch({ type: 'purchaseLegacy', legacy });
  }

  /** 보석 뽑기. 결과(뽑은 용병 · 처음인지 · 레벨)를 돌려준다. 보석이 모자라면 null */
  summon(count: 1 | 10): SummonPull[] | null {
    const seed = Math.floor(Math.random() * 0xffffffff);
    const preview = summonRule(this.progress(), count, seed, this.deps.config);
    if (!preview.ok || !this.apply({ type: 'summon', count, seed }).ok) return null;
    this.emit(this.takeGrowth());
    void this.saveNow();
    return preview.value.pulls;
  }

  setParty(party: MercenaryId[]) {
    return this.dispatch({ type: 'setParty', party });
  }

  /** 광고를 끝까지 봤거나 광고 패스가 있을 때. day = 기기 날짜 'YYYY-MM-DD' */
  claimAdGems(): boolean {
    const before = this.progress().gems;
    const result = this.apply({ type: 'claimAdGems', day: localDay(this.deps.platform.now()) });
    if (!result.ok) return false;
    this.emit([{ type: 'gemsGained', at: this.battle?.now ?? 0, amount: result.value.gems - before, reason: 'ad' }]);
    void this.saveNow();
    return true;
  }

  /**
   * 스토어 결제가 끝난 주문을 지급하고 바로 저장한다. 저장까지 됐을 때만 true —
   * false 면 스토어가 주문을 미지급으로 남겨 두고, 다음 실행 때 restore 로 다시 온다
   */
  async grantOrder(sku: string, orderId: string): Promise<boolean> {
    const before = this.progress();
    const result = this.apply({ type: 'grantPurchase', sku, orderId });
    if (!result.ok) return false;
    if (result.value !== before) {
      const name = this.deps.config.shop.find((p) => p.sku === sku)?.name ?? sku;
      this.emit([{ type: 'purchased', at: this.battle?.now ?? 0, sku, name }]);
    }
    return this.saveNow();
  }

  /** 오늘 날짜 (광고 보석 횟수 계산용) */
  today(): string {
    return localDay(this.deps.platform.now());
  }

  setBattleSpeed(battleSpeed: BattleSpeed): void {
    this.updateSettings({ battleSpeed });
  }

  setSound(sound: boolean): void {
    this.updateSettings({ sound });
  }

  /** 튜토리얼 안내 하나를 봤다 */
  completeTutorial(step: string): void {
    const done = this.deps.store.getState().settings.tutorial;
    if (!done.includes(step)) this.updateSettings({ tutorial: [...done, step] });
  }

  /** 오프라인 보상 창의 광고 보너스. 이미 받았거나 창이 없으면 false */
  claimOfflineBonus(): boolean {
    const { store, config } = this.deps;
    const notice = store.getState().offline;
    if (!notice || notice.bonus !== 'available') return false;
    const extra = config.balance.offline.adMultiplier - 1;
    const { gold, absorb } = scaleReward(notice.reward, extra);
    if (!this.apply({ type: 'grantBattleReward', gold, kills: {}, absorb }).ok) return false;
    store.setState({ offline: { ...notice, bonus: 'claimed' } });
    this.emit([...this.takeGrowth(), { type: 'offlineReward', at: this.battle?.now ?? 0, gold, awayMs: notice.reward.awayMs, bonus: true }]);
    void this.saveNow();
    return true;
  }

  dismissOffline(): void {
    this.deps.store.setState({ offline: null });
  }

  onEvents(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 렌더링용 읽기 전용 뷰. 고치지 말 것 */
  view(): Readonly<BattleState> | null {
    return this.battle;
  }

  /** 기기 저장에 성공하면 true */
  async saveNow(): Promise<boolean> {
    const envelope = this.snapshot();
    this.dirty = false;
    this.lastSavedAt = envelope.savedAt;
    try {
      await this.deps.repo.save(envelope);
    } catch (e) {
      this.dirty = true;
      console.warn('저장 실패', e);
      return false;
    }
    for (const listener of this.saveListeners) listener(envelope);
    return true;
  }

  /** 기기에 저장할 때마다 불린다 (서버 저장이 따라 올린다) */
  onSaved(listener: (envelope: SaveEnvelope) => void): () => void {
    this.saveListeners.add(listener);
    return () => this.saveListeners.delete(listener);
  }

  /** 지금 진행을 저장 형식으로. 진행 중인 던전은 마지막 체크포인트를, 끝난 판은 넣지 않는다 (보상은 이미 진행에 들어 있다) */
  snapshot(): SaveEnvelope {
    const { platform, store, config } = this.deps;
    const now = platform.now();
    const { progress, settings } = store.getState();
    const dungeonRun = this.pendingRun ?? (this.dungeon && !isDungeonOver(this.dungeon) ? this.checkpoint : null);
    return toEnvelope({ ...this.meta, lastActiveAt: now, progress, settings, dungeonRun }, config, now);
  }

  /**
   * 다른 기기에서 더 진행한 저장으로 바꾸고 현재 스테이지를 처음부터 연다. 읽을 수 없는 저장이면 false.
   * 이 기기에서만 지급한 결제는 바꾼 저장에도 지급한다
   */
  adopt(envelope: SaveEnvelope): boolean {
    const data = restoreSaveData(envelope, this.deps.config);
    if (!data) return false;
    this.meta = { installId: data.installId, createdAt: data.createdAt };
    const progress = carryPurchases(data.progress, this.progress(), this.deps.config);
    // 이 기기의 던전 판은 버린 진행에 속한다 — 그대로 끝내면 받아 온 진행에 보상이 한 번 더 들어간다
    const hadRun = this.dungeon !== null;
    this.dungeon = null;
    this.checkpoint = null;
    this.pendingRun = null;
    this.dungeonPause = null;
    this.deps.store.setState({ progress, settings: data.settings, dungeon: null, dungeonResult: null, dungeonResume: null });
    if (hadRun) this.emit([{ type: 'dungeonClosed', at: 0 }]);
    this.growth = [];
    this.pausedUntil = 0;
    this.emit([this.startBattle()]);
    if (data.dungeonRun) this.setPendingRun(data.dungeonRun);
    void this.saveNow();
    return true;
  }

  /** 렌더링용 읽기 전용 진행 상태 (슬라임 색 등) */
  getProgress(): Readonly<ProgressState> {
    return this.progress();
  }

  private progress(): ProgressState {
    return this.deps.store.getState().progress;
  }

  private updateSettings(patch: Partial<GameSettings>): void {
    this.deps.store.setState((s) => ({ settings: { ...s.settings, ...patch } }));
    this.dirty = true;
  }

  /** 떠나 있던 시간만큼 기본 보상을 바로 주고, 광고 보너스를 받을 수 있게 창을 띄운다 */
  private grantOffline(awayMs: number): void {
    const reward = computeOfflineReward(this.progress(), awayMs, this.deps.config, seedFrom(this.seed, 0x0ff1, ++this.offlineCount));
    if (!reward) return;
    if (!this.apply({ type: 'grantBattleReward', gold: reward.gold, kills: reward.kills, absorb: reward.absorb }).ok) return;
    this.deps.store.setState({ offline: { reward, bonus: 'available' } });
    this.emit([...this.takeGrowth(), { type: 'offlineReward', at: this.battle?.now ?? 0, gold: reward.gold, awayMs: reward.awayMs, bonus: false }]);
    void this.saveNow();
  }

  private apply(cmd: GameCommand): Result<ProgressState, RuleError> {
    const before = this.progress();
    const result = applyCommand(before, cmd, this.deps.config);
    if (result.ok) {
      this.deps.store.setState({ progress: result.value });
      this.dirty = true;
      if (result.value.slime !== before.slime) this.onSlimeChanged(before, result.value);
      else if (result.value.prestige.legacy !== before.prestige.legacy || result.value.mercenaries !== before.mercenaries) this.refreshBattleStats(result.value, before);
      if (result.value.slime !== before.slime || result.value.stage.highestCleared !== before.stage.highestCleared) {
        this.growth.push(...diffForms(before, result.value, this.deps.config));
      }
    }
    return result;
  }

  /** 강화 · 흡수로 슬라임이 바뀌면 진행 중인 전투에 즉시 반영하고 레벨 · 특성 변화를 모은다 */
  private onSlimeChanged(before: ProgressState, after: ProgressState): void {
    const { config } = this.deps;
    this.growth.push(...diffGrowth(before.slime.absorption, after.slime.absorption, config));
    const battle = this.battle;
    if (!battle) return;
    const stats = deriveSlimeStats(after.slime, config, slimeBonus(after, config));
    if (!sameCombatStats(stats, battle.slime.stats)) applySlimeStats(battle, stats);
  }

  /** 정수 강화 · 용병이 바뀌면 진행 중인 전투의 능력치 · 골드 배율 · 용병을 바로 바꾼다 */
  private refreshBattleStats(p: ProgressState, before: ProgressState): void {
    const battle = this.battle;
    if (!battle) return;
    const bonus = slimeBonus(p, this.deps.config);
    if (p.mercenaries.party !== before.mercenaries.party || p.mercenaries.owned !== before.mercenaries.owned) {
      setAllies(battle, partyAllies(p.mercenaries, this.deps.config));
      this.growth.push({ type: 'partyChanged', at: battle.now });
    }
    const stats = deriveSlimeStats(p.slime, this.deps.config, bonus);
    if (!sameCombatStats(stats, battle.slime.stats)) applySlimeStats(battle, stats);
    setGoldMultiplier(battle, bonus.gold);
  }

  private takeGrowth(): SessionEvent[] {
    const taken = this.growth;
    this.growth = [];
    return taken;
  }

  private handleBattleEvent(e: BattleEvent, after: SessionEvent[]): void {
    switch (e.type) {
      case 'monsterSpawned':
        if (e.boss) this.updateHud();
        break;
      case 'monsterKilled':
        this.apply({ type: 'grantBattleReward', gold: e.gold, kills: { [e.family]: 1 }, absorb: { [e.family]: e.absorb } });
        this.updateHud();
        break;
      case 'slimeDied':
        this.apply({ type: 'recordDeath' });
        break;
      case 'stageCleared':
      case 'challengeFailed': {
        const gemsBefore = this.progress().gems;
        this.apply({ type: e.type, stage: e.stageId });
        const gained = this.progress().gems - gemsBefore;
        if (gained > 0) after.push({ type: 'gemsGained', at: e.at, amount: gained, reason: 'firstClear' });
        const started = this.syncBattle();
        if (started) after.push(started);
        void this.saveNow();
        break;
      }
    }
  }

  /** 진행 상태가 가리키는 스테이지 · 모드와 현재 전투를 맞춘다. 새 전투를 열었으면 그 이벤트를 돌려준다 */
  private syncBattle(): SessionEvent | null {
    const battle = this.battle;
    const { current, mode } = this.progress().stage;
    if (battle && battle.stageId === current) {
      if (battle.phase === 'cleared' && mode === 'farm') {
        continueAsFarm(battle, this.deps.config);
        this.updateHud();
        return null;
      }
      if (battle.mode === mode && !isFinished(battle)) return null;
    }
    return this.startBattle();
  }

  private startBattle(): SessionEvent {
    const { current, mode } = this.progress().stage;
    const bonus = slimeBonus(this.progress(), this.deps.config);
    this.battleCount += 1;
    this.battle = createBattle(
      {
        stageId: current,
        mode,
        slime: deriveSlimeStats(this.progress().slime, this.deps.config, bonus),
        seed: seedFrom(this.seed, current, this.battleCount),
        goldMul: bonus.gold,
        allies: partyAllies(this.progress().mercenaries, this.deps.config),
        // 필살기 게이지는 다음 전투로 이어진다
        ultimateCharge: this.battle?.ultimate.charge,
      },
      this.deps.config,
    );
    this.updateHud();
    return { type: 'battleStarted', at: 0, stageId: current, mode };
  }

  private updateHud(): void {
    const b = this.battle;
    if (!b) return;
    this.deps.store.setState({ hud: { stageId: b.stageId, mode: b.mode, kills: b.kills, killsToClear: b.killsToClear, boss: isBossFight(b) } });
  }

  private emit(events: readonly SessionEvent[]): void {
    for (const listener of this.listeners) listener(events);
  }
}

function scaleReward(r: OfflineReward, k: number): { gold: number; absorb: Partial<Record<string, number>> } {
  return { gold: Math.floor(r.gold * k), absorb: Object.fromEntries(Object.entries(r.absorb).map(([f, n]) => [f, Math.floor((n ?? 0) * k)])) };
}

/** 던전 한 판의 id — 기기 · 실행이 달라도 겹치지 않게 */
function newRunId(): string {
  return globalThis.crypto.randomUUID();
}

function resumeInfo(run: DungeonState, cfg: GameConfig): DungeonResumeInfo {
  return { level: run.level, wave: Math.max(1, run.wave), waves: waveCount(cfg), hp: run.slime.hp / run.slime.stats.maxHp, skills: run.skills, synergies: run.synergies };
}

/** 기기 날짜 'YYYY-MM-DD' — 하루 횟수 제한의 기준 */
function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

import { applySlimeStats, continueAsFarm, createBattle, isBossFight, isFinished, setAllies, setGoldMultiplier, stepBattle } from '../core/battle/engine';
import { lastStageId } from '../core/lookup';
import { computeOfflineReward, type OfflineReward } from '../core/idle/offline';
import type { BattleEvent, BattleMode, BattleState } from '../core/model/battle';
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
import type { GameStore } from '../store/gameStore';
import type { PlatformAdapter, SaveEnvelope, SaveRepository } from './ports';
import { newSaveData, restoreSaveData, toEnvelope, type SaveData } from './saveData';
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
  | { type: 'gemsGained'; at: number; amount: number; reason: 'firstClear' | 'rebirth' | 'ad' }
  | { type: 'partyChanged'; at: number }
  | { type: 'purchased'; at: number; sku: string; name: string };
export type SessionListener = (events: readonly SessionEvent[]) => void;
export type StartStatus = 'new' | 'restored' | 'recovered' | 'reset';

export interface SessionDeps {
  config: GameConfig;
  store: GameStore;
  repo: SaveRepository;
  platform: PlatformAdapter;
  seed?: number;
}

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
    this.unsubscribeVisibility = platform.onVisibilityChange((visible) => {
      if (!visible) {
        this.hiddenAt ??= platform.now();
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
  }

  /** Phaser update 에서 매 프레임 호출 */
  tick(frameMs: number): void {
    const battle = this.battle;
    if (!battle || this.deps.platform.now() < this.pausedUntil) return;
    const dt = Math.min(Math.max(frameMs, 0), MAX_FRAME_MS) * this.deps.store.getState().settings.battleSpeed;
    const battleEvents = stepBattle(battle, dt, this.deps.config);
    const after: SessionEvent[] = [];
    for (const e of battleEvents) this.handleBattleEvent(e, after);
    const events: SessionEvent[] = [...battleEvents, ...this.takeGrowth(), ...after];
    if (events.length > 0) this.emit(events);
    if (this.dirty && this.deps.platform.now() - this.lastSavedAt >= SAVE_INTERVAL_MS) void this.saveNow();
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

  /** 지금 진행을 저장 형식으로 */
  snapshot(): SaveEnvelope {
    const { platform, store, config } = this.deps;
    const now = platform.now();
    const { progress, settings } = store.getState();
    return toEnvelope({ ...this.meta, lastActiveAt: now, progress, settings }, config, now);
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
    this.deps.store.setState({ progress, settings: data.settings });
    this.growth = [];
    this.pausedUntil = 0;
    this.emit([this.startBattle()]);
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

/** 기기 날짜 'YYYY-MM-DD' — 하루 횟수 제한의 기준 */
function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

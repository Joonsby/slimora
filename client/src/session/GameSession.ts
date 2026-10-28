import { applySlimeStats, continueAsFarm, createBattle, isFinished, stepBattle } from '../core/battle/engine';
import { lastStageId } from '../core/lookup';
import type { BattleEvent, BattleMode, BattleState } from '../core/model/battle';
import type { GameCommand, RuleError } from '../core/model/commands';
import type { GameConfig } from '../core/model/config';
import type { StageId, UpgradeId } from '../core/model/ids';
import type { ProgressState } from '../core/model/progress';
import { diffGrowth, type GrowthChange } from '../core/progression/absorption';
import { applyCommand } from '../core/progression/applyCommand';
import type { Result } from '../core/result';
import { seedFrom } from '../core/rng';
import { deriveSlimeStats, sameCombatStats } from '../core/stats';
import type { GameStore } from '../store/gameStore';
import type { PlatformAdapter, SaveRepository } from './ports';
import { newSaveData, restoreSaveData, toEnvelope, type SaveData } from './saveData';
import type { BattleSpeed } from './settings';

export type SessionEvent = BattleEvent | GrowthChange | { type: 'battleStarted'; at: number; stageId: StageId; mode: BattleMode };
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
  private readonly seed: number;
  private battleCount = 0;
  private meta: Pick<SaveData, 'installId' | 'createdAt'> = { installId: '', createdAt: 0 };
  private dirty = false;
  private lastSavedAt = 0;
  private unsubscribeVisibility: (() => void) | null = null;
  /** 다음 emit 에 실어 보낼 레벨 · 특성 변화 */
  private growth: GrowthChange[] = [];

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
      if (!visible) void this.saveNow();
    });
    if (status !== 'restored') await this.saveNow();
    return status;
  }

  dispose(): void {
    this.unsubscribeVisibility?.();
    this.listeners.clear();
  }

  /** Phaser update 에서 매 프레임 호출 */
  tick(frameMs: number): void {
    const battle = this.battle;
    if (!battle) return;
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

  setBattleSpeed(battleSpeed: BattleSpeed): void {
    this.deps.store.setState((s) => ({ settings: { ...s.settings, battleSpeed } }));
    this.dirty = true;
  }

  onEvents(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 렌더링용 읽기 전용 뷰. 고치지 말 것 */
  view(): Readonly<BattleState> | null {
    return this.battle;
  }

  async saveNow(): Promise<void> {
    const { repo, platform, store, config } = this.deps;
    const now = platform.now();
    const { progress, settings } = store.getState();
    this.dirty = false;
    this.lastSavedAt = now;
    try {
      await repo.save(toEnvelope({ ...this.meta, lastActiveAt: now, progress, settings }, config, now));
    } catch (e) {
      this.dirty = true;
      console.warn('저장 실패', e);
    }
  }

  /** 렌더링용 읽기 전용 진행 상태 (슬라임 색 등) */
  getProgress(): Readonly<ProgressState> {
    return this.progress();
  }

  private progress(): ProgressState {
    return this.deps.store.getState().progress;
  }

  private apply(cmd: GameCommand): Result<ProgressState, RuleError> {
    const before = this.progress();
    const result = applyCommand(before, cmd, this.deps.config);
    if (result.ok) {
      this.deps.store.setState({ progress: result.value });
      this.dirty = true;
      if (result.value.slime !== before.slime) this.onSlimeChanged(before, result.value);
    }
    return result;
  }

  /** 강화 · 흡수로 슬라임이 바뀌면 진행 중인 전투에 즉시 반영하고 레벨 · 특성 변화를 모은다 */
  private onSlimeChanged(before: ProgressState, after: ProgressState): void {
    const { config } = this.deps;
    this.growth.push(...diffGrowth(before.slime.absorption, after.slime.absorption, config));
    const battle = this.battle;
    if (!battle) return;
    const stats = deriveSlimeStats(after.slime, config);
    if (!sameCombatStats(stats, battle.slime.stats)) applySlimeStats(battle, stats);
  }

  private takeGrowth(): GrowthChange[] {
    const taken = this.growth;
    this.growth = [];
    return taken;
  }

  private handleBattleEvent(e: BattleEvent, after: SessionEvent[]): void {
    switch (e.type) {
      case 'monsterKilled':
        this.apply({ type: 'grantBattleReward', gold: e.gold, kills: { [e.family]: 1 }, absorb: { [e.family]: e.absorb } });
        this.updateHud();
        break;
      case 'slimeDied':
        this.apply({ type: 'recordDeath' });
        break;
      case 'stageCleared':
      case 'challengeFailed': {
        this.apply({ type: e.type, stage: e.stageId });
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
    this.battleCount += 1;
    this.battle = createBattle(
      { stageId: current, mode, slime: deriveSlimeStats(this.progress().slime, this.deps.config), seed: seedFrom(this.seed, current, this.battleCount) },
      this.deps.config,
    );
    this.updateHud();
    return { type: 'battleStarted', at: 0, stageId: current, mode };
  }

  private updateHud(): void {
    const b = this.battle;
    if (!b) return;
    this.deps.store.setState({ hud: { stageId: b.stageId, mode: b.mode, kills: b.kills, killsToClear: b.killsToClear } });
  }

  private emit(events: readonly SessionEvent[]): void {
    for (const listener of this.listeners) listener(events);
  }
}

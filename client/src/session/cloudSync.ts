import type { ProgressState } from '../core/model/progress';
import type { GameSession } from './GameSession';
import type { CloudSave, CloudSaveStore, PlatformAdapter } from './ports';
import { restoreSaveData, SCHEMA_VERSION } from './saveData';

/** 서버에 올리는 최소 간격. 화면이 가려질 때는 바로 올린다 */
export const CLOUD_INTERVAL_MS = 30_000;

export type CloudStartResult = 'uploaded' | 'adopted' | 'same' | 'outdated' | 'failed';

export interface CloudSyncDeps {
  cloud: CloudSaveStore;
  session: GameSession;
  platform: PlatformAdapter;
  /** 서버의 저장으로 바꿨을 때 (시작 직후 · 다른 기기와 충돌했을 때) */
  onAdopted?: () => void;
}

/** 누적 획득 골드는 쓰지 않아도 줄지 않으므로 「얼마나 진행했나」의 기준으로 쓴다 */
const played = (p: ProgressState) => p.lifetime.goldEarned;

/**
 * 기기 저장을 서버와 맞춘다. 기기 저장이 기준이고 서버는 다른 기기 · 재설치를 위한 사본이다.
 * 두 쪽이 다르면 더 많이 진행한 쪽을 남긴다
 */
export class CloudSync {
  /** 마지막으로 맞춘 서버 version. null 이면 아직 서버와 맞추지 못했다 */
  private version: number | null = null;
  private started = false;
  private disabled = false;
  private dirty = false;
  private busy = false;
  private again = false;
  private visible = true;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly deps: CloudSyncDeps) {
    deps.platform.onVisibilityChange((visible) => (this.visible = visible));
    deps.session.onSaved(() => this.queue());
  }

  /** 게임이 시작된 뒤 한 번. 서버 저장과 비교해 올리거나 받아온다 */
  async start(): Promise<CloudStartResult> {
    this.started = true;
    this.busy = true;
    this.lastAttemptAt = this.deps.platform.now();
    try {
      return await this.reconcile(await this.deps.cloud.load());
    } catch (e) {
      console.warn('서버 저장 연결 실패', e);
      return 'failed';
    } finally {
      this.busy = false;
    }
  }

  private queue(): void {
    this.dirty = true;
    if (!this.started || this.disabled) return;
    if (!this.visible || this.deps.platform.now() - this.lastAttemptAt >= CLOUD_INTERVAL_MS) void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.busy) {
      this.again ||= !this.visible;
      return;
    }
    this.busy = true;
    this.lastAttemptAt = this.deps.platform.now();
    try {
      if (this.version === null) await this.reconcile(await this.deps.cloud.load());
      else await this.push(this.version);
    } catch (e) {
      // dirty 가 남아 다음 저장 때 다시 올린다
      console.warn('서버 저장 실패', e);
    } finally {
      this.busy = false;
      if (this.again) {
        this.again = false;
        if (this.dirty && !this.disabled) void this.flush();
      }
    }
  }

  private async reconcile(remote: CloudSave | null, retries = 1): Promise<CloudStartResult> {
    const { session } = this.deps;
    if (remote && remote.envelope.schemaVersion > SCHEMA_VERSION) return this.disable();
    // 읽을 수 없는 서버 저장은 덮어쓴다
    const theirs = remote ? restoreSaveData(remote.envelope, session.config) : null;
    const diff = theirs ? played(theirs.progress) - played(session.getProgress()) : -1;
    if (remote && diff > 0) {
      this.version = remote.version;
      session.adopt(remote.envelope);
      this.deps.onAdopted?.();
      return 'adopted';
    }
    if (remote && diff === 0) {
      this.version = remote.version;
      return 'same';
    }
    return this.push(remote?.version ?? 0, retries);
  }

  private async push(baseVersion: number, retries = 1): Promise<CloudStartResult> {
    this.dirty = false;
    let result;
    try {
      result = await this.deps.cloud.save(this.deps.session.snapshot(), baseVersion, !this.visible);
    } catch (e) {
      this.dirty = true;
      throw e;
    }
    switch (result.status) {
      case 'ok':
        this.version = result.version;
        return 'uploaded';
      case 'outdated':
        return this.disable();
      case 'conflict':
        // 다른 기기가 먼저 저장했다 — 그 저장과 다시 비교한다
        this.version = null;
        this.dirty = true;
        if (retries > 0) return this.reconcile(result.current, retries - 1);
        throw new Error('서버 저장 충돌이 계속된다');
    }
  }

  /** 서버에 이 빌드보다 새 형식의 저장이 있다. 덮어쓰지 않게 이번 실행 동안 올리지 않는다 */
  private disable(): 'outdated' {
    this.disabled = true;
    return 'outdated';
  }
}

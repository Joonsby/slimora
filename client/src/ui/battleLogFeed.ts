import { findMonster, findStage } from '../core/lookup';
import { findForm } from '../core/progression/forms';
import type { GameConfig } from '../core/model/config';
import type { GameSession, SessionEvent } from '../session/GameSession';
import { pushLog, type GameStore, type GameStoreState, type LogEntry } from '../store/gameStore';
import { describeEffects } from './effectText';

/** 세션 이벤트를 전투 로그 문장으로 바꿔 스토어에 쌓는다. 평타는 남기지 않는다 */
export function attachBattleLog(session: GameSession, store: GameStore, cfg: GameConfig): () => void {
  return session.onEvents((events) => {
    const state = store.getState();
    const entries: Omit<LogEntry, 'id'>[] = [];
    for (const e of events) {
      const entry = describe(e, cfg, state);
      if (entry) entries.push(entry);
    }
    pushLog(store, entries);
  });
}

function describe(e: SessionEvent, cfg: GameConfig, state: GameStoreState): Omit<LogEntry, 'id'> | null {
  switch (e.type) {
    case 'battleStarted': {
      const stage = findStage(cfg, e.stageId);
      return { text: `스테이지 ${e.stageId} ${stage.name} — ${e.mode === 'challenge' ? '도전 시작' : '사냥 시작'}`, tone: 'normal' };
    }
    case 'monsterKilled':
      return { text: `${findMonster(cfg, e.defId).name} 처치 +${e.gold} G`, tone: 'gold' };
    case 'damage':
      return e.crit && e.to === 'monster' ? { text: `치명타! ${e.amount} 피해`, tone: 'good' } : null;
    case 'burnApplied':
      return e.to === 'slime' && e.stacks === 1 ? { text: '화상을 입었다', tone: 'bad' } : null;
    case 'slimeDied':
      return { text: '슬라임이 쓰러졌다', tone: 'bad' };
    case 'respawned':
      return { text: '슬라임이 다시 일어났다', tone: 'normal' };
    case 'stageCleared':
      return { text: `스테이지 ${e.stageId} 클리어!`, tone: 'good' };
    case 'levelUp':
      return { text: `레벨 업! 슬라임 Lv ${e.level}`, tone: 'good' };
    case 'traitTierUp': {
      const trait = cfg.traits.find((t) => t.family === e.family);
      const family = cfg.families.find((f) => f.id === e.family)?.name ?? e.family;
      const effects = trait?.tiers[e.tier - 1]?.effects ?? [];
      return { text: `${family} 특성 ${e.tier}단계 — ${describeEffects(effects)}`, tone: 'good' };
    }
    case 'challengeFailed': {
      const { mode, current } = state.progress.stage;
      const head = e.reason === 'timeout' ? '시간 초과' : '도전 실패';
      return { text: mode === 'farm' ? `${head} — 스테이지 ${current} 사냥터로 후퇴` : `${head} — 다시 도전`, tone: 'bad' };
    }
    case 'monsterSpawned': {
      if (!e.boss) return null;
      const limit = findStage(cfg, state.hud.stageId).boss?.timeLimitMs ?? 0;
      return { text: `${findMonster(cfg, e.defId).name} 등장! 제한시간 ${Math.round(limit / 1000)}초`, tone: 'bad' };
    }
    case 'enraged':
      return e.side === 'monster' ? { text: '보스가 격노했다 — 공격이 빨라진다', tone: 'bad' } : null;
    case 'formAvailable':
      return { text: `${findForm(cfg, e.form)?.name ?? e.form}으로 진화할 수 있다`, tone: 'good' };
    case 'evolved':
      return { text: `${findForm(cfg, e.form)?.name ?? e.form}으로 진화!`, tone: 'good' };
    case 'masteryUp':
      return { text: `${findForm(cfg, e.form)?.name ?? e.form} 숙련 Lv ${e.level}`, tone: 'good' };
    default:
      return null;
  }
}

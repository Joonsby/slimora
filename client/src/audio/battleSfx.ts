import type { DungeonEvent } from '../core/model/dungeon';
import type { GameSession, SessionEvent } from '../session/GameSession';
import type { GameStore } from '../store/gameStore';
import type { Sfx, SfxName } from './sfx';

/** 세션 이벤트에 효과음을 붙인다. 설정의 소리 켜기/끄기를 따른다 */
export function attachBattleSfx(session: GameSession, store: GameStore, sfx: Sfx): () => void {
  sfx.setEnabled(store.getState().settings.sound);
  const unsubscribeStore = store.subscribe((s, prev) => {
    if (s.settings.sound !== prev.settings.sound) sfx.setEnabled(s.settings.sound);
  });
  const unsubscribeEvents = session.onEvents((events) => {
    for (const e of events) {
      const name = soundOf(e);
      if (name) sfx.play(name);
    }
  });
  const unsubscribeDungeon = session.onDungeonEvents((events) => {
    for (const e of events) {
      const name = dungeonSoundOf(e);
      if (name) sfx.play(name);
    }
  });
  return () => {
    unsubscribeStore();
    unsubscribeEvents();
    unsubscribeDungeon();
  };
}

function soundOf(e: SessionEvent): SfxName | null {
  switch (e.type) {
    case 'damage':
      if (e.source !== 'hit') return null;
      if (e.to === 'slime') return e.heavy ? 'heavy' : 'hurt';
      return e.crit ? 'crit' : 'hit';
    case 'monsterKilled':
      return 'kill';
    case 'levelUp':
    case 'traitTierUp':
    case 'masteryUp':
      return 'level';
    case 'stageCleared':
      return 'clear';
    case 'challengeFailed':
    case 'slimeDied':
      return 'fail';
    case 'monsterSpawned':
      return e.boss ? 'boss' : null;
    case 'evolved':
    case 'rebirth':
      return 'evolve';
    case 'offlineReward':
    case 'gemsGained':
      return 'coin';
    case 'allyAttack':
      return 'ally';
    case 'ultimate':
      return e.interrupted ? 'block' : 'ultimate';
    case 'ultimateReady':
      return 'level';
    case 'heavyWarning':
      return e.by === 'monster' ? 'warn' : null;
    default:
      return null;
  }
}

function dungeonSoundOf(e: DungeonEvent): SfxName | null {
  switch (e.type) {
    case 'dHit':
      if (e.source === 'hit') return e.crit ? 'crit' : 'hit';
      return e.source === 'split' ? 'hit' : null;
    case 'dHurt':
      return e.source === 'burn' ? null : e.heavy ? 'heavy' : 'hurt';
    case 'dKilled':
      return e.boss ? 'clear' : 'kill';
    case 'dExplosion':
      return 'explosion';
    case 'dLightning':
      return e.mini ? null : 'zap';
    case 'dShield':
      return 'shield';
    case 'dShieldBreak':
      return 'shieldBreak';
    case 'dUltimate':
      return e.blocked || e.broke ? 'block' : 'ultimate';
    case 'dUltReady':
      return 'level';
    case 'dBossCast':
      return 'warn';
    case 'dSpawn':
      return e.boss ? 'boss' : null;
    case 'dWaveClear':
      return 'coin';
    case 'dSynergy':
      return 'synergy';
    case 'dCleared':
      return 'evolve';
    case 'dFailed':
      return 'fail';
    default:
      return null;
  }
}

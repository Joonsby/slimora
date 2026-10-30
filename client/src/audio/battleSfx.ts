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
  return () => {
    unsubscribeStore();
    unsubscribeEvents();
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
    default:
      return null;
  }
}

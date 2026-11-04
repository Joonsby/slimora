import Phaser from 'phaser';
import type { GameSession } from '../session/GameSession';
import { BattleScene } from './BattleScene';
import { DungeonScene } from './DungeonScene';

/** 기기 픽셀로 그린다 (CSS 픽셀로 그리면 휴대폰에서 흐리다). 배율은 성능을 위해 2 까지. onShown = 전투 화면을 처음 그린 뒤 */
export function createGame(parent: HTMLElement, session: GameSession, onShown?: () => void): Phaser.Game {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // 부모 폭이나 높이가 0 이면 WebGL 프레임버퍼 생성이 실패해 게임 루프가 멈춘다
  const size = () => ({ w: Math.max(1, Math.round(parent.clientWidth * dpr)), h: Math.max(1, Math.round(parent.clientHeight * dpr)) });
  const { w, h } = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#140f26',
    scale: { mode: Phaser.Scale.NONE, width: w, height: h, zoom: 1 / dpr },
    banner: false,
    audio: { noAudio: true },
    // 던전 장면은 처음 던전에 들어갈 때 시작한다
    scene: [new BattleScene(session, dpr), new DungeonScene(session, dpr)],
  });
  const observer = new ResizeObserver(() => {
    const next = size();
    if (next.w !== game.scale.width || next.h !== game.scale.height) game.scale.resize(next.w, next.h);
  });
  observer.observe(parent);
  // 던전에 들어가고 나올 때 장면을 바꾼다. 한 번에 한 장면만 돌며 세션을 진행한다
  const offEvents = session.onEvents((events) => {
    for (const e of events) {
      if (e.type === 'dungeonStarted') {
        game.scene.run('dungeon');
        game.scene.sleep('battle');
      } else if (e.type === 'dungeonClosed') {
        game.scene.run('battle');
        game.scene.sleep('dungeon');
      }
    }
  });
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    observer.disconnect();
    offEvents();
  });
  if (onShown) {
    // 전투 장면이 만들어진(running) 뒤 첫 프레임을 그리고 나면
    const check = () => {
      if (!game.scene.isActive('battle')) return;
      game.events.off(Phaser.Core.Events.POST_RENDER, check);
      onShown();
    };
    game.events.on(Phaser.Core.Events.POST_RENDER, check);
  }
  return game;
}

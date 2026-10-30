import Phaser from 'phaser';
import type { GameSession } from '../session/GameSession';
import { BattleScene } from './BattleScene';

/** 기기 픽셀로 그린다 (CSS 픽셀로 그리면 휴대폰에서 흐리다). 배율은 성능을 위해 2 까지 */
export function createGame(parent: HTMLElement, session: GameSession): Phaser.Game {
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
    scene: [new BattleScene(session, dpr)],
  });
  const observer = new ResizeObserver(() => {
    const next = size();
    if (next.w !== game.scale.width || next.h !== game.scale.height) game.scale.resize(next.w, next.h);
  });
  observer.observe(parent);
  game.events.once(Phaser.Core.Events.DESTROY, () => observer.disconnect());
  return game;
}

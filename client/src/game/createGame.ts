import Phaser from 'phaser';
import type { GameSession } from '../session/GameSession';
import { BattleScene } from './BattleScene';

export function createGame(parent: HTMLElement, session: GameSession): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1d2436',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 360,
      height: parent.clientHeight || 320,
      // 부모 폭이나 높이가 0 이면 WebGL 프레임버퍼 생성이 실패해 게임 루프가 멈춘다
      min: { width: 1, height: 1 },
    },
    banner: false,
    audio: { noAudio: true },
    scene: [new BattleScene(session)],
  });
}

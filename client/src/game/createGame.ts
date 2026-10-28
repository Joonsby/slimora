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
    },
    banner: false,
    audio: { noAudio: true },
    scene: [new BattleScene(session)],
  });
}

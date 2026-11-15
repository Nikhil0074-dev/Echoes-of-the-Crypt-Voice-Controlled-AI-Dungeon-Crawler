import Phaser from 'phaser';
import type { GameController } from '../controller/GameController';
import { DungeonScene } from './DungeonScene';
import { TILE } from './PixelArt';

export function createPhaserGame(parent: HTMLElement, controller: GameController): Phaser.Game {
  const s = controller.getSnapshot().state;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: s.width * TILE,
    height: s.height * TILE,
    backgroundColor: '#0b0716',
    pixelArt: true,
    roundPixels: true,
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: []
  });
  game.scene.add('DungeonScene', DungeonScene, true, { controller });
  return game;
}

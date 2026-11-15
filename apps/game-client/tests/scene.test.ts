// @vitest-environment jsdom
import 'vitest-canvas-mock';
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { parseLocal } from '@dungeon/ai-engine';
import { parseLevel } from '@dungeon/game-core';
import { GameController } from '../src/controller/GameController';
import { SaveManager } from '../src/persistence/saveManager';
import { DungeonScene } from '../src/game/DungeonScene';
import { TILE } from '../src/game/PixelArt';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as unknown as Storage;
};

// jsdom never decodes images, so Phaser's built-in base64 textures would never report "ready".
class FakeImage {
  width = 32; height = 32; onload: (() => void) | null = null; onerror: (() => void) | null = null;
  private _src = '';
  set src(v: string) { this._src = v; setTimeout(() => this.onload?.(), 0); }
  get src() { return this._src; }
  addEventListener(ev: string, fn: () => void) { if (ev === 'load') this.onload = fn; }
  removeEventListener() {}
}
(window as unknown as { Image: unknown }).Image = FakeImage;
(globalThis as unknown as { Image: unknown }).Image = FakeImage;

window.focus = () => {};

let game: Phaser.Game | null = null;
afterEach(() => { game?.destroy(true); game = null; });

async function boot(rows: string[]) {
  const c = new GameController({
    interpret: async (t, x) => parseLocal(t, x), saves: new SaveManager(mem()), phaseResetMs: null, persistSettings: false,
    state: parseLevel({ id: 't', name: 'T', rows })
  });
  c.sfx.enabled = false;
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  game = new Phaser.Game({ type: Phaser.CANVAS, parent, width: rows[0]!.length * TILE, height: rows.length * TILE, banner: false, audio: { noAudio: true }, scene: [] });
  game.scene.add('DungeonScene', DungeonScene, true, { controller: c });
  await new Promise(r => setTimeout(r, 400));
  const scene = game.scene.getScene('DungeonScene') as DungeonScene;
  return { c, scene };
}

describe('DungeonScene (headless Phaser)', () => {
  it('boots, builds textures and the world from the controller state', async () => {
    const { scene } = await boot(['#########', '#P..G.CX#', '#.T.K.D.#', '#########']);
    expect(scene.sys.isActive()).toBe(true);
    for (const k of ['player', 'goblin', 'chest', 'door', 'wall0', 'floor1', 'glow', 'shadow']) expect(scene.textures.exists(k), k).toBe(true);
  });

  it('plays a full command (move, bump, fight, pickup, door, chest) without errors', async () => {
    const { c, scene } = await boot(['##########', '#PG.K.DC.#', '#........#', '##########']);
    await c.submitText('attack the goblin');
    await c.submitText('attack the goblin');
    await c.submitText('move east 2 steps');
    await c.submitText('pick up the key');
    await c.submitText('go to the door');
    await c.submitText('open the door');
    await c.submitText('move west 20');
    await c.submitText('look around');
    await new Promise(r => setTimeout(r, 3000));
    expect(scene.sys.isActive()).toBe(true);
    expect(c.getSnapshot().state.enemies[0]!.alive).toBe(false);
    expect(c.getSnapshot().state.doors[0]!.state).toBe('OPEN');
  }, 20000);

  it('rebuilds on new game and survives death', async () => {
    const { c, scene } = await boot(['#####', '#PS.#', '#####']);
    for (let i = 0; i < 30 && c.getSnapshot().state.status === 'PLAYING'; i++) await c.submitText('defend');
    await new Promise(r => setTimeout(r, 1500));
    expect(c.getSnapshot().state.status).toBe('DEAD');
    c.newGame();
    await new Promise(r => setTimeout(r, 200));
    expect(scene.sys.isActive()).toBe(true);
  }, 20000);
});

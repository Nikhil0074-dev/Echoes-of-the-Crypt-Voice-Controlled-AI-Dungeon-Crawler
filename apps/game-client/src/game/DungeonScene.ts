import Phaser from 'phaser';
import type { AbsDirection, EnemyState, GameEvent, GameState, Vec2 } from '@dungeon/shared';
import { VIEW_RADIUS } from '@dungeon/game-core';
import type { GameController, ResultEvent } from '../controller/GameController';
import { buildTextures, TILE } from './PixelArt';
import { ITEM_SPRITE } from './sprites';

const FONT = '"Press Start 2P", monospace';
const FOG_COLOR = 0x07040f;
const STEP_MS = 130;

interface EnemyView { container: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Graphics }

const px = (p: Vec2): { x: number; y: number } => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });

export class DungeonScene extends Phaser.Scene {
  private controller!: GameController;
  private state!: GameState;
  private explored: boolean[][] = [];
  private light: Vec2 = { x: 0, y: 0 };
  private world!: Phaser.GameObjects.Container;
  private doors = new Map<string, Phaser.GameObjects.Image>();
  private chests = new Map<string, Phaser.GameObjects.Image>();
  private traps = new Map<string, Phaser.GameObjects.Image>();
  private items = new Map<string, Phaser.GameObjects.Image>();
  private enemies = new Map<string, EnemyView>();
  private exits: Phaser.GameObjects.Image[] = [];
  private player!: Phaser.GameObjects.Container;
  private playerSprite!: Phaser.GameObjects.Image;
  private fog!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Image;
  private queue: ResultEvent[] = [];
  private playing = false;
  private offs: (() => void)[] = [];

  constructor() { super('DungeonScene'); }

  init(data: { controller: GameController }): void {
    this.controller = data.controller;
  }

  create(): void {
    buildTextures(this);
    this.cameras.main.setBackgroundColor('#0b0716');
    this.buildWorld(this.controller.getSnapshot().state);
    this.offs.push(
      this.controller.onResult(r => { this.queue.push(r); void this.drain(); }),
      this.controller.onReset(s => { this.queue = []; this.buildWorld(s); })
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.offs.forEach(o => o()); this.offs = []; });
  }

  override update(time: number): void {
    if (!this.player || !this.glow) return;
    this.glow.setPosition(this.player.x, this.player.y);
    this.glow.setAlpha(0.8 + Math.sin(time / 110) * 0.06 + Math.sin(time / 37) * 0.04);
  }

  // ---------- construction ----------
  private clearWorld(): void {
    this.tweens.killAll();
    this.world?.destroy(true);
    this.fog?.destroy();
    this.glow?.destroy();
    this.player?.destroy(true);
    this.doors.clear(); this.chests.clear(); this.traps.clear(); this.items.clear(); this.enemies.clear(); this.exits = [];
  }

  private buildWorld(state: GameState): void {
    this.clearWorld();
    this.state = state;
    this.explored = state.explored.map(r => [...r]);
    this.light = { ...state.player.pos };
    this.cameras.main.setBounds(0, 0, state.width * TILE, state.height * TILE);

    this.world = this.add.container(0, 0);
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const t = state.terrain[y]![x]!;
        const variant = (x * 7 + y * 13) % 3;
        const img = this.add.image(x * TILE, y * TILE, t === 'WALL' ? `wall${variant}` : `floor${variant}`).setOrigin(0, 0);
        this.world.add(img);
        if (t === 'EXIT') {
          const e = this.add.image(x * TILE, y * TILE, 'exit').setOrigin(0, 0);
          this.world.add(e);
          this.exits.push(e);
          this.tweens.add({ targets: e, alpha: 0.75, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }
      }
    }
    for (const t of state.traps) this.traps.set(t.id, this.addTile(t.pos, 'trap'));
    for (const d of state.doors) this.doors.set(d.id, this.addTile(d.pos, 'door'));
    for (const c of state.chests) this.chests.set(c.id, this.addTile(c.pos, 'chest'));
    for (const e of state.enemies) this.enemies.set(e.id, this.makeEnemy(e));
    for (const i of state.items) this.items.set(i.id, this.makeItem(i.id, i.item, i.pos));

    this.player = this.add.container(px(state.player.pos).x, px(state.player.pos).y);
    const shadow = this.add.image(0, 16, 'shadow');
    this.playerSprite = this.add.image(0, -2, 'player');
    this.player.add([shadow, this.playerSprite]);
    this.player.setDepth(10);
    this.tweens.add({ targets: this.playerSprite, y: -4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.glow = this.add.image(this.player.x, this.player.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(20);
    this.glow.setScale((VIEW_RADIUS * 2 * TILE) / 256 * 1.1);
    this.fog = this.add.graphics().setDepth(30);
    this.sync(state);
  }

  private addTile(pos: Vec2, key: string): Phaser.GameObjects.Image {
    const img = this.add.image(pos.x * TILE, pos.y * TILE, key).setOrigin(0, 0);
    this.world.add(img);
    return img;
  }

  private makeEnemy(e: EnemyState): EnemyView {
    const p = px(e.pos);
    const container = this.add.container(p.x, p.y).setDepth(9);
    const shadow = this.add.image(0, 16, 'shadow');
    const sprite = this.add.image(0, -2, e.kind);
    const bar = this.add.graphics();
    container.add([shadow, sprite, bar]);
    this.tweens.add({ targets: sprite, y: -4, duration: 600 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return { container, sprite, bar };
  }

  private makeItem(id: string, item: string, pos: Vec2): Phaser.GameObjects.Image {
    const p = px(pos);
    const img = this.add.image(p.x, p.y, ITEM_SPRITE[item] ?? 'potion').setScale(0.9).setDepth(5);
    this.tweens.add({ targets: img, y: p.y - 3, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    void id;
    return img;
  }

  // ---------- state sync ----------
  private visible(p: Vec2, from: Vec2 = this.light): boolean {
    const dx = p.x - from.x, dy = p.y - from.y;
    return dx * dx + dy * dy <= VIEW_RADIUS * VIEW_RADIUS;
  }
  private isExplored(p: Vec2): boolean { return this.explored[p.y]?.[p.x] === true; }

  private drawBar(v: EnemyView, e: EnemyState): void {
    v.bar.clear();
    const w = 28, x = -w / 2, y = -26;
    v.bar.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, 6);
    v.bar.fillStyle(0x7a1d28, 1).fillRect(x, y, w, 4);
    v.bar.fillStyle(0xe5484d, 1).fillRect(x, y, Math.max(0, Math.round((w * e.health) / e.maxHealth)), 4);
  }

  /** Make the display match `state` exactly (called after every animated result). */
  private sync(state: GameState): void {
    this.state = state;
    this.explored = state.explored.map(r => [...r]);
    this.light = { ...state.player.pos };

    for (const d of state.doors) {
      const img = this.doors.get(d.id);
      if (!img) continue;
      img.setTexture(d.state === 'OPEN' ? 'doorOpen' : d.state === 'LOCKED' ? 'doorLocked' : 'door');
      img.setVisible(this.isExplored(d.pos));
    }
    for (const c of state.chests) {
      const img = this.chests.get(c.id);
      img?.setTexture(c.opened ? 'chestOpen' : 'chest').setVisible(this.isExplored(c.pos));
    }
    for (const t of state.traps) {
      const img = this.traps.get(t.id);
      img?.setVisible(this.isExplored(t.pos)).setTint(t.triggered ? 0xff8080 : 0xffffff);
    }
    this.exits.forEach(e => e.setVisible(this.isExplored({ x: Math.round(e.x / TILE), y: Math.round(e.y / TILE) })));

    const wanted = new Set(state.items.map(i => i.id));
    for (const [id, img] of this.items) if (!wanted.has(id)) { this.tweens.killTweensOf(img); img.destroy(); this.items.delete(id); }
    for (const i of state.items) {
      if (!this.items.has(i.id)) this.items.set(i.id, this.makeItem(i.id, i.item, i.pos));
      this.items.get(i.id)!.setVisible(this.isExplored(i.pos));
    }

    for (const e of state.enemies) {
      const v = this.enemies.get(e.id);
      if (!v) continue;
      const p = px(e.pos);
      v.container.setPosition(p.x, p.y);
      this.drawBar(v, e);
      v.container.setVisible(e.alive && this.visible(e.pos));
      v.container.setAlpha(1).setScale(1);
    }

    const pp = px(state.player.pos);
    this.player.setPosition(pp.x, pp.y).setAlpha(state.player.alive ? 1 : 0.5);
    this.playerSprite.setFlipX(state.player.facing === 'WEST').setRotation(state.player.alive ? 0 : Math.PI / 2);
    this.drawFog();
  }

  private drawFog(): void {
    const g = this.fog;
    g.clear();
    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        let a: number;
        if (!this.explored[y]![x]) a = 0.97;
        else if (!this.visible({ x, y })) a = 0.6;
        else {
          const d = Math.hypot(x - this.light.x, y - this.light.y);
          a = Math.min(0.5, Math.max(0, (d - 2.2) * 0.13));
        }
        if (a > 0) { g.fillStyle(FOG_COLOR, a); g.fillRect(x * TILE, y * TILE, TILE, TILE); }
      }
    }
  }

  private markExplored(center: Vec2): void {
    const r = Math.ceil(VIEW_RADIUS);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > VIEW_RADIUS * VIEW_RADIUS) continue;
      const row = this.explored[center.y + dy];
      if (row && center.x + dx >= 0 && center.x + dx < this.state.width) row[center.x + dx] = true;
    }
  }

  // ---------- animation ----------
  private async drain(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.queue.length > 0 && this.sys.isActive()) {
        const r = this.queue.shift()!;
        for (const ev of r.events) { if (!this.sys.isActive()) break; await this.play(ev, r); }
        if (this.sys.isActive()) this.sync(r.state);
      }
    } finally { this.playing = false; }
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise(resolve => {
      if (!this.sys.isActive()) { resolve(); return; }
      this.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  private viewOf(id: string): Phaser.GameObjects.Container | undefined {
    return id === 'player' ? this.player : this.enemies.get(id)?.container;
  }

  private float(at: { x: number; y: number }, text: string, color: string): void {
    const t = this.add.text(at.x, at.y - 20, text, { fontFamily: FONT, fontSize: '10px', color, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private flash(sprite: Phaser.GameObjects.Image): void {
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(90, () => { if (sprite.active) sprite.clearTint(); });
  }

  private sfx(name: Parameters<GameController['sfx']['play']>[0]): void { this.controller.sfx.play(name); }

  private async play(ev: GameEvent, r: ResultEvent): Promise<void> {
    switch (ev.kind) {
      case 'face': this.playerSprite.setFlipX(ev.direction === 'WEST'); return;
      case 'bump': {
        this.sfx('bump');
        const x = this.player.x;
        await this.tween({ targets: this.player, x: x + 3, duration: 40, yoyo: true, repeat: 1 });
        this.player.x = x;
        return;
      }
      case 'move': {
        this.sfx('step');
        this.light = { ...ev.to };
        this.markExplored(ev.to);
        this.drawFog();
        const p = px(ev.to);
        await this.tween({ targets: this.player, x: p.x, y: p.y, duration: STEP_MS, ease: 'Sine.easeInOut' });
        return;
      }
      case 'enemyMove': {
        const v = this.viewOf(ev.id);
        if (!v) return;
        const p = px(ev.to);
        v.setVisible(this.visible(ev.to));
        await this.tween({ targets: v, x: p.x, y: p.y, duration: STEP_MS, ease: 'Sine.easeInOut' });
        return;
      }
      case 'attack': {
        const a = this.viewOf(ev.attacker), t = this.viewOf(ev.target);
        if (!a || !t) return;
        const dx = Math.sign(t.x - a.x) * 10, dy = Math.sign(t.y - a.y) * 10;
        const { x, y } = a;
        this.sfx(ev.target === 'player' ? 'hurt' : 'hit');
        await this.tween({ targets: a, x: x + dx, y: y + dy, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
        a.setPosition(x, y);
        return;
      }
      case 'damage': {
        const v = this.viewOf(ev.target);
        if (!v) return;
        this.float(v, `-${ev.amount}`, ev.target === 'player' ? '#ff6b6b' : '#ffd27a');
        const spr = ev.target === 'player' ? this.playerSprite : this.enemies.get(ev.target)?.sprite;
        if (spr) this.flash(spr);
        if (ev.target === 'player') this.cameras.main.shake(120, 0.004);
        else {
          const e = r.state.enemies.find(x => x.id === ev.target);
          const view = this.enemies.get(ev.target);
          if (e && view) this.drawBar(view, e);
        }
        return;
      }
      case 'heal': this.sfx('heal'); this.float(this.player, `+${ev.amount}`, '#7bd88f'); return;
      case 'defend': this.float(this.player, 'GUARD', '#6ea8ff'); return;
      case 'enemyDefeated': {
        const v = this.enemies.get(ev.id);
        if (!v) return;
        this.float(v.container, `+${ev.xp}XP`, '#f5c542');
        this.sfx('pickup');
        await this.tween({ targets: v.container, alpha: 0, scale: 0.6, duration: 320 });
        return;
      }
      case 'door': {
        this.sfx('open');
        const img = this.doors.get(ev.id);
        if (img) img.setTexture(ev.state === 'OPEN' ? 'doorOpen' : 'door').setVisible(true);
        return;
      }
      case 'chest': {
        this.sfx('open');
        const img = this.chests.get(ev.id);
        if (img) { img.setTexture('chestOpen'); this.float({ x: img.x + TILE / 2, y: img.y + TILE / 2 }, `+${ev.gold}G`, '#f5c542'); }
        return;
      }
      case 'pickup': {
        this.sfx('pickup');
        const img = this.items.get(ev.id);
        if (img) { this.items.delete(ev.id); this.tweens.killTweensOf(img); await this.tween({ targets: img, y: img.y - 16, alpha: 0, scale: 1.3, duration: 220 }); img.destroy(); }
        return;
      }
      case 'drop': case 'equip': this.sfx('pickup'); return;
      case 'trap': {
        this.sfx('hurt');
        const img = this.traps.get(ev.id);
        if (img) img.setTint(0xff8080);
        return;
      }
      case 'levelUp': this.sfx('levelup'); this.float(this.player, `LEVEL ${ev.level}!`, '#f5c542'); return;
      case 'objective': this.sfx('pickup'); this.float(this.player, '★ OBJECTIVE', '#7bd88f'); return;
      case 'win': this.sfx('win'); this.cameras.main.flash(500, 255, 220, 140); return;
      case 'playerDied': {
        this.sfx('death');
        this.cameras.main.shake(300, 0.008);
        await this.tween({ targets: this.playerSprite, rotation: Math.PI / 2, duration: 400 });
        return;
      }
    }
  }
}

export type { AbsDirection };

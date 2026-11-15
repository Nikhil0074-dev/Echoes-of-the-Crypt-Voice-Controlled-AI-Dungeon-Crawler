import Phaser from 'phaser';
import { PALETTE, SPRITES, SPRITE_SIZE } from './sprites';

export const SCALE = 3;
export const TILE = SPRITE_SIZE * SCALE;

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number): CanvasRenderingContext2D | null {
  if (scene.textures.exists(key)) return null;
  const tex = scene.textures.createCanvas(key, w, h);
  return tex ? tex.getContext() : null;
}
function refresh(scene: Phaser.Scene, key: string): void {
  const t = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  t.refresh();
}
const hash = (x: number, y: number, s: number): number => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/** Generates every texture procedurally so the game ships with zero binary assets. */
export function buildTextures(scene: Phaser.Scene): void {
  for (const [name, rows] of Object.entries(SPRITES)) {
    const ctx = canvasTexture(scene, name, TILE, TILE);
    if (!ctx) continue;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        if (ch === '.') continue;
        ctx.fillStyle = PALETTE[ch] ?? '#ff00ff';
        ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    });
    refresh(scene, name);
  }

  // walls: staggered bricks with deterministic colour variation
  for (let v = 0; v < 3; v++) {
    const key = `wall${v}`;
    const ctx = canvasTexture(scene, key, TILE, TILE);
    if (!ctx) continue;
    ctx.fillStyle = '#241b38';
    ctx.fillRect(0, 0, TILE, TILE);
    const bh = TILE / 4;
    for (let row = 0; row < 4; row++) {
      const off = row % 2 === 0 ? 0 : TILE / 4;
      for (let i = -1; i < 3; i++) {
        const x = i * (TILE / 2) + off;
        const shade = hash(i, row, v);
        ctx.fillStyle = shade < 0.33 ? '#4d3f6b' : shade < 0.66 ? '#574875' : '#44385f';
        ctx.fillRect(x + 1, row * bh + 1, TILE / 2 - 2, bh - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + 1, row * bh + 1, TILE / 2 - 2, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + 1, row * bh + bh - 3, TILE / 2 - 2, 2);
      }
    }
    refresh(scene, key);
  }

  // floors: dark flagstones
  for (let v = 0; v < 3; v++) {
    const key = `floor${v}`;
    const ctx = canvasTexture(scene, key, TILE, TILE);
    if (!ctx) continue;
    ctx.fillStyle = v === 1 ? '#201735' : '#1b1330';
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, TILE, 2);
    ctx.fillRect(0, 0, 2, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, TILE - 2, TILE, 2);
    ctx.fillRect(TILE - 2, 0, 2, TILE);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = hash(i, v, 7) > 0.5 ? 'rgba(138,79,214,0.10)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(Math.floor(hash(i, 1, v) * (TILE - 6)) + 2, Math.floor(hash(i, 2, v) * (TILE - 6)) + 2, 3 + (i % 2) * 3, 3);
    }
    refresh(scene, key);
  }

  // soft torch glow and character shadow
  const glow = canvasTexture(scene, 'glow', 256, 256);
  if (glow) {
    const g = glow.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,190,100,0.55)');
    g.addColorStop(0.5, 'rgba(255,140,60,0.18)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    glow.fillStyle = g;
    glow.fillRect(0, 0, 256, 256);
    refresh(scene, 'glow');
  }
  const shadow = canvasTexture(scene, 'shadow', TILE, 16);
  if (shadow) {
    shadow.fillStyle = 'rgba(0,0,0,0.45)';
    shadow.beginPath();
    shadow.ellipse(TILE / 2, 8, 15, 5, 0, 0, Math.PI * 2);
    shadow.fill();
    refresh(scene, 'shadow');
  }
  const spark = canvasTexture(scene, 'spark', 4, 4);
  if (spark) { spark.fillStyle = '#ffd27a'; spark.fillRect(0, 0, 4, 4); refresh(scene, 'spark'); }
}

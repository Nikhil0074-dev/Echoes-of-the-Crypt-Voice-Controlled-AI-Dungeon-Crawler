import type { AbsDirection, GameState, Vec2, EnemyState, DoorState, ChestState } from '@dungeon/shared';
import { DIRECTION_VECTORS, OPPOSITE } from '@dungeon/shared';
import { VIEW_RADIUS } from './constants';

export const posKey = (p: Vec2): string => `${p.x},${p.y}`;
export const samePos = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;
export const manhattan = (a: Vec2, b: Vec2): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const addDir = (p: Vec2, d: AbsDirection): Vec2 => ({ x: p.x + DIRECTION_VECTORS[d].x, y: p.y + DIRECTION_VECTORS[d].y });
export const opposite = (d: AbsDirection): AbsDirection => OPPOSITE[d];
export const inBounds = (s: GameState, p: Vec2): boolean => p.x >= 0 && p.y >= 0 && p.x < s.width && p.y < s.height;

export function directionBetween(from: Vec2, to: Vec2): AbsDirection | undefined {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx === 0 && dy === 0) return undefined;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'EAST' : 'WEST';
  return dy > 0 ? 'SOUTH' : 'NORTH';
}

export const doorAt = (s: GameState, p: Vec2): DoorState | undefined => s.doors.find(d => samePos(d.pos, p));
export const chestAt = (s: GameState, p: Vec2): ChestState | undefined => s.chests.find(c => samePos(c.pos, p));
export const enemyAt = (s: GameState, p: Vec2): EnemyState | undefined => s.enemies.find(e => e.alive && samePos(e.pos, p));
export const trapAt = (s: GameState, p: Vec2) => s.traps.find(t => samePos(t.pos, p));
export const aliveEnemies = (s: GameState): EnemyState[] => s.enemies.filter(e => e.alive);

/** Mark tiles within the torch radius as explored. Returns true if anything new was revealed. */
export function reveal(s: GameState): boolean {
  let changed = false;
  const r = Math.ceil(VIEW_RADIUS);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > VIEW_RADIUS * VIEW_RADIUS) continue;
      const x = s.player.pos.x + dx, y = s.player.pos.y + dy;
      const row = s.explored[y];
      if (row && x >= 0 && x < s.width && row[x] === false) { row[x] = true; changed = true; }
    }
  }
  return changed;
}

export function isVisible(s: GameState, p: Vec2): boolean {
  const dx = p.x - s.player.pos.x, dy = p.y - s.player.pos.y;
  return dx * dx + dy * dy <= VIEW_RADIUS * VIEW_RADIUS;
}

export function describeOffset(from: Vec2, to: Vec2): string {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 'right here';
  const parts: string[] = [];
  if (dy !== 0) parts.push(`${Math.abs(dy)} ${dy < 0 ? 'north' : 'south'}`);
  if (dx !== 0) parts.push(`${Math.abs(dx)} ${dx < 0 ? 'west' : 'east'}`);
  return parts.join(', ');
}

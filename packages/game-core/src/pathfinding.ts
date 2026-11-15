import type { GameState, Vec2 } from '@dungeon/shared';
import { ABS_DIRECTIONS } from '@dungeon/shared';
import { addDir, chestAt, doorAt, enemyAt, inBounds, posKey, samePos, trapAt } from './grid';

export interface PathOptions {
  actor: 'player' | 'enemy';
  avoidTraps?: boolean;
  ignoreEnemyId?: string;
  maxLength?: number;
}

export function isWalkable(s: GameState, p: Vec2, o: PathOptions): boolean {
  if (!inBounds(s, p)) return false;
  if (s.terrain[p.y]![p.x] === 'WALL') return false;
  const door = doorAt(s, p);
  if (door && door.state !== 'OPEN') return false;
  if (chestAt(s, p)) return false;
  const e = enemyAt(s, p);
  if (e && e.id !== o.ignoreEnemyId) return false;
  if (o.avoidTraps !== false && trapAt(s, p)) return false;
  if (o.actor === 'enemy' && samePos(p, s.player.pos)) return false;
  return true;
}

/**
 * Breadth-first search from `from` to the nearest of `goals`.
 * Returns the tiles to walk (excluding the start, including the goal);
 * [] if already standing on a goal; null if unreachable.
 */
export function findPath(s: GameState, from: Vec2, goals: Vec2[], o: PathOptions): Vec2[] | null {
  const goalSet = new Set(goals.map(posKey));
  if (goalSet.has(posKey(from))) return [];
  const max = o.maxLength ?? 200;
  const prev = new Map<string, Vec2 | null>();
  prev.set(posKey(from), null);
  let frontier: Vec2[] = [from];
  let depth = 0;
  while (frontier.length > 0 && depth < max) {
    depth++;
    const next: Vec2[] = [];
    for (const cur of frontier) {
      for (const d of ABS_DIRECTIONS) {
        const n = addDir(cur, d);
        const k = posKey(n);
        if (prev.has(k)) continue;
        const isGoal = goalSet.has(k);
        // Enemies path *to* the player tile, which is otherwise not walkable for them.
        const walk = isWalkable(s, n, o) || (isGoal && o.actor === 'enemy' && samePos(n, s.player.pos));
        if (!walk) continue;
        prev.set(k, cur);
        if (isGoal) {
          const path: Vec2[] = [];
          let c: Vec2 | null = n;
          while (c && !samePos(c, from)) { path.push(c); c = prev.get(posKey(c)) ?? null; }
          return path.reverse();
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

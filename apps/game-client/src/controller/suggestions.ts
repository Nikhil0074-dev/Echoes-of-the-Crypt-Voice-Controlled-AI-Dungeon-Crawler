import type { GameState } from '@dungeon/shared';
import { ITEMS, aliveEnemies, inventoryCount, manhattan } from '@dungeon/game-core';

/** Context-aware "try saying…" prompts. Pure function of the game state. */
export function suggestCommands(s: GameState, max = 4): string[] {
  const out: string[] = [];
  const p = s.player.pos;
  if (s.status !== 'PLAYING') return ['Start a new game'];
  const adjacentEnemy = aliveEnemies(s).find(e => manhattan(e.pos, p) === 1);
  if (adjacentEnemy) out.push(`Attack the ${adjacentEnemy.kind}`, 'Defend');
  if (s.player.health < s.player.maxHealth * 0.5 && inventoryCount(s, 'health_potion') > 0) out.push('Use my health potion');
  for (const i of s.items) if (manhattan(i.pos, p) <= 1) out.push(`Pick up the ${ITEMS[i.item].name.toLowerCase()}`);
  for (const d of s.doors) if (manhattan(d.pos, p) <= 1 && d.state !== 'OPEN') out.push(d.state === 'LOCKED' ? 'Unlock the door' : 'Open the door');
  for (const c of s.chests) if (manhattan(c.pos, p) <= 1 && !c.opened) out.push('Open the chest');
  if (out.length < max) {
    for (const t of ['Look around', 'What is my objective?']) out.push(t);
    out.push(s.player.facing === 'NORTH' ? 'Move three steps south' : 'Move three steps north');
  }
  return [...new Set(out)].slice(0, max);
}

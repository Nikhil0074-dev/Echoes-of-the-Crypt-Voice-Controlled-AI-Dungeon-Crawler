import type { GameState } from '@dungeon/shared';
import { safeStorage } from './settings';

const KEY = 'vdc.save.v1';
const VERSION = 1;
interface SaveFile { version: number; savedAt: string; state: GameState }

function looksLikeState(s: unknown): s is GameState {
  if (typeof s !== 'object' || s === null) return false;
  const g = s as Partial<GameState>;
  return Array.isArray(g.terrain) && Array.isArray(g.explored) && Array.isArray(g.enemies) && Array.isArray(g.doors) &&
    Array.isArray(g.chests) && Array.isArray(g.items) && Array.isArray(g.traps) && Array.isArray(g.objectives) &&
    typeof g.width === 'number' && typeof g.height === 'number' &&
    typeof g.player === 'object' && g.player !== null && typeof g.player.pos?.x === 'number' &&
    typeof g.player.health === 'number' && Array.isArray(g.player.inventory) &&
    g.terrain.length === g.height && g.terrain.every(r => Array.isArray(r) && r.length === g.width);
}

export class SaveManager {
  constructor(private readonly storage: Storage | null = safeStorage()) {}

  save(state: GameState, now: Date = new Date()): boolean {
    if (!this.storage) return false;
    try {
      const file: SaveFile = { version: VERSION, savedAt: now.toISOString(), state };
      this.storage.setItem(KEY, JSON.stringify(file));
      return true;
    } catch { return false; }
  }

  load(): { state: GameState; savedAt: string } | null {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return null;
      const f = JSON.parse(raw) as Partial<SaveFile>;
      if (f.version !== VERSION || !looksLikeState(f.state)) return null;
      return { state: f.state, savedAt: String(f.savedAt ?? '') };
    } catch { return null; }
  }

  hasSave(): boolean { return this.load() !== null; }
  clear(): void { try { this.storage?.removeItem(KEY); } catch { /* ignore */ } }
}

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createGame } from '@dungeon/game-core';
import { SaveManager } from '../src/persistence/saveManager';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/persistence/settings';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

let store: MemStorage;
beforeEach(() => { store = new MemStorage(); });

describe('SaveManager', () => {
  it('round-trips the full game state', () => {
    const sm = new SaveManager(store);
    expect(sm.hasSave()).toBe(false);
    const s = createGame();
    s.player.gold = 99;
    s.player.pos = { x: 3, y: 2 };
    expect(sm.save(s, new Date('2026-01-01T00:00:00Z'))).toBe(true);
    const loaded = sm.load()!;
    expect(loaded.state).toEqual(s);
    expect(loaded.savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(sm.hasSave()).toBe(true);
    sm.clear();
    expect(sm.hasSave()).toBe(false);
  });

  it('rejects corrupt, wrong-version and tampered saves', () => {
    const sm = new SaveManager(store);
    store.setItem('vdc.save.v1', '{not json');
    expect(sm.load()).toBeNull();
    store.setItem('vdc.save.v1', JSON.stringify({ version: 99, state: createGame() }));
    expect(sm.load()).toBeNull();
    store.setItem('vdc.save.v1', JSON.stringify({ version: 1, state: { player: {} } }));
    expect(sm.load()).toBeNull();
    const bad = createGame();
    bad.terrain.pop();
    store.setItem('vdc.save.v1', JSON.stringify({ version: 1, state: bad }));
    expect(sm.load()).toBeNull();
  });

  it('degrades gracefully without storage or when quota is exceeded', () => {
    expect(new SaveManager(null).save(createGame())).toBe(false);
    expect(new SaveManager(null).load()).toBeNull();
    const full = new MemStorage();
    full.setItem = () => { throw new Error('quota'); };
    expect(new SaveManager(full).save(createGame())).toBe(false);
  });
});

describe('settings', () => {
  it('returns defaults for empty or corrupt storage', () => {
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    store.setItem('vdc.settings.v1', 'oops');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('persists and sanitises values', () => {
    expect(saveSettings({ ...DEFAULT_SETTINGS, tts: true, handsFree: true, aiMode: 'server', language: 'es-ES' }, store)).toBe(true);
    expect(loadSettings(store)).toMatchObject({ tts: true, handsFree: true, aiMode: 'server', language: 'es-ES' });
    store.setItem('vdc.settings.v1', JSON.stringify({ language: '<script>', aiMode: 'x', sound: false }));
    const s = loadSettings(store);
    expect(s.language).toBe('en-US');
    expect(s.aiMode).toBe('local');
    expect(s.sound).toBe(false);
    expect(saveSettings(DEFAULT_SETTINGS, null)).toBe(false);
  });
});

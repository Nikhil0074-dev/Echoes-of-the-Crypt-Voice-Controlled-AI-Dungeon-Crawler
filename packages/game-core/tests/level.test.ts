import { describe, expect, it } from 'vitest';
import { createGame, findPath, parseLevel, CRYPT_OF_ECHOES, posKey } from '../src';

describe('level parsing', () => {
  it('builds the Crypt of Echoes with consistent dimensions', () => {
    const s = createGame();
    expect(s.width).toBe(20);
    expect(s.height).toBe(10);
    expect(s.terrain).toHaveLength(10);
    s.terrain.forEach(r => expect(r).toHaveLength(20));
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
    expect(s.enemies.map(e => e.kind).sort()).toEqual(['goblin', 'skeleton']);
    expect(s.doors).toHaveLength(2);
    expect(s.chests).toHaveLength(1);
    expect(s.objectives).toHaveLength(4);
  });

  it('reveals the starting area only', () => {
    const s = createGame();
    expect(s.explored[1]![1]).toBe(true);
    expect(s.explored[8]![18]).toBe(false);
  });

  it('keeps the exit reachable once doors are open and the key is used', () => {
    const s = createGame();
    s.doors.forEach(d => (d.state = 'OPEN'));
    s.enemies.forEach(e => (e.alive = false));
    s.traps = [];
    const exit = { x: 17, y: 8 };
    expect(s.terrain[8]![17]).toBe('EXIT');
    const path = findPath(s, s.player.pos, [exit], { actor: 'player' });
    expect(path).not.toBeNull();
    expect(posKey(path![path!.length - 1]!)).toBe(posKey(exit));
  });

  it('makes the exit unreachable while the locked door is shut', () => {
    const s = createGame();
    s.doors.forEach(d => { if (d.state === 'CLOSED') d.state = 'OPEN'; });
    s.traps = [];
    const path = findPath(s, s.player.pos, [{ x: 17, y: 8 }], { actor: 'player' });
    expect(path).toBeNull();
  });

  it('rejects malformed levels', () => {
    expect(() => parseLevel({ id: 'x', name: 'x', rows: [] })).toThrow();
    expect(() => parseLevel({ id: 'x', name: 'x', rows: ['###', '#P#', '##'] })).toThrow(/width/);
    expect(() => parseLevel({ id: 'x', name: 'x', rows: ['###', '#.#', '###'] })).toThrow(/player/);
    expect(() => parseLevel({ id: 'x', name: 'x', rows: ['###', '#P?', '###'] })).toThrow(/Unknown/);
  });

  it('has a unique id for every level object', () => {
    const s = createGame();
    const ids = [...s.doors, ...s.chests, ...s.traps, ...s.items, ...s.enemies].map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CRYPT_OF_ECHOES.objectives!.every(o => !o.done)).toBe(true);
  });
});

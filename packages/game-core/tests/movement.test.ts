import { describe, expect, it } from 'vitest';
import { level, run, revealAll } from './helpers';

const room = [
  '#########',
  '#P.....T#',
  '#.......#',
  '#.......#',
  '#########'
];

describe('MOVE', () => {
  it('moves the requested distance', () => {
    const r = run(level(room), { type: 'MOVE', direction: 'EAST', distance: 3 });
    expect(r.ok).toBe(true);
    expect(r.state.player.pos).toEqual({ x: 4, y: 1 });
    expect(r.messages[0]).toMatch(/3 tiles east/);
    expect(r.events.filter(e => e.kind === 'move')).toHaveLength(3);
  });

  it('does not mutate the input state', () => {
    const s = level(room);
    run(s, { type: 'MOVE', direction: 'EAST', distance: 2 });
    expect(s.player.pos).toEqual({ x: 1, y: 1 });
    expect(s.turn).toBe(0);
  });

  it('stops at walls and reports partial movement', () => {
    const r = run(level(room), { type: 'MOVE', direction: 'NORTH', distance: 3 });
    expect(r.ok).toBe(false);
    expect(r.state.player.pos).toEqual({ x: 1, y: 1 });
    expect(r.messages[0]).toMatch(/wall/i);
  });

  it('reports "moved 2 tiles" then the wall', () => {
    const r = run(level(room), { type: 'MOVE', direction: 'SOUTH', distance: 5 });
    expect(r.state.player.pos).toEqual({ x: 1, y: 3 });
    expect(r.messages[0]).toMatch(/2 tiles south\. A wall blocks/);
  });

  it('resolves FORWARD and BACKWARD from facing', () => {
    let r = run(level(room), { type: 'MOVE', direction: 'EAST', distance: 1 });
    r = run(r.state, { type: 'MOVE', direction: 'FORWARD', distance: 2 });
    expect(r.state.player.pos).toEqual({ x: 4, y: 1 });
    r = run(r.state, { type: 'MOVE', direction: 'BACKWARD', distance: 1 });
    expect(r.state.player.pos).toEqual({ x: 3, y: 1 });
  });

  it('clamps absurd distances to the maximum', () => {
    const r = run(level(room), { type: 'MOVE', direction: 'EAST', distance: 9999 });
    expect(r.state.player.pos.x).toBeGreaterThan(1);
  });

  it('walking onto a trap hurts and interrupts', () => {
    const r = run(level(room), { type: 'MOVE', direction: 'EAST', distance: 10 });
    expect(r.state.player.pos).toEqual({ x: 7, y: 1 });
    expect(r.state.player.health).toBe(90);
    expect(r.ok).toBe(false);
  });

  it('careful movement stops before a trap', () => {
    const r = run(level(room), { type: 'MOVE', direction: 'EAST', distance: 10, careful: true });
    expect(r.state.player.pos).toEqual({ x: 6, y: 1 });
    expect(r.state.player.health).toBe(100);
    expect(r.messages[0]).toMatch(/trap/);
  });

  it('closed and locked doors block movement', () => {
    const s = level(['#####', '#PD.#', '#####']);
    const r = run(s, { type: 'MOVE', direction: 'EAST', distance: 2 });
    expect(r.state.player.pos).toEqual({ x: 1, y: 1 });
    expect(r.messages[0]).toMatch(/closed/);
    const s2 = level(['#####', '#PL.#', '#####']);
    expect(run(s2, { type: 'MOVE', direction: 'EAST', distance: 1 }).messages[0]).toMatch(/locked/);
  });

  it('chests are solid', () => {
    const r = run(level(['#####', '#PC.#', '#####']), { type: 'MOVE', direction: 'EAST', distance: 1 });
    expect(r.ok).toBe(false);
    expect(r.messages[0]).toMatch(/chest/);
  });

  it('reveals fog as the player explores', () => {
    const s = level(['####################', '#P.................#', '####################']);
    expect(s.explored[1]![15]).toBe(false);
    const r = run(s, { type: 'MOVE', direction: 'EAST', distance: 12 });
    expect(r.state.explored[1]![15]).toBe(true);
  });

  it('winning on the exit ends the game and completes the objective', () => {
    const s = level(['#####', '#P.X#', '#####']);
    s.objectives = [{ id: 'reach_exit', text: 'Reach the exit', hint: '', done: false }];
    const r = run(s, { type: 'MOVE', direction: 'EAST', distance: 5 });
    expect(r.state.status).toBe('WON');
    expect(r.state.objectives[0]!.done).toBe(true);
    expect(r.ok).toBe(true);
    expect(run(r.state, { type: 'MOVE', direction: 'WEST', distance: 1 }).ok).toBe(false);
  });
});

describe('MOVE_TO', () => {
  const rows = [
    '##########',
    '#P...H..X#',
    '#.####.###',
    '#...C....#',
    '##########'
  ];

  it('walks to a known item and stands on it', () => {
    const s = revealAll(level(rows));
    const r = run(s, { type: 'MOVE_TO', target: 'potion' });
    expect(r.ok).toBe(true);
    expect(r.state.player.pos).toEqual({ x: 5, y: 1 });
  });

  it('walks next to a chest (solid target)', () => {
    const r = run(revealAll(level(rows)), { type: 'MOVE_TO', target: 'chest' });
    expect(r.ok).toBe(true);
    const p = r.state.player.pos;
    expect(Math.abs(p.x - 4) + Math.abs(p.y - 3)).toBe(1);
  });

  it('refuses to path to things the player has not discovered', () => {
    const r = run(level(rows), { type: 'MOVE_TO', target: 'exit' });
    expect(r.ok).toBe(false);
    expect(r.messages[0]).toMatch(/haven't discovered/);
  });

  it('asks for clarification on "there"', () => {
    const r = run(level(rows), { type: 'MOVE_TO', target: 'there' });
    expect(r.ok).toBe(false);
    expect(r.clarification).toMatch(/Where/);
  });

  it('reports unknown targets', () => {
    expect(run(level(rows), { type: 'MOVE_TO', target: 'kitchen' }).messages[0]).toMatch(/don't know/);
  });

  it('avoids traps when a safe route exists', () => {
    const s = revealAll(level(['#######', '#P.T.X#', '#.....#', '#######']));
    const r = run(s, { type: 'MOVE_TO', target: 'exit' });
    expect(r.state.status).toBe('WON');
    expect(r.state.player.health).toBe(100);
  });

  it('fails when a door blocks the only route', () => {
    const s = revealAll(level(['#######', '#P.D.X#', '#######']));
    const r = run(s, { type: 'MOVE_TO', target: 'exit' });
    expect(r.ok).toBe(false);
    expect(r.messages[0]).toMatch(/no clear path/);
  });

  it('can path to a door from the near side', () => {
    const s = revealAll(level(['#######', '#P..D.#', '#######']));
    const r = run(s, { type: 'MOVE_TO', target: 'door' });
    expect(r.ok).toBe(true);
    expect(r.state.player.pos).toEqual({ x: 3, y: 1 });
  });

  it('reports already-there', () => {
    const s = revealAll(level(['#####', '#PC.#', '#####']));
    expect(run(s, { type: 'MOVE_TO', target: 'chest' }).messages[0]).toMatch(/already/);
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { parseLocal } from '@dungeon/ai-engine';
import { createGame, parseLevel } from '@dungeon/game-core';
import { GameController, summarize, type ResultEvent } from '../src/controller/GameController';
import { createInterpreter } from '../src/controller/interpreter';
import { SaveManager } from '../src/persistence/saveManager';
import { DEFAULT_SETTINGS } from '../src/persistence/settings';
import { Sfx } from '../src/voice/Sfx';
import { VoiceFeedback } from '../src/voice/VoiceFeedback';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as unknown as Storage;
};

const make = (rows?: string[], extra = {}) => new GameController({
  interpret: async (t, ctx) => parseLocal(t, ctx),
  saves: new SaveManager(mem()),
  state: rows ? parseLevel({ id: 't', name: 'T', rows }) : undefined,
  phaseResetMs: null, persistSettings: false, ...extra
});

describe('GameController: voice pipeline', () => {
  it('turns a transcript into movement and records history', async () => {
    const c = make(['#######', '#P....#', '#######']);
    await c.submitText('Move three steps east', 'voice');
    const s = c.getSnapshot();
    expect(s.state.player.pos).toEqual({ x: 4, y: 1 });
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ status: 'ok', summary: 'MOVE EAST ×3', transcript: 'Move three steps east' });
    expect(s.phase).toBe('completed');
    expect(s.lastCommand?.intent).toBe('MOVE');
    expect(s.log.some(l => l.text.startsWith('»'))).toBe(true);
  });

  it('emits result events with prev and next state for the renderer', async () => {
    const c = make(['#######', '#P....#', '#######']);
    const got: ResultEvent[] = [];
    c.onResult(r => got.push(r));
    await c.submitText('go east two steps');
    expect(got).toHaveLength(1);
    expect(got[0]!.prev.player.pos.x).toBe(1);
    expect(got[0]!.state.player.pos.x).toBe(3);
    expect(got[0]!.events.filter(e => e.kind === 'move')).toHaveLength(2);
  });

  it('asks for clarification instead of executing unclear commands', async () => {
    const c = make(['#######', '#P....#', '#######']);
    await c.submitText('sing me a song');
    const s = c.getSnapshot();
    expect(s.state.player.pos).toEqual({ x: 1, y: 1 });
    expect(s.history[0]!.status).toBe('clarify');
    expect(s.clarification).toMatch(/didn't understand/);
    expect(s.phase).toBe('failed');
  });

  it('"go there" is a clarification from the engine', async () => {
    const c = make(['#######', '#P....#', '#######']);
    await c.submitText('go there');
    expect(c.getSnapshot().clarification).toBe('Where would you like to go?');
  });

  it('resolves "attack it" from the previous target (context)', async () => {
    const c = make(['#######', '#PG...#', '#######']);
    await c.submitText('attack the goblin');
    await c.submitText('attack it');
    const goblin = c.getSnapshot().state.enemies[0]!;
    expect(goblin.alive).toBe(false);
  });

  it('builds a small context for the interpreter', () => {
    const c = make(['#######', '#PG...#', '#######']);
    expect(c.buildContext()).toEqual({ facing: 'SOUTH', nearbyEnemies: ['goblin'], lastTarget: undefined });
  });

  it('suppresses duplicate voice finals but not typed repeats', async () => {
    const c = make(['#########', '#P......#', '#########']);
    await c.submitText('move east', 'voice');
    await c.submitText('move east', 'voice');
    expect(c.getSnapshot().state.player.pos.x).toBe(2);
    await c.submitText('move east', 'text');
    expect(c.getSnapshot().state.player.pos.x).toBe(3);
  });

  it('serialises commands in order and caps the queue', async () => {
    const c = make(['###########', '#P........#', '###########'], { maxQueue: 2 });
    const p = [c.submitText('move east'), c.submitText('move east'), c.submitText('move east')];
    await Promise.all(p);
    expect(c.getSnapshot().state.player.pos.x).toBe(3); // third was dropped
    expect(c.getSnapshot().log.some(l => /Too many commands/.test(l.text))).toBe(true);
  });

  it('survives an interpreter that throws', async () => {
    const c = new GameController({ interpret: async () => { throw new Error('boom'); }, saves: new SaveManager(mem()), phaseResetMs: null, persistSettings: false });
    await c.submitText('look around');
    expect(c.getSnapshot().history[0]!.status).toBe('failed');
    expect(c.getSnapshot().phase).toBe('failed');
  });

  it('ignores empty input', async () => {
    const c = make();
    await c.submitText('   ');
    expect(c.getSnapshot().history).toHaveLength(0);
  });

  it('keyboard actions go through the same engine', () => {
    const c = make(['#####', '#P..#', '#####']);
    c.runActions([{ type: 'MOVE', direction: 'EAST', distance: 1 }], 'Move east');
    expect(c.getSnapshot().state.player.pos.x).toBe(2);
    expect(c.getSnapshot().history[0]!.source).toBe('keyboard');
  });

  it('colours log lines by outcome', async () => {
    const c = make(['#######', '#PG...#', '#######']);
    await c.submitText('attack the goblin');
    const tones = c.getSnapshot().log.map(l => l.tone);
    expect(tones).toContain('bad'); // goblin counter-attack
  });
});

describe('GameController: system commands and lifecycle', () => {
  it('pause blocks gameplay but allows information; resume restores', async () => {
    const c = make(['#######', '#P....#', '#######']);
    await c.submitText('pause the game');
    expect(c.getSnapshot().paused).toBe(true);
    await c.submitText('move east');
    expect(c.getSnapshot().state.player.pos.x).toBe(1);
    expect(c.getSnapshot().history.at(-1)!.status).toBe('rejected');
    await c.submitText('check my inventory');
    expect(c.getSnapshot().history.at(-1)!.status).toBe('ok');
    await c.submitText('resume the game');
    expect(c.getSnapshot().paused).toBe(false);
    await c.submitText('move east');
    expect(c.getSnapshot().state.player.pos.x).toBe(2);
  });

  it('saves and loads progress by voice and API', async () => {
    const saves = new SaveManager(mem());
    const c = new GameController({ interpret: async (t, x) => parseLocal(t, x), saves, phaseResetMs: null, persistSettings: false });
    expect(c.loadGame()).toBe(false);
    await c.submitText('move south');
    await c.submitText('save my progress');
    expect(c.hasSave()).toBe(true);
    c.newGame();
    expect(c.getSnapshot().state.player.pos).toEqual({ x: 1, y: 1 });
    expect(c.loadGame()).toBe(true);
    expect(c.getSnapshot().state.player.pos).toEqual({ x: 1, y: 2 });
  });

  it('mute / unmute update settings and the sound engine', async () => {
    const sfx = new Sfx();
    const c = make(undefined, { sfx });
    await c.submitText('mute the sound');
    expect(c.getSnapshot().settings.sound).toBe(false);
    expect(sfx.enabled).toBe(false);
    await c.submitText('unmute');
    expect(sfx.enabled).toBe(true);
  });

  it('settings/help requests surface a modal request, and stop listening notifies', async () => {
    const c = make();
    const sys = vi.fn();
    c.onSystem(sys);
    await c.submitText('open settings');
    expect(c.getSnapshot().modalRequest).toBe('settings');
    c.clearModalRequest();
    await c.submitText('help');
    expect(c.getSnapshot().modalRequest).toBe('help');
    await c.submitText('stop listening');
    expect(sys).toHaveBeenCalledWith('STOP_LISTENING');
  });

  it('new game resets state, history and notifies the renderer', async () => {
    const c = make();
    const reset = vi.fn();
    c.onReset(reset);
    await c.submitText('look around');
    c.newGame();
    expect(c.getSnapshot().history).toHaveLength(0);
    expect(reset).toHaveBeenCalledOnce();
    expect(c.getSnapshot().state.levelId).toBe('crypt-1');
  });

  it('updateSettings toggles TTS and sound and notifies subscribers', () => {
    const feedback = new VoiceFeedback(null);
    const c = make(undefined, { feedback });
    const fn = vi.fn();
    const off = c.subscribe(fn);
    c.updateSettings({ tts: true });
    expect(feedback.enabled).toBe(true);
    expect(fn).toHaveBeenCalled();
    off();
    fn.mockClear();
    c.updateSettings({ tts: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it('mic status drives the phase chip and returns to listening after a command', async () => {
    vi.useFakeTimers();
    const c = new GameController({ interpret: async (t, x) => parseLocal(t, x), saves: new SaveManager(mem()), phaseResetMs: 100, persistSettings: false });
    c.setMic(true);
    expect(c.getSnapshot().phase).toBe('listening');
    const p = c.submitText('look around');
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(c.getSnapshot().phase).toBe('completed');
    vi.advanceTimersByTime(150);
    expect(c.getSnapshot().phase).toBe('listening');
    c.setMic(false);
    expect(c.getSnapshot().phase).toBe('idle');
    c.setMicError('Microphone access was denied.');
    expect(c.getSnapshot().micError).toMatch(/denied/);
    vi.useRealTimers();
  });

  it('dying ends the game and further commands are rejected by the engine', async () => {
    const c = make(['#####', '#PS.#', '#####']);
    for (let i = 0; i < 30 && c.getSnapshot().state.status === 'PLAYING'; i++) await c.submitText('defend');
    expect(c.getSnapshot().state.status).toBe('DEAD');
    await c.submitText('move east');
    expect(c.getSnapshot().history.at(-1)!.status).toBe('failed');
  });

  it('can complete the exit objective end-to-end by voice', async () => {
    const c = make(['#######', '#P...X#', '#######']);
    await c.submitText('Go to the exit');
    expect(c.getSnapshot().state.status).toBe('WON');
  });
});

describe('summarize', () => {
  it('describes sequences readably', () => {
    expect(summarize(parseLocal('Walk two steps to the right and attack the goblin'))).toBe('MOVE EAST ×2 → ATTACK GOBLIN');
    expect(summarize(parseLocal('blah'))).toBe('UNKNOWN');
    expect(summarize(parseLocal('go to the chest and open it'))).toBe('GO TO CHEST → INTERACT CHEST');
  });
});

describe('createInterpreter', () => {
  const ok = (command: unknown, usedLlm = false) => async () => new Response(JSON.stringify({ command, usedLlm }), { status: 200 });

  it('local mode never touches the network', async () => {
    const f = vi.fn();
    const cmd = await createInterpreter({ mode: 'local', fetchImpl: f as never })('go north', {});
    expect(f).not.toHaveBeenCalled();
    expect(cmd.actions[0]).toMatchObject({ type: 'MOVE', direction: 'NORTH' });
  });

  it('server mode validates and uses the server command', async () => {
    const cmd = await createInterpreter({ mode: 'server', fetchImpl: ok({ actions: [{ type: 'LOOK' }], confidence: 0.9 }, true) as never })('whatever', {});
    expect(cmd.intent).toBe('LOOK');
    expect(cmd.source).toBe('llm');
    expect(cmd.transcript).toBe('whatever');
  });

  it('falls back to local on invalid server output, errors and non-200s', async () => {
    const bad = await createInterpreter({ mode: 'server', fetchImpl: ok({ actions: [{ type: 'TELEPORT' }] }) as never })('go north', {});
    expect(bad.source).toBe('local');
    const err = await createInterpreter({ mode: 'server', fetchImpl: (async () => { throw new Error('offline'); }) as never })('go north', {});
    expect(err.actions[0]).toMatchObject({ type: 'MOVE' });
    const five = await createInterpreter({ mode: 'server', fetchImpl: (async () => new Response('x', { status: 500 })) as never })('look around', {});
    expect(five.intent).toBe('LOOK');
  });

  it('aborts slow servers', async () => {
    const slow = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as never;
    const cmd = await createInterpreter({ mode: 'server', timeoutMs: 20, fetchImpl: slow })('look around', {});
    expect(cmd.intent).toBe('LOOK');
  });
});

describe('default controller state', () => {
  it('starts with the Crypt of Echoes and default settings', () => {
    const c = new GameController({ saves: new SaveManager(mem()), persistSettings: false });
    expect(c.getSnapshot().state).toEqual(createGame());
    expect(c.getSnapshot().settings).toEqual(DEFAULT_SETTINGS);
  });
});

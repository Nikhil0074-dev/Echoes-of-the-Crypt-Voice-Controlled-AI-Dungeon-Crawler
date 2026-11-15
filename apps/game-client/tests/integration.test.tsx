// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { parseLocal } from '@dungeon/ai-engine';
import { parseLevel } from '@dungeon/game-core';
import { GameController } from '../src/controller/GameController';
import { SaveManager } from '../src/persistence/saveManager';
import { GameScreen } from '../src/components/GameScreen';
import App from '../src/App';
import { PALETTE, SPRITES, SPRITE_SIZE, ITEM_SPRITE } from '../src/game/sprites';

vi.mock('../src/components/Stage', () => ({ Stage: () => <div data-testid="stage" /> }));

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as unknown as Storage;
};

class FakeRec {
  static last: FakeRec | null = null;
  lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
  onstart: (() => void) | null = null; onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null; onresult: ((e: unknown) => void) | null = null;
  constructor() { FakeRec.last = this; }
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
  say(text: string, final = true) {
    const r = { isFinal: final, length: 1, 0: { transcript: text, confidence: 0.9 } };
    this.onresult?.({ resultIndex: 0, results: Object.assign([r], { length: 1 }) });
  }
}

beforeEach(() => { FakeRec.last = null; (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec; });
afterEach(() => { cleanup(); delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition; });

const ctl = (rows: string[]) => new GameController({
  interpret: async (t, c) => parseLocal(t, c), saves: new SaveManager(mem()), phaseResetMs: null, persistSettings: false,
  state: parseLevel({ id: 't', name: 'T', rows })
});

describe('speech → AI parser → engine → UI (end to end, with a fake recogniser)', () => {
  it('speaking a command moves the hero and updates the console', async () => {
    const c = ctl(['#########', '#P......#', '#########']);
    render(<GameScreen controller={c} onMenu={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start listening' })); });
    expect(FakeRec.last).not.toBeNull();
    expect(c.getSnapshot().micOn).toBe(true);
    expect(screen.getByTestId('phase').textContent).toBe('Listening…');

    act(() => FakeRec.last!.say('move three', false));
    expect(screen.getByTestId('heard').textContent).toContain('move three');

    await act(async () => { FakeRec.last!.say('Move three steps east'); });
    expect(c.getSnapshot().state.player.pos.x).toBe(4);
    expect(screen.getByTestId('interp').textContent).toContain('MOVE EAST ×3');

    await act(async () => { FakeRec.last!.say('move three steps east'); }); // duplicate final inside the window
    expect(c.getSnapshot().state.player.pos.x).toBe(4);

    await act(async () => { FakeRec.last!.say('stop listening'); });
    expect(c.getSnapshot().micOn).toBe(false);
  });

  it('shows a helpful message when the microphone is denied', async () => {
    const c = ctl(['#####', '#P..#', '#####']);
    render(<GameScreen controller={c} onMenu={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start listening' })); });
    act(() => { FakeRec.last!.onerror?.({ error: 'not-allowed' }); FakeRec.last!.onend?.(); });
    expect(screen.getByTestId('feedback').textContent).toMatch(/denied/);
    expect(c.getSnapshot().micOn).toBe(false);
  });

  it('M toggles the microphone from the keyboard', async () => {
    const c = ctl(['#####', '#P..#', '#####']);
    render(<GameScreen controller={c} onMenu={() => {}} />);
    await act(async () => { fireEvent.keyDown(window, { key: 'm' }); });
    expect(c.getSnapshot().micOn).toBe(true);
    await act(async () => { fireEvent.keyDown(window, { key: 'm' }); });
    expect(c.getSnapshot().micOn).toBe(false);
  });

  it('degrades gracefully when speech recognition does not exist', () => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    const c = ctl(['#####', '#P..#', '#####']);
    render(<GameScreen controller={c} onMenu={() => {}} />);
    expect((screen.getByRole('button', { name: 'Start listening' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('Type a command')).toBeTruthy();
  });
});

describe('App', () => {
  it('goes from menu to a new game and back, then offers Continue after saving', async () => {
    localStorage.clear();
    render(<App />);
    expect((screen.getByRole('button', { name: /Continue Game/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Start New Game/ }));
    expect(screen.getByTestId('stage')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    fireEvent.click(screen.getByRole('button', { name: /Menu/ }));
    const cont = screen.getByRole('button', { name: /Continue Game/ }) as HTMLButtonElement;
    expect(cont.disabled).toBe(false);
    fireEvent.click(cont);
    expect(screen.getByTestId('stage')).toBeTruthy();
    localStorage.clear();
  });

  it('opens menu modals', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Voice Command Guide/ }));
    expect(screen.getByRole('dialog', { name: 'Voice Command Guide' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close'));
    fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
  });
});

describe('sprite data', () => {
  it('every sprite is 16×16 and uses only palette colours', () => {
    for (const [name, rows] of Object.entries(SPRITES)) {
      expect(rows, name).toHaveLength(SPRITE_SIZE);
      rows.forEach((r, i) => {
        expect(r.length, `${name} row ${i}`).toBe(SPRITE_SIZE);
        for (const ch of r) if (ch !== '.') expect(PALETTE[ch], `${name} char ${ch}`).toBeTruthy();
      });
    }
  });
  it('every item and entity maps to a sprite', () => {
    for (const s of Object.values(ITEM_SPRITE)) expect(SPRITES[s]).toBeTruthy();
    for (const k of ['player', 'goblin', 'skeleton', 'chest', 'chestOpen', 'door', 'doorLocked', 'doorOpen', 'trap', 'exit']) expect(SPRITES[k], k).toBeTruthy();
  });
});

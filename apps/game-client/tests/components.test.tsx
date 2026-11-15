// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { parseLocal } from '@dungeon/ai-engine';
import { createGame, parseLevel } from '@dungeon/game-core';
import { GameController } from '../src/controller/GameController';
import { suggestCommands } from '../src/controller/suggestions';
import { SaveManager } from '../src/persistence/saveManager';
import { Hud } from '../src/components/Hud';
import { SidePanel } from '../src/components/SidePanel';
import { VoiceConsole } from '../src/components/VoiceConsole';
import { MainMenu } from '../src/components/MainMenu';
import { Modal } from '../src/components/Modal';
import { COMMAND_GUIDE, Credits, HowToPlay, VoiceGuide } from '../src/components/Guides';
import { SettingsPanel } from '../src/components/SettingsPanel';
import { GameScreen, KEYMAP } from '../src/components/GameScreen';
import { useSnapshot } from '../src/components/hooks';

vi.mock('../src/components/Stage', () => ({ Stage: () => <div data-testid="stage" /> }));

afterEach(() => cleanup());

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as unknown as Storage;
};
const ctl = (rows?: string[]) => new GameController({
  interpret: async (t, c) => parseLocal(t, c), saves: new SaveManager(mem()), phaseResetMs: null, persistSettings: false,
  state: rows ? parseLevel({ id: 't', name: 'Test Crypt', rows }) : undefined
});

describe('Hud', () => {
  it('shows level, bars and gold with accessible values', () => {
    const s = createGame();
    s.player.health = 40; s.player.gold = 12; s.player.level = 3;
    render(<Hud state={s} />);
    expect(screen.getByText('LV 3')).toBeTruthy();
    const hp = screen.getByRole('progressbar', { name: 'HP' });
    expect(hp.getAttribute('aria-valuenow')).toBe('40');
    expect(hp.getAttribute('aria-valuemax')).toBe('100');
    expect(screen.getByText('◆ 12')).toBeTruthy();
    expect(screen.getByText(/Iron Sword/)).toBeTruthy();
  });
});

describe('SidePanel', () => {
  it('lists objectives, highlights the next one and switches tabs', () => {
    const s = createGame();
    s.objectives[0]!.done = true;
    render(<SidePanel state={s} log={[{ id: 1, text: 'You hit the Goblin for 13.', tone: 'good' }]} />);
    expect(screen.getByText('Find the dungeon key').closest('li')!.className).toContain('done');
    expect(screen.getByText('Open the treasure chest').closest('li')!.className).toContain('next');
    expect(screen.getByText(/Hint:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Pack' }));
    expect(screen.getByText('Health Potion')).toBeTruthy();
    expect(screen.getByText(/equipped/)).toBeTruthy();
    expect(screen.getByText('+4 attack')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Log' }));
    expect(screen.getByText('You hit the Goblin for 13.')).toBeTruthy();
  });

  it('handles an empty pack, empty log and finished quests', () => {
    const s = createGame();
    s.player.inventory = [];
    s.objectives.forEach(o => (o.done = true));
    render(<SidePanel state={s} log={[]} />);
    expect(screen.getByText('Every objective complete!')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Pack' }));
    expect(screen.getByText('Your pack is empty.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Log' }));
    expect(screen.getByText('Nothing has happened yet.')).toBeTruthy();
  });
});

describe('VoiceConsole', () => {
  const Harness = ({ c, supported = true, toggle = vi.fn() }: { c: GameController; supported?: boolean; toggle?: () => void }) => {
    const snap = useSnapshot(c);
    return <VoiceConsole controller={c} snap={snap} voice={{ supported, toggle, start: toggle, stop: toggle }} />;
  };

  it('runs typed commands through the pipeline and shows the interpretation', async () => {
    const c = ctl(['#######', '#P....#', '#######']);
    render(<Harness c={c} />);
    const input = screen.getByLabelText('Type a command');
    fireEvent.change(input, { target: { value: 'Move two steps east' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
    expect(c.getSnapshot().state.player.pos.x).toBe(3);
    expect(screen.getByTestId('heard').textContent).toContain('Move two steps east');
    expect(screen.getByTestId('interp').textContent).toContain('MOVE EAST ×2');
    expect(screen.getByTestId('interp').textContent).toContain('LOCAL');
    expect(screen.getByTestId('phase').textContent).toBe('Done');
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('feedback').textContent).toMatch(/2 tiles east/);
  });

  it('submits on Enter and ignores blank input', async () => {
    const c = ctl(['#######', '#P....#', '#######']);
    render(<Harness c={c} />);
    const input = screen.getByLabelText('Type a command');
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'go east' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(c.getSnapshot().state.player.pos.x).toBe(2);
  });

  it('shows clarification styling for unclear commands', async () => {
    const c = ctl();
    render(<Harness c={c} />);
    fireEvent.change(screen.getByLabelText('Type a command'), { target: { value: 'dance wildly' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
    expect(screen.getByTestId('feedback').className).toContain('ask');
    expect(screen.getByTestId('phase').textContent).toBe("Couldn't do that");
  });

  it('shows live interim speech and mic state', () => {
    const c = ctl();
    render(<Harness c={c} />);
    act(() => { c.setMic(true); c.setInterim('attack the gob'); });
    expect(screen.getByTestId('heard').textContent).toContain('attack the gob');
    expect(screen.getByRole('button', { name: 'Stop listening' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('phase').textContent).toBe('Listening…');
  });

  it('toggles the mic via the orb and disables it when unsupported', () => {
    const toggle = vi.fn();
    const c = ctl();
    const { unmount } = render(<Harness c={c} toggle={toggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(toggle).toHaveBeenCalledOnce();
    unmount();
    render(<Harness c={c} supported={false} />);
    expect((screen.getByRole('button', { name: 'Start listening' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/isn’t supported in this browser/)).toBeTruthy();
  });

  it('suggested command chips run when clicked, and can be hidden', async () => {
    const c = ctl(['#######', '#PH...#', '#######']);
    const { rerender } = render(<Harness c={c} />);
    const chip = screen.getByRole('button', { name: 'Pick up the health potion' });
    await act(async () => { fireEvent.click(chip); });
    expect(c.getSnapshot().state.items).toHaveLength(0);
    act(() => c.updateSettings({ showHints: false }));
    rerender(<Harness c={c} />);
    expect(screen.queryByLabelText('Suggested commands')).toBeNull();
  });

  it('lists the five most recent commands newest first', async () => {
    const c = ctl(['#########', '#P......#', '#########']);
    render(<Harness c={c} />);
    for (let i = 0; i < 7; i++) await act(async () => { await c.submitText(i % 2 ? 'move west' : 'move east', 'text'); });
    const items = within(screen.getByLabelText('Command history')).getAllByRole('listitem');
    expect(items).toHaveLength(5);
  });

  it('surfaces microphone errors in the feedback line', () => {
    const c = ctl();
    render(<Harness c={c} />);
    act(() => c.setMicError('Microphone access was denied.'));
    expect(screen.getByTestId('feedback').textContent).toContain('denied');
  });
});

describe('suggestCommands', () => {
  it('suggests fighting when an enemy is adjacent', () => {
    expect(suggestCommands(parseLevel({ id: 't', name: 't', rows: ['#####', '#PG.#', '#####'] }))).toContain('Attack the goblin');
  });
  it('suggests healing when hurt', () => {
    const s = parseLevel({ id: 't', name: 't', rows: ['###', '#P#', '###'] });
    s.player.health = 30;
    expect(suggestCommands(s)).toContain('Use my health potion');
  });
  it('suggests doors and chests when adjacent, and respects the cap', () => {
    const s = parseLevel({ id: 't', name: 't', rows: ['#####', '#PDC#', '#####'] });
    const out = suggestCommands(s, 3);
    expect(out).toContain('Open the door');
    expect(out.length).toBeLessThanOrEqual(3);
    expect(suggestCommands(parseLevel({ id: 't', name: 't', rows: ['#####', '#PLC#', '#####'] }))).toContain('Unlock the door');
  });
  it('falls back to exploration prompts and handles game over', () => {
    const s = createGame();
    expect(suggestCommands(s)).toContain('Look around');
    s.status = 'DEAD';
    expect(suggestCommands(s)).toEqual(['Start a new game']);
  });
  it('every suggestion is understood by the local parser', () => {
    const states = [createGame(), parseLevel({ id: 't', name: 't', rows: ['#####', '#PGC#', '#####'] }), parseLevel({ id: 't', name: 't', rows: ['#####', '#PDK#', '#####'] })];
    for (const s of states) for (const t of suggestCommands(s, 8)) {
      expect(parseLocal(t).requiresConfirmation, t).toBe(false);
    }
  });
});

describe('MainMenu, Modal and guides', () => {
  it('disables Continue without a save and reports selections', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<MainMenu hasSave={false} onSelect={onSelect} />);
    expect((screen.getByRole('button', { name: /Continue Game/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Start New Game/ }));
    expect(onSelect).toHaveBeenCalledWith('new');
    rerender(<MainMenu hasSave onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue Game/ }));
    expect(onSelect).toHaveBeenLastCalledWith('continue');
    for (const [name, id] of [['How to Play', 'how'], ['Voice Command Guide', 'voice'], ['Settings', 'settings'], ['Credits', 'credits']] as const) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
      expect(onSelect).toHaveBeenLastCalledWith(id);
    }
  });

  it('Modal closes on Escape, backdrop click and the close button', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal title="T" onClose={onClose}><p>hi</p></Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByLabelText('Close'));
    fireEvent.mouseDown(container.querySelector('.modal-back')!);
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('guides render their content', () => {
    render(<><VoiceGuide /><HowToPlay /><Credits /></>);
    for (const g of COMMAND_GUIDE) expect(screen.getByText(g.title)).toBeTruthy();
    expect(screen.getByText(/Keyboard fallback/)).toBeTruthy();
    expect(screen.getByText(/Phaser 3/)).toBeTruthy();
  });

  it('every command in the voice guide is understood by the parser', () => {
    for (const g of COMMAND_GUIDE) for (const e of g.examples) {
      const c = parseLocal(e);
      expect(c.requiresConfirmation, e).toBe(false);
      expect(c.actions.length, e).toBeGreaterThan(0);
    }
  });
});

describe('SettingsPanel', () => {
  it('updates settings through the controller', () => {
    const c = ctl();
    const Wrap = () => { const snap = useSnapshot(c); return <SettingsPanel controller={c} snap={snap} voice={{ supported: true }} />; };
    render(<Wrap />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const sound = boxes[0]!;
    fireEvent.click(sound);
    expect(c.getSnapshot().settings.sound).toBe(false);
    fireEvent.click(boxes[2]!);
    expect(c.getSnapshot().settings.handsFree).toBe(true);
    fireEvent.change(screen.getByDisplayValue('English (US)'), { target: { value: 'en-IN' } });
    expect(c.getSnapshot().settings.language).toBe('en-IN');
    fireEvent.change(screen.getByDisplayValue('Local rules (offline)'), { target: { value: 'server' } });
    expect(c.getSnapshot().settings.aiMode).toBe('server');
    expect(boxes[1]!.disabled).toBe(true); // no speechSynthesis in jsdom
  });
});

describe('GameScreen', () => {
  it('renders the layout with HUD, stage and console', () => {
    const c = ctl();
    render(<GameScreen controller={c} onMenu={() => {}} />);
    expect(screen.getByTestId('stage')).toBeTruthy();
    expect(screen.getByLabelText('Player status')).toBeTruthy();
    expect(screen.getByLabelText('Voice console')).toBeTruthy();
    expect(screen.getAllByText('Crypt of Echoes').length).toBeGreaterThan(0);
  });

  it('keyboard shortcuts drive the same engine', () => {
    const c = ctl(['#########', '#P......#', '#.G.....#', '#########']);
    render(<GameScreen controller={c} onMenu={() => {}} />);
    act(() => { fireEvent.keyDown(window, { key: 'ArrowRight' }); });
    expect(c.getSnapshot().state.player.pos.x).toBe(2);
    act(() => { fireEvent.keyDown(window, { key: 'ArrowLeft' }); });
    expect(c.getSnapshot().state.player.pos.x).toBe(1);
    act(() => { fireEvent.keyDown(window, { key: 's' }); });
    act(() => { fireEvent.keyDown(window, { key: 'f' }); }); // nothing to pick up: harmless failure
    expect(c.getSnapshot().history.at(-1)!.status).toBe('failed');
    act(() => { fireEvent.keyDown(window, { key: 'D' }); }); // blocked by the goblin
    act(() => { fireEvent.keyDown(window, { key: ' ' }); });
    expect(c.getSnapshot().state.enemies[0]!.health).toBeLessThan(20);
    expect(Object.keys(KEYMAP)).toContain('q');
  });

  it('ignores shortcuts while typing and when modifiers are held', () => {
    const c = ctl(['#######', '#P....#', '#######']);
    render(<GameScreen controller={c} onMenu={() => {}} />);
    fireEvent.keyDown(screen.getByLabelText('Type a command'), { key: 'd' });
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    expect(c.getSnapshot().state.player.pos.x).toBe(1);
  });

  it('P toggles pause and shows the overlay; moves are rejected while paused', () => {
    const c = ctl(['#######', '#P....#', '#######']);
    render(<GameScreen controller={c} onMenu={() => {}} />);
    act(() => { fireEvent.keyDown(window, { key: 'p' }); });
    expect(screen.getByText('Paused')).toBeTruthy();
    act(() => { fireEvent.keyDown(window, { key: 'd' }); });
    expect(c.getSnapshot().state.player.pos.x).toBe(1);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('shows win and death overlays with working buttons', () => {
    const c = ctl(['#####', '#PX.#', '#####']);
    const onMenu = vi.fn();
    render(<GameScreen controller={c} onMenu={onMenu} />);
    act(() => { fireEvent.keyDown(window, { key: 'd' }); });
    expect(screen.getByText('You Escaped!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Main Menu' }));
    expect(onMenu).toHaveBeenCalled();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Try Again' })));
    expect(screen.queryByText('You Escaped!')).toBeNull();
  });

  it('opens settings/help when requested by a voice command', async () => {
    const c = ctl();
    render(<GameScreen controller={c} onMenu={() => {}} />);
    await act(async () => { await c.submitText('open settings'); });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await act(async () => { await c.submitText('help'); });
    expect(screen.getByRole('dialog', { name: 'Voice Command Guide' })).toBeTruthy();
  });

  it('top bar buttons save, mute and pause', () => {
    const c = ctl();
    render(<GameScreen controller={c} onMenu={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(c.hasSave()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '🔊' }));
    expect(c.getSnapshot().settings.sound).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Pause/ }));
    expect(c.getSnapshot().paused).toBe(true);
  });
});

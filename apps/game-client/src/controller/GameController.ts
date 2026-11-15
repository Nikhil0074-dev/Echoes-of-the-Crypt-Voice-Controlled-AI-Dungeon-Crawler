import type {
  Action, ExecutionResult, GameCommand, GameEvent, GameState, ParseContext, SystemCommandName
} from '@dungeon/shared';
import { aliveEnemies, createGame, executeCommand, isVisible } from '@dungeon/game-core';
import { createInterpreter, type Interpreter } from './interpreter';
import { SaveManager } from '../persistence/saveManager';
import { DEFAULT_SETTINGS, saveSettings, type Settings } from '../persistence/settings';
import { Sfx } from '../voice/Sfx';
import { VoiceFeedback } from '../voice/VoiceFeedback';
import { TranscriptProcessor } from '../voice/TranscriptProcessor';

export type Phase = 'idle' | 'listening' | 'processing' | 'recognized' | 'executing' | 'completed' | 'failed';
export type EntryStatus = 'ok' | 'failed' | 'clarify' | 'rejected';
export type Tone = 'info' | 'good' | 'bad' | 'warn' | 'cmd' | 'system';
export type ModalRequest = 'settings' | 'help' | null;

export interface HistoryEntry { id: number; transcript: string; summary: string; status: EntryStatus; message: string; source: string }
export interface LogEntry { id: number; text: string; tone: Tone }

export interface UiSnapshot {
  state: GameState;
  paused: boolean;
  micOn: boolean;
  phase: Phase;
  interim: string;
  transcript: string;
  lastCommand: GameCommand | null;
  message: string;
  clarification: string | null;
  history: HistoryEntry[];
  log: LogEntry[];
  settings: Settings;
  modalRequest: ModalRequest;
  micError: string | null;
}

export interface ResultEvent { prev: GameState; state: GameState; events: GameEvent[] }

export interface ControllerOptions {
  interpret?: Interpreter;
  saves?: SaveManager;
  settings?: Settings;
  sfx?: Sfx;
  feedback?: VoiceFeedback;
  state?: GameState;
  persistSettings?: boolean;
  /** ms before the status chip returns to listening/idle; null disables the timer (tests). */
  phaseResetMs?: number | null;
  maxQueue?: number;
}

const ALLOWED_WHILE_PAUSED = new Set(['SYSTEM', 'LOOK', 'STATUS', 'INVENTORY', 'QUEST', 'LOCATE']);
const HISTORY_MAX = 30;
const LOG_MAX = 80;

export function summarize(c: GameCommand): string {
  if (c.actions.length === 0) return 'UNKNOWN';
  return c.actions.map(a => {
    switch (a.type) {
      case 'MOVE': return `MOVE ${a.direction} ×${a.distance}${a.careful ? ' (careful)' : ''}`;
      case 'MOVE_TO': return `GO TO ${a.target.toUpperCase()}`;
      case 'ATTACK': return `ATTACK ${(a.target ?? 'nearest').toUpperCase()}`;
      case 'INTERACT': return `INTERACT ${(a.target ?? 'nearby').toUpperCase()}`;
      case 'COLLECT': return `COLLECT ${(a.target ?? 'item').toUpperCase()}`;
      case 'USE_ITEM': case 'EQUIP_ITEM': case 'DROP_ITEM': return `${a.type.replace('_ITEM', '')} ${a.item.toUpperCase()}`;
      case 'STATUS': return `STATUS ${a.query}`;
      case 'LOCATE': return `LOCATE ${a.target.toUpperCase()}`;
      case 'SYSTEM': return a.command.replace('_', ' ');
      default: return a.type;
    }
  }).join(' → ');
}

export class GameController {
  readonly sfx: Sfx;
  readonly feedback: VoiceFeedback;
  private readonly saves: SaveManager;
  private readonly processor = new TranscriptProcessor();
  private readonly customInterpret?: Interpreter;
  private readonly phaseResetMs: number | null;
  private readonly maxQueue: number;
  private readonly persist: boolean;
  private snap: UiSnapshot;
  private listeners = new Set<() => void>();
  private resultListeners = new Set<(r: ResultEvent) => void>();
  private resetListeners = new Set<(s: GameState) => void>();
  private systemListeners = new Set<(c: SystemCommandName) => void>();
  private chain: Promise<void> = Promise.resolve();
  private pending = 0;
  private seq = 0;
  private lastTarget: string | undefined;
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: ControllerOptions = {}) {
    this.customInterpret = opts.interpret;
    this.saves = opts.saves ?? new SaveManager();
    this.sfx = opts.sfx ?? new Sfx();
    this.feedback = opts.feedback ?? new VoiceFeedback();
    this.phaseResetMs = opts.phaseResetMs === undefined ? 1600 : opts.phaseResetMs;
    this.maxQueue = opts.maxQueue ?? 3;
    this.persist = opts.persistSettings ?? true;
    const settings = { ...(opts.settings ?? DEFAULT_SETTINGS) };
    this.sfx.enabled = settings.sound;
    this.feedback.enabled = settings.tts;
    this.snap = {
      state: opts.state ?? createGame(), paused: false, micOn: false, phase: 'idle', interim: '', transcript: '',
      lastCommand: null, message: 'Press the orb or type a command. Try “look around”.', clarification: null,
      history: [], log: [], settings, modalRequest: null, micError: null
    };
  }

  // ----- store API (React useSyncExternalStore) -----
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = (): UiSnapshot => this.snap;
  onResult(fn: (r: ResultEvent) => void): () => void { this.resultListeners.add(fn); return () => { this.resultListeners.delete(fn); }; }
  onReset(fn: (s: GameState) => void): () => void { this.resetListeners.add(fn); return () => { this.resetListeners.delete(fn); }; }
  onSystem(fn: (c: SystemCommandName) => void): () => void { this.systemListeners.add(fn); return () => { this.systemListeners.delete(fn); }; }

  private set(patch: Partial<UiSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach(l => l());
  }

  private pushLog(text: string, tone: Tone): void {
    const log = [...this.snap.log, { id: ++this.seq, text, tone }].slice(-LOG_MAX);
    this.set({ log });
  }

  private setPhase(phase: Phase): void {
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
    this.set({ phase });
    if ((phase === 'completed' || phase === 'failed') && this.phaseResetMs !== null) {
      this.phaseTimer = setTimeout(() => {
        this.phaseTimer = null;
        this.set({ phase: this.snap.micOn ? 'listening' : 'idle' });
      }, this.phaseResetMs);
    }
  }

  // ----- game lifecycle -----
  newGame(): void {
    this.lastTarget = undefined;
    this.processor.reset();
    this.set({
      state: createGame(), paused: false, history: [], log: [], lastCommand: null, clarification: null, transcript: '', interim: '',
      message: 'You descend into the Crypt of Echoes. Say “look around”.', phase: this.snap.micOn ? 'listening' : 'idle'
    });
    this.pushLog('You descend into the Crypt of Echoes…', 'system');
    this.resetListeners.forEach(l => l(this.snap.state));
  }

  hasSave(): boolean { return this.saves.hasSave(); }

  loadGame(): boolean {
    const loaded = this.saves.load();
    if (!loaded) return false;
    this.lastTarget = undefined;
    this.set({ state: loaded.state, paused: false, history: [], log: [], lastCommand: null, clarification: null, message: 'Game loaded.' });
    this.pushLog('Game loaded.', 'system');
    this.resetListeners.forEach(l => l(this.snap.state));
    return true;
  }

  saveGame(): boolean {
    const ok = this.saves.save(this.snap.state);
    this.pushLog(ok ? 'Progress saved.' : 'Could not save (storage unavailable).', ok ? 'system' : 'warn');
    return ok;
  }

  updateSettings(patch: Partial<Settings>): void {
    const settings = { ...this.snap.settings, ...patch };
    this.sfx.enabled = settings.sound;
    this.feedback.enabled = settings.tts;
    if (!settings.tts) this.feedback.stop();
    if (this.persist) saveSettings(settings);
    this.set({ settings });
  }

  setPaused(paused: boolean): void { this.set({ paused }); }
  clearModalRequest(): void { this.set({ modalRequest: null }); }

  // ----- voice status (driven by the speech manager hook) -----
  setMic(on: boolean): void {
    this.set({ micOn: on, micError: on ? null : this.snap.micError, interim: on ? this.snap.interim : '' });
    if (this.snap.phase === 'idle' || this.snap.phase === 'listening') this.setPhase(on ? 'listening' : 'idle');
  }
  setInterim(text: string): void { this.set({ interim: text }); }
  setMicError(message: string | null): void {
    this.set({ micError: message });
    if (message) this.pushLog(message, 'warn');
  }

  // ----- command input -----
  buildContext(): ParseContext {
    const s = this.snap.state;
    return {
      facing: s.player.facing,
      nearbyEnemies: aliveEnemies(s).filter(e => isVisible(s, e.pos)).map(e => e.kind),
      lastTarget: this.lastTarget
    };
  }

  /** Voice or typed text. Commands are processed one at a time, in order. */
  submitText(raw: string, source: 'voice' | 'text' = 'text'): Promise<void> {
    const text = source === 'voice' ? this.processor.accept(raw) : this.processor.clean(raw);
    if (!text) return Promise.resolve();
    if (this.pending >= this.maxQueue) {
      this.pushLog('Too many commands queued. Wait a moment.', 'warn');
      return Promise.resolve();
    }
    this.pending++;
    const run = this.chain.then(() => this.processText(text, source));
    this.chain = run.catch(() => undefined).then(() => { this.pending--; });
    return run.catch(() => undefined);
  }

  /** Keyboard shortcuts bypass interpretation but use the same engine and validation. */
  runActions(actions: Action[], label: string): void {
    const command: GameCommand = {
      commandId: `kbd_${++this.seq}`, transcript: label, intent: actions.length === 1 ? actions[0]!.type : 'SEQUENCE',
      actions, confidence: 1, requiresConfirmation: false, source: 'keyboard'
    };
    this.applyCommand(command, label, 'keyboard');
  }

  private async processText(text: string, source: string): Promise<void> {
    this.set({ transcript: text, interim: '', clarification: null });
    this.setPhase('processing');
    const interpret = this.customInterpret ?? createInterpreter({ mode: this.snap.settings.aiMode, baseUrl: '' });
    let command: GameCommand;
    try {
      command = await interpret(text, this.buildContext());
    } catch {
      this.pushEntry(text, 'UNKNOWN', 'failed', 'Could not interpret that.', source);
      this.setPhase('failed');
      return;
    }
    this.set({ lastCommand: command });
    this.setPhase('recognized');
    this.applyCommand(command, text, source);
  }

  private pushEntry(transcript: string, summary: string, status: EntryStatus, message: string, source: string): void {
    const history = [...this.snap.history, { id: ++this.seq, transcript, summary, status, message, source }].slice(-HISTORY_MAX);
    this.set({ history, message });
  }

  private applyCommand(command: GameCommand, transcript: string, source: string): void {
    const summary = summarize(command);
    this.set({ lastCommand: command });
    this.pushLog(`» ${transcript}`, 'cmd');

    if (command.requiresConfirmation || command.actions.length === 0) {
      const msg = command.clarification ?? "I didn't understand that.";
      this.pushEntry(transcript, summary, 'clarify', msg, source);
      this.set({ clarification: msg });
      this.pushLog(msg, 'warn');
      this.sfx.play('error');
      this.feedback.speak(msg, this.snap.settings.language);
      this.setPhase('failed');
      return;
    }
    if (this.snap.paused && command.actions.some(a => !ALLOWED_WHILE_PAUSED.has(a.type))) {
      const msg = 'The game is paused. Say “resume” to continue.';
      this.pushEntry(transcript, summary, 'rejected', msg, source);
      this.pushLog(msg, 'warn');
      this.sfx.play('error');
      this.setPhase('failed');
      return;
    }

    this.setPhase('executing');
    const prev = this.snap.state;
    const result = executeCommand(prev, command);
    this.finish(result, prev, command, transcript, summary, source);
  }

  private finish(result: ExecutionResult, prev: GameState, command: GameCommand, transcript: string, summary: string, source: string): void {
    const messages = [...result.messages];
    for (const sys of result.system) messages.push(this.handleSystem(sys));
    const text = messages.filter(Boolean).join(' ') || 'Done.';

    for (const a of command.actions) {
      const t = (a as { target?: string }).target;
      if (t && !['it', 'that', 'this', 'there', 'here'].includes(t)) this.lastTarget = t;
    }

    const status: EntryStatus = result.clarification ? 'clarify' : result.ok ? 'ok' : 'failed';
    const evs = result.events;
    const tone: Tone =
      evs.some(e => e.kind === 'playerDied' || (e.kind === 'damage' && e.target === 'player')) ? 'bad'
        : evs.some(e => ['objective', 'levelUp', 'chest', 'pickup', 'win', 'enemyDefeated', 'heal'].includes(e.kind)) ? 'good'
          : result.ok ? 'info' : 'warn';

    this.set({ state: result.state, clarification: result.clarification ?? null });
    this.pushEntry(transcript, summary, status, text, source);
    this.pushLog(text, tone);
    if (!result.ok) this.sfx.play('error');
    this.feedback.speak(text, this.snap.settings.language);
    this.resultListeners.forEach(l => l({ prev, state: result.state, events: result.events }));
    this.setPhase(result.ok ? 'completed' : 'failed');
  }

  private handleSystem(cmd: SystemCommandName): string {
    this.systemListeners.forEach(l => l(cmd));
    switch (cmd) {
      case 'PAUSE': this.set({ paused: true }); return 'Game paused. Say “resume” to continue.';
      case 'RESUME': this.set({ paused: false }); return 'Game resumed.';
      case 'SAVE': return this.saves.save(this.snap.state) ? 'Progress saved.' : 'Could not save (storage unavailable).';
      case 'MUTE': this.updateSettings({ sound: false }); return 'Sound muted.';
      case 'UNMUTE': this.updateSettings({ sound: true }); return 'Sound on.';
      case 'STOP_LISTENING': return 'Microphone off.';
      case 'SETTINGS': this.set({ modalRequest: 'settings' }); return 'Opening settings.';
      case 'HELP': this.set({ modalRequest: 'help' }); return 'Opening the voice command guide.';
    }
  }
}


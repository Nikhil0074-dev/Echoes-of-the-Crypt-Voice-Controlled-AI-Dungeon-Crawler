// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechRecognitionManager, getRecognitionCtor, type RecognitionLike } from '../src/voice/SpeechRecognitionManager';
import { TranscriptProcessor } from '../src/voice/TranscriptProcessor';
import { VoiceFeedback } from '../src/voice/VoiceFeedback';
import { Sfx } from '../src/voice/Sfx';

class FakeRec implements RecognitionLike {
  static instances: FakeRec[] = [];
  lang = ''; continuous = false; interimResults = false; maxAlternatives = 0;
  onstart: (() => void) | null = null; onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onresult: RecognitionLike['onresult'] = null;
  started = 0; stopped = 0;
  constructor() { FakeRec.instances.push(this); }
  start() { this.started++; this.onstart?.(); }
  stop() { this.stopped++; this.onend?.(); }
  abort() { this.onend?.(); }
  emit(results: { text: string; final: boolean; conf?: number }[], resultIndex = 0) {
    const arr = results.map(r => ({ isFinal: r.final, length: 1, 0: { transcript: r.text, confidence: r.conf ?? 0.9 } }));
    (this.onresult as unknown as ((e: unknown) => void) | null)?.({ resultIndex, results: Object.assign(arr, { length: arr.length }) });
  }
}

beforeEach(() => { FakeRec.instances = []; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const make = (opts = {}, cb = {}) => new SpeechRecognitionManager({ ctor: FakeRec, ...opts }, cb);

describe('SpeechRecognitionManager', () => {
  it('reports unsupported browsers and refuses to start', () => {
    const onError = vi.fn();
    const m = new SpeechRecognitionManager({ ctor: null }, { onError });
    expect(m.supported).toBe(false);
    expect(m.start()).toBe(false);
    expect(onError).toHaveBeenCalledWith('not-supported', expect.stringMatching(/not supported/));
  });

  it('detects the standard and webkit constructors', () => {
    expect(getRecognitionCtor({})).toBeNull();
    expect(getRecognitionCtor({ webkitSpeechRecognition: FakeRec })).toBe(FakeRec);
    expect(getRecognitionCtor({ SpeechRecognition: FakeRec, webkitSpeechRecognition: class {} })).toBe(FakeRec);
  });

  it('configures the recogniser and fires start/end', () => {
    const onStart = vi.fn(), onEnd = vi.fn();
    const m = make({ lang: 'fr-FR' }, { onStart, onEnd });
    expect(m.start()).toBe(true);
    const r = FakeRec.instances[0]!;
    expect(r.lang).toBe('fr-FR');
    expect(r.interimResults).toBe(true);
    expect(r.continuous).toBe(true);
    expect(m.listening).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();
    m.stop();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(m.listening).toBe(false);
  });

  it('start is idempotent while listening', () => {
    const m = make();
    m.start(); m.start();
    expect(FakeRec.instances).toHaveLength(1);
  });

  it('separates interim and final results with confidence', () => {
    const onInterim = vi.fn(), onFinal = vi.fn();
    const m = make({}, { onInterim, onFinal });
    m.start();
    const r = FakeRec.instances[0]!;
    r.emit([{ text: 'move no', final: false }]);
    r.emit([{ text: ' move north ', final: true, conf: 0.77 }]);
    expect(onInterim).toHaveBeenCalledWith('move no');
    expect(onFinal).toHaveBeenCalledWith('move north', 0.77);
  });

  it('maps permission errors and does not auto-restart afterwards', () => {
    const onError = vi.fn(), onEnd = vi.fn();
    const m = make({ autoRestart: true }, { onError, onEnd });
    m.start();
    const r = FakeRec.instances[0]!;
    r.onerror?.({ error: 'not-allowed' });
    r.onend?.();
    vi.advanceTimersByTime(1000);
    expect(onError).toHaveBeenCalledWith('permission-denied', expect.stringMatching(/denied/));
    expect(FakeRec.instances).toHaveLength(1);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(m.wanted).toBe(false);
  });

  it('ignores benign no-speech errors but restarts in hands-free mode', () => {
    const onError = vi.fn();
    const m = make({ autoRestart: true, restartDelayMs: 100 }, { onError });
    m.start();
    FakeRec.instances[0]!.onerror?.({ error: 'no-speech' });
    FakeRec.instances[0]!.onend?.();
    expect(onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(FakeRec.instances).toHaveLength(2);
    expect(m.listening).toBe(true);
  });

  it('does not restart after an explicit stop', () => {
    const m = make({ autoRestart: true });
    m.start();
    m.stop();
    vi.advanceTimersByTime(1000);
    expect(FakeRec.instances).toHaveLength(1);
  });

  it('surfaces network and unknown errors', () => {
    const onError = vi.fn();
    const m = make({}, { onError });
    m.start();
    FakeRec.instances[0]!.onerror?.({ error: 'network' });
    FakeRec.instances[0]!.onerror?.({ error: 'weird' });
    expect(onError.mock.calls.map(c => c[0])).toEqual(['network', 'unknown']);
  });

  it('survives start() throwing', () => {
    class Boom extends FakeRec { override start(): void { throw new Error('already started'); } }
    const onError = vi.fn();
    const m = new SpeechRecognitionManager({ ctor: Boom }, { onError });
    m.start();
    expect(onError).toHaveBeenCalledWith('unknown', expect.any(String));
    expect(m.wanted).toBe(false);
  });

  it('changes language on the live recogniser', () => {
    const m = make();
    m.start();
    m.setLanguage('es-ES');
    expect(FakeRec.instances[0]!.lang).toBe('es-ES');
  });
});

describe('TranscriptProcessor', () => {
  it('drops empty input and collapses whitespace', () => {
    const p = new TranscriptProcessor();
    expect(p.accept('   ')).toBeNull();
    expect(p.accept('  move   north ')).toBe('move north');
  });

  it('suppresses repeated final transcripts inside the window only', () => {
    let t = 0;
    const p = new TranscriptProcessor(1000, () => t);
    expect(p.accept('Move north')).toBe('Move north');
    t = 500;
    expect(p.accept('move north!')).toBeNull();
    t = 1600;
    expect(p.accept('move north')).toBe('move north');
    expect(p.accept('attack')).toBe('attack');
  });

  it('reset clears dedupe state and long input is truncated', () => {
    let t = 0;
    const p = new TranscriptProcessor(1000, () => t);
    p.accept('look');
    p.reset();
    expect(p.accept('look')).toBe('look');
    expect(p.clean('x'.repeat(500))).toHaveLength(300);
  });
});

describe('VoiceFeedback', () => {
  const synth = () => ({ cancel: vi.fn(), speak: vi.fn() }) as unknown as SpeechSynthesis & { speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
  const utter = () => ({ lang: '', rate: 1 }) as unknown as SpeechSynthesisUtterance;

  it('does nothing when disabled or unsupported', () => {
    expect(new VoiceFeedback(null).speak('hi')).toBe(false);
    const s = synth();
    const f = new VoiceFeedback(s, utter);
    expect(f.speak('hi')).toBe(false);
    expect(s.speak).not.toHaveBeenCalled();
    expect(new VoiceFeedback(null).supported).toBe(false);
  });

  it('speaks when enabled and signals start/end so the mic can pause', () => {
    const s = synth();
    const f = new VoiceFeedback(s, utter);
    f.enabled = true;
    const onStart = vi.fn(), onEnd = vi.fn();
    f.onStart = onStart; f.onEnd = onEnd;
    expect(f.speak('The chest is locked.', 'en-GB')).toBe(true);
    const u = s.speak.mock.calls[0]![0] as SpeechSynthesisUtterance;
    expect(u.lang).toBe('en-GB');
    u.onstart?.(new Event('start') as SpeechSynthesisEvent);
    u.onend?.(new Event('end') as SpeechSynthesisEvent);
    expect(onStart).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
    expect(s.cancel).toHaveBeenCalled();
    expect(f.speak('   ')).toBe(false);
    f.stop();
  });
});

describe('Sfx', () => {
  it('never throws without WebAudio and respects the enabled flag', () => {
    const s = new Sfx();
    expect(() => s.play('hit')).not.toThrow();
    s.enabled = false;
    expect(() => s.play('win')).not.toThrow();
  });

  it('builds oscillator graphs with a fake AudioContext', () => {
    const osc = { type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(() => ({ connect: vi.fn() })), start: vi.fn(), stop: vi.fn() };
    const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    class Ctx { currentTime = 0; state = 'running'; destination = {}; createOscillator() { return osc; } createGain() { return gain; } resume() {} }
    vi.stubGlobal('AudioContext', Ctx);
    Object.defineProperty(window, 'AudioContext', { value: Ctx, configurable: true });
    const s = new Sfx();
    s.play('pickup');
    expect(osc.start).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

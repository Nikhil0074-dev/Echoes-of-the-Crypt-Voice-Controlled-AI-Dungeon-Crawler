interface RecAlt { transcript: string; confidence: number }
interface RecResult { isFinal: boolean; length: number; [i: number]: RecAlt }
interface RecEvent { resultIndex: number; results: { length: number; [i: number]: RecResult } }
interface RecErrorEvent { error: string }
export interface RecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((e: RecErrorEvent) => void) | null; onresult: ((e: RecEvent) => void) | null;
  start(): void; stop(): void; abort(): void;
}
export type RecognitionCtor = new () => RecognitionLike;

export type SpeechErrorCode =
  | 'not-supported' | 'permission-denied' | 'no-speech' | 'audio-capture' | 'network' | 'aborted' | 'unknown';

export interface SpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onInterim?: (text: string) => void;
  onFinal?: (text: string, confidence: number) => void;
  onError?: (code: SpeechErrorCode, message: string) => void;
}

export interface SpeechOptions {
  ctor?: RecognitionCtor | null;
  lang?: string;
  continuous?: boolean;
  /** Restart automatically when the browser ends the session (hands-free mode). */
  autoRestart?: boolean;
  restartDelayMs?: number;
}

export function getRecognitionCtor(win: unknown = typeof window !== 'undefined' ? window : undefined): RecognitionCtor | null {
  const w = win as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

const ERROR_MAP: Record<string, SpeechErrorCode> = {
  'not-allowed': 'permission-denied', 'service-not-allowed': 'permission-denied',
  'no-speech': 'no-speech', 'audio-capture': 'audio-capture', network: 'network', aborted: 'aborted'
};
export const SPEECH_ERROR_TEXT: Record<SpeechErrorCode, string> = {
  'not-supported': 'Speech recognition is not supported in this browser. Use Chrome, Edge or Safari, or type commands.',
  'permission-denied': 'Microphone access was denied. Allow it in your browser settings, or type commands.',
  'no-speech': 'I did not hear anything.',
  'audio-capture': 'No microphone was found.',
  network: 'The speech service could not be reached.',
  aborted: 'Listening was interrupted.',
  unknown: 'Speech recognition failed.'
};

export class SpeechRecognitionManager {
  private rec: RecognitionLike | null = null;
  private wantListening = false;
  private active = false;
  private fatal = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly ctor: RecognitionCtor | null;
  private lang: string;
  private readonly continuous: boolean;
  private autoRestart: boolean;
  private readonly restartDelay: number;

  constructor(opts: SpeechOptions = {}, private cb: SpeechCallbacks = {}) {
    this.ctor = opts.ctor === undefined ? getRecognitionCtor() : opts.ctor;
    this.lang = opts.lang ?? 'en-US';
    this.continuous = opts.continuous ?? true;
    this.autoRestart = opts.autoRestart ?? false;
    this.restartDelay = opts.restartDelayMs ?? 250;
  }

  get supported(): boolean { return this.ctor !== null; }
  get listening(): boolean { return this.active; }
  get wanted(): boolean { return this.wantListening; }
  setCallbacks(cb: SpeechCallbacks): void { this.cb = cb; }
  setLanguage(lang: string): void { this.lang = lang; if (this.rec) this.rec.lang = lang; }
  setAutoRestart(v: boolean): void { this.autoRestart = v; }

  start(): boolean {
    if (!this.ctor) { this.cb.onError?.('not-supported', SPEECH_ERROR_TEXT['not-supported']); return false; }
    if (this.wantListening) return true;
    this.wantListening = true;
    this.fatal = false;
    this.spawn();
    return true;
  }

  stop(): void {
    this.wantListening = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.rec) { try { this.rec.stop(); } catch { /* already stopped */ } }
    else if (this.active) { this.active = false; this.cb.onEnd?.(); }
  }

  private spawn(): void {
    if (!this.ctor) return;
    const rec = new this.ctor();
    rec.lang = this.lang;
    rec.continuous = this.continuous;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => { this.active = true; this.cb.onStart?.(); };
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const alt = r?.[0];
        if (!r || !alt) continue;
        if (r.isFinal) this.cb.onFinal?.(alt.transcript.trim(), alt.confidence);
        else interim += alt.transcript;
      }
      if (interim) this.cb.onInterim?.(interim.trim());
    };
    rec.onerror = e => {
      const code = ERROR_MAP[e.error] ?? 'unknown';
      if (code === 'permission-denied' || code === 'audio-capture') { this.fatal = true; this.wantListening = false; }
      if (code === 'no-speech' || code === 'aborted') return; // benign; onend decides about restarting
      this.cb.onError?.(code, SPEECH_ERROR_TEXT[code]);
    };
    rec.onend = () => {
      this.active = false;
      this.rec = null;
      if (this.wantListening && this.autoRestart && !this.fatal) {
        this.timer = setTimeout(() => { this.timer = null; if (this.wantListening) this.spawn(); }, this.restartDelay);
        return;
      }
      this.wantListening = false;
      this.cb.onEnd?.();
    };
    this.rec = rec;
    try { rec.start(); } catch {
      this.rec = null;
      this.wantListening = false;
      this.cb.onError?.('unknown', SPEECH_ERROR_TEXT.unknown);
    }
  }
}

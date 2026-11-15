export type SfxName = 'step' | 'bump' | 'hit' | 'hurt' | 'pickup' | 'open' | 'heal' | 'death' | 'win' | 'levelup' | 'error' | 'mic';

interface Tone { f: number; d: number; type?: OscillatorType; to?: number; v?: number; at?: number }
const RECIPES: Record<SfxName, Tone[]> = {
  step: [{ f: 110, d: 0.05, type: 'square', v: 0.04 }],
  bump: [{ f: 70, d: 0.08, type: 'sawtooth', v: 0.06 }],
  hit: [{ f: 220, d: 0.1, type: 'sawtooth', to: 90, v: 0.09 }],
  hurt: [{ f: 160, d: 0.18, type: 'square', to: 60, v: 0.1 }],
  pickup: [{ f: 660, d: 0.07, type: 'square', v: 0.07 }, { f: 990, d: 0.1, type: 'square', v: 0.07, at: 0.07 }],
  open: [{ f: 180, d: 0.15, type: 'triangle', to: 360, v: 0.08 }],
  heal: [{ f: 440, d: 0.1, type: 'sine', v: 0.08 }, { f: 660, d: 0.12, type: 'sine', v: 0.08, at: 0.1 }],
  death: [{ f: 200, d: 0.6, type: 'sawtooth', to: 40, v: 0.1 }],
  win: [{ f: 523, d: 0.12, type: 'square', v: 0.07 }, { f: 659, d: 0.12, type: 'square', v: 0.07, at: 0.12 }, { f: 784, d: 0.25, type: 'square', v: 0.07, at: 0.24 }],
  levelup: [{ f: 392, d: 0.1, type: 'square', v: 0.07 }, { f: 523, d: 0.1, type: 'square', v: 0.07, at: 0.1 }, { f: 784, d: 0.18, type: 'square', v: 0.07, at: 0.2 }],
  error: [{ f: 130, d: 0.14, type: 'square', v: 0.06 }],
  mic: [{ f: 880, d: 0.06, type: 'sine', v: 0.05 }]
};

/** Synthesised retro sound effects (no audio files). Silently does nothing without WebAudio. */
export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const C = typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
    if (!C) return null;
    try { this.ctx = new C(); } catch { this.ctx = null; }
    return this.ctx;
  }

  play(name: SfxName): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const t0 = ctx.currentTime;
      for (const tone of RECIPES[name]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = t0 + (tone.at ?? 0);
        osc.type = tone.type ?? 'square';
        osc.frequency.setValueAtTime(tone.f, start);
        if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.d);
        gain.gain.setValueAtTime(tone.v ?? 0.06, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.d);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + tone.d + 0.02);
      }
    } catch { /* audio is best-effort */ }
  }
}

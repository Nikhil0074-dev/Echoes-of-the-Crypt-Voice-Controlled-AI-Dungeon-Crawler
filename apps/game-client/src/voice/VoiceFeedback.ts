/** Optional text-to-speech. Callers can pause the microphone while the game speaks. */
export class VoiceFeedback {
  enabled = false;
  onStart?: () => void;
  onEnd?: () => void;

  constructor(
    private readonly synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null,
    private readonly makeUtterance: (t: string) => SpeechSynthesisUtterance | null =
      t => (typeof SpeechSynthesisUtterance !== 'undefined' ? new SpeechSynthesisUtterance(t) : null)
  ) {}

  get supported(): boolean { return this.synth !== null; }

  speak(text: string, lang = 'en-US'): boolean {
    if (!this.enabled || !this.synth || !text.trim()) return false;
    const u = this.makeUtterance(text);
    if (!u) return false;
    u.lang = lang;
    u.rate = 1.05;
    u.onstart = () => this.onStart?.();
    u.onend = () => this.onEnd?.();
    u.onerror = () => this.onEnd?.();
    this.synth.cancel();
    this.synth.speak(u);
    return true;
  }

  stop(): void { this.synth?.cancel(); }
}

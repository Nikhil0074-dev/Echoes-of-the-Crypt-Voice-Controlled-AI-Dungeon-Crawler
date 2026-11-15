import { normalizeText } from '@dungeon/ai-engine';

/** Cleans recognised speech and suppresses duplicate final transcripts (continuous recognition repeats). */
export class TranscriptProcessor {
  private lastKey = '';
  private lastAt = 0;
  constructor(private readonly windowMs = 1200, private readonly now: () => number = Date.now) {}

  clean(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  /** Returns the cleaned text, or null if empty / a duplicate of the previous command. */
  accept(raw: string): string | null {
    const text = this.clean(raw);
    if (!text) return null;
    const key = normalizeText(text);
    const t = this.now();
    if (key === this.lastKey && t - this.lastAt < this.windowMs) return null;
    this.lastKey = key;
    this.lastAt = t;
    return text;
  }

  reset(): void { this.lastKey = ''; this.lastAt = 0; }
}

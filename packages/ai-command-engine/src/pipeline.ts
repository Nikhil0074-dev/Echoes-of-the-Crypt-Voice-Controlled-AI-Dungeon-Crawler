import type { GameCommand, ParseContext } from '@dungeon/shared';
import { parseLocal } from './localParser';
import type { LLMProvider } from './providers';
import { buildUserPrompt, extractJson, SYSTEM_PROMPT } from './prompt';
import { validateCommand } from './validator';

export type PipelineMode = 'local' | 'hybrid' | 'llm';

export interface PipelineOptions {
  provider?: LLMProvider | null;
  /** local: never call the LLM. hybrid: local first, LLM only for unclear input. llm: LLM first. */
  mode?: PipelineMode;
  timeoutMs?: number;
  /** Local confidence at or above which hybrid mode skips the LLM. */
  localThreshold?: number;
}

export interface InterpretResult { command: GameCommand; usedLlm: boolean; llmError?: string }

export class CommandPipeline {
  private readonly provider: LLMProvider | null;
  private readonly mode: PipelineMode;
  private readonly timeoutMs: number;
  private readonly threshold: number;

  constructor(opts: PipelineOptions = {}) {
    this.provider = opts.provider ?? null;
    this.mode = opts.mode ?? 'hybrid';
    this.timeoutMs = opts.timeoutMs ?? 6000;
    this.threshold = opts.localThreshold ?? 0.85;
  }

  get providerName(): string { return this.provider?.name ?? 'local'; }

  async interpret(transcript: string, ctx: ParseContext = {}): Promise<InterpretResult> {
    const text = transcript.trim().slice(0, 300);
    const local = parseLocal(text, ctx);
    if (!this.provider || this.mode === 'local') return { command: local, usedLlm: false };
    if (this.mode === 'hybrid' && local.confidence >= this.threshold && !local.requiresConfirmation) {
      return { command: local, usedLlm: false };
    }
    try {
      const raw = await this.callLlm(text, ctx);
      const v = validateCommand({ ...(raw as object), transcript: text }, text);
      if (!v.ok) throw new Error(`invalid LLM output: ${v.errors.join('; ')}`);
      return { command: { ...v.command, source: 'llm' }, usedLlm: true };
    } catch (e) {
      return { command: local, usedLlm: false, llmError: e instanceof Error ? e.message : String(e) };
    }
  }

  private async callLlm(text: string, ctx: ParseContext): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const reply = await this.provider!.complete(SYSTEM_PROMPT, buildUserPrompt(text, ctx), ctl.signal);
      return extractJson(reply);
    } finally {
      clearTimeout(timer);
    }
  }
}

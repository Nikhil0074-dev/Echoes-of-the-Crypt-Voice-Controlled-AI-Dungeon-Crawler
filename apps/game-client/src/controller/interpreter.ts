import type { GameCommand, ParseContext } from '@dungeon/shared';
import { parseLocal, validateCommand } from '@dungeon/ai-engine';

export type Interpreter = (transcript: string, ctx: ParseContext) => Promise<GameCommand>;

export interface InterpreterOptions {
  mode: 'local' | 'server';
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Local mode runs the offline rule parser. Server mode asks the backend pipeline (which may use an LLM),
 * validates whatever comes back, and silently falls back to the local parser on any failure.
 */
export function createInterpreter(o: InterpreterOptions): Interpreter {
  return async (transcript, ctx) => {
    if (o.mode === 'server') {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 4000);
      try {
        const f = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
        const res = await f(`${o.baseUrl ?? ''}/api/v1/commands/interpret`, {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ transcript, context: ctx })
        });
        if (res.ok) {
          const body = (await res.json()) as { command?: unknown; usedLlm?: boolean };
          const v = validateCommand({ ...(body.command as object), transcript }, transcript);
          if (v.ok) return { ...v.command, source: body.usedLlm ? 'llm' : 'local' };
        }
      } catch { /* fall through to local */ } finally { clearTimeout(timer); }
    }
    return parseLocal(transcript, ctx);
  };
}

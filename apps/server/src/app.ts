import express, { type NextFunction, type Request, type Response } from 'express';
import type { GameState, ParseContext } from '@dungeon/shared';
import { CommandPipeline, validateCommand } from '@dungeon/ai-engine';
import { executeCommand } from '@dungeon/game-core';
import { rateLimiter } from './rateLimit';

export interface AppOptions {
  pipeline: CommandPipeline;
  clientOrigin?: string;
  rateLimitPerMinute?: number;
}

export const MAX_TRANSCRIPT = 300;

export function parseContext(raw: unknown): ParseContext {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const ctx: ParseContext = {};
  if (typeof r.facing === 'string' && ['NORTH', 'SOUTH', 'EAST', 'WEST'].includes(r.facing)) ctx.facing = r.facing as ParseContext['facing'];
  if (Array.isArray(r.nearbyEnemies)) ctx.nearbyEnemies = r.nearbyEnemies.filter((x): x is string => typeof x === 'string').slice(0, 10).map(s => s.slice(0, 30));
  if (typeof r.lastTarget === 'string') ctx.lastTarget = r.lastTarget.slice(0, 30);
  return ctx;
}

export function createApp(opts: AppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', opts.clientOrigin ?? '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ ok: true, ai: opts.pipeline.providerName });
  });

  api.post('/commands/interpret', rateLimiter(opts.rateLimitPerMinute ?? 120, 60_000), async (req, res) => {
    const transcript = (req.body as { transcript?: unknown })?.transcript;
    if (typeof transcript !== 'string' || transcript.trim().length === 0 || transcript.length > MAX_TRANSCRIPT) {
      res.status(400).json({ error: 'invalid_transcript', message: `transcript must be 1-${MAX_TRANSCRIPT} characters` });
      return;
    }
    const result = await opts.pipeline.interpret(transcript, parseContext((req.body as { context?: unknown }).context));
    res.json({ command: result.command, usedLlm: result.usedLlm });
  });

  // Validates a command and (optionally) dry-runs it against a client-provided state.
  api.post('/commands/validate', (req, res) => {
    const body = req.body as { command?: unknown; state?: unknown };
    const v = validateCommand(body?.command);
    if (!v.ok) { res.status(422).json({ valid: false, errors: v.errors }); return; }
    if (body.state === undefined) { res.json({ valid: true, command: v.command }); return; }
    const s = body.state as Partial<GameState>;
    if (!s || !Array.isArray(s.terrain) || !s.player || !Array.isArray(s.enemies)) {
      res.status(422).json({ valid: false, errors: ['state is malformed'] });
      return;
    }
    try {
      const r = executeCommand(s as GameState, v.command);
      res.json({ valid: true, command: v.command, preview: { ok: r.ok, messages: r.messages, clarification: r.clarification ?? null } });
    } catch {
      res.status(422).json({ valid: false, errors: ['state could not be processed'] });
    }
  });

  app.use('/api/v1', api);
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'not_found' }); });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    res.status(status).json({ error: status === 500 ? 'internal_error' : 'bad_request' });
  });
  return app;
}

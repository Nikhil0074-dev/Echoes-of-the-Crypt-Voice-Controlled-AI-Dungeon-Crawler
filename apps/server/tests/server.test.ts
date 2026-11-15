import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { CommandPipeline } from '@dungeon/ai-engine';
import { createGame } from '@dungeon/game-core';
import { createApp } from '../src/app';
import { attachSockets } from '../src/sockets';
import { rateLimiter } from '../src/rateLimit';

let http: HttpServer;
let base: string;
let io: Server;

beforeAll(async () => {
  const pipeline = new CommandPipeline();
  const app = createApp({ pipeline, rateLimitPerMinute: 1000 });
  http = createServer(app);
  io = new Server(http);
  attachSockets(io, pipeline);
  await new Promise<void>(r => http.listen(0, r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { io.close(); await new Promise(r => http.close(r)); });

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('REST API', () => {
  it('health reports local AI when no provider is configured', async () => {
    const r = await fetch(base + '/api/v1/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, ai: 'local' });
    expect(r.headers.get('x-powered-by')).toBeNull();
  });

  it('interprets a spoken command', async () => {
    const r = await post('/api/v1/commands/interpret', { transcript: 'Move three steps north', context: { facing: 'SOUTH' } });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.command.actions).toEqual([{ type: 'MOVE', direction: 'NORTH', distance: 3 }]);
    expect(body.usedLlm).toBe(false);
  });

  it.each([{}, { transcript: '' }, { transcript: 42 }, { transcript: 'x'.repeat(301) }])('rejects bad transcript %j', async b => {
    const r = await post('/api/v1/commands/interpret', b);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('invalid_transcript');
  });

  it('rejects malformed JSON with a 400, not a crash', async () => {
    const r = await fetch(base + '/api/v1/commands/interpret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    expect(r.status).toBe(400);
  });

  it('validates commands', async () => {
    const ok = await post('/api/v1/commands/validate', { command: { actions: [{ type: 'LOOK' }] } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).valid).toBe(true);
    const bad = await post('/api/v1/commands/validate', { command: { actions: [{ type: 'TELEPORT' }] } });
    expect(bad.status).toBe(422);
    expect((await bad.json()).valid).toBe(false);
  });

  it('dry-runs a command against a supplied state without mutating it', async () => {
    const state = createGame();
    const r = await post('/api/v1/commands/validate', { command: { actions: [{ type: 'MOVE', direction: 'NORTH', distance: 3 }] }, state });
    const body = await r.json();
    expect(body.valid).toBe(true);
    expect(body.preview.ok).toBe(false);
    expect(body.preview.messages[0]).toMatch(/wall/i);
    const bad = await post('/api/v1/commands/validate', { command: { actions: [{ type: 'LOOK' }] }, state: { nope: 1 } });
    expect(bad.status).toBe(422);
  });

  it('returns JSON 404 for unknown api routes', async () => {
    const r = await fetch(base + '/api/v1/nothing');
    expect(r.status).toBe(404);
  });

  it('answers CORS preflight', async () => {
    const r = await fetch(base + '/api/v1/commands/interpret', { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('rate limiter', () => {
  it('blocks after the limit and resets after the window', () => {
    let t = 0;
    const limit = rateLimiter(2, 1000, () => t);
    const statuses: number[] = [];
    const res = () => ({ setHeader() {}, status(s: number) { statuses.push(s); return { json() {} }; } }) as never;
    const req = { ip: '1.1.1.1' } as never;
    let passed = 0;
    const next = () => { passed++; };
    limit(req, res(), next); limit(req, res(), next); limit(req, res(), next);
    expect(passed).toBe(2);
    expect(statuses).toEqual([429]);
    t = 1500;
    limit(req, res(), next);
    expect(passed).toBe(3);
  });
});

describe('Socket.IO', () => {
  const open = (): Promise<Socket> => new Promise((resolve, reject) => {
    const s = connect(base, { transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
  const once = <T,>(s: Socket, ev: string) => new Promise<T>(r => s.once(ev, r));

  it('interprets voice transcripts in real time', async () => {
    const s = await open();
    const p = once<{ requestId: string; command: { actions: unknown[] } }>(s, 'command:interpreted');
    s.emit('voice:transcript', { requestId: 'r1', transcript: 'attack the goblin' });
    const r = await p;
    expect(r.requestId).toBe('r1');
    expect(r.command.actions).toEqual([{ type: 'ATTACK', target: 'goblin' }]);
    s.close();
  });

  it('rejects invalid payloads and duplicate request ids', async () => {
    const s = await open();
    let p = once<{ reason: string }>(s, 'command:rejected');
    s.emit('voice:transcript', { transcript: '' });
    expect((await p).reason).toBe('invalid_transcript');

    const first = once(s, 'command:interpreted');
    s.emit('voice:transcript', { requestId: 'dup', transcript: 'look around' });
    await first;
    p = once(s, 'command:rejected');
    s.emit('voice:transcript', { requestId: 'dup', transcript: 'look around' });
    expect((await p).reason).toBe('duplicate');
    s.close();
  });
});

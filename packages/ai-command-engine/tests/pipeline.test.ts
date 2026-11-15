import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, CommandPipeline, createProviderFromEnv, extractJson, buildUserPrompt, type LLMProvider } from '../src';

const provider = (impl: LLMProvider['complete']): LLMProvider => ({ name: 'mock', complete: vi.fn(impl) });
const json = (o: unknown) => JSON.stringify(o);

describe('CommandPipeline', () => {
  it('uses only the local parser without a provider', async () => {
    const r = await new CommandPipeline().interpret('move north');
    expect(r.usedLlm).toBe(false);
    expect(r.command.actions[0]).toMatchObject({ type: 'MOVE', direction: 'NORTH' });
  });

  it('hybrid mode skips the LLM when local parsing is confident', async () => {
    const p = provider(async () => json({ actions: [{ type: 'LOOK' }] }));
    const r = await new CommandPipeline({ provider: p }).interpret('go north');
    expect(p.complete).not.toHaveBeenCalled();
    expect(r.command.source).toBe('local');
  });

  it('hybrid mode asks the LLM for input the local parser cannot read', async () => {
    const p = provider(async () => 'Sure! ```json\n' + json({ actions: [{ type: 'MOVE', direction: 'EAST', distance: 2 }], confidence: 0.9 }) + '\n```');
    const r = await new CommandPipeline({ provider: p }).interpret('scoot over a smidge to starboard');
    expect(r.usedLlm).toBe(true);
    expect(r.command.source).toBe('llm');
    expect(r.command.transcript).toBe('scoot over a smidge to starboard');
    expect(r.command.actions).toEqual([{ type: 'MOVE', direction: 'EAST', distance: 2 }]);
  });

  it('llm mode always calls the provider and passes context', async () => {
    const p = provider(async () => json({ actions: [{ type: 'ATTACK', target: 'goblin' }] }));
    const r = await new CommandPipeline({ provider: p, mode: 'llm' }).interpret('go north', { lastTarget: 'goblin', nearbyEnemies: ['goblin'] });
    expect(p.complete).toHaveBeenCalledOnce();
    const userPrompt = (p.complete as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    expect(userPrompt).toContain('goblin');
    expect(r.command.actions[0]).toMatchObject({ type: 'ATTACK' });
  });

  it('falls back to local parsing when the LLM output is invalid', async () => {
    const p = provider(async () => json({ actions: [{ type: 'TELEPORT' }] }));
    const r = await new CommandPipeline({ provider: p, mode: 'llm' }).interpret('go north');
    expect(r.usedLlm).toBe(false);
    expect(r.llmError).toMatch(/invalid LLM output/);
    expect(r.command.actions[0]).toMatchObject({ type: 'MOVE' });
  });

  it('falls back when the provider throws or returns garbage', async () => {
    const boom = provider(async () => { throw new Error('network down'); });
    expect((await new CommandPipeline({ provider: boom, mode: 'llm' }).interpret('look around')).llmError).toMatch(/network down/);
    const junk = provider(async () => 'no json here');
    expect((await new CommandPipeline({ provider: junk, mode: 'llm' }).interpret('look around')).command.intent).toBe('LOOK');
  });

  it('times out slow providers', async () => {
    const slow = provider((_s, _u, signal) => new Promise((_res, rej) => signal?.addEventListener('abort', () => rej(new Error('aborted')))));
    const r = await new CommandPipeline({ provider: slow, mode: 'llm', timeoutMs: 20 }).interpret('look around');
    expect(r.usedLlm).toBe(false);
    expect(r.llmError).toMatch(/aborted/);
  });

  it('truncates very long transcripts', async () => {
    const r = await new CommandPipeline().interpret('go north ' + 'x'.repeat(1000));
    expect(r.command.transcript.length).toBeLessThanOrEqual(300);
  });
});

describe('prompt helpers', () => {
  it('extractJson tolerates fences and prose', () => {
    expect(extractJson('here you go: {"a":1} thanks')).toEqual({ a: 1 });
    expect(() => extractJson('nothing')).toThrow();
  });
  it('buildUserPrompt only includes limited context', () => {
    const p = buildUserPrompt('hi "there"', { facing: 'NORTH', nearbyEnemies: ['goblin'] });
    expect(p).toContain('"NORTH"');
    expect(p).toContain('\\"there\\"');
  });
});

describe('AnthropicProvider', () => {
  it('requires an api key', () => {
    expect(() => new AnthropicProvider({ apiKey: '' })).toThrow();
    expect(createProviderFromEnv({})).toBeNull();
    expect(createProviderFromEnv({ ANTHROPIC_API_KEY: 'k' })?.name).toBe('anthropic');
  });

  it('posts to the messages endpoint with auth headers and joins text blocks', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"a"' }, { type: 'text', text: ':1}' }] }), { status: 200 }));
    const p = new AnthropicProvider({ apiKey: 'secret', model: 'm', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await p.complete('sys', 'user')).toBe('{"a":1}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('secret');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'm', system: 'sys', temperature: 0 });
    expect(body.messages[0]).toEqual({ role: 'user', content: 'user' });
  });

  it('throws on HTTP errors and empty replies', async () => {
    const bad = new AnthropicProvider({ apiKey: 'k', fetchImpl: (async () => new Response('no', { status: 500 })) as unknown as typeof fetch });
    await expect(bad.complete('s', 'u')).rejects.toThrow(/500/);
    const empty = new AnthropicProvider({ apiKey: 'k', fetchImpl: (async () => new Response('{"content":[]}', { status: 200 })) as unknown as typeof fetch });
    await expect(empty.complete('s', 'u')).rejects.toThrow(/no text/);
  });
});

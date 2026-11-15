export interface LLMProvider {
  readonly name: string;
  complete(system: string, user: string, signal?: AbortSignal): Promise<string>;
}

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxTokens?: number;
}

/** Thin adapter over the Anthropic Messages API. Keys stay on the server. */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly o: Required<Omit<AnthropicOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(opts: AnthropicOptions) {
    if (!opts.apiKey) throw new Error('AnthropicProvider requires an apiKey');
    this.o = {
      apiKey: opts.apiKey,
      model: opts.model ?? 'claude-haiku-5-5',
      baseUrl: opts.baseUrl ?? 'https://api.anthropic.com',
      maxTokens: opts.maxTokens ?? 512,
      fetchImpl: opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
    };
  }

  async complete(system: string, user: string, signal?: AbortSignal): Promise<string> {
    const res = await this.o.fetchImpl(`${this.o.baseUrl}/v1/messages`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': this.o.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: this.o.model, max_tokens: this.o.maxTokens, temperature: 0, system,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!res.ok) throw new Error(`LLM request failed with status ${res.status}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('');
    if (!text) throw new Error('LLM returned no text');
    return text;
  }
}

export function createProviderFromEnv(env: Record<string, string | undefined>): LLMProvider | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  return new AnthropicProvider({ apiKey: key, model: env.AI_MODEL || undefined });
}

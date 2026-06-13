/**
 * Azure OpenAI client - API-key (secret) auth.
 * Configure in .env.local:
 *   AZURE_OPENAI_ENDPOINT   = https://<resource>.openai.azure.com
 *   AZURE_OPENAI_API_KEY    = <secret key>
 *   AZURE_OPENAI_DEPLOYMENT = <chat deployment name, e.g. gpt-4o>
 *   AZURE_OPENAI_API_VERSION= 2024-08-01-preview   (optional)
 * Server-only - never import into a client component.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AzureConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

export function getAzureConfig(): AzureConfig | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!endpoint || !apiKey || !deployment) return null;
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    apiKey,
    deployment,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview',
  };
}

export class AzureOpenAINotConfiguredError extends Error {
  constructor() {
    super(
      'Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT in .env.local.',
    );
    this.name = 'AzureOpenAINotConfiguredError';
  }
}

/** Sleep for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse Retry-After header; returns milliseconds or null. */
function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get('Retry-After');
  if (!raw) return null;
  const seconds = parseFloat(raw);
  if (!isNaN(seconds)) return Math.ceil(seconds) * 1000;
  const date = Date.parse(raw);
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

/** Call Azure OpenAI chat completions. Returns the assistant message content. */
export async function azureChat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const cfg = getAzureConfig();
  if (!cfg) throw new AzureOpenAINotConfiguredError();

  const url = `${cfg.endpoint}/openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.apiVersion}`;
  const maxTokens = Math.min(opts.maxTokens ?? 800, 4096);

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': cfg.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: maxTokens,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (fetchErr) {
      // Network / timeout error - rethrow without body
      throw new Error(
        `Azure OpenAI request failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
      );
    }

    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? '';
    }

    const isRetryable = res.status === 429 || res.status >= 500;

    if (isRetryable && attempt < MAX_ATTEMPTS) {
      // Log full body server-side only - never surface to caller
      const body = await res.text().catch(() => '(unreadable)');
      console.error(`[azureChat] attempt ${attempt} got ${res.status}, retrying. Body: ${body}`);

      const retryAfterMs = parseRetryAfter(res.headers);
      const backoffMs = retryAfterMs ?? Math.min(1000 * 2 ** (attempt - 1), 8000);
      await sleep(backoffMs);
      continue;
    }

    // Non-retryable or final attempt: log full body server-side, throw sanitized error
    const body = await res.text().catch(() => '(unreadable)');
    console.error(`[azureChat] Azure OpenAI returned ${res.status}. Body: ${body}`);
    throw new Error(`Azure OpenAI returned ${res.status}`);
  }

  // Should not be reached
  throw new Error('Azure OpenAI returned 429');
}

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

/** Call Azure OpenAI chat completions. Returns the assistant message content. */
export async function azureChat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const cfg = getAzureConfig();
  if (!cfg) throw new AzureOpenAINotConfiguredError();

  const url = `${cfg.endpoint}/openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.apiVersion}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': cfg.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 800,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Azure OpenAI returned ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

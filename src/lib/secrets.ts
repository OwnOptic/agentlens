/**
 * Secret resolution.
 *
 * Resolution order:
 *   1. KEY_VAULT_URI set -> read from Azure Key Vault via DefaultAzureCredential
 *      (managed identity in Container Apps, `az login` locally). 10-minute cache.
 *   2. Otherwise -> the matching environment variable (dashes become underscores).
 *
 * Returns undefined rather than throwing, so callers surface an honest
 * "not connected" state instead of a stack trace.
 */

import type { SecretClient } from '@azure/keyvault-secrets';

export type SecretName = 'AZURE-CLIENT-SECRET';

const ENV_MAP: Record<SecretName, string> = {
  'AZURE-CLIENT-SECRET': 'AZURE_CLIENT_SECRET',
};

interface CacheEntry {
  value: string;
  expiresAt: number;
}

let kvClient: SecretClient | null = null;
const cache = new Map<SecretName, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getKvClient(): Promise<SecretClient> {
  if (kvClient) return kvClient;

  const { SecretClient } = await import('@azure/keyvault-secrets');
  const { DefaultAzureCredential } = await import('@azure/identity');

  kvClient = new SecretClient(process.env.KEY_VAULT_URI!, new DefaultAzureCredential());
  return kvClient;
}

export async function getSecret(name: SecretName): Promise<string | undefined> {
  if (process.env.KEY_VAULT_URI) {
    const cached = cache.get(name);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    try {
      const client = await getKvClient();
      const result = await client.getSecret(name);
      if (result.value !== undefined) {
        cache.set(name, { value: result.value, expiresAt: Date.now() + CACHE_TTL_MS });
        return result.value;
      }
      return undefined;
    } catch {
      // Vault unreachable or secret absent - fall through to the environment.
      return process.env[ENV_MAP[name]];
    }
  }

  return process.env[ENV_MAP[name]];
}

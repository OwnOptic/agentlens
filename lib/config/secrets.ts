/**
 * secrets.ts - Single secret-resolution module (SERVER ONLY)
 *
 * Resolution order:
 *   1. If KEY_VAULT_URI is set: read from Azure Key Vault via DefaultAzureCredential
 *      (Managed Identity in prod, az login / env creds in dev). 10-min in-memory cache.
 *   2. Otherwise: map secret names to environment variables (dashes -> underscores).
 *
 * NEVER import this module from client components.
 * @server
 */

import type { SecretClient } from '@azure/keyvault-secrets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SecretName =
  | 'AZURE-CLIENT-SECRET'
  | 'AZURE-OPENAI-API-KEY'
  | 'SUPABASE-SERVICE-KEY'
  | 'CRON-SECRET'
  | 'TEAMS-WEBHOOK-URL'
  | 'AUTH-SECRET'
  | 'WEBAPP-CLIENT-SECRET';

// ---------------------------------------------------------------------------
// Env-var name mapping (dashes -> underscores)
// ---------------------------------------------------------------------------

const ENV_MAP: Record<SecretName, string> = {
  'AZURE-CLIENT-SECRET':    'AZURE_CLIENT_SECRET',
  'AZURE-OPENAI-API-KEY':   'AZURE_OPENAI_API_KEY',
  'SUPABASE-SERVICE-KEY':   'SUPABASE_SERVICE_KEY',
  'CRON-SECRET':            'CRON_SECRET',
  'TEAMS-WEBHOOK-URL':      'TEAMS_WEBHOOK_URL',
  'AUTH-SECRET':            'AUTH_SECRET',
  'WEBAPP-CLIENT-SECRET':   'WEBAPP_CLIENT_SECRET',
};

// ---------------------------------------------------------------------------
// Key Vault lazy-init + 10-min cache
// ---------------------------------------------------------------------------

interface CacheEntry { value: string; expiresAt: number }

let _kvClient: SecretClient | null = null;
const _cache = new Map<SecretName, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getKvClient(): Promise<SecretClient> {
  if (_kvClient) return _kvClient;

  const { SecretClient } = await import('@azure/keyvault-secrets');
  const { DefaultAzureCredential } = await import('@azure/identity');

  const vaultUri = process.env.KEY_VAULT_URI!;
  _kvClient = new SecretClient(vaultUri, new DefaultAzureCredential());
  return _kvClient;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a secret by name.
 * Returns undefined (never throws) when the secret is genuinely absent so
 * callers can surface an honest "not configured" state.
 */
export async function getSecret(name: SecretName): Promise<string | undefined> {
  if (process.env.KEY_VAULT_URI) {
    // Check in-memory cache first
    const cached = _cache.get(name);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const client = await getKvClient();
      const result = await client.getSecret(name);
      const value = result.value;
      if (value !== undefined) {
        _cache.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
        return value;
      }
      return undefined;
    } catch {
      // Key Vault unavailable or secret not found - fall through to env
      return process.env[ENV_MAP[name]];
    }
  }

  // No Key Vault configured - resolve from environment
  return process.env[ENV_MAP[name]];
}

/**
 * Returns a map of each secret name to its resolution status.
 * Values are NEVER included - this is safe to log or return to the UI.
 */
export async function getSecretSourceMap(): Promise<Record<SecretName, 'keyvault' | 'env' | 'missing'>> {
  const useKv = Boolean(process.env.KEY_VAULT_URI);

  const entries = await Promise.all(
    (Object.keys(ENV_MAP) as SecretName[]).map(async (name) => {
      const value = await getSecret(name);
      let source: 'keyvault' | 'env' | 'missing';
      if (value === undefined) {
        source = 'missing';
      } else if (useKv) {
        source = 'keyvault';
      } else {
        source = 'env';
      }
      return [name, source] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<SecretName, 'keyvault' | 'env' | 'missing'>;
}

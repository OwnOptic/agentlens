/**
 * probes.ts - Setup readiness probe battery (SERVER ONLY)
 *
 * Runs each integration area check independently (try/catch, 8s timeout).
 * Results are cached in-module for 5 minutes to avoid hammering credentials
 * on every page load.
 *
 * Import: runAllProbes() -> SetupStatus
 * @server
 */

import type { SetupCheck, SetupStatus } from '@/lib/setup/types';
import { getSecretSourceMap } from '@/lib/config/secrets';
import { isAuthEnabled, safeError } from '@/lib/auth/guard';
import { getAzureConfig } from '@/lib/ai/azureOpenAI';

// ---------------------------------------------------------------------------
// Module-level 5-minute cache
// ---------------------------------------------------------------------------

interface ProbeCache {
  status: SetupStatus;
  expiresAt: number;
}

let _cache: ProbeCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Probe timed out after ${ms}ms`)), ms),
    ),
  ]);
}

const PROBE_TIMEOUT = 8_000;

// ---------------------------------------------------------------------------
// IDENTITY probes
// ---------------------------------------------------------------------------

async function probeSpConfigured(): Promise<SetupCheck> {
  const configured = Boolean(process.env.AZURE_CLIENT_ID);
  return {
    key: 'identity_sp_configured',
    label: 'Service principal configured (AZURE_CLIENT_ID)',
    area: 'identity',
    status: configured ? 'ok' : 'missing',
    detail: configured
      ? 'AZURE_CLIENT_ID is set.'
      : 'AZURE_CLIENT_ID is not set. The app cannot authenticate to Azure.',
    fix: configured
      ? undefined
      : 'Set AZURE_CLIENT_ID in .env.local or in Key Vault as AZURE-CLIENT-ID.',
  };
}

async function probeArmToken(): Promise<SetupCheck> {
  const hasClientId = Boolean(process.env.AZURE_CLIENT_ID);
  if (!hasClientId) {
    return {
      key: 'identity_arm_token',
      label: 'Can acquire ARM token',
      area: 'identity',
      status: 'missing',
      detail: 'Skipped - AZURE_CLIENT_ID not configured.',
      fix: 'Configure service principal first.',
    };
  }

  try {
    const { getToken: acquireToken } = await import('@/lib/auth/tokenService');
    await withTimeout(
      acquireToken('https://management.azure.com/.default'),
      PROBE_TIMEOUT,
    );
    return {
      key: 'identity_arm_token',
      label: 'Can acquire ARM token',
      area: 'identity',
      status: 'ok',
      detail: 'ARM token acquired successfully.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      key: 'identity_arm_token',
      label: 'Can acquire ARM token',
      area: 'identity',
      status: 'error',
      detail: `Token acquisition failed: ${msg.slice(0, 200)}`,
      fix: 'az ad sp create-for-rbac --name agentlens --role Reader --scopes /subscriptions/<id>',
    };
  }
}

async function probeAuthEnabled(): Promise<SetupCheck> {
  const enabled = isAuthEnabled();
  return {
    key: 'identity_auth_enabled',
    label: 'Auth enabled (AZURE_AD_CLIENT_ID + AUTH_SECRET / KEY_VAULT_URI)',
    area: 'identity',
    status: enabled ? 'ok' : 'missing',
    detail: enabled
      ? 'Auth is enabled. Users must sign in via Azure AD.'
      : 'Auth is disabled (dev/pre-setup mode). Set AZURE_AD_CLIENT_ID and AUTH_SECRET to enable.',
    fix: enabled
      ? undefined
      : 'Set AZURE_AD_CLIENT_ID and AUTH_SECRET in .env.local, then restart.',
  };
}

// ---------------------------------------------------------------------------
// DATA probes
// ---------------------------------------------------------------------------

async function probeArgQuery(): Promise<SetupCheck> {
  const hasClientId = Boolean(process.env.AZURE_CLIENT_ID);
  if (!hasClientId) {
    return {
      key: 'data_arg_query',
      label: 'Azure Resource Graph - 1-row probe query',
      area: 'data',
      status: 'missing',
      detail: 'Skipped - service principal not configured.',
      fix: 'Configure AZURE_CLIENT_ID first.',
    };
  }

  try {
    const { getToken: acquireToken } = await import('@/lib/auth/tokenService');
    const token = await withTimeout(
      acquireToken('https://management.azure.com/.default'),
      PROBE_TIMEOUT,
    );

    const res = await withTimeout(
      fetch('https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'Resources | limit 1 | project id',
          options: { resultFormat: 'objectArray' },
        }),
        cache: 'no-store',
      }),
      PROBE_TIMEOUT,
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        key: 'data_arg_query',
        label: 'Azure Resource Graph - 1-row probe query',
        area: 'data',
        status: 'error',
        detail: `ARG returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        fix: 'Grant Reader role on the subscription: az role assignment create --role Reader --assignee <clientId> --scope /subscriptions/<id>',
      };
    }

    return {
      key: 'data_arg_query',
      label: 'Azure Resource Graph - 1-row probe query',
      area: 'data',
      status: 'ok',
      detail: 'ARG probe query returned successfully.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      key: 'data_arg_query',
      label: 'Azure Resource Graph - 1-row probe query',
      area: 'data',
      status: 'error',
      detail: `ARG probe failed: ${msg.slice(0, 200)}`,
      fix: 'az role assignment create --role Reader --assignee <clientId> --scope /subscriptions/<id>',
    };
  }
}

async function probeDataverse(): Promise<SetupCheck> {
  const orgUrls = process.env.AGENTLENS_ORG_URLS;
  if (!orgUrls) {
    return {
      key: 'data_dataverse',
      label: 'Dataverse - AGENTLENS_ORG_URLS configured',
      area: 'data',
      status: 'missing',
      detail: 'AGENTLENS_ORG_URLS is not set. Dataverse queries will not run.',
      fix: 'Set AGENTLENS_ORG_URLS=https://yourorg.crm.dynamics.com in .env.local',
    };
  }

  // Try to acquire a token for the first org URL
  const firstOrg = orgUrls.split(',')[0].trim();
  try {
    const { getDataverseToken } = await import('@/lib/auth/tokenService');
    await withTimeout(
      getDataverseToken(firstOrg),
      PROBE_TIMEOUT,
    );
    return {
      key: 'data_dataverse',
      label: 'Dataverse - AGENTLENS_ORG_URLS configured',
      area: 'data',
      status: 'ok',
      detail: `AGENTLENS_ORG_URLS set and token acquirable for ${firstOrg}.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      key: 'data_dataverse',
      label: 'Dataverse - AGENTLENS_ORG_URLS configured',
      area: 'data',
      status: 'error',
      detail: `Dataverse token acquisition failed for ${firstOrg}: ${msg.slice(0, 200)}`,
      fix: 'Grant the service principal the Dataverse System Customizer or Reader role in the Power Platform admin center.',
    };
  }
}

async function probeAgent365(): Promise<SetupCheck> {
  const hasClientId = Boolean(process.env.AZURE_CLIENT_ID);
  if (!hasClientId) {
    return {
      key: 'data_agent365',
      label: 'Agent 365 Graph probe',
      area: 'data',
      status: 'missing',
      detail: 'Skipped - service principal not configured.',
      fix: 'Configure AZURE_CLIENT_ID first.',
    };
  }

  try {
    const { getToken: acquireToken } = await import('@/lib/auth/tokenService');
    const token = await withTimeout(
      acquireToken('https://graph.microsoft.com/.default'),
      PROBE_TIMEOUT,
    );

    // Probe the Agent 365 endpoint
    const res = await withTimeout(
      fetch('https://graph.microsoft.com/v1.0/solutions/virtualEvents', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }),
      PROBE_TIMEOUT,
    );

    if (res.status === 403) {
      // Endpoint is real but the tenant does not have Agent 365 licensing
      return {
        key: 'data_agent365',
        label: 'Agent 365 Graph probe',
        area: 'data',
        status: 'license_required',
        detail: 'Endpoint is reachable but returned 403 - needs Agent 365 license.',
        fix: 'Assign Agent 365 (or M365 E5) licenses to the service account in M365 admin center > Licenses.',
      };
    }

    if (!res.ok) {
      const text = await res.text();
      return {
        key: 'data_agent365',
        label: 'Agent 365 Graph probe',
        area: 'data',
        status: 'error',
        detail: `Graph returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        fix: 'Check Graph API permissions: add AgentService.Read.All in Azure Portal > App registrations > API permissions.',
      };
    }

    return {
      key: 'data_agent365',
      label: 'Agent 365 Graph probe',
      area: 'data',
      status: 'ok',
      detail: 'Agent 365 Graph endpoint reachable.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      key: 'data_agent365',
      label: 'Agent 365 Graph probe',
      area: 'data',
      status: 'error',
      detail: `Agent 365 probe failed: ${msg.slice(0, 200)}`,
      fix: 'Check network connectivity and Graph API permissions.',
    };
  }
}

// ---------------------------------------------------------------------------
// AI probes
// ---------------------------------------------------------------------------

async function probeAzureOpenAIConfigured(): Promise<SetupCheck> {
  const cfg = getAzureConfig();
  if (!cfg) {
    const missing: string[] = [];
    if (!process.env.AZURE_OPENAI_ENDPOINT) missing.push('AZURE_OPENAI_ENDPOINT');
    if (!process.env.AZURE_OPENAI_API_KEY) missing.push('AZURE_OPENAI_API_KEY');
    if (!process.env.AZURE_OPENAI_DEPLOYMENT) missing.push('AZURE_OPENAI_DEPLOYMENT');
    return {
      key: 'ai_openai_configured',
      label: 'Azure OpenAI configured',
      area: 'ai',
      status: 'missing',
      detail: `Missing: ${missing.join(', ')}. AI features (summaries, NL queries) will not work.`,
      fix: `az keyvault secret set --vault-name <vault> --name AZURE-OPENAI-API-KEY --value <key>`,
    };
  }
  return {
    key: 'ai_openai_configured',
    label: 'Azure OpenAI configured',
    area: 'ai',
    status: 'ok',
    // Do not include endpoint URL or deployment name in the browser-visible detail.
    detail: 'Azure OpenAI endpoint and deployment configured.',
  };
}

async function probeAzureOpenAIPing(): Promise<SetupCheck> {
  const cfg = getAzureConfig();
  if (!cfg) {
    return {
      key: 'ai_openai_ping',
      label: 'Azure OpenAI - 1-token ping',
      area: 'ai',
      status: 'missing',
      detail: 'Skipped - Azure OpenAI not configured.',
      fix: 'Configure AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT.',
    };
  }

  try {
    const url = `${cfg.endpoint}/openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.apiVersion}`;
    const res = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: { 'api-key': cfg.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        cache: 'no-store',
      }),
      PROBE_TIMEOUT,
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        key: 'ai_openai_ping',
        label: 'Azure OpenAI - 1-token ping',
        area: 'ai',
        status: 'error',
        detail: `Azure OpenAI returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        fix: 'Verify the deployment name and API key are correct in .env.local or Key Vault.',
      };
    }

    return {
      key: 'ai_openai_ping',
      label: 'Azure OpenAI - 1-token ping',
      area: 'ai',
      status: 'ok',
      detail: 'Azure OpenAI endpoint responded successfully.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      key: 'ai_openai_ping',
      label: 'Azure OpenAI - 1-token ping',
      area: 'ai',
      status: 'error',
      detail: `Ping failed: ${msg.slice(0, 200)}`,
      fix: 'Check network connectivity to Azure OpenAI endpoint.',
    };
  }
}

// ---------------------------------------------------------------------------
// STORAGE probes
// ---------------------------------------------------------------------------

async function probeSupabase(): Promise<SetupCheck> {
  const dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_URL;
  if (!dbUrl) {
    return {
      key: 'storage_supabase',
      label: 'Supabase / DATABASE_URL configured',
      area: 'storage',
      status: 'missing',
      detail: 'Neither DATABASE_URL nor SUPABASE_URL is set. Audit history and alerts will not persist.',
      fix: 'Set DATABASE_URL=postgresql://... in .env.local (from Supabase project settings > Database > Connection string).',
    };
  }
  return {
    key: 'storage_supabase',
    label: 'Supabase / DATABASE_URL configured',
    area: 'storage',
    status: 'ok',
    detail: 'DATABASE_URL is set.',
  };
}

async function probeKeyVault(): Promise<SetupCheck> {
  const kvUri = process.env.KEY_VAULT_URI;
  if (!kvUri) {
    return {
      key: 'storage_keyvault',
      label: 'Azure Key Vault configured (KEY_VAULT_URI)',
      area: 'storage',
      status: 'missing',
      detail: 'KEY_VAULT_URI is not set. Secrets are read from environment variables only.',
      fix: 'Set KEY_VAULT_URI=https://<vault>.vault.azure.net in .env.local for production secret management.',
    };
  }

  // Check whether the secret source map shows any keyvault hits
  try {
    const sourceMap = await withTimeout(getSecretSourceMap(), PROBE_TIMEOUT);
    const kvHits = Object.values(sourceMap).filter((s) => s === 'keyvault').length;
    if (kvHits === 0) {
      return {
        key: 'storage_keyvault',
        label: 'Azure Key Vault configured (KEY_VAULT_URI)',
        area: 'storage',
        status: 'error',
        // Do not echo the KV URI into the browser-visible detail.
        detail: 'KEY_VAULT_URI is set but no secrets were resolved from Key Vault. Check credentials and secret names.',
        fix: 'az keyvault secret list --vault-name <vault> — verify secret names match the expected convention (e.g. AZURE-CLIENT-SECRET).',
      };
    }
    return {
      key: 'storage_keyvault',
      label: 'Azure Key Vault configured (KEY_VAULT_URI)',
      area: 'storage',
      status: 'ok',
      // Do not include the vault URI in browser-visible output.
      detail: `Key Vault reachable. ${kvHits} secret(s) resolved from Key Vault.`,
    };
  } catch (err) {
    return {
      key: 'storage_keyvault',
      label: 'Azure Key Vault configured (KEY_VAULT_URI)',
      area: 'storage',
      status: 'error',
      detail: `Key Vault probe failed: ${safeError(err).slice(0, 200)}`,
      fix: 'Ensure the identity running the app has Key Vault Secrets Reader role: az role assignment create --role "Key Vault Secrets User" --assignee <principalId> --scope <kvResourceId>',
    };
  }
}

// ---------------------------------------------------------------------------
// HOSTING probes
// ---------------------------------------------------------------------------

async function probeHostingEnvVars(): Promise<SetupCheck> {
  const checks: Array<{ name: string; set: boolean }> = [
    { name: 'NEXTAUTH_URL', set: Boolean(process.env.NEXTAUTH_URL) },
    { name: 'CRON_SECRET', set: Boolean(process.env.CRON_SECRET) },
    { name: 'TEAMS_WEBHOOK_URL', set: Boolean(process.env.TEAMS_WEBHOOK_URL) },
  ];

  const missing = checks.filter((c) => !c.set).map((c) => c.name);
  const present = checks.filter((c) => c.set).map((c) => c.name);

  if (missing.length === 0) {
    return {
      key: 'hosting_env_vars',
      label: 'Hosting env vars (NEXTAUTH_URL / CRON_SECRET / TEAMS_WEBHOOK_URL)',
      area: 'hosting',
      status: 'ok',
      detail: `All hosting vars set: ${present.join(', ')}.`,
    };
  }

  if (missing.length === checks.length) {
    return {
      key: 'hosting_env_vars',
      label: 'Hosting env vars (NEXTAUTH_URL / CRON_SECRET / TEAMS_WEBHOOK_URL)',
      area: 'hosting',
      status: 'missing',
      detail: `None of the hosting vars are set: ${missing.join(', ')}.`,
      fix: 'Set in .env.local: NEXTAUTH_URL=https://agentlens.yourdomain.com, CRON_SECRET=<random>, TEAMS_WEBHOOK_URL=<webhook>.',
    };
  }

  return {
    key: 'hosting_env_vars',
    label: 'Hosting env vars (NEXTAUTH_URL / CRON_SECRET / TEAMS_WEBHOOK_URL)',
    area: 'hosting',
    status: 'missing',
    detail: `Missing: ${missing.join(', ')}. Present: ${present.join(', ')}.`,
    fix: `Set in .env.local: ${missing.map((v) => `${v}=<value>`).join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full probe battery and return a SetupStatus.
 * Results are cached for 5 minutes.
 */
export async function runAllProbes(forceRefresh = false): Promise<SetupStatus> {
  if (!forceRefresh && _cache && _cache.expiresAt > Date.now()) {
    return _cache.status;
  }

  // Run all probes concurrently; each is individually wrapped in try/catch
  const probes: Array<() => Promise<SetupCheck>> = [
    // identity
    probeSpConfigured,
    probeArmToken,
    probeAuthEnabled,
    // data
    probeArgQuery,
    probeDataverse,
    probeAgent365,
    // ai
    probeAzureOpenAIConfigured,
    probeAzureOpenAIPing,
    // storage
    probeSupabase,
    probeKeyVault,
    // hosting
    probeHostingEnvVars,
  ];

  const checks = await Promise.all(
    probes.map(async (probe) => {
      try {
        return await probe();
      } catch (err) {
        // Defensive catch - no probe should escape, but just in case
        const msg = err instanceof Error ? err.message : String(err);
        return {
          key: 'unknown_probe_error',
          label: 'Unknown probe',
          area: 'identity' as const,
          status: 'error' as const,
          detail: `Probe threw unexpectedly: ${msg.slice(0, 200)}`,
        };
      }
    }),
  );

  const status: SetupStatus = {
    checkedAt: new Date().toISOString(),
    checks,
  };

  _cache = { status, expiresAt: Date.now() + CACHE_TTL_MS };
  return status;
}

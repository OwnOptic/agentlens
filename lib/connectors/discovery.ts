/**
 * Multi-source agent discovery - identify EVERY Microsoft agent in the tenant.
 *
 * There is no single API. Agents live in 4 stores, each with its own API + admin role:
 *   1. Copilot Studio + M365 Agent Builder -> Azure Resource Graph (PowerPlatformResources)
 *   2. All M365 agents (broadest registry)  -> Agent 365 / M365 Copilot Graph (copilotPackages)
 *   3. Azure AI Foundry agents              -> Foundry project REST API (/agents)
 *   4. Microsoft Fabric data agents         -> Fabric Admin REST API (/admin/items?type=DataAgent)
 *
 * T-202: Promise.allSettled so one failing source never rejects the whole sweep.
 *        Token acquisition is INSIDE each source's try/catch so a token error
 *        degrades that one source to status='error' only.
 *
 * Each source is queried only if its token is configured; otherwise it degrades to
 * "not_configured" so the rest of the sweep still returns.
 */

import { getArmToken, getGraphToken, getToken } from '@/lib/auth/tokenService';
import { fetchArgAll } from '@/lib/connectors/odata';

export type AgentPlatform =
  | 'copilot_studio'
  | 'm365_agentbuilder'
  | 'm365_declarative'
  | 'foundry'
  | 'fabric';

export interface UnifiedAgent {
  id: string;
  name: string;
  platform: AgentPlatform;
  owner: string | null;
  location: string | null; // environment / project / workspace
  source: string;          // the API it was discovered through
  status?: 'error';
  error?: string;
  details?: Record<string, unknown>;
}

export type SourceStatus = 'ok' | 'not_configured' | 'error';

export interface DiscoverySource {
  key: string;
  label: string;
  api: string;
  requiredRole: string;
  status: SourceStatus;
  count: number;
  error?: string;
  agents: UnifiedAgent[];
}

export interface DiscoveryResult {
  fetchedAt: string;
  sources: DiscoverySource[];
  total: number;
}

/* 1) Power Platform: Copilot Studio + M365 Agent Builder ----------- */
async function discoverPowerPlatform(): Promise<DiscoverySource> {
  const base: DiscoverySource = {
    key: 'power_platform',
    label: 'Copilot Studio + Agent Builder',
    api: 'Azure Resource Graph (PowerPlatformResources)',
    requiredRole: 'Power Platform Administrator',
    status: 'not_configured',
    count: 0,
    agents: [],
  };

  // Token acquisition is INSIDE try/catch so a token failure degrades only this source
  try {
    const token = await getArmToken();
    if (!token) return base;

    const { rows, truncated } = await fetchArgAll(
      token,
      "PowerPlatformResources | where type == 'microsoft.copilotstudio/agents' | project name, properties | limit 500",
    );

    const agents: UnifiedAgent[] = rows.map((r) => {
      const p = (r['properties'] ?? {}) as Record<string, unknown>;
      const createdIn = String(p['createdIn'] ?? '');
      return {
        id: String(r['name']),
        name: String(p['displayName'] ?? r['name']),
        platform: createdIn.includes('Agent Builder') ? 'm365_agentbuilder' : 'copilot_studio',
        owner: (p['ownerId'] as string) ?? null,
        location: (p['environmentId'] as string) ?? null,
        source: 'arg',
        details: { model: p['model'], authentication: p['authentication'], channels: p['channels'] },
      };
    });

    return {
      ...base,
      status: 'ok',
      count: agents.length,
      agents,
      ...(truncated ? { error: 'Result set truncated at 5000 rows' } : {}),
    };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/* 2) All M365 agents: Agent 365 / Copilot copilotPackages Graph ---- */
async function discoverM365(): Promise<DiscoverySource> {
  const base: DiscoverySource = {
    key: 'm365',
    label: 'All M365 agents (Agent 365 registry)',
    api: 'Graph copilotPackages (preview)',
    requiredRole: 'AI Administrator',
    status: 'not_configured',
    count: 0,
    agents: [],
  };

  try {
    const token = await getGraphToken();
    if (!token) return base;

    // Package Management API - REQUIRES a Microsoft Agent 365 license (else 403).
    const res = await fetch(
      "https://graph.microsoft.com/beta/copilot/admin/catalog/packages?$filter=supportedHosts/any(h:h eq 'Copilot')",
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (res.status === 403) throw new Error('403 - requires a Microsoft Agent 365 license (AI Admin + CopilotPackages.Read.All)');
    if (!res.ok) throw new Error(`Graph ${res.status}`);
    const json = (await res.json()) as { value?: Record<string, unknown>[] };
    const items: Record<string, unknown>[] = json.value ?? [];
    const agents: UnifiedAgent[] = items.map((it) => ({
      id: String(it['id'] ?? ''),
      name: String(it['displayName'] ?? it['name'] ?? 'Unknown'),
      platform: 'm365_declarative',
      owner: ((it['publisherName'] ?? it['publisher']) as string) ?? null,
      location: Array.isArray(it['elementTypes']) ? (it['elementTypes'] as string[]).join(', ') : 'Microsoft 365',
      source: 'graph-copilotPackages',
      details: it,
    }));
    return { ...base, status: 'ok', count: agents.length, agents };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/* 3) Azure AI Foundry agents -------------------------------------- */
async function discoverFoundry(): Promise<DiscoverySource> {
  const base: DiscoverySource = {
    key: 'foundry',
    label: 'Azure AI Foundry agents',
    api: 'Foundry project REST API (/agents)',
    requiredRole: 'Azure AI access (ai.azure.com)',
    status: 'not_configured',
    count: 0,
    agents: [],
  };

  try {
    const endpoint = process.env.MVP_FOUNDRY_PROJECT_ENDPOINT;
    if (!endpoint) return base;

    // Foundry uses the ARM audience
    const token = await getToken('https://management.azure.com/.default', 'MVP_FOUNDRY_TOKEN');
    if (!token) return base;

    const res = await fetch(`${endpoint.replace(/\/$/, '')}/agents?api-version=v1`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Foundry ${res.status}`);
    const json = (await res.json()) as { data?: Record<string, unknown>[]; value?: Record<string, unknown>[] };
    const items: Record<string, unknown>[] = json.data ?? json.value ?? [];
    const agents: UnifiedAgent[] = items.map((it) => ({
      id: String(it['id'] ?? it['name'] ?? ''),
      name: String(it['name'] ?? 'Unknown'),
      platform: 'foundry',
      owner: null,
      location: endpoint.split('/projects/')[1] ?? 'Foundry project',
      source: 'foundry',
      details: it,
    }));
    return { ...base, status: 'ok', count: agents.length, agents };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/* 4) Microsoft Fabric data agents --------------------------------- */
async function discoverFabric(): Promise<DiscoverySource> {
  const base: DiscoverySource = {
    key: 'fabric',
    label: 'Microsoft Fabric data agents',
    api: 'Fabric Admin REST (/admin/items?type=DataAgent)',
    requiredRole: 'Fabric Administrator',
    status: 'not_configured',
    count: 0,
    agents: [],
  };

  try {
    // Fabric uses the Power BI / Fabric audience; fall back to MVP_FABRIC_TOKEN dev env
    const token = await getToken('https://analysis.windows.net/powerbi/api/.default', 'MVP_FABRIC_TOKEN');
    if (!token) return base;

    const res = await fetch('https://api.fabric.microsoft.com/v1/admin/items?type=DataAgent', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Fabric ${res.status}`);
    const json = (await res.json()) as { itemEntities?: Record<string, unknown>[]; value?: Record<string, unknown>[] };
    const items: Record<string, unknown>[] = json.itemEntities ?? json.value ?? [];
    const agents: UnifiedAgent[] = items.map((it) => ({
      id: String(it['id'] ?? ''),
      name: String(it['name'] ?? it['displayName'] ?? 'Unknown'),
      platform: 'fabric',
      owner: null,
      location: (it['workspaceId'] as string) ?? 'Fabric workspace',
      source: 'fabric-admin',
      details: it,
    }));
    return { ...base, status: 'ok', count: agents.length, agents };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Run all sources via Promise.allSettled - a rejected source maps to status='error'
 * instead of rejecting the whole sweep.
 */
export async function discoverAllAgents(): Promise<DiscoveryResult> {
  const settled = await Promise.allSettled([
    discoverPowerPlatform(),
    discoverM365(),
    discoverFoundry(),
    discoverFabric(),
  ]);

  const sources: DiscoverySource[] = settled.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // Unexpected rejection from a source (internal bug) - surface as error
    const labels = ['power_platform', 'm365', 'foundry', 'fabric'];
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return {
      key: labels[i] ?? `source_${i}`,
      label: labels[i] ?? `Source ${i}`,
      api: 'unknown',
      requiredRole: 'unknown',
      status: 'error' as SourceStatus,
      count: 0,
      error: reason,
      agents: [],
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    sources,
    total: sources.reduce((n, s) => n + s.count, 0),
  };
}

export const PLATFORM_LABEL: Record<AgentPlatform, string> = {
  copilot_studio: 'Copilot Studio',
  m365_agentbuilder: 'M365 Agent Builder',
  m365_declarative: 'M365 Declarative',
  foundry: 'Azure AI Foundry',
  fabric: 'Fabric Data Agent',
};

/**
 * Multi-store agent discovery - find EVERY Microsoft agent in the tenant.
 *
 * There is no single API for this. Agents live in four stores, each with its own
 * API and its own admin role:
 *   1. Copilot Studio + M365 Agent Builder -> Azure Resource Graph (PowerPlatformResources)
 *   2. All M365 agents (broadest registry) -> Graph copilotPackages (Agent 365, licence gated)
 *   3. Azure AI Foundry agents             -> Foundry project REST API (/agents)
 *   4. Microsoft Fabric data agents        -> Fabric Admin REST (/admin/items?type=DataAgent)
 *
 * Every source runs under Promise.allSettled and carries its own status, so one
 * unreachable store degrades to `not_configured` or `error` for that store alone
 * and the rest of the sweep still returns. A store that could not be read is
 * NEVER reported as zero agents - zero and unknown are different findings.
 */

import { getArmToken, getGraphToken, getToken, FABRIC_SCOPE, ARM_SCOPE } from '../lib/tokens.js';
import { fetchArgAll } from './odata.js';
import type { Agent } from '../domain/types.js';

export type SourceStatus = 'ok' | 'not_configured' | 'error';

export interface DiscoverySource {
  key: string;
  label: string;
  /** The API this store is read through - named to the administrator. */
  api: string;
  /** What the service principal needs in order to read it. */
  requiredRole: string;
  status: SourceStatus;
  count: number;
  error?: string;
  truncated?: boolean;
  agents: Agent[];
}

export interface DiscoveryResult {
  fetchedAt: string;
  sources: DiscoverySource[];
  /** Total across the stores that were READ. Stores that failed are excluded. */
  total: number;
}

/* 1) Power Platform: Copilot Studio + M365 Agent Builder ------------------- */
async function discoverPowerPlatform(): Promise<DiscoverySource> {
  const base: DiscoverySource = {
    key: 'power_platform',
    label: 'Copilot Studio + Agent Builder',
    api: 'Azure Resource Graph (PowerPlatformResources)',
    requiredRole: 'Reader on the subscription + Power Platform Administrator',
    status: 'not_configured',
    count: 0,
    agents: [],
  };

  // Token acquisition sits INSIDE the try so a token failure degrades this
  // source only, rather than rejecting the whole sweep.
  try {
    const token = await getArmToken();
    if (!token) return base;

    const { rows, truncated } = await fetchArgAll(
      token,
      "PowerPlatformResources | where type == 'microsoft.copilotstudio/agents' | project name, properties",
    );

    const agents: Agent[] = rows.map((r) => {
      const p = (r['properties'] ?? {}) as Record<string, unknown>;
      const createdIn = String(p['createdIn'] ?? '');
      return {
        id: String(r['name']),
        name: String(p['displayName'] ?? r['name']),
        platform: createdIn.includes('Agent Builder') ? 'm365_agentbuilder' : 'copilot_studio',
        owner: (p['ownerId'] as string) ?? null,
        location: (p['environmentId'] as string) ?? null,
        envId: (p['environmentId'] as string) ?? undefined,
        source: 'Azure Resource Graph',
      };
    });

    return { ...base, status: 'ok', count: agents.length, agents, truncated };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/* 2) All M365 agents: Agent 365 / copilotPackages -------------------------- */
async function discoverM365(): Promise<DiscoverySource> {
  const base: DiscoverySource = {
    key: 'm365',
    label: 'M365 agents (Agent 365 registry)',
    api: 'Microsoft Graph copilotPackages (beta)',
    requiredRole: 'AI Administrator + CopilotPackages.Read.All (Agent 365 licence)',
    status: 'not_configured',
    count: 0,
    agents: [],
  };

  try {
    const token = await getGraphToken();
    if (!token) return base;

    const res = await fetch(
      "https://graph.microsoft.com/beta/copilot/admin/catalog/packages?$filter=supportedHosts/any(h:h eq 'Copilot')",
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      },
    );

    // 403 here almost always means the tenant is not licensed for Agent 365.
    // That is a configuration fact, not a failure of the sweep.
    if (res.status === 403) {
      throw new Error(
        'HTTP 403 - requires a Microsoft Agent 365 licence plus AI Administrator and CopilotPackages.Read.All',
      );
    }
    if (!res.ok) throw new Error(`Microsoft Graph returned HTTP ${res.status}`);

    const json = (await res.json()) as { value?: Record<string, unknown>[] };
    const agents: Agent[] = (json.value ?? []).map((it) => ({
      id: String(it['id'] ?? ''),
      name: String(it['displayName'] ?? it['name'] ?? 'Unknown'),
      platform: 'm365_declarative',
      owner: ((it['publisherName'] ?? it['publisher']) as string) ?? null,
      location: 'Microsoft 365',
      source: 'Microsoft Graph',
    }));

    return { ...base, status: 'ok', count: agents.length, agents };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/* 3) Azure AI Foundry agents ---------------------------------------------- */
async function discoverFoundry(): Promise<DiscoverySource> {
  const base: DiscoverySource = {
    key: 'foundry',
    label: 'Azure AI Foundry agents',
    api: 'Foundry project REST API (/agents)',
    requiredRole: 'Azure AI Developer on the Foundry project',
    status: 'not_configured',
    count: 0,
    agents: [],
  };

  try {
    const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
    if (!endpoint) return base;

    const token = await getToken(ARM_SCOPE);
    if (!token) return base;

    const res = await fetch(`${endpoint.replace(/\/$/, '')}/agents?api-version=v1`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Foundry returned HTTP ${res.status}`);

    const json = (await res.json()) as {
      data?: Record<string, unknown>[];
      value?: Record<string, unknown>[];
    };
    const items = json.data ?? json.value ?? [];
    const projectName = endpoint.split('/projects/')[1] ?? 'Foundry project';

    const agents: Agent[] = items.map((it) => ({
      id: String(it['id'] ?? it['name'] ?? ''),
      name: String(it['name'] ?? 'Unknown'),
      platform: 'foundry',
      owner: null,
      location: projectName,
      source: 'Azure AI Foundry',
    }));

    return { ...base, status: 'ok', count: agents.length, agents };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/* 4) Microsoft Fabric data agents ----------------------------------------- */
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
    const token = await getToken(FABRIC_SCOPE);
    if (!token) return base;

    const res = await fetch('https://api.fabric.microsoft.com/v1/admin/items?type=DataAgent', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Fabric returned HTTP ${res.status}`);

    const json = (await res.json()) as {
      itemEntities?: Record<string, unknown>[];
      value?: Record<string, unknown>[];
    };
    const items = json.itemEntities ?? json.value ?? [];

    const agents: Agent[] = items.map((it) => ({
      id: String(it['id'] ?? ''),
      name: String(it['name'] ?? it['displayName'] ?? 'Unknown'),
      platform: 'fabric',
      owner: null,
      location: (it['workspaceId'] as string) ?? 'Fabric workspace',
      source: 'Microsoft Fabric',
    }));

    return { ...base, status: 'ok', count: agents.length, agents };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Sweep all four stores concurrently.
 * `total` counts only the stores that were actually read.
 */
export async function discoverAllAgents(): Promise<DiscoveryResult> {
  const keys = ['power_platform', 'm365', 'foundry', 'fabric'];
  const settled = await Promise.allSettled([
    discoverPowerPlatform(),
    discoverM365(),
    discoverFoundry(),
    discoverFabric(),
  ]);

  const sources: DiscoverySource[] = settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;

    // An unexpected rejection is a bug in this file, not a tenant condition.
    // Surface it as an error rather than letting it read as "no agents".
    return {
      key: keys[i] ?? `source_${i}`,
      label: keys[i] ?? `Source ${i}`,
      api: 'unknown',
      requiredRole: 'unknown',
      status: 'error' as SourceStatus,
      count: 0,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      agents: [],
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    sources,
    total: sources.filter((s) => s.status === 'ok').reduce((n, s) => n + s.count, 0),
  };
}

/**
 * Multi-source agent discovery - identify EVERY Microsoft agent in the tenant.
 *
 * There is no single API. Agents live in 4 stores, each with its own API + admin role:
 *   1. Copilot Studio + M365 Agent Builder -> Azure Resource Graph (PowerPlatformResources)
 *   2. All M365 agents (broadest registry)  -> Agent 365 / M365 Copilot Graph (copilotPackages)
 *   3. Azure AI Foundry agents              -> Foundry project REST API (/agents)
 *   4. Microsoft Fabric data agents         -> Fabric Admin REST API (/admin/items?type=DataAgent)
 *
 * Each source is queried only if its token is configured; otherwise it degrades to
 * "not_configured" so the rest of the sweep still returns. See
 * reference_all_microsoft_agents_discovery for the full API map.
 */

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

const ARG = 'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01';

async function argQuery(token: string, query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(ARG, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, options: { resultFormat: 'objectArray' } }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ARG ${res.status}`);
  return (await res.json()).data ?? [];
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
  const token = process.env.MVP_ARM_TOKEN;
  if (!token) return base;
  try {
    const rows = await argQuery(
      token,
      "PowerPlatformResources | where type == 'microsoft.copilotstudio/agents' | project name, properties | limit 500",
    );
    const agents: UnifiedAgent[] = rows.map((r) => {
      const p = (r.properties ?? {}) as Record<string, unknown>;
      const createdIn = String(p.createdIn ?? '');
      return {
        id: String(r.name),
        name: String(p.displayName ?? r.name),
        platform: createdIn.includes('Agent Builder') ? 'm365_agentbuilder' : 'copilot_studio',
        owner: (p.ownerId as string) ?? null,
        location: (p.environmentId as string) ?? null,
        source: 'arg',
        details: { model: p.model, authentication: p.authentication, channels: p.channels },
      };
    });
    return { ...base, status: 'ok', count: agents.length, agents };
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
  const token = process.env.MVP_GRAPH_TOKEN;
  if (!token) return base;
  try {
    const res = await fetch('https://graph.microsoft.com/beta/admin/copilot/copilotPackages', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Graph ${res.status}`);
    const json = await res.json();
    const items: Record<string, unknown>[] = json.value ?? [];
    const agents: UnifiedAgent[] = items.map((it) => ({
      id: String(it.id ?? it.packageId ?? ''),
      name: String(it.displayName ?? it.name ?? 'Unknown'),
      platform: 'm365_declarative',
      owner: (it.publisher as string) ?? null,
      location: 'Microsoft 365',
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
  const token = process.env.MVP_FOUNDRY_TOKEN;
  const endpoint = process.env.MVP_FOUNDRY_PROJECT_ENDPOINT; // https://{acct}.services.ai.azure.com/api/projects/{project}
  if (!token || !endpoint) return base;
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/agents?api-version=v1`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Foundry ${res.status}`);
    const json = await res.json();
    const items: Record<string, unknown>[] = json.data ?? json.value ?? [];
    const agents: UnifiedAgent[] = items.map((it) => ({
      id: String(it.id ?? it.name ?? ''),
      name: String(it.name ?? 'Unknown'),
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
  const token = process.env.MVP_FABRIC_TOKEN;
  if (!token) return base;
  try {
    const res = await fetch('https://api.fabric.microsoft.com/v1/admin/items?type=DataAgent', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Fabric ${res.status}`);
    const json = await res.json();
    const items: Record<string, unknown>[] = json.itemEntities ?? json.value ?? [];
    const agents: UnifiedAgent[] = items.map((it) => ({
      id: String(it.id ?? ''),
      name: String(it.name ?? it.displayName ?? 'Unknown'),
      platform: 'fabric',
      owner: null,
      location: (it.workspaceId as string) ?? 'Fabric workspace',
      source: 'fabric-admin',
      details: it,
    }));
    return { ...base, status: 'ok', count: agents.length, agents };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/** Run all sources in parallel and aggregate. */
export async function discoverAllAgents(): Promise<DiscoveryResult> {
  const sources = await Promise.all([
    discoverPowerPlatform(),
    discoverM365(),
    discoverFoundry(),
    discoverFabric(),
  ]);
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

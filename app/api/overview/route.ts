import { NextResponse } from 'next/server';
import { getAzureConfig } from '@/lib/ai/azureOpenAI';
import { getArmToken, getGraphToken, clearTokenCache } from '@/lib/auth/tokenService';

/**
 * GET /api/overview - REAL tenant posture from Azure Resource Graph + which data
 * sources are currently connected (transparency).
 */
export const dynamic = 'force-dynamic';

const ARG = 'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01';

async function arg(token: string, query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(ARG, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, options: { resultFormat: 'objectArray' } }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ARG ${res.status}`);
  return (await res.json()).data ?? [];
}

export async function GET() {
  const [armToken, graphToken] = await Promise.all([getArmToken(), getGraphToken()]);

  const hasSp = Boolean(process.env.AZURE_CLIENT_ID && process.env.AZURE_TENANT_ID);

  // Source connection states (transparency)
  const sources = [
    {
      key: 'arg',
      label: 'Azure Resource Graph',
      powers: 'Overview, Inventory, Sprawl, Discovery, Compliance, Risky Patterns',
      role: 'Power Platform Admin',
      state: armToken ? 'live' : 'not_connected',
    },
    {
      key: 'dataverse',
      label: 'Dataverse transcripts',
      powers: 'Conversation KPIs (intent/sentiment)',
      role: 'Service principal + env URLs',
      state: hasSp && process.env.AGENTLENS_ORG_URLS ? 'live' : 'not_connected',
    },
    {
      key: 'openai',
      label: 'Azure OpenAI',
      powers: 'Ask (AI), Conversation KPI classifier',
      role: 'Azure OpenAI key',
      state: getAzureConfig() ? 'live' : 'not_connected',
    },
    {
      key: 'licensing',
      label: 'PPAC Licensing API',
      powers: 'Cost & Capacity',
      role: 'Power Platform Admin',
      state: 'not_connected',
    },
    {
      key: 'appinsights',
      label: 'Azure App Insights',
      powers: 'Health',
      role: 'App Insights reader',
      state: 'not_connected',
    },
    {
      key: 'graph',
      label: 'Agent 365 (Graph)',
      powers: 'M365 agent discovery',
      role: 'AI Admin + Agent 365 license',
      state: graphToken ? 'live' : 'not_connected',
    },
  ];

  if (!armToken) {
    return NextResponse.json({
      connected: false,
      sources,
      agents: 0,
      environments: 0,
      defaultEnvAgents: 0,
      orphans: 0,
      resourceSummary: [],
    });
  }

  try {
    const [summary, envs, agents] = await Promise.all([
      arg(armToken, 'PowerPlatformResources | summarize c=count() by type | order by c desc'),
      arg(armToken, "PowerPlatformResources | where type == 'microsoft.powerplatform/environments' | project name, properties"),
      arg(armToken, "PowerPlatformResources | where type == 'microsoft.copilotstudio/agents' | project name, properties | limit 500"),
    ]);

    const defaultEnvIds = new Set(
      envs
        .filter((e) => (e.properties as Record<string, unknown>)?.isDefault)
        .map((e) => e.name as string),
    );
    const agentObjs = agents.map((a) => (a.properties ?? {}) as Record<string, unknown>);
    const defaultEnvAgents = agentObjs.filter((p) => defaultEnvIds.has(p.environmentId as string)).length;
    const orphans = agentObjs.filter((p) => !p.ownerId).length;

    return NextResponse.json(
      {
        connected: true,
        fetchedAt: new Date().toISOString(),
        sources,
        agents: agents.length,
        environments: envs.length,
        defaultEnvAgents,
        orphans,
        resourceSummary: summary.map((r) => ({ type: r.type as string, count: r.c as number })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 401 -> evict cache so next request re-acquires via SP flow
    if (msg.includes('401')) clearTokenCache();
    return NextResponse.json(
      {
        connected: false,
        sources,
        error: msg,
        agents: 0,
        environments: 0,
        defaultEnvAgents: 0,
        orphans: 0,
        resourceSummary: [],
      },
      { status: 200 },
    );
  }
}

import { NextResponse } from 'next/server';

/**
 * LIVE data route - queries the real MVP tenant via Azure Resource Graph.
 * Uses MVP_ARM_TOKEN (a user token, demo only). In production this is the
 * service-principal token from lib/auth/tokenService. This proves the ARG
 * backbone end-to-end against a real tenant.
 */

const ARG_ENDPOINT =
  'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01';

export const dynamic = 'force-dynamic';

async function arg(token: string, query: string) {
  const res = await fetch(ARG_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, options: { resultFormat: 'objectArray' } }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`ARG returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  return json.data ?? [];
}

export async function GET() {
  const token = process.env.MVP_ARM_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'MVP_ARM_TOKEN not configured', hint: 'Run the device-code login and set the token in .env.local' },
      { status: 500 },
    );
  }

  try {
    const [summaryRaw, environments, agents] = await Promise.all([
      arg(token, 'PowerPlatformResources | summarize c=count() by type | order by c desc'),
      arg(
        token,
        "PowerPlatformResources | where type == 'microsoft.powerplatform/environments' | project name, properties | limit 50",
      ),
      arg(
        token,
        "PowerPlatformResources | where type == 'microsoft.copilotstudio/agents' | project name, properties | limit 200",
      ),
    ]);

    return NextResponse.json(
      {
        source: 'live-arg',
        tenant: 'MVP',
        fetchedAt: new Date().toISOString(),
        summary: summaryRaw.map((r: { type: string; c: number }) => ({ type: r.type, count: r.c })),
        environments: environments.map((e: { name: string; properties: Record<string, unknown> }) => ({
          id: e.name,
          displayName: e.properties?.displayName ?? e.name,
          environmentType: e.properties?.environmentType ?? e.properties?.environmentSku ?? 'unknown',
          region: e.properties?.region ?? e.properties?.azureRegion ?? '-',
          isDefault: Boolean(e.properties?.isDefault),
        })),
        agents,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), hint: 'The token likely expired (~60-90 min) - re-run the login.' },
      { status: 502 },
    );
  }
}

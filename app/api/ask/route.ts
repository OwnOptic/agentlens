/**
 * POST /api/ask  - AgentLens "Ask AI"
 *
 * Answers a natural-language question about the tenant's Copilot agent
 * governance posture, grounded on REAL live tenant data (Azure Resource Graph),
 * using Azure OpenAI (secret-key auth). No mock data.
 */

import { NextResponse } from 'next/server';
import { azureChat, getAzureConfig } from '@/lib/ai/azureOpenAI';
import { getArmToken, clearTokenCache } from '@/lib/auth/tokenService';
// auth-sso: guard + rate-limiter applied here; other route slices call requireSession in their own files
import { requireSession, rateLimit, safeError } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

const ARG_ENDPOINT =
  'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01';

async function arg(token: string, query: string): Promise<unknown[]> {
  const res = await fetch(ARG_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, options: { resultFormat: 'objectArray' } }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ARG ${res.status}`);
  return (await res.json()).data ?? [];
}

/** Build a grounding context from REAL tenant data (ARG). */
async function buildLiveContext(): Promise<{ context: string; live: boolean }> {
  const token = await getArmToken();
  if (!token) return { context: 'No live tenant connection configured.', live: false };
  try {
    const [summary, environments, agents] = await Promise.all([
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
    const context = JSON.stringify(
      {
        resourceCounts: summary,
        environmentCount: environments.length,
        environments: environments.map((e) => {
          const env = e as { name: string; properties: Record<string, unknown> };
          return {
            id: env.name,
            displayName: env.properties?.displayName,
            type: env.properties?.environmentType,
            isDefault: env.properties?.isDefault,
          };
        }),
        copilotStudioAgentCount: agents.length,
        agents,
      },
      null,
      0,
    );
    return { context, live: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('401')) clearTokenCache();
    return { context: `Live query failed: ${msg}`, live: false };
  }
}

const SYSTEM_PROMPT = `You are AgentLens, an AI assistant for Microsoft Copilot Studio agent governance.
Answer the user's question using ONLY the real tenant data provided below (JSON from Azure Resource Graph).
Be concise, specific, and cite numbers from the data. If the data does not contain the answer, say so plainly
and suggest what to check. Never invent agents, environments, or numbers that are not in the data.`;

export async function POST(request: Request): Promise<NextResponse> {
  // Auth guard - returns 401 when auth is enabled and no valid session token
  const guard = await requireSession(request);
  if (!guard.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Per-user rate limit: 30 requests per minute
  const rateLimitKey = guard.user.email ?? guard.user.name ?? 'anonymous';
  const rl = rateLimit(rateLimitKey, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs },
      { status: 429 },
    );
  }

  if (!getAzureConfig()) {
    return NextResponse.json(
      {
        error: 'Azure OpenAI not configured',
        hint: 'Add AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT to .env.local',
      },
      { status: 503 },
    );
  }

  let question = '';
  try {
    const body = (await request.json()) as { question?: string };
    question = (body.question ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 });

  try {
    const { context, live } = await buildLiveContext();
    const answer = await azureChat(
      [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\nTENANT DATA:\n${context}` },
        { role: 'user', content: question },
      ],
      { temperature: 0.2, maxTokens: 700 },
    );
    return NextResponse.json({ answer, grounded: live, dataSource: live ? 'live-arg' : 'none' });
  } catch (e) {
    return NextResponse.json(
      { error: safeError(e), hint: 'Check the Azure OpenAI deployment + key.' },
      { status: 502 },
    );
  }
}

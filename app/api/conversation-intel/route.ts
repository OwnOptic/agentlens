import { NextResponse } from 'next/server';
import { getConversationIntel } from '@/lib/connectors/transcripts';
import { requireSession, safeError } from '@/lib/auth/guard';

/**
 * GET /api/conversation-intel - real conversation KPI signals derived from
 * Dataverse conversationtranscript content (intent + sentiment), aggregated per agent.
 * Org URLs come from AGENTLENS_ORG_URLS (comma-separated Dataverse env URLs).
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  const orgUrls = (process.env.AGENTLENS_ORG_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const result = await getConversationIntel(orgUrls);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 502 });
  }
}

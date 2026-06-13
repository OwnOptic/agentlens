import { NextResponse } from 'next/server';
import type { ConversationKpi } from '@/lib/types';
import { mockConversationKpis } from '@/lib/mock/seed';
import { requireSession } from '@/lib/auth/guard';

/**
 * GET /api/kpis
 * Returns aggregate conversation KPIs (sessions, deflection rate, escalation rate)
 * for all agents across all environments.
 *
 * Response contains aggregate-only data; no conversation content or user identifiers.
 * Data sourced from Copilot Studio native analytics or App Insights aggregation.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse<{ kpis: ConversationKpi[]; dataSource: 'mock' } | { error: string }>> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  try {
    // TODO: Integrate with KpisConnector (Copilot Studio analytics endpoint)
    // For now, return mock seed data to allow the app to run offline

    return NextResponse.json({ kpis: mockConversationKpis, dataSource: 'mock' });
  } catch (error) {
    console.error('Error fetching conversation KPIs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversation KPIs' },
      { status: 500 }
    );
  }
}

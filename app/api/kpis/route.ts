import { NextResponse } from 'next/server';
import type { ConversationKpi } from '@/lib/types';
import { mockConversationKpis } from '@/lib/mock/seed';

/**
 * GET /api/kpis
 * Returns aggregate conversation KPIs (sessions, deflection rate, escalation rate)
 * for all agents across all environments.
 *
 * Response contains aggregate-only data; no conversation content or user identifiers.
 * Data sourced from Copilot Studio native analytics or App Insights aggregation.
 */
export async function GET(): Promise<NextResponse<ConversationKpi[] | { error: string }>> {
  try {
    // TODO: Integrate with KpisConnector (Copilot Studio analytics endpoint)
    // For now, return mock seed data to allow the app to run offline

    return NextResponse.json(mockConversationKpis);
  } catch (error) {
    console.error('Error fetching conversation KPIs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversation KPIs' },
      { status: 500 }
    );
  }
}

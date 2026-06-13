import { NextResponse } from 'next/server';
import type { HealthMetric } from '@/lib/types';
import { mockHealthMetrics } from '@/lib/mock/seed';
import { requireSession } from '@/lib/auth/guard';

/**
 * GET /api/health
 * Returns operational health metrics (error rate, latency, failed sessions)
 * for all agents across all environments.
 *
 * Data sourced from Application Insights / Azure Monitor telemetry
 * aggregated by bot and day.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse<{ metrics: HealthMetric[]; dataSource: 'mock' } | { error: string }>> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  try {
    // TODO: Integrate with AppInsightsConnector
    // For now, return mock seed data to allow the app to run offline

    return NextResponse.json({ metrics: mockHealthMetrics, dataSource: 'mock' });
  } catch (error) {
    console.error('Error fetching health metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health metrics' },
      { status: 500 }
    );
  }
}

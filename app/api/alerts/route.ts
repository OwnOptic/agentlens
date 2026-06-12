/**
 * GET  /api/alerts         - List alerts (filter: ?state=open|ack|resolved, ?severity=critical|warning|info)
 * POST /api/alerts/run     - Re-evaluate alert rules against current mock data
 * PATCH /api/alerts/[id]   - Handled in /api/alerts/[id]/route.ts (not this file)
 * POST /api/alerts         - Bulk operations: { action: 'ack' | 'resolve', ids: string[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Alert, AlertSeverity } from '@/lib/types';
import { mockAlerts, mockAgents, mockMetrics, mockCapacity, mockEnvironments } from '@/lib/mock/seed';
import { evaluateAlerts } from '@/lib/alerts/engine';
import { dispatchAlerts } from '@/lib/alerts/dispatch';

// ---------------------------------------------------------------------------
// In-memory alert store (replaces Supabase when DB is unavailable)
// Seeded from mock data; mutations are reflected within the same process lifetime.
// ---------------------------------------------------------------------------
let alertStore: Alert[] = structuredClone(mockAlerts);

function getFilteredAlerts(req: NextRequest): Alert[] {
  const { searchParams } = new URL(req.url);
  const stateFilter = searchParams.get('state');
  const severityFilter = searchParams.get('severity') as AlertSeverity | null;
  const typeFilter = searchParams.get('type');

  return alertStore.filter((a) => {
    if (stateFilter && a.state !== stateFilter) return false;
    if (severityFilter && a.severity !== severityFilter) return false;
    if (typeFilter && a.type !== typeFilter) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// GET /api/alerts
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest): Promise<NextResponse<Alert[] | { error: string }>> {
  try {
    // TODO: replace in-memory store with Supabase query when DB is available
    // const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    // const { data, error } = await supabase.from('alerts').select('*').order('created_at', { ascending: false });
    // if (error) throw error;
    // return NextResponse.json(data);

    const filtered = getFilteredAlerts(req);
    return NextResponse.json(filtered);
  } catch (err) {
    console.error('[GET /api/alerts]', err);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/alerts
// Two modes:
//   body = { action: 'ack' | 'resolve', ids: string[] }  -> bulk state mutation
//   body = { action: 'run' }                              -> re-evaluate rules
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
): Promise<NextResponse<{ updated: number } | { generated: number; alerts: Alert[] } | { error: string }>> {
  try {
    const body = await req.json() as unknown;

    if (
      typeof body !== 'object' ||
      body === null ||
      !('action' in body) ||
      typeof (body as Record<string, unknown>).action !== 'string'
    ) {
      return NextResponse.json({ error: 'Missing or invalid "action" field' }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const action = payload.action as string;

    // Bulk ack/resolve
    if (action === 'ack' || action === 'resolve') {
      const ids = payload.ids;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        return NextResponse.json({ error: '"ids" must be a string array' }, { status: 400 });
      }
      const idSet = new Set<string>(ids as string[]);
      let count = 0;
      alertStore = alertStore.map((a) => {
        if (idSet.has(a.id)) {
          count++;
          return { ...a, state: action === 'ack' ? 'ack' : 'resolved' };
        }
        return a;
      });
      return NextResponse.json({ updated: count });
    }

    // Re-evaluate rules
    if (action === 'run') {
      const baselines = {
        budget_monthly_limit: 1000,
        high_consumption_threshold: 20,
        idle_days_threshold: 30,
        expected_model_meter: 'standard',
        volume_7day_avg: {
          'env-dev-11111111/bot-dev-http-eee': 22,
          'env-prod-33333333/bot-prod-customercare-hhh': 500,
        } as Record<string, number>,
      };

      const fresh = evaluateAlerts(
        mockMetrics,
        baselines,
        mockAgents,
        mockEnvironments,
        mockCapacity,
      );

      // Merge into store: add only new alerts not already present
      const existingKeys = new Set(
        alertStore.map((a) => `${a.envId}::${a.botId ?? '_'}::${a.type}`),
      );
      const novel = fresh.filter(
        (a) => !existingKeys.has(`${a.envId}::${a.botId ?? '_'}::${a.type}`),
      );
      alertStore = [...alertStore, ...novel];

      // Dispatch novel alerts (fire-and-forget; don't await in the response path)
      void dispatchAlerts(novel);

      return NextResponse.json({ generated: novel.length, alerts: novel });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error('[POST /api/alerts]', err);
    return NextResponse.json({ error: 'Failed to process alert action' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/alerts  - single alert update (ack or resolve by id in body)
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
): Promise<NextResponse<Alert | { error: string }>> {
  try {
    const body = await req.json() as unknown;
    if (
      typeof body !== 'object' ||
      body === null
    ) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const id = payload.id;
    const state = payload.state;

    if (typeof id !== 'string') {
      return NextResponse.json({ error: '"id" must be a string' }, { status: 400 });
    }
    if (state !== 'open' && state !== 'ack' && state !== 'resolved') {
      return NextResponse.json({ error: '"state" must be open | ack | resolved' }, { status: 400 });
    }

    let updated: Alert | null = null;
    alertStore = alertStore.map((a) => {
      if (a.id === id) {
        updated = { ...a, state };
        return updated;
      }
      return a;
    });

    if (!updated) {
      return NextResponse.json({ error: `Alert ${id} not found` }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[PATCH /api/alerts]', err);
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}

/**
 * GET /api/setup-status
 *
 * Returns the deployment readiness probe results.
 * Protected by requireSession (auth-optional in dev/pre-setup mode).
 *
 * Cache: probe results are cached in-module for 5 minutes.
 * Pass ?refresh=1 to force a re-run.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { requireSession, safeError } from '@/lib/auth/guard';
import { runAllProbes } from '@/lib/setup/probes';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) {
    return new NextResponse(guard.response.body, {
      status: guard.response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';

  try {
    const status = await runAllProbes(forceRefresh);
    return NextResponse.json(status);
  } catch (err) {
    const msg = safeError(err);
    return NextResponse.json(
      { error: 'Probe battery failed unexpectedly', detail: msg },
      { status: 500 },
    );
  }
}

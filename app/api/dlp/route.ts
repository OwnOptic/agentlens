/**
 * AgentLens API - /api/dlp
 *
 * GET /api/dlp
 *   -> { recommendations: DlpRecommendation[], tenant: TenantPayload }
 *
 * TenantPayload is either:
 *   { state: 'connected'; policies: TenantDlpPolicy[]; gaps: DlpGap[] }
 * or:
 *   { state: 'not_connected'; reason: string }
 *
 * Auth is required when isAuthEnabled() is true; dev mode passes through.
 * The tenant data is always honest: real BAP API data or an explicit
 * not_connected state with a fix description - never mocked.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { DLP_RECOMMENDATIONS } from '@/lib/dlp/recommendations';
import { fetchTenantDlpPolicies } from '@/lib/connectors/dlp';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Auth guard
  const guard = await requireSession(req);
  if (!guard.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch live tenant DLP data (returns honest not_connected when unconfigured)
  const tenantResult = await fetchTenantDlpPolicies();

  return NextResponse.json({
    recommendations: DLP_RECOMMENDATIONS,
    tenant: tenantResult,
  });
}

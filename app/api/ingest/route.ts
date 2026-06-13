/**
 * POST /api/ingest
 *
 * Triggers the full AgentLens ingestion pipeline.
 * Intended to be called by a trusted cron/scheduler (e.g. Vercel Cron, GitHub Actions).
 *
 * Security:
 *   - Requires the `x-cron-secret` header to match the CRON_SECRET env var.
 *   - Uses constant-time comparison (timingSafeEqual) to prevent timing attacks.
 *   - Returns 403 if the secret is missing or incorrect.
 *
 * Responses:
 *   200  { run: IngestionRun }         - pipeline completed (success or partial)
 *   400  { error: string }             - malformed request
 *   403  { error: string }             - invalid or missing secret
 *   500  { error: string, details? }   - unexpected server error
 *
 * If CRON_SECRET is not configured the endpoint is disabled (returns 403) to
 * prevent accidental exposure.
 */

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { IngestionRun } from '@/lib/types';
import { runIngestion } from '@/lib/ingestion/orchestrator';
import { requireSession, safeError } from '@/lib/auth/guard';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Guard: CRON_SECRET must be configured
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: 'Endpoint disabled: CRON_SECRET is not configured on this deployment.' },
      { status: 403 },
    );
  }

  // Accept the secret from either `x-cron-secret` or the legacy `CRON_SECRET` header
  const providedSecret =
    request.headers.get('x-cron-secret') ??
    request.headers.get('CRON_SECRET');

  // Constant-time comparison to prevent timing attacks
  const secretMatches = (() => {
    if (!providedSecret) return false;
    const expected = Buffer.from(expectedSecret, 'utf8');
    const provided = Buffer.from(providedSecret, 'utf8');
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  })();

  if (!secretMatches) {
    return NextResponse.json(
      { error: 'Forbidden: invalid or missing cron secret.' },
      { status: 403 },
    );
  }

  try {
    const run: IngestionRun = await runIngestion();

    // Use 200 for both success and partial so the caller can inspect the body
    const statusCode = run.status === 'failed' ? 500 : 200;

    return NextResponse.json({ run }, { status: statusCode });
  } catch (e) {
    const details = safeError(e);
    console.error('[POST /api/ingest] Unhandled error:', details);
    return NextResponse.json(
      { error: 'Internal server error', details },
      { status: 500 },
    );
  }
}

/**
 * GET /api/ingest
 *
 * Health-check endpoint - returns the current pipeline configuration state
 * without running ingestion. Guarded by session (returns { status: 'ok' } shape only).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(request);
  if (!guard.ok) return guard.response;

  const configured = Boolean(
    process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_TENANT_ID,
  );
  const supabaseConfigured = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY,
  );
  const appInsightsConfigured = Boolean(process.env.APPINSIGHTS_WORKSPACE_ID);
  const cronConfigured = Boolean(process.env.CRON_SECRET);

  return NextResponse.json({
    status: 'ok',
    mode: configured ? 'live' : 'mock',
    connectors: {
      azureAd: configured,
      supabase: supabaseConfigured,
      appInsights: appInsightsConfigured,
      billingPolicy: Boolean(process.env.PPAC_BILLING_POLICY_ID),
    },
    cronConfigured,
  });
}

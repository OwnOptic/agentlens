/**
 * AgentLens API Route: /api/maturity
 *
 * GET  /api/maturity          -> full MaturityAssessment (mock-backed)
 * GET  /api/maturity?pillar=X -> single PillarAssessment
 * POST /api/maturity          -> re-score with questionnaire answers (admin only)
 *
 * Falls back to mock seed when no live connectors are available so the
 * app runs fully offline during development.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAssessment } from '@/lib/maturity/report';
import { buildTelemetrySignals } from '@/lib/maturity/scoring';
import { PILLARS, type Pillar } from '@/lib/maturity/controls';
import { requireSession, safeError } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helper: attempt to load live signals; fall back to mock
// ---------------------------------------------------------------------------

function getSignals() {
  // In a live deployment, real connector calls would go here.
  // For now we always use the mock seed so the route works offline.
  return buildTelemetrySignals();
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = request.nextUrl;
  const pillarParam = searchParams.get('pillar');

  try {
    const signals    = getSignals();
    const assessment = generateAssessment(signals);

    // Optional: filter to a single pillar
    if (pillarParam !== null) {
      if (!(PILLARS as readonly string[]).includes(pillarParam)) {
        return NextResponse.json(
          {
            error:   'invalid_pillar',
            message: `Pillar must be one of: ${PILLARS.join(', ')}`,
          },
          { status: 400 },
        );
      }
      const pillar = pillarParam as Pillar;
      const pillarData = assessment.pillars.find((p) => p.pillar === pillar);
      if (!pillarData) {
        return NextResponse.json(
          { error: 'not_found', message: `No data for pillar: ${pillar}` },
          { status: 404 },
        );
      }
      return NextResponse.json({ ...pillarData, dataSource: 'mock' });
    }

    return NextResponse.json({ ...assessment, dataSource: 'mock' });
  } catch (err) {
    const message = safeError(err);
    return NextResponse.json(
      { error: 'internal_error', message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler: accept questionnaire answers to re-score manual controls
// ---------------------------------------------------------------------------

interface QuestionnaireBody {
  /** Whether the weekly governance digest is currently circulated. */
  weeklyDigestCirculated?: boolean;
  /** Optional override for service principal rotation policy score (0-4). */
  rotationPolicyScore?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(request);
  if (!guard.ok) return guard.response;

  if (!guard.user.roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: QuestionnaireBody;
  try {
    body = (await request.json()) as QuestionnaireBody;
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  try {
    const signals = buildTelemetrySignals({
      weeklyDigestCirculated: body.weeklyDigestCirculated ?? null,
    });
    const assessment = generateAssessment(signals);
    return NextResponse.json({ ...assessment, dataSource: 'mock' });
  } catch (err) {
    const message = safeError(err);
    return NextResponse.json(
      { error: 'internal_error', message },
      { status: 500 },
    );
  }
}

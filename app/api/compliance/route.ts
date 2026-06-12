/**
 * AgentLens API - /api/compliance
 *
 * GET  /api/compliance           - returns { tenantScore, violations, rules, patterns }
 * GET  /api/compliance?view=violations - returns violations only
 * GET  /api/compliance?view=patterns   - returns risky-patterns matrix only
 * POST /api/compliance/ack             - bulk-acknowledge violations { ids: string[] }
 * POST /api/compliance/resolve         - bulk-resolve violations { ids: string[] }
 *
 * Falls back to mock seed data (no live credentials required).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ComplianceViolation } from '@/lib/types';
import {
  mockAgents,
  mockEnvironments,
  mockComplianceRules,
  mockViolations,
} from '@/lib/mock/seed';
import { defaultRulePack } from '@/lib/compliance/rules';
import { evaluateAgents } from '@/lib/compliance/evaluator';
import { scoreTenant } from '@/lib/compliance/scoring';
import { buildPatternsMatrix } from '@/lib/compliance/riskyPatterns';

// ---------------------------------------------------------------------------
// In-memory violation store (per process; resets on cold start)
// ---------------------------------------------------------------------------

let _violationStore: ComplianceViolation[] | null = null;

function getViolationStore(): ComplianceViolation[] {
  if (_violationStore === null) {
    const allRules = mergeRules();
    _violationStore = evaluateAgents(
      mockAgents,
      mockEnvironments,
      allRules,
      mockViolations,
    );
  }
  return _violationStore;
}

function mergeRules() {
  const seedIds = new Set(mockComplianceRules.map((r) => r.id));
  const extra = defaultRulePack.filter((r) => !seedIds.has(r.id));
  return [...mockComplianceRules, ...extra];
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const view = searchParams.get('view');

  const allRules = mergeRules();
  const violations = getViolationStore();

  if (view === 'violations') {
    return NextResponse.json({ violations });
  }

  if (view === 'patterns') {
    const patterns = buildPatternsMatrix(mockAgents, mockEnvironments);
    return NextResponse.json({ patterns });
  }

  // Default: full compliance payload
  const tenantScore = scoreTenant(mockAgents, mockEnvironments, allRules, violations);
  const patterns = buildPatternsMatrix(mockAgents, mockEnvironments);

  return NextResponse.json({
    tenantScore,
    violations,
    rules: allRules,
    patterns,
  });
}

// ---------------------------------------------------------------------------
// POST handler - bulk violation state transitions
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
    return NextResponse.json(
      { error: 'Body must be { ids: string[] }' },
      { status: 400 },
    );
  }

  const ids = body.ids as string[];

  const action = pathname.endsWith('/ack')
    ? 'acknowledged'
    : pathname.endsWith('/resolve')
    ? 'resolved'
    : null;

  if (!action) {
    return NextResponse.json(
      { error: 'Use POST /api/compliance/ack or /api/compliance/resolve' },
      { status: 404 },
    );
  }

  const store = getViolationStore();
  let updated = 0;

  for (let i = 0; i < store.length; i++) {
    if (ids.includes(store[i].id)) {
      store[i] = { ...store[i], state: action };
      updated++;
    }
  }

  const allRules = mergeRules();
  const tenantScore = scoreTenant(mockAgents, mockEnvironments, allRules, store);

  return NextResponse.json({ updated, tenantScore });
}

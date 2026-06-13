/**
 * AgentLens API - /api/compliance
 *
 * GET  /api/compliance           - returns { tenantScore, violations, rules, patterns, dataSource }
 * GET  /api/compliance?view=violations - returns violations only
 * GET  /api/compliance?view=patterns   - returns risky-patterns matrix only
 * POST /api/compliance  { action: 'ack'|'resolve', ids: string[] }
 *   - bulk-acknowledge or bulk-resolve violations (admin only)
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
import { requireSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

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
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  const { searchParams } = req.nextUrl;
  const view = searchParams.get('view');

  const allRules = mergeRules();
  const violations = getViolationStore();

  if (view === 'violations') {
    return NextResponse.json({ violations, dataSource: 'mock' });
  }

  if (view === 'patterns') {
    const patterns = buildPatternsMatrix(mockAgents, mockEnvironments);
    return NextResponse.json({ patterns, dataSource: 'mock' });
  }

  // Default: full compliance payload
  const tenantScore = scoreTenant(mockAgents, mockEnvironments, allRules, violations);
  const patterns = buildPatternsMatrix(mockAgents, mockEnvironments);

  return NextResponse.json({
    tenantScore,
    violations,
    rules: allRules,
    patterns,
    dataSource: 'mock',
  });
}

// ---------------------------------------------------------------------------
// POST handler - bulk violation state transitions
// Body: { action: 'ack' | 'resolve', ids: string[] }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  if (!guard.user.roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { action?: unknown; ids?: unknown };
  try {
    body = (await req.json()) as { action?: unknown; ids?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.action !== 'ack' && body.action !== 'resolve') {
    return NextResponse.json(
      { error: 'Body must include action: "ack" | "resolve"' },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
    return NextResponse.json(
      { error: 'Body must include ids: string[]' },
      { status: 400 },
    );
  }

  const action = body.action === 'ack' ? 'acknowledged' : 'resolved';
  const ids = body.ids as string[];

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

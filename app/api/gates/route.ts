/**
 * AgentLens /api/gates Route
 *
 * POST /api/gates
 *   Body: { agentRef: string, policyId?: string, context: PolicyContext }
 *   Returns: GateRunOutput (decision + policyResults + notification)
 *   Requires admin role.
 *
 * GET /api/gates
 *   Returns: { policies: GatePolicy[], decisions: GateDecision[], dataSource: 'mock' }
 *
 * DELETE /api/gates?id=<decisionId>
 *   Revokes a decision. Requires admin role.
 *
 * Falls back to mock seed data when live credentials are absent.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GatePolicy, GateDecision } from '@/lib/types';
import type { PolicyContext } from '@/lib/policy/schema';
import { runGate } from '@/lib/policy/gates';
import { verifyDecision } from '@/lib/policy/signing';
import {
  mockGatePolicies,
  mockGateDecisions,
  mockAgents,
  mockEnvironments,
  mockMaturityResults,
  mockViolations,
} from '@/lib/mock/seed';
import { requireSession, safeError } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// In-memory decision store (replaces DB for offline/demo use)
// Hydrated from mock seed on first import.
// ---------------------------------------------------------------------------

const decisionStore: Map<string, GateDecision> = new Map(
  mockGateDecisions.map((d) => [d.id, d])
);

// ---------------------------------------------------------------------------
// GET /api/gates
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  const policies: GatePolicy[] = mockGatePolicies;
  const decisions: GateDecision[] = Array.from(decisionStore.values()).sort(
    (a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime()
  );

  // Annotate decisions with verify state for the UI
  const annotatedDecisions = decisions.map((d) => ({
    ...d,
    _signatureValid: verifyDecision(d).valid,
  }));

  return NextResponse.json({ policies, decisions: annotatedDecisions, dataSource: 'mock' }, { status: 200 });
}

// ---------------------------------------------------------------------------
// POST /api/gates
// ---------------------------------------------------------------------------

interface GateRequestBody {
  agentRef: string;
  policyId?: string;
  context?: Partial<PolicyContext>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  if (!guard.user.roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: GateRequestBody;

  try {
    body = (await req.json()) as GateRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { agentRef, policyId } = body;

  if (!agentRef || typeof agentRef !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: agentRef (string)' },
      { status: 422 }
    );
  }

  // Resolve agent context from mock data (or use provided context)
  const context = buildContext(agentRef, body.context);

  if (!context) {
    return NextResponse.json(
      { error: `Agent not found: ${agentRef}` },
      { status: 404 }
    );
  }

  try {
    const output = await runGate({
      agentRef,
      context,
      policies: mockGatePolicies,
      policyId,
    });

    // Persist decision to in-memory store
    decisionStore.set(output.decision.id, output.decision);

    return NextResponse.json(output, { status: 200 });
  } catch (err) {
    console.error('[api/gates] Gate evaluation failed:', err);
    return NextResponse.json(
      { error: 'Gate evaluation failed', detail: safeError(err) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/gates  (revoke a decision)
// Query param: id=<decisionId>
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  if (!guard.user.roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing query param: id' }, { status: 400 });
  }

  const existing = decisionStore.get(id);
  if (!existing) {
    return NextResponse.json({ error: `Decision not found: ${id}` }, { status: 404 });
  }

  if (existing.revoked) {
    return NextResponse.json({ error: 'Decision is already revoked' }, { status: 409 });
  }

  const revoked = { ...existing, revoked: true };
  decisionStore.set(id, revoked);

  return NextResponse.json({ revoked: true, decision: revoked }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Build a PolicyContext from the agentRef + optional partial context override.
 * Looks up agent/env from mock seed to populate fields not in the request body.
 */
function buildContext(
  agentRef: string,
  overrides?: Partial<PolicyContext>
): PolicyContext | null {
  const [envId, botId] = agentRef.split('/');

  const agent = mockAgents.find((a) => a.envId === envId && a.botId === botId);
  const env = mockEnvironments.find((e) => e.id === envId);

  // If caller provided explicit context, use it directly
  if (overrides?.agent) {
    return {
      agent: overrides.agent,
      env: overrides.env,
      maturity: overrides.maturity,
      compliance: overrides.compliance,
    };
  }

  if (!agent) return null;

  // Compute maturity averages from mock results
  const securityScores = mockMaturityResults
    .filter((r) => r.controlId.startsWith('ctrl-sec-'))
    .map((r) => r.score);
  const securityAvg =
    securityScores.length > 0
      ? securityScores.reduce<number>((a, b) => a + b, 0) / securityScores.length
      : 0;

  // Count open critical violations for this agent
  const agentRef_ = `${envId}/${botId}`;
  const criticalViolationsCount = mockViolations.filter(
    (v) => v.agentRef === agentRef_ && v.severity === 'critical' && v.state === 'open'
  ).length;
  const openViolationsCount = mockViolations.filter(
    (v) => v.agentRef === agentRef_ && v.state === 'open'
  ).length;

  return {
    agent: {
      botId: agent.botId,
      envId: agent.envId,
      authMode: agent.ownerEmail ? 'aad' : 'anonymous',
      ownerEmail: agent.ownerEmail,
      ownerName: agent.ownerName,
      state: agent.state,
      lifecycle: agent.lifecycle,
      dlpReviewed: agent.ownerEmail !== null,
      httpApproved: !botId.includes('http'),
      connectors: botId.includes('http') ? ['http'] : [],
      channels: ['teams'],
    },
    env: {
      type: env?.type ?? 'Sandbox',
      region: env?.region,
      dlpPolicyId: env?.type === 'Production' ? 'dlp-prod' : null,
    },
    maturity: {
      securityAvg,
      managementAvg: 3.0,
      reportingAvg: 2.5,
    },
    compliance: {
      openViolationsCount,
      criticalViolationsCount,
    },
  };
}

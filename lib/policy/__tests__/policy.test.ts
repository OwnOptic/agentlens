/**
 * AgentLens Gate Policy Unit Tests
 *
 * Covers:
 *   - YAML parsing (valid, invalid, edge cases)
 *   - Expression evaluator (all operators, paths, null checks)
 *   - Evaluation result shapes (pass/block, reasons, ruleOutcomes)
 *   - Gate runner (advisory mode, no-policy fallback, multi-policy worst-wins)
 *   - Signing round-trip (sign, verify, revoke, tamper detection)
 *   - Mock seed alignment (real seed policies evaluate against seed agents)
 */

import { describe, it, expect } from 'vitest';
import { parsePolicy } from '../schema';
import { evaluate } from '../evaluator';
import { runGate } from '../gates';
import { signDecision, verifyDecision, revokeDecision } from '../signing';
import type { PolicyContext } from '../schema';
import { mockGatePolicies, mockAgents, mockEnvironments } from '@/lib/mock/seed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<PolicyContext['agent']> = {}): PolicyContext {
  return {
    agent: {
      botId: 'test-bot-001',
      envId: 'env-test',
      authMode: 'aad',
      ownerEmail: 'owner@test.com',
      ownerName: 'Test Owner',
      state: 'Active',
      lifecycle: 'pilot',
      dlpReviewed: true,
      httpApproved: true,
      connectors: [],
      channels: ['teams'],
      ...overrides,
    },
    env: { type: 'Production', dlpPolicyId: 'dlp-001' },
    maturity: { securityAvg: 3.5, managementAvg: 3.0, reportingAvg: 2.5 },
    compliance: { openViolationsCount: 0, criticalViolationsCount: 0 },
  };
}

// ---------------------------------------------------------------------------
// parsePolicy
// ---------------------------------------------------------------------------

describe('parsePolicy', () => {
  it('parses a minimal valid policy', () => {
    const yaml = `---
name: test-gate
version: "1.0"
rules:
  - id: rule-one
    description: Test rule
    condition: agent.ownerEmail != null
    blocking: true
`;
    const policy = parsePolicy(yaml);
    expect(policy.name).toBe('test-gate');
    expect(policy.version).toBe('1.0');
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0].id).toBe('rule-one');
    expect(policy.rules[0].blocking).toBe(true);
    expect(policy.rules[0].condition).toBe('agent.ownerEmail != null');
  });

  it('defaults version to "1.0" when absent', () => {
    const yaml = `---
name: no-version-gate
rules:
  - id: r1
    description: Rule 1
    condition: agent.state == "Active"
    blocking: false
`;
    const policy = parsePolicy(yaml);
    expect(policy.version).toBe('1.0');
  });

  it('throws when name is missing', () => {
    const yaml = `---
rules:
  - id: r1
    description: Test
    condition: agent.ownerEmail != null
    blocking: true
`;
    expect(() => parsePolicy(yaml)).toThrow(/name/i);
  });

  it('throws when a rule is missing condition', () => {
    const yaml = `---
name: bad-gate
rules:
  - id: no-condition
    description: Missing condition
    blocking: true
`;
    expect(() => parsePolicy(yaml)).toThrow(/condition/i);
  });

  it('parses all 4 rules from the prod seed policy', () => {
    const prodPolicy = mockGatePolicies.find((p) => p.id === 'gate-policy-prod');
    expect(prodPolicy).toBeDefined();
    const parsed = parsePolicy(prodPolicy!.yaml);
    expect(parsed.rules.length).toBeGreaterThanOrEqual(3);
    expect(parsed.rules.every((r) => r.id && r.condition)).toBe(true);
  });

  it('parses pilot seed policy correctly', () => {
    const pilotPolicy = mockGatePolicies.find((p) => p.id === 'gate-policy-pilot');
    expect(pilotPolicy).toBeDefined();
    const parsed = parsePolicy(pilotPolicy!.yaml);
    expect(parsed.rules.length).toBeGreaterThanOrEqual(2);
  });

  // T-006/303: blank line inside a rule block still parses all properties
  // SKIP until T-303 (Phase 3) fixes the hand-rolled YAML parser's blank-line
  // handling. The parser currently treats a blank line inside a rule block as a
  // dedent and truncates the value. Un-skip when T-303 lands.
  it.skip('parses a rule block that contains a blank line between properties', () => {
    const yaml = `---
name: blank-line-gate
version: "1.0"
rules:
  - id: rule-with-blank

    description: Rule with a blank line between properties
    condition: agent.state == "Active"

    blocking: true
`;
    const policy = parsePolicy(yaml);
    expect(policy.name).toBe('blank-line-gate');
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0].id).toBe('rule-with-blank');
    expect(policy.rules[0].blocking).toBe(true);
    expect(policy.rules[0].condition).toBe('agent.state == "Active"');
  });

  // T-006/303: a policy with no 'rules:' key - assert current evaluator behavior
  // TODO: consider adding an explicit validation step in parsePolicy that
  // returns a structured error when 'rules' is absent, rather than relying on
  // downstream failures.
  // SKIP until T-303 (Phase 3) adds explicit "no rules" validation to parsePolicy
  // (today it silently returns an empty rules array, which would pass everything).
  it.skip('throws or is reported invalid when the rules key is absent', () => {
    const yaml = `---
name: no-rules-gate
version: "1.0"
`;
    expect(() => parsePolicy(yaml)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

describe('evaluate - operator coverage', () => {
  it('passes == on matching string', () => {
    const policy = parsePolicy(`---
name: eq-test
rules:
  - id: r1
    description: State check
    condition: agent.state == "Active"
    blocking: true
`);
    const result = evaluate(policy, makeCtx({ state: 'Active' }));
    expect(result.verdict).toBe('pass');
    expect(result.reasons).toHaveLength(0);
  });

  it('blocks on != mismatch', () => {
    const policy = parsePolicy(`---
name: neq-test
rules:
  - id: r1
    description: Auth mode check
    condition: agent.authMode != "anonymous"
    blocking: true
`);
    const result = evaluate(policy, makeCtx({ authMode: 'anonymous' }));
    expect(result.verdict).toBe('block');
    expect(result.reasons).toHaveLength(1);
  });

  it('handles null comparison (ownerEmail == null)', () => {
    const policy = parsePolicy(`---
name: null-test
rules:
  - id: r1
    description: No owner check
    condition: agent.ownerEmail != null
    blocking: true
`);
    const resultPass = evaluate(policy, makeCtx({ ownerEmail: 'owner@test.com' }));
    expect(resultPass.verdict).toBe('pass');

    const resultBlock = evaluate(policy, makeCtx({ ownerEmail: null }));
    expect(resultBlock.verdict).toBe('block');
  });

  it('handles boolean true/false comparison', () => {
    const policy = parsePolicy(`---
name: bool-test
rules:
  - id: r1
    description: DLP review required
    condition: agent.dlpReviewed == true
    blocking: true
`);
    expect(evaluate(policy, makeCtx({ dlpReviewed: true })).verdict).toBe('pass');
    expect(evaluate(policy, makeCtx({ dlpReviewed: false })).verdict).toBe('block');
  });

  it('evaluates numeric >= comparison', () => {
    const policy = parsePolicy(`---
name: num-test
rules:
  - id: r1
    description: Maturity score
    condition: maturity.securityAvg >= 3
    blocking: true
`);
    const ctx = makeCtx();
    const ctxLow = { ...ctx, maturity: { securityAvg: 2, managementAvg: 3, reportingAvg: 2 } };
    expect(evaluate(policy, ctx).verdict).toBe('pass');
    expect(evaluate(policy, ctxLow).verdict).toBe('block');
  });

  it('evaluates contains on array', () => {
    const policy = parsePolicy(`---
name: contains-test
rules:
  - id: r1
    description: Channel check
    condition: agent.channels contains "teams"
    blocking: true
`);
    expect(evaluate(policy, makeCtx({ channels: ['teams', 'web'] })).verdict).toBe('pass');
    expect(evaluate(policy, makeCtx({ channels: ['web'] })).verdict).toBe('block');
  });

  it('evaluates !contains on array', () => {
    const policy = parsePolicy(`---
name: notcontains-test
rules:
  - id: r1
    description: No HTTP connector
    condition: agent.connectors !contains "http"
    blocking: true
`);
    expect(evaluate(policy, makeCtx({ connectors: [] })).verdict).toBe('pass');
    expect(evaluate(policy, makeCtx({ connectors: ['http', 'sharepoint'] })).verdict).toBe('block');
  });

  it('returns advisory reasons without blocking', () => {
    const policy = parsePolicy(`---
name: advisory-test
rules:
  - id: advisory-r1
    description: Advisory maturity check
    condition: maturity.securityAvg >= 4
    blocking: false
`);
    const ctx = makeCtx();
    // securityAvg is 3.5 so fails but is advisory
    const result = evaluate(policy, ctx);
    expect(result.verdict).toBe('pass');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/ADVISORY/);
    expect(result.eligible).toBe(true);
  });

  it('marks ineligible when at least one blocking rule fails', () => {
    const policy = parsePolicy(`---
name: mixed-test
rules:
  - id: blocking-r
    description: Must be authenticated
    condition: agent.authMode != "anonymous"
    blocking: true
  - id: advisory-r
    description: DLP advisory
    condition: maturity.securityAvg >= 5
    blocking: false
`);
    const ctx = makeCtx({ authMode: 'anonymous' });
    const result = evaluate(policy, ctx);
    expect(result.verdict).toBe('block');
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(2); // one blocking + one advisory
  });

  it('returns correct ruleOutcomes length', () => {
    const policy = parsePolicy(`---
name: multi-rule-test
rules:
  - id: r1
    description: Rule 1
    condition: agent.authMode != "anonymous"
    blocking: true
  - id: r2
    description: Rule 2
    condition: agent.ownerEmail != null
    blocking: true
  - id: r3
    description: Rule 3
    condition: agent.dlpReviewed == true
    blocking: false
`);
    const result = evaluate(policy, makeCtx());
    expect(result.ruleOutcomes).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Mock seed alignment
// ---------------------------------------------------------------------------

describe('mock seed policy evaluation', () => {
  it('a well-configured prod agent passes the prod gate policy', () => {
    const prodPolicy = mockGatePolicies.find((p) => p.id === 'gate-policy-prod')!;
    const parsed = parsePolicy(prodPolicy.yaml);
    const ctx: PolicyContext = {
      agent: {
        botId: 'bot-prod-customercare-hhh',
        envId: 'env-prod-33333333',
        authMode: 'aad',
        ownerEmail: 'eve.ops@contoso.com',
        ownerName: 'Eve Ops',
        state: 'Active',
        lifecycle: 'prod',
        dlpReviewed: true,
        httpApproved: true,
        connectors: [],
        channels: ['teams'],
      },
      env: { type: 'Production', dlpPolicyId: 'dlp-prod' },
      maturity: { securityAvg: 3.5, managementAvg: 3.0, reportingAvg: 3.0 },
      compliance: { openViolationsCount: 0, criticalViolationsCount: 0 },
    };
    const result = evaluate(parsed, ctx);
    expect(result.verdict).toBe('pass');
  });

  it('an anonymous auth agent fails the prod gate with blocking reason', () => {
    const prodPolicy = mockGatePolicies.find((p) => p.id === 'gate-policy-prod')!;
    const parsed = parsePolicy(prodPolicy.yaml);
    const ctx: PolicyContext = {
      agent: {
        botId: 'bot-anon-hr-aaa',
        envId: 'env-default-00000000',
        authMode: 'anonymous',
        ownerEmail: null,
        ownerName: null,
        state: 'Active',
        lifecycle: 'prod',
        dlpReviewed: false,
        httpApproved: false,
        connectors: [],
        channels: [],
      },
      env: { type: 'Production', dlpPolicyId: null },
      maturity: { securityAvg: 2, managementAvg: 2, reportingAvg: 1 },
      compliance: { openViolationsCount: 2, criticalViolationsCount: 1 },
    };
    const result = evaluate(parsed, ctx);
    expect(result.verdict).toBe('block');
    expect(result.reasons.some((r) => /anon/i.test(r))).toBe(true);
  });

  it('all 10 mock agents can be evaluated without throwing', () => {
    const prodPolicy = mockGatePolicies[0];
    const parsed = parsePolicy(prodPolicy.yaml);

    for (const agent of mockAgents) {
      const env = mockEnvironments.find((e) => e.id === agent.envId);
      const ctx: PolicyContext = {
        agent: {
          botId: agent.botId,
          envId: agent.envId,
          authMode: 'aad',
          ownerEmail: agent.ownerEmail,
          ownerName: agent.ownerName,
          state: agent.state,
          lifecycle: agent.lifecycle,
          dlpReviewed: true,
          httpApproved: true,
          connectors: [],
          channels: [],
        },
        env: { type: env?.type ?? 'Sandbox', dlpPolicyId: null },
        maturity: { securityAvg: 3, managementAvg: 3, reportingAvg: 3 },
        compliance: { openViolationsCount: 0, criticalViolationsCount: 0 },
      };
      expect(() => evaluate(parsed, ctx)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Gate runner
// ---------------------------------------------------------------------------

describe('runGate', () => {
  it('returns a pass decision when all blocking rules pass', async () => {
    const output = await runGate({
      agentRef: 'env-uat-22222222/bot-uat-finance-fff',
      context: makeCtx({ lifecycle: 'pilot' }),
      policies: mockGatePolicies,
    });
    expect(output.decision.verdict).toBe('pass');
    expect(output.decision.id).toMatch(/^gate-decision-/);
    expect(output.decision.signature).toBeTruthy();
    expect(output.decision.revoked).toBe(false);
  });

  it('returns a block decision when blocking rules fail', async () => {
    const output = await runGate({
      agentRef: 'env-default-00000000/bot-anon-hr-aaa',
      context: makeCtx({ authMode: 'anonymous', ownerEmail: null, dlpReviewed: false }),
      policies: mockGatePolicies,
    });
    expect(output.decision.verdict).toBe('block');
    expect(output.decision.reasons.length).toBeGreaterThan(0);
  });

  it('passes advisory when no enabled policies match policyId', async () => {
    const output = await runGate({
      agentRef: 'env-dev-11111111/bot-dev-sales-ddd',
      context: makeCtx(),
      policies: mockGatePolicies,
      policyId: 'gate-policy-nonexistent',
    });
    expect(output.decision.verdict).toBe('pass');
    expect(output.notification).toMatch(/no enabled (gate )?policies/i);
  });

  it('returns advisory mode notification text', async () => {
    const output = await runGate({
      agentRef: 'env-test/bot-test',
      context: makeCtx({ authMode: 'anonymous' }),
      policies: mockGatePolicies,
    });
    expect(output.notification).toMatch(/advisory/i);
  });

  it('includes policyResults with per-policy outcome', async () => {
    const output = await runGate({
      agentRef: 'env-uat-22222222/bot-uat-finance-fff',
      context: makeCtx(),
      policies: mockGatePolicies,
    });
    expect(output.policyResults.length).toBeGreaterThan(0);
    for (const pr of output.policyResults) {
      expect(pr.policyId).toBeTruthy();
      expect(pr.policyName).toBeTruthy();
      expect(['pass', 'block']).toContain(pr.verdict);
    }
  });

  it('worst-verdict wins across multiple policies', async () => {
    // One policy passes, another blocks
    const passingPolicy = mockGatePolicies.find((p) => p.id === 'gate-policy-pilot')!;
    const blockingYaml = `---
name: always-block
rules:
  - id: block-all
    description: Always blocks
    condition: agent.authMode == "never"
    blocking: true
`;
    const alwaysBlockPolicy = {
      id: 'gate-always-block',
      name: 'Always Block',
      yaml: blockingYaml,
      enabled: true,
    };
    const output = await runGate({
      agentRef: 'env-test/bot-test',
      context: makeCtx(),
      policies: [passingPolicy, alwaysBlockPolicy],
    });
    expect(output.decision.verdict).toBe('block');
  });
});

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

describe('signing', () => {
  const payload = {
    id: 'gate-decision-test-001',
    agentRef: 'env-uat-22222222/bot-uat-finance-fff',
    verdict: 'pass' as const,
    signedAt: '2026-06-12T10:00:00.000Z',
    reasons: [] as string[],
  };

  it('produces a non-empty hex signature', () => {
    const sig = signDecision(payload);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same payload always produces the same signature', () => {
    const sig1 = signDecision(payload);
    const sig2 = signDecision(payload);
    expect(sig1).toBe(sig2);
  });

  it('different verdict produces different signature', () => {
    const sig1 = signDecision(payload);
    const sig2 = signDecision({ ...payload, verdict: 'block' });
    expect(sig1).not.toBe(sig2);
  });

  it('verifyDecision returns valid=true for a correctly signed decision', () => {
    const sig = signDecision(payload);
    const decision = { ...payload, reasons: [], signature: sig, revoked: false };
    const result = verifyDecision(decision);
    expect(result.valid).toBe(true);
  });

  it('verifyDecision returns valid=false for a tampered signature', () => {
    const sig = signDecision(payload);
    const tampered = sig.replace(/[0-9]/, (d) => (parseInt(d) + 1 > 9 ? '0' : String(parseInt(d) + 1)));
    const decision = { ...payload, reasons: [], signature: tampered, revoked: false };
    const result = verifyDecision(decision);
    expect(result.valid).toBe(false);
  });

  it('verifyDecision returns valid=false for a tampered payload field', () => {
    const sig = signDecision(payload);
    const decision = {
      ...payload,
      verdict: 'block' as const, // tampered
      reasons: [],
      signature: sig,
      revoked: false,
    };
    const result = verifyDecision(decision);
    expect(result.valid).toBe(false);
  });

  it('revokeDecision sets revoked=true and preserves original signature', () => {
    const sig = signDecision(payload);
    const decision = { ...payload, reasons: [], signature: sig, revoked: false };
    const revoked = revokeDecision(decision);
    expect(revoked.revoked).toBe(true);
    expect(revoked.signature).toBe(sig); // original sig preserved
    expect(decision.revoked).toBe(false); // original unchanged
  });

  it('verifyDecision on a revoked decision reports revoked=true', () => {
    const sig = signDecision(payload);
    const decision = { ...payload, reasons: [], signature: sig, revoked: true };
    const result = verifyDecision(decision);
    // Signature is intact but revoked
    expect(result.valid).toBe(false);
    expect(result.revoked).toBe(true);
  });

  it('gate runner produces a verifiable signature', async () => {
    const output = await runGate({
      agentRef: 'env-uat-22222222/bot-uat-finance-fff',
      context: makeCtx(),
      policies: mockGatePolicies,
    });
    const verifyResult = verifyDecision(output.decision);
    expect(verifyResult.valid).toBe(true);
  });

  // T-006: tampering with reasons after signing invalidates the signature
  it('tampered reasons after signing makes verifyDecision return invalid', () => {
    const payloadWithReasons = {
      ...payload,
      reasons: ['BLOCK [blocking-r] Auth mode must not be anonymous'],
    };
    const sig = signDecision(payloadWithReasons);
    const decision = {
      ...payloadWithReasons,
      signature: sig,
      revoked: false,
    };

    // Verify the original is valid
    expect(verifyDecision(decision).valid).toBe(true);

    // Tamper: replace reasons with different content
    const tampered = {
      ...decision,
      reasons: ['BLOCK [blocking-r] Some other reason injected by attacker'],
    };
    expect(verifyDecision(tampered).valid).toBe(false);
  });
});

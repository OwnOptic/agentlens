import { describe, it, expect } from 'vitest';
import { classify } from './verdicts.js';

/**
 * A verdict drives a retire-or-keep decision, so the case that matters most is
 * the one where there is nothing to base it on.
 */

describe('classify', () => {
  it('refuses to recommend anything when usage could not be read', () => {
    const { verdict, rationale } = classify({
      sessions: null,
      escalationRate: null,
      duplicate: false,
      orphan: false,
    });

    expect(verdict).toBeNull();
    expect(rationale).toContain('No usage data');
    expect(rationale).toContain('Dataverse');
  });

  it('does not treat unreadable usage as zero usage', () => {
    const unknown = classify({ sessions: null, escalationRate: null, duplicate: false, orphan: false });
    const zero = classify({ sessions: 0, escalationRate: 0, duplicate: false, orphan: false });

    expect(unknown.verdict).toBeNull();
    expect(zero.verdict).toBe('retire');
    expect(unknown.rationale).not.toEqual(zero.rationale);
  });

  it('retires an agent with zero sessions', () => {
    const { verdict, rationale } = classify({
      sessions: 0,
      escalationRate: 0,
      duplicate: false,
      orphan: false,
    });
    expect(verdict).toBe('retire');
    expect(rationale).toContain('Zero sessions');
  });

  it('calls out accountability when a dead agent also has no owner', () => {
    const { verdict, rationale } = classify({
      sessions: 0,
      escalationRate: 0,
      duplicate: false,
      orphan: true,
    });
    expect(verdict).toBe('retire');
    expect(rationale).toContain('no resolvable owner');
  });

  it('consolidates a duplicate even when it is well used', () => {
    const { verdict, rationale } = classify({
      sessions: 500,
      escalationRate: 0.05,
      duplicate: true,
      orphan: false,
    });
    expect(verdict).toBe('consolidate');
    expect(rationale).toContain('500');
  });

  it('improves a barely-used agent rather than retiring it outright', () => {
    const { verdict } = classify({
      sessions: 3,
      escalationRate: 0.1,
      duplicate: false,
      orphan: false,
    });
    expect(verdict).toBe('improve');
  });

  it('improves a well-used agent that escalates too often', () => {
    // Used and failing is the highest-value thing to fix.
    const { verdict, rationale } = classify({
      sessions: 800,
      escalationRate: 0.62,
      duplicate: false,
      orphan: false,
    });
    expect(verdict).toBe('improve');
    expect(rationale).toContain('62%');
  });

  it('promotes a healthy, well-used agent', () => {
    const { verdict } = classify({
      sessions: 800,
      escalationRate: 0.05,
      duplicate: false,
      orphan: false,
    });
    expect(verdict).toBe('promote');
  });

  it('flags missing ownership even on an agent worth promoting', () => {
    const { verdict, rationale } = classify({
      sessions: 800,
      escalationRate: 0.05,
      duplicate: false,
      orphan: true,
    });
    expect(verdict).toBe('promote');
    expect(rationale).toContain('no resolvable owner');
  });

  it('never states an escalation rate it was not given', () => {
    const { rationale } = classify({
      sessions: 800,
      escalationRate: null,
      duplicate: false,
      orphan: false,
    });
    expect(rationale).not.toMatch(/\d+% escalate/);
  });
});

import { describe, it, expect } from 'vitest';
import type { Agent } from './types.js';
import { nameStem, findDuplicateClusters } from './clusters.js';

function agent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'id-1',
    name: 'HR Onboarding Bot',
    platform: 'copilot_studio',
    owner: 'Ada Lovelace',
    location: 'Production',
    source: 'Azure Resource Graph',
    ...over,
  };
}

describe('nameStem', () => {
  it('reduces cosmetic variants of the same agent to one stem', () => {
    expect(nameStem('HR Onboarding Bot')).toBe(nameStem('HR onboarding assistant v2'));
    expect(nameStem('HR Onboarding Bot (copy 2)')).toBe(nameStem('hr_onboarding_agent'));
  });

  it('keeps genuinely different agents apart', () => {
    expect(nameStem('HR Onboarding Bot')).not.toBe(nameStem('Finance Approval Bot'));
  });

  it('is order-insensitive, so "Onboarding HR" matches "HR Onboarding"', () => {
    expect(nameStem('Onboarding HR')).toBe(nameStem('HR Onboarding'));
  });

  it('returns empty for a name made entirely of noise words', () => {
    // Such a name carries no signal, and clustering on it would group
    // unrelated agents purely because someone called them both "Test Bot".
    expect(nameStem('Test Bot')).toBe('');
    expect(nameStem('My New Agent')).toBe('');
  });
});

describe('findDuplicateClusters', () => {
  it('groups agents sharing a stem', () => {
    const clusters = findDuplicateClusters([
      agent({ id: '1', name: 'HR Onboarding Bot' }),
      agent({ id: '2', name: 'HR onboarding assistant' }),
      agent({ id: '3', name: 'Finance Approvals' }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.agents.map((a) => a.id).sort()).toEqual(['1', '2']);
  });

  it('never clusters on a noise-only name', () => {
    const clusters = findDuplicateClusters([
      agent({ id: '1', name: 'Test Bot' }),
      agent({ id: '2', name: 'Demo Agent' }),
      agent({ id: '3', name: 'New Copilot' }),
    ]);
    expect(clusters).toHaveLength(0);
  });

  it('respects minClusterSize', () => {
    const agents = [
      agent({ id: '1', name: 'HR Onboarding Bot' }),
      agent({ id: '2', name: 'HR onboarding assistant' }),
    ];
    expect(findDuplicateClusters(agents, 2)).toHaveLength(1);
    expect(findDuplicateClusters(agents, 3)).toHaveLength(0);
  });

  it('keeps the owned agent as canonical over an unowned one', () => {
    // An unowned agent cannot be maintained, so it is never the survivor.
    const clusters = findDuplicateClusters([
      agent({ id: 'orphan', name: 'HR Onboarding Bot', owner: null }),
      agent({ id: 'owned', name: 'HR onboarding assistant', owner: 'Ada Lovelace' }),
    ]);

    expect(clusters[0]!.canonical.id).toBe('owned');
    expect(clusters[0]!.mergeCandidates.map((a) => a.id)).toEqual(['orphan']);
  });

  it('prefers the active agent when both have owners', () => {
    const clusters = findDuplicateClusters([
      agent({ id: 'inactive', name: 'HR Onboarding Bot', state: 'Inactive' }),
      agent({ id: 'active', name: 'HR onboarding assistant', state: 'Active' }),
    ]);
    expect(clusters[0]!.canonical.id).toBe('active');
  });

  it('carries evidence an administrator can defend to the agent owner', () => {
    const clusters = findDuplicateClusters([
      agent({ id: '1', name: 'HR Onboarding Bot', location: 'Production' }),
      agent({ id: '2', name: 'HR onboarding assistant', location: 'Sandbox' }),
    ]);

    const { evidence } = clusters[0]!;
    expect(evidence).toContain('2 agents');
    expect(evidence).toContain('hr onboarding');
    expect(evidence).toContain('2 locations');
  });

  it('reports a single-location cluster as such', () => {
    const clusters = findDuplicateClusters([
      agent({ id: '1', name: 'HR Onboarding Bot', location: 'Production' }),
      agent({ id: '2', name: 'HR onboarding assistant', location: 'Production' }),
    ]);
    expect(clusters[0]!.evidence).toContain('one location');
    expect(clusters[0]!.locations).toEqual(['Production']);
  });

  it('notes when a cluster spans different agent stores', () => {
    const clusters = findDuplicateClusters([
      agent({ id: '1', name: 'HR Onboarding Bot', platform: 'copilot_studio' }),
      agent({ id: '2', name: 'HR onboarding assistant', platform: 'foundry' }),
    ]);
    expect(clusters[0]!.evidence).toContain('2 different stores');
  });

  it('puts the biggest cluster first', () => {
    const clusters = findDuplicateClusters([
      agent({ id: '1', name: 'Expenses Bot' }),
      agent({ id: '2', name: 'Expenses assistant' }),
      agent({ id: '3', name: 'HR Onboarding Bot' }),
      agent({ id: '4', name: 'HR onboarding assistant' }),
      agent({ id: '5', name: 'HR onboarding copilot' }),
    ]);
    expect(clusters[0]!.agents).toHaveLength(3);
  });

  it('finds nothing in an empty estate', () => {
    expect(findDuplicateClusters([])).toEqual([]);
  });
});

/**
 * Duplicate detection.
 *
 * Pure derivation over agents already read from the tenant - it adds no data
 * source and invents nothing.
 *
 * The clustering is deliberately a simple, explainable heuristic rather than an
 * opaque similarity score, because the administrator has to defend the
 * recommendation to the agent's owner. Every cluster carries the evidence
 * sentence that produced it, and the reader is free to disagree with it.
 */

import type { Agent } from './types.js';

export interface Cluster {
  /** The shared name stem the cluster was built from. */
  stem: string;
  /** Why these agents were grouped. Shown to the administrator verbatim. */
  evidence: string;
  agents: Agent[];
  /** Suggested survivor: has an owner, then most recently active, then oldest. */
  canonical: Agent;
  mergeCandidates: Agent[];
  locations: string[];
}

/** Words that carry no distinguishing meaning in an agent name. */
const NOISE = new Set([
  'agent',
  'bot',
  'copilot',
  'assistant',
  'helper',
  'the',
  'a',
  'an',
  'and',
  'for',
  'of',
  'my',
  'new',
  'test',
  'demo',
  'copy',
  'v1',
  'v2',
  'v3',
  'prod',
  'dev',
  'uat',
  'poc',
  'pilot',
  'draft',
  'final',
]);

/**
 * Reduce a display name to its meaningful stem.
 * "HR Onboarding Bot (copy 2)" and "HR onboarding assistant v2" both -> "hr onboarding".
 */
export function nameStem(name: string): string {
  return name
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w) && !/^\d+$/.test(w))
    .sort()
    .join(' ');
}

function pickCanonical(agents: Agent[]): Agent {
  const score = (a: Agent): number => {
    let s = 0;
    if (a.owner) s += 100; // an owned agent can actually be maintained
    if (a.state === 'Active') s += 50;
    if (a.lastActivity) s += 10;
    return s;
  };

  return [...agents].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    // Tie-break on recency of activity, then on age (the original usually wins).
    const aAct = a.lastActivity ?? '';
    const bAct = b.lastActivity ?? '';
    if (aAct !== bAct) return bAct.localeCompare(aAct);
    return (a.createdOn ?? '').localeCompare(b.createdOn ?? '');
  })[0]!;
}

/**
 * Group agents that share a name stem.
 *
 * Only groups of at least `minClusterSize` are returned. A stem shared across
 * several environments is called out explicitly, because the same agent rebuilt
 * in three environments is the most common and most costly form of sprawl.
 */
export function findDuplicateClusters(agents: Agent[], minClusterSize = 2): Cluster[] {
  const byStem = new Map<string, Agent[]>();

  for (const agent of agents) {
    const stem = nameStem(agent.name);
    if (!stem) continue; // a name made entirely of noise words tells us nothing
    const list = byStem.get(stem) ?? [];
    list.push(agent);
    byStem.set(stem, list);
  }

  const clusters: Cluster[] = [];

  for (const [stem, members] of byStem) {
    if (members.length < minClusterSize) continue;

    const canonical = pickCanonical(members);
    const locations = [...new Set(members.map((m) => m.location ?? 'unknown'))];
    const platforms = [...new Set(members.map((m) => m.platform))];

    const evidence =
      `${members.length} agents reduce to the same name stem "${stem}"` +
      (locations.length > 1 ? `, spread across ${locations.length} locations` : ', in one location') +
      (platforms.length > 1 ? `, and across ${platforms.length} different stores` : '') +
      '.';

    clusters.push({
      stem,
      evidence,
      agents: members,
      canonical,
      mergeCandidates: members.filter((m) => m.id !== canonical.id),
      locations,
    });
  }

  return clusters.sort((a, b) => b.agents.length - a.agents.length);
}

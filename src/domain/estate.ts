/**
 * The estate: one sweep of the tenant, shared by every tool that needs the
 * agent list (sweep_inventory, consolidation_plan, agent_map, value_and_cost).
 *
 * It reads the four stores, the environment list, and owner names, then
 * normalises them into one shape. Each part carries its own reachability, so a
 * caller can always distinguish "read it, the answer is zero" from "could not
 * read it". Nothing here fills a gap with a plausible value.
 */

import { discoverAllAgents, type DiscoveryResult } from '../connectors/discovery.js';
import { listEnvironments } from '../connectors/inventory.js';
import { resolveOwners } from '../connectors/graph.js';
import type { Agent, Environment } from './types.js';

export interface Estate {
  fetchedAt: string;
  discovery: DiscoveryResult;
  /** null when the Power Platform admin API could not be read. */
  environments: Environment[] | null;
  environmentsError?: string;
  /** Agents from the stores that were successfully read. */
  agents: Agent[];
  /** Whether owner names could be looked up at all. */
  ownersResolvable: boolean;
  /** Agents with no resolvable owner - the orphan finding. */
  orphans: Agent[];
  /**
   * Agents whose owner EXISTS but whose account is disabled in Entra - a
   * stronger orphan signal than a missing owner: the person left and the
   * agent kept running under their name.
   */
  disabledOwners: Agent[];
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function buildEstate(opts?: { environmentId?: string }): Promise<Estate> {
  const [discovery, environmentsResult] = await Promise.all([
    discoverAllAgents(),
    listEnvironments(),
  ]);

  const environments =
    environmentsResult.state === 'connected' ? environmentsResult.environments : null;
  const environmentNames = new Map((environments ?? []).map((e) => [e.id, e.name]));

  let agents = discovery.sources
    .filter((s) => s.status === 'ok')
    .flatMap((s) => s.agents);

  if (opts?.environmentId) {
    agents = agents.filter((a) => a.envId === opts.environmentId);
  }

  // Owner IDs arrive as Entra object IDs. Resolve the ones that look like IDs;
  // anything already human-readable (a publisher name, say) is left alone.
  const ownerIds = agents.map((a) => a.owner).filter((o): o is string => Boolean(o && GUID.test(o)));
  const owners = await resolveOwners(ownerIds);
  const ownersResolvable = ownerIds.length === 0 || owners.size > 0;

  agents = agents.map((agent) => {
    const resolved = agent.owner && GUID.test(agent.owner) ? owners.get(agent.owner) : undefined;
    return {
      ...agent,
      owner:
        agent.owner && GUID.test(agent.owner) ? (resolved?.name ?? null) : agent.owner,
      // Only ever set when Graph explicitly said the account is disabled -
      // an unresolved owner stays an orphan, never a guess either way.
      ...(resolved?.accountEnabled === false ? { ownerDisabled: true } : {}),
      location:
        agent.location && environmentNames.has(agent.location)
          ? environmentNames.get(agent.location)!
          : agent.location,
    };
  });

  return {
    fetchedAt: discovery.fetchedAt,
    discovery,
    environments,
    ...(environmentsResult.state === 'not_connected'
      ? { environmentsError: environmentsResult.reason }
      : {}),
    agents,
    ownersResolvable,
    orphans: agents.filter((a) => !a.owner),
    disabledOwners: agents.filter((a) => a.ownerDisabled === true),
  };
}

/** True when at least one store was read. Nothing can be reported otherwise. */
export function anyStoreRead(estate: Estate): boolean {
  return estate.discovery.sources.some((s) => s.status === 'ok');
}

/** The stores that could not be read, phrased for an administrator. */
export function unreadStores(estate: Estate): string[] {
  return estate.discovery.sources
    .filter((s) => s.status !== 'ok')
    .map((s) =>
      s.status === 'error'
        ? `${s.label} (${s.error})`
        : `${s.label} (not configured - needs ${s.requiredRole})`,
    );
}

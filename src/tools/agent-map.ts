/**
 * TOOL 5 of 5 - agent_map
 *
 * The estate as a Mermaid diagram. Copilot renders Mermaid in the chat surface,
 * so returning the source is enough - never rasterise.
 *
 * Adds no data source: it draws what sweep_inventory read.
 *
 * HONESTY: every node label carries a count that was read. A store that could
 * not be read is labelled "not connected" and drawn in the unread style. Zero
 * and unknown must never look the same on a diagram someone will screenshot.
 */

import { z } from 'zod';
import { ok, partial, notConnected, failed, toMcpContent, type ToolResult } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';
import { buildEstate, unreadStores, type Estate } from '../domain/estate.js';
import { findDuplicateClusters } from '../domain/clusters.js';
import { buildSourceReports } from './sweep-inventory.js';

export const agentMapInput = {
  groupBy: z
    .enum(['store', 'environment'])
    .optional()
    .describe("How to group the middle layer of the map. Defaults to 'store'."),
};

export interface AgentMapData {
  /** Mermaid source. Copilot renders this directly. */
  mermaid: string;
  legend: string;
  nodeCount: number;
  storesNotRead: string[];
}

/** Mermaid node labels cannot contain quotes or brackets. */
function esc(text: string): string {
  return text.replace(/["[\]{}()]/g, '').replace(/\|/g, '-');
}

function buildMermaid(estate: Estate, groupBy: 'store' | 'environment'): { mermaid: string; nodeCount: number } {
  const lines: string[] = ['flowchart TB'];
  const readStores = estate.discovery.sources.filter((s) => s.status === 'ok');
  const total = readStores.reduce((n, s) => n + s.count, 0);

  lines.push(`  tenant["Tenant<br/>${total} agents read"]`);
  let nodeCount = 1;

  if (groupBy === 'store') {
    estate.discovery.sources.forEach((source, i) => {
      const id = `s${i}`;
      nodeCount++;
      if (source.status === 'ok') {
        lines.push(`  ${id}["${esc(source.label)}<br/>${source.count}"]`);
        lines.push(`  tenant --> ${id}`);
        lines.push(`  class ${id} read;`);
      } else {
        // Deliberately not "0" - we did not read this store.
        lines.push(`  ${id}["${esc(source.label)}<br/>not connected"]`);
        lines.push(`  tenant --> ${id}`);
        lines.push(`  class ${id} unread;`);
      }
    });
  } else {
    const byLocation = new Map<string, number>();
    for (const agent of estate.agents) {
      const key = agent.location ?? 'Location unknown';
      byLocation.set(key, (byLocation.get(key) ?? 0) + 1);
    }
    [...byLocation.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([location, count], i) => {
        const id = `e${i}`;
        nodeCount++;
        lines.push(`  ${id}["${esc(location)}<br/>${count}"]`);
        lines.push(`  tenant --> ${id}`);
        lines.push(`  class ${id} read;`);
      });
  }

  // Risk layer - only findings that were actually computed.
  const clusters = findDuplicateClusters(estate.agents);
  if (estate.orphans.length > 0) {
    nodeCount++;
    lines.push(`  orphans["No resolvable owner<br/>${estate.orphans.length}"]`);
    lines.push('  tenant --> orphans');
    lines.push('  class orphans risk;');
  }
  if (clusters.length > 0) {
    nodeCount++;
    const duplicated = clusters.reduce((n, c) => n + c.agents.length, 0);
    lines.push(`  dupes["Duplicate clusters<br/>${clusters.length} covering ${duplicated}"]`);
    lines.push('  tenant --> dupes');
    lines.push('  class dupes risk;');
  }

  lines.push('  classDef read fill:#e8f4ea,stroke:#2f855a,color:#1a202c;');
  lines.push('  classDef unread fill:#f0f0f0,stroke:#a0aec0,color:#4a5568,stroke-dasharray: 4 3;');
  lines.push('  classDef risk fill:#fdf0e6,stroke:#f26f21,color:#1a202c;');

  return { mermaid: lines.join('\n'), nodeCount };
}

export async function agentMap(args: {
  groupBy?: 'store' | 'environment';
}): Promise<ToolResult<AgentMapData>> {
  if (!readerConfigured()) {
    return notConnected(
      'The AgentLens-Reader service principal is not configured, so there is nothing to map. An empty diagram would imply an empty tenant, which is not what was found.',
      [{ source: 'Azure Resource Graph', status: 'not_connected' }],
      'Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET (or KEY_VAULT_URI) on the server.',
    );
  }

  let estate: Estate;
  try {
    estate = await buildEstate();
  } catch (e) {
    return failed('The agent map could not be produced.', e);
  }

  const sources = buildSourceReports(estate);
  const notRead = unreadStores(estate);

  if (notRead.length === estate.discovery.sources.length) {
    return notConnected(
      'No agent store could be read, so no map can be drawn.',
      sources,
      `Grant the reader service principal access to at least one store. Not read: ${notRead.join('; ')}`,
    );
  }

  const { mermaid, nodeCount } = buildMermaid(estate, args.groupBy ?? 'store');

  const data: AgentMapData = {
    mermaid,
    legend:
      'Green nodes were read from the tenant and the number is the agent count. ' +
      'Grey dashed nodes could not be read - they are not zero, they are unknown. ' +
      'Orange nodes are findings worth acting on.',
    nodeCount,
    storesNotRead: notRead,
  };

  const summary =
    `Mapped ${estate.agents.length} agents across ${estate.discovery.sources.length - notRead.length} of ` +
    `${estate.discovery.sources.length} stores.` +
    (notRead.length > 0 ? ' Stores that could not be read are shown as "not connected", not as zero.' : '');

  return notRead.length > 0
    ? partial(summary, data, sources, `Not read: ${notRead.join('; ')}`)
    : ok(summary, data, sources);
}

export const agentMapTool = {
  name: 'agent_map',
  config: {
    title: 'Map my agents',
    description:
      'Render the agent estate as a Mermaid diagram: the four stores with their counts, and the findings worth acting on such as orphaned agents and duplicate clusters. Stores that could not be read are labelled as such rather than shown as zero. Read-only.',
    inputSchema: agentMapInput,
  },
  handler: async (args: { groupBy?: 'store' | 'environment' }) => toMcpContent(await agentMap(args)),
};

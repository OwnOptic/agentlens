/**
 * TOOL 5 of 5 - agent_map
 *
 * Renders the agent estate as a Mermaid diagram: the four stores, where risk
 * concentrates, and the recommended disposition.
 *
 * ---------------------------------------------------------------------------
 * TO IMPLEMENT
 * ---------------------------------------------------------------------------
 * This is the simplest tool. It adds no new data source: build the graph from
 * sweep_inventory (and dlp_posture if available), then emit Mermaid text.
 *
 * Copilot renders Mermaid in the chat surface, so returning the source is
 * enough. Do not rasterise to an image.
 *
 * Suggested shape (flowchart TB):
 *   tenant -> the four stores -> risk buckets -> disposition
 *   Colour: red for the ungoverned Default environment and the retire bucket,
 *   amber for orphans and duplicate clusters, green for promote.
 *
 * HONESTY RULES:
 *   - Node labels carry counts. Every count comes from sweep_inventory.
 *   - If a store returned no data, label it "not connected" rather than "0".
 *     Zero and unknown are different findings and must look different.
 */

import { z } from 'zod';
import { notImplemented, toMcpContent, type ToolResult } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';

export const agentMapInput = {
  groupBy: z
    .enum(['store', 'environment', 'disposition'])
    .optional()
    .describe("How to group the top level of the map. Defaults to 'store'."),
  includeDisposition: z
    .boolean()
    .optional()
    .describe('Include the promote / consolidate / retire buckets. Requires value_and_cost. Defaults to true.'),
};

export interface AgentMapData {
  /** Mermaid source. Copilot renders this directly. */
  mermaid: string;
  /** Short prose explaining how to read the diagram. */
  legend: string;
  nodeCount: number;
}

export async function agentMap(
  _args: { groupBy?: 'store' | 'environment' | 'disposition'; includeDisposition?: boolean },
): Promise<ToolResult<AgentMapData>> {
  if (!readerConfigured()) {
    return notImplemented('agent_map', ['Azure Resource Graph'],
      'This tool renders the output of sweep_inventory. Configure the AgentLens-Reader service principal first.');
  }

  // TODO(implement): build from sweep_inventory, emit Mermaid.
  return notImplemented('agent_map', ['Azure Resource Graph'],
    'Build the graph from sweep_inventory output and emit Mermaid flowchart source. See the notes at the top of mcp/src/tools/agent-map.ts.');
}

export const agentMapTool = {
  name: 'agent_map',
  config: {
    title: 'Map my agents',
    description:
      'Render the agent estate as a Mermaid diagram: the four stores, the risk hotspots such as the ungoverned Default environment and orphaned agents, and the recommended disposition. Read-only.',
    inputSchema: agentMapInput,
  },
  handler: async (args: { groupBy?: 'store' | 'environment' | 'disposition'; includeDisposition?: boolean }) =>
    toMcpContent(await agentMap(args)),
};

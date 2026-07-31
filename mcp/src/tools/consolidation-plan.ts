/**
 * TOOL 4 of 5 - consolidation_plan
 *
 * Clusters duplicate agents, drafts the improvement plan, and returns it as a
 * branded PDF the administrator can send to agent owners.
 *
 * ---------------------------------------------------------------------------
 * TO IMPLEMENT
 * ---------------------------------------------------------------------------
 * 1. CLUSTERING - derive from sweep_inventory rather than re-querying. Signals
 *    that work well together: normalised name similarity, shared connectors,
 *    shared knowledge sources, and same-purpose descriptions. Prefer explainable
 *    heuristics over an opaque score; the administrator must be able to defend
 *    the recommendation to the agent's owner.
 *
 * 2. PLAN - for each cluster pick the canonical agent (highest adoption, correct
 *    environment, has an owner) and mark the rest for merge.
 *
 * 3. PDF - render server-side. The demo used a simple HTML template printed to
 *    PDF via headless Edge/Chromium, which is enough. Keep the Elliot Margot
 *    brand: navy #2A3B4E band, orange #F26F21 rule, e-margot.ch footer.
 *
 * RETURNING THE FILE
 *   MCP tools return content items. Options, in order of preference:
 *     a) Return a short-lived signed URL to the generated PDF (best for Copilot,
 *        keeps the response small).
 *     b) Return a base64 resource. Watch the response size limit.
 *   Do NOT return a link to a file the caller cannot reach.
 *
 * HONESTY RULES:
 *   - Every figure in the PDF comes from sweep_inventory and value_and_cost.
 *     If cost is unavailable, the PDF must omit the savings line entirely rather
 *     than printing an estimate.
 *   - Never state a saving you did not compute.
 */

import { z } from 'zod';
import { notImplemented, toMcpContent, type ToolResult } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';

export const consolidationPlanInput = {
  format: z
    .enum(['json', 'pdf'])
    .optional()
    .describe("Output format. 'json' returns the plan data, 'pdf' also renders the branded document. Defaults to json."),
  minClusterSize: z
    .number()
    .int()
    .min(2)
    .optional()
    .describe('Minimum number of agents for a group to count as a duplicate cluster. Defaults to 2.'),
};

export interface DuplicateCluster {
  clusterName: string;
  agentCount: number;
  canonicalAgentId: string;
  canonicalAgentName: string;
  environments: string[];
  mergeCandidates: { agentId: string; agentName: string; environment: string }[];
  evidence: string;
}

export interface ConsolidationPlanData {
  clusters: DuplicateCluster[];
  agentsToRetire: number;
  estimatedMonthlySaving: number | null;
  currency: string | null;
  actions: string[];
  pdfUrl?: string;
}

export async function consolidationPlan(
  _args: { format?: 'json' | 'pdf'; minClusterSize?: number },
): Promise<ToolResult<ConsolidationPlanData>> {
  if (!readerConfigured()) {
    return notImplemented('consolidation_plan', ['Azure Resource Graph', 'Microsoft Graph'],
      'This tool builds on sweep_inventory and value_and_cost. Configure the AgentLens-Reader service principal first.');
  }

  // TODO(implement): cluster from sweep_inventory, enrich with value_and_cost,
  // render the PDF when format === 'pdf'.
  return notImplemented('consolidation_plan', ['Azure Resource Graph', 'Microsoft Graph'],
    'Implement clustering on top of sweep_inventory, then render the branded PDF. See the notes at the top of mcp/src/tools/consolidation-plan.ts.');
}

export const consolidationPlanTool = {
  name: 'consolidation_plan',
  config: {
    title: 'Duplicates and consolidation plan',
    description:
      'Find duplicate agents, choose the canonical one per cluster, and draft an improvement plan with the merge, retire and ownership actions. Optionally renders a branded PDF. Read-only, it never merges anything itself.',
    inputSchema: consolidationPlanInput,
  },
  handler: async (args: { format?: 'json' | 'pdf'; minClusterSize?: number }) =>
    toMcpContent(await consolidationPlan(args)),
};

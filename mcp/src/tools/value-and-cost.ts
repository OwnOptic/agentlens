/**
 * TOOL 3 of 5 - value_and_cost
 *
 * Joins aggregate usage signals with real Azure spend to rank every agent as
 * promote / improve / consolidate / retire.
 *
 * ---------------------------------------------------------------------------
 * TO IMPLEMENT
 * ---------------------------------------------------------------------------
 * REUSE, do not rewrite:
 *   ../../lib/connectors/kpis.ts        -> kpis (KpisConnector)
 *   ../../lib/connectors/transcripts.ts -> transcript aggregation
 *   ../../lib/connectors/dataverse.ts   -> Dataverse Web API client
 *   ../../lib/connectors/cost.ts        -> cost (CostConnector)
 *   ../../lib/connectors/costManagement.ts -> Azure Cost Management queries
 *   ../../lib/cost/projections.ts       -> month-end forecast
 *   ../../lib/auth/tokenService.ts      -> getDataverseToken(orgUrl)
 *
 * REQUIRED ACCESS:
 *   - Dataverse: the reader SP must be an APPLICATION USER in each environment,
 *     with a security role granting Read on `conversationtranscript`.
 *     Configured per environment in the Power Platform admin center.
 *   - Cost: Cost Management Reader RBAC on the subscription or billing scope.
 *
 * ---------------------------------------------------------------------------
 * PRIVACY - THE HARD RULE
 * ---------------------------------------------------------------------------
 * Transcripts are analysed IN AGGREGATE ONLY. Persist and return counts, rates
 * and scores. Never return, log, or store message content. Never return an end
 * user's identity. The only personal data allowed out is an AGENT OWNER's name,
 * because owners are accountable parties, not data subjects of the conversation.
 *
 * If you find yourself needing raw transcript text to implement a feature, stop
 * and redesign the feature. This rule is what makes the tool deployable in a
 * client tenant.
 */

import { z } from 'zod';
import { notImplemented, toMcpContent, type ToolResult } from '../lib/result.js';
import { readerConfigured, config } from '../lib/config.js';

export const valueAndCostInput = {
  days: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe('Lookback window in days for usage signals. Defaults to 30.'),
  environmentId: z.string().optional().describe('Optional. Restrict to a single environment ID.'),
};

export type Verdict = 'promote' | 'improve' | 'consolidate' | 'retire';

export interface AgentValueRow {
  agentId: string;
  agentName: string;
  sessions: number;
  resolutionRate: number | null;
  escalationRate: number | null;
  monthlyCost: number | null;
  currency: string | null;
  verdict: Verdict;
  rationale: string;
}

export interface ValueAndCostData {
  windowDays: number;
  monthToDateCost: number | null;
  forecastMonthEnd: number | null;
  costOnZeroUsageAgents: number | null;
  currency: string | null;
  agents: AgentValueRow[];
}

export async function valueAndCost(
  _args: { days?: number; environmentId?: string },
): Promise<ToolResult<ValueAndCostData>> {
  const missing: string[] = [];
  if (!readerConfigured()) missing.push('the AgentLens-Reader credentials');
  if (config.dataverseOrgUrls.length === 0) missing.push('DATAVERSE_ORG_URLS');
  if (!config.reader.subscriptionId) missing.push('AZURE_SUBSCRIPTION_ID');

  if (missing.length > 0) {
    return notImplemented('value_and_cost', ['Dataverse', 'Azure Cost Management'],
      `Set ${missing.join(', ')}. The reader service principal also needs an Application User in each Dataverse environment (Read on conversationtranscript) and Cost Management Reader on the billing scope.`);
  }

  // TODO(implement): usage via kpis/transcripts (AGGREGATE ONLY), spend via cost,
  // then join and classify. If one side is unavailable, return `partial` with the
  // side you do have and mark the other not_connected - do NOT estimate it.
  return notImplemented('value_and_cost', ['Dataverse', 'Azure Cost Management'],
    'Wire usage to lib/connectors/kpis.ts + transcripts.ts (aggregate only) and spend to lib/connectors/cost.ts. See the notes at the top of mcp/src/tools/value-and-cost.ts.');
}

export const valueAndCostTool = {
  name: 'value_and_cost',
  config: {
    title: 'Value and cost',
    description:
      'Rank agents by real adoption and real Azure spend, and give each a verdict: promote, improve, consolidate or retire. Usage is aggregate only, no conversation content. Read-only.',
    inputSchema: valueAndCostInput,
  },
  handler: async (args: { days?: number; environmentId?: string }) =>
    toMcpContent(await valueAndCost(args)),
};

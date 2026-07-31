/**
 * TOOL 1 of 5 - sweep_inventory   [REFERENCE IMPLEMENTATION PATTERN]
 *
 * Returns every AI agent in the tenant across all four stores, with owner,
 * environment, sharing scope, orphans and duplicate clusters.
 *
 * ---------------------------------------------------------------------------
 * TO IMPLEMENT
 * ---------------------------------------------------------------------------
 * The console already does this. REUSE it, do not rewrite the API calls:
 *
 *   ../../lib/connectors/discovery.ts   ->  discoverAllAgents(): Promise<DiscoveryResult>
 *       Sweeps all four sources and is exactly this tool's job.
 *   ../../lib/connectors/argInventory.ts -> argInventory.listAgents() / .listEnvironments()
 *   ../../lib/connectors/graph.ts        -> graph (owner resolution, Agent 365 packages)
 *   ../../lib/auth/tokenService.ts       -> getArmToken() / getGraphToken()
 *
 * Two ways to consume them:
 *   A) Import directly if you compile the MCP against the repo root (path alias
 *      "@/lib/*"). Simplest, keeps one implementation.
 *   B) Call the console's HTTP route (app/api/discover/route.ts) if you deploy
 *      the MCP separately from the Next.js app.
 * Pick one and note it in mcp/README.md.
 *
 * REQUIRED ACCESS (see the root README, section 6):
 *   - Azure Resource Graph  : Reader RBAC + Power Platform Administrator role
 *   - Microsoft Graph       : User.Read.All (application), admin-consented
 *   - Agent 365 (optional)  : CopilotPackages.Read.All - license gated, degrade
 *                             to 'partial' rather than failing if absent
 *
 * HONESTY RULES (non-negotiable):
 *   - Never invent counts. If a store cannot be read, mark that source
 *     not_connected and report the stores you COULD read as 'partial'.
 *   - Report zero as zero. Zero agents is a real finding, not a failure.
 */

import { z } from 'zod';
import { notImplemented, toMcpContent, type ToolResult } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';

export const sweepInventoryInput = {
  environmentId: z
    .string()
    .optional()
    .describe('Optional. Restrict the sweep to a single Power Platform environment ID.'),
  includeOrphansOnly: z
    .boolean()
    .optional()
    .describe('Optional. When true, return only agents with no resolvable owner.'),
};

export interface AgentRecord {
  id: string;
  name: string;
  store: 'Copilot Studio' | 'M365 Agent Builder' | 'Azure AI Foundry' | 'Microsoft Fabric';
  environment: string;
  owner: string | null;
  sharing: string | null;
  createdOn?: string;
}

export interface SweepInventoryData {
  totalAgents: number;
  environmentCount: number;
  byStore: Record<string, number>;
  defaultEnvironmentAgents: number;
  orphanedAgents: number;
  duplicateClusters: number;
  agents: AgentRecord[];
}

export async function sweepInventory(
  _args: { environmentId?: string; includeOrphansOnly?: boolean },
): Promise<ToolResult<SweepInventoryData>> {
  // Guard: without the reader service principal there is nothing to read.
  if (!readerConfigured()) {
    return notImplemented('sweep_inventory', ['Azure Resource Graph', 'Microsoft Graph'],
      'Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET for the AgentLens-Reader service principal, then grant it Reader RBAC plus the Power Platform Administrator role. See the root README section 6.');
  }

  // TODO(implement): replace everything below with a call to discoverAllAgents()
  // and map its DiscoveryResult onto SweepInventoryData.
  //
  //   const result = await discoverAllAgents();
  //   return ok(`Found ${result.agents.length} agents across ${envCount} environments.`, mapped, [
  //     { source: 'Azure Resource Graph', status: 'connected' },
  //     { source: 'Microsoft Graph', status: 'connected' },
  //   ]);
  return notImplemented('sweep_inventory', ['Azure Resource Graph', 'Microsoft Graph'],
    'Wire this tool to discoverAllAgents() in lib/connectors/discovery.ts. See the implementation notes at the top of mcp/src/tools/sweep-inventory.ts.');
}

export const sweepInventoryTool = {
  name: 'sweep_inventory',
  config: {
    title: 'Sweep every agent store',
    description:
      'Inventory every AI agent in the tenant across Copilot Studio, M365 Agent Builder, Azure AI Foundry and Microsoft Fabric. Returns counts per store, per environment, agents with no owner, and duplicate clusters. Read-only.',
    inputSchema: sweepInventoryInput,
  },
  handler: async (args: { environmentId?: string; includeOrphansOnly?: boolean }) =>
    toMcpContent(await sweepInventory(args)),
};

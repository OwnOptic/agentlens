/**
 * TOOL 2 of 5 - dlp_posture
 *
 * Data Loss Prevention policy coverage per environment, a tenant compliance
 * score, and the risky patterns worth fixing first.
 *
 * ---------------------------------------------------------------------------
 * TO IMPLEMENT
 * ---------------------------------------------------------------------------
 * REUSE, do not rewrite:
 *   ../../lib/connectors/dlp.ts      -> fetchTenantDlpPolicies(): Promise<DlpResult>
 *   ../../lib/connectors/ppApi.ts    -> Power Platform / BAP API helpers
 *   ../../lib/compliance/scoring.ts        -> the tenant compliance score
 *   ../../lib/compliance/riskyPatterns.ts  -> risky pattern detection
 *   ../../lib/compliance/rules.ts          -> the rule definitions
 *   ../../lib/dlp/recommendations.ts       -> per-archetype recommendations
 *
 * REQUIRED ACCESS:
 *   The AgentLens-Reader service principal must be registered as a Power
 *   Platform ADMIN MANAGEMENT APPLICATION. This is NOT an API permission:
 *     New-PowerAppManagementApp -ApplicationId <READER_APP_ID>
 *   An administrator must run it in a user context; a service principal cannot
 *   register itself.
 *   https://learn.microsoft.com/power-platform/admin/powerplatform-api-create-service-principal
 *
 * HONESTY RULES:
 *   - "No policy" is a real, important finding. Report it as a finding, never as
 *     an error and never as a safe default.
 *   - Do not infer a policy exists because an environment looks managed.
 */

import { z } from 'zod';
import { notImplemented, toMcpContent, type ToolResult } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';

export const dlpPostureInput = {
  environmentId: z
    .string()
    .optional()
    .describe('Optional. Restrict the assessment to a single environment ID.'),
};

export interface EnvironmentPosture {
  environmentId: string;
  environmentName: string;
  archetype: 'Default' | 'Production' | 'Sandbox' | 'Dev' | 'Trial' | 'Other';
  policyCount: number;
  verdict: 'compliant' | 'partial' | 'none';
  detail: string;
}

export interface RiskyPattern {
  pattern: string;
  severity: 'critical' | 'warning' | 'info';
  affectedAgents: number;
  why: string;
}

export interface DlpPostureData {
  complianceScore: number | null;
  openViolations: number;
  environments: EnvironmentPosture[];
  riskyPatterns: RiskyPattern[];
}

export async function dlpPosture(_args: { environmentId?: string }): Promise<ToolResult<DlpPostureData>> {
  if (!readerConfigured()) {
    return notImplemented('dlp_posture', ['Power Platform Governance API'],
      'Set the AgentLens-Reader credentials, then register the service principal as a Power Platform admin management application with New-PowerAppManagementApp. See the root README section 6.');
  }

  // TODO(implement): call fetchTenantDlpPolicies(), score with lib/compliance/scoring.ts,
  // and detect patterns with lib/compliance/riskyPatterns.ts.
  return notImplemented('dlp_posture', ['Power Platform Governance API'],
    'Wire this tool to fetchTenantDlpPolicies() in lib/connectors/dlp.ts and the scorers in lib/compliance/. See the notes at the top of mcp/src/tools/dlp-posture.ts.');
}

export const dlpPostureTool = {
  name: 'dlp_posture',
  config: {
    title: 'Governance and DLP posture',
    description:
      'Assess Data Loss Prevention coverage per Power Platform environment, produce a tenant compliance score, and list risky patterns such as agents shared with the whole organisation or running on maker credentials. Read-only.',
    inputSchema: dlpPostureInput,
  },
  handler: async (args: { environmentId?: string }) => toMcpContent(await dlpPosture(args)),
};

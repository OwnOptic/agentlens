/**
 * TOOL 2 of 5 - dlp_posture
 *
 * Which Power Platform environments a DLP policy actually covers, and which are
 * exposed.
 *
 * Reads: Power Platform governance API (policies) and the Power Platform admin
 * API (environments). Both are needed - you cannot say an environment is
 * uncovered without knowing the environment exists.
 *
 * ACCESS: the governance API is not an Entra API permission. An administrator
 * must run New-PowerAppManagementApp for the reader app registration.
 *
 * HONESTY: "no policy covers this environment" is a finding, reported as a
 * finding. It is never softened into a safe-looking default, and a 403 is never
 * reported as "no policies exist".
 */

import { z } from 'zod';
import { ok, partial, notConnected, failed, toMcpContent, type SourceReport, type ToolResult } from '../lib/result.js';
import { readerConfigured } from '../lib/config.js';
import { fetchTenantDlpPolicies, type DlpPolicy } from '../connectors/dlp.js';
import { buildDlpCoverageSvg } from '../lib/diagram.js';
import { listEnvironments } from '../connectors/inventory.js';
import type { Environment } from '../domain/types.js';

export const dlpPostureInput = {
  environmentId: z
    .string()
    .optional()
    .describe('Optional. Restrict the assessment to a single environment ID.'),
};

export interface EnvironmentPosture {
  environmentId: string;
  environmentName: string;
  environmentType: string;
  isDefault: boolean;
  /** Policies whose scope includes this environment. */
  coveringPolicies: string[];
  verdict: 'covered' | 'uncovered';
  detail: string;
}

export interface DlpPostureData {
  policyCount: number;
  hasTenantWidePolicy: boolean;
  environmentsAssessed: number | null;
  uncoveredEnvironments: number | null;
  policies: { name: string; scope: string; blocked: number; business: number; nonBusiness: number }[];
  environments: EnvironmentPosture[];
  /** Coverage grid as self-contained SVG - present when environments were read. */
  svg?: string;
  findings: { severity: 'critical' | 'warning' | 'info'; message: string }[];
}

/** Does this policy's scope include this environment? */
function covers(policy: DlpPolicy, env: Environment): boolean {
  switch (policy.scope) {
    case 'AllEnvironments':
      return true;
    case 'OnlyEnvironments':
      return policy.scopedEnvironmentIds.includes(env.id);
    case 'ExceptEnvironments':
      return !policy.scopedEnvironmentIds.includes(env.id);
    default:
      return false;
  }
}

export async function dlpPosture(args: {
  environmentId?: string;
}): Promise<ToolResult<DlpPostureData>> {
  if (!readerConfigured()) {
    return notConnected(
      'The AgentLens-Reader service principal is not configured, so DLP policies could not be read. No conclusion about tenant DLP coverage can be drawn.',
      [
        { source: 'Power Platform Governance API', status: 'not_connected' },
        { source: 'Power Platform Admin API', status: 'not_connected' },
      ],
      'Set AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET (or KEY_VAULT_URI), then have an administrator run: New-PowerAppManagementApp -ApplicationId <reader app id>.',
    );
  }

  let policyResult: Awaited<ReturnType<typeof fetchTenantDlpPolicies>>;
  let envResult: Awaited<ReturnType<typeof listEnvironments>>;
  try {
    [policyResult, envResult] = await Promise.all([fetchTenantDlpPolicies(), listEnvironments()]);
  } catch (e) {
    return failed('The DLP assessment could not be completed.', e);
  }

  const sources: SourceReport[] = [
    {
      source: 'Power Platform Governance API',
      status: policyResult.state === 'connected' ? 'connected' : 'not_connected',
      ...(policyResult.state === 'connected' ? {} : { detail: policyResult.reason }),
    },
    {
      source: 'Power Platform Admin API',
      status: envResult.state === 'connected' ? 'connected' : 'not_connected',
      ...(envResult.state === 'connected' ? {} : { detail: envResult.reason }),
    },
  ];

  if (policyResult.state === 'not_connected') {
    return notConnected(
      'The DLP policy list could not be read, so no statement can be made about which environments are covered. This is not the same as finding no policies.',
      sources,
      policyResult.reason,
    );
  }

  const policies = policyResult.policies;
  const hasTenantWidePolicy = policies.some((p) => p.scope === 'AllEnvironments');

  const findings: DlpPostureData['findings'] = [];

  if (policies.length === 0) {
    findings.push({
      severity: 'critical',
      message:
        'No DLP policies exist in this tenant. Every connector is available in every environment, including the default environment where all licensed users can build.',
    });
  } else if (!hasTenantWidePolicy) {
    findings.push({
      severity: 'critical',
      message:
        'No policy is scoped to AllEnvironments. Any environment created from now on is unprotected the moment it exists, before anyone notices it.',
    });
  }

  for (const p of policies) {
    if (p.blockedCount === 0 && p.businessCount === 0 && p.nonBusinessCount === 0) {
      findings.push({
        severity: 'warning',
        message: `Policy "${p.displayName}" classifies no connectors at all. It exists but governs nothing.`,
      });
    }
  }

  // Environment-by-environment coverage needs the environment list.
  let environments: EnvironmentPosture[] = [];
  let uncoveredEnvironments: number | null = null;
  let environmentsAssessed: number | null = null;

  if (envResult.state === 'connected') {
    const envs = args.environmentId
      ? envResult.environments.filter((e) => e.id === args.environmentId)
      : envResult.environments;

    environments = envs.map((env) => {
      const covering = policies.filter((p) => covers(p, env));
      return {
        environmentId: env.id,
        environmentName: env.name,
        environmentType: env.type,
        isDefault: env.isDefault,
        coveringPolicies: covering.map((p) => p.displayName),
        verdict: covering.length > 0 ? ('covered' as const) : ('uncovered' as const),
        detail:
          covering.length > 0
            ? `Covered by ${covering.length} polic${covering.length === 1 ? 'y' : 'ies'}: ${covering
                .map((p) => p.displayName)
                .join(', ')}.`
            : 'No DLP policy in this tenant has this environment in scope. Any connector may be used here.',
      };
    });

    environmentsAssessed = environments.length;
    uncoveredEnvironments = environments.filter((e) => e.verdict === 'uncovered').length;

    const uncoveredDefault = environments.find((e) => e.isDefault && e.verdict === 'uncovered');
    if (uncoveredDefault) {
      findings.push({
        severity: 'critical',
        message: `The default environment "${uncoveredDefault.environmentName}" is not covered by any DLP policy. Every licensed user can create agents there.`,
      });
    }
  }

  const data: DlpPostureData = {
    policyCount: policies.length,
    hasTenantWidePolicy,
    environmentsAssessed,
    uncoveredEnvironments,
    policies: policies.map((p) => ({
      name: p.displayName,
      scope: p.scope,
      blocked: p.blockedCount,
      business: p.businessCount,
      nonBusiness: p.nonBusinessCount,
    })),
    environments,
    ...(environments.length > 0 ? { svg: buildDlpCoverageSvg(environments) } : {}),
    findings,
  };

  if (envResult.state === 'not_connected') {
    return partial(
      `Read ${policies.length} DLP polic${policies.length === 1 ? 'y' : 'ies'}, but the environment list could not be read, so coverage per environment is unknown. ${findings.length} tenant-level finding${findings.length === 1 ? '' : 's'}.`,
      data,
      sources,
      envResult.reason,
    );
  }

  const summary =
    `${policies.length} DLP polic${policies.length === 1 ? 'y' : 'ies'} across ${environmentsAssessed} environment${environmentsAssessed === 1 ? '' : 's'}: ` +
    `${uncoveredEnvironments} uncovered. ${findings.length} finding${findings.length === 1 ? '' : 's'}.`;

  return ok(summary, data, sources);
}

export const dlpPostureTool = {
  name: 'dlp_posture',
  config: {
    title: 'Governance and DLP posture',
    description:
      'Assess Data Loss Prevention coverage across Power Platform environments: which policies exist, which environments no policy covers, and whether the default environment is exposed. Read-only.',
    inputSchema: dlpPostureInput,
    // Read-only, stated machine-readably: Cowork (and progressively Copilot)
    // treats unannotated tools as destructive and demands confirmation.
    annotations: { title: 'Assess DLP posture', readOnlyHint: true, destructiveHint: false },
  },
  handler: async (args: { environmentId?: string }) => toMcpContent(await dlpPosture(args)),
};

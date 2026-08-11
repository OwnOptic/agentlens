/**
 * Tenant DLP policies, from the Power Platform governance API.
 *
 *   GET https://api.bap.microsoft.com/providers/PowerPlatform.Governance/v1/policies
 *
 * ACCESS NOTE: this is NOT an Entra API permission. The service principal must be
 * registered as a Power Platform admin management application:
 *
 *   New-PowerAppManagementApp -ApplicationId <AgentLens-Reader app id>
 *
 * An administrator runs that in a user context; a service principal cannot
 * register itself. Until it is run, this connector returns not_connected with
 * that instruction rather than an empty policy list - "no policies found" and
 * "not allowed to look" are opposite findings and must never be confused.
 */

import { getArmToken } from '../lib/tokens.js';

export interface DlpPolicy {
  id: string;
  displayName: string;
  /** AllEnvironments | ExceptEnvironments | OnlyEnvironments */
  scope: string;
  /** Environment IDs named by the policy. Empty when scope is AllEnvironments. */
  scopedEnvironmentIds: string[];
  blockedCount: number;
  businessCount: number;
  nonBusinessCount: number;
}

interface BapConnectorGroup {
  classification: 'Business' | 'NonBusiness' | 'Blocked';
  connectors?: { id: string; name?: string }[];
}

interface BapEnvironmentFilter {
  filterType: 'AllEnvironments' | 'ExceptEnvironments' | 'OnlyEnvironments';
  environments?: { name: string }[];
}

interface BapPolicy {
  name: string;
  displayName?: string;
  environments?: BapEnvironmentFilter;
  environmentsFilter?: BapEnvironmentFilter;
  connectorGroups?: BapConnectorGroup[];
}

export type DlpResult =
  | { state: 'connected'; policies: DlpPolicy[] }
  | { state: 'not_connected'; reason: string };

function countIn(groups: BapConnectorGroup[], classification: BapConnectorGroup['classification']): number {
  return groups
    .filter((g) => g.classification === classification)
    .reduce((n, g) => n + (g.connectors?.length ?? 0), 0);
}

function mapPolicy(raw: BapPolicy): DlpPolicy {
  const groups = raw.connectorGroups ?? [];
  const filter = raw.environmentsFilter ?? raw.environments;

  return {
    id: raw.name,
    displayName: raw.displayName ?? raw.name,
    scope: filter?.filterType ?? 'AllEnvironments',
    scopedEnvironmentIds: (filter?.environments ?? []).map((e) => e.name),
    blockedCount: countIn(groups, 'Blocked'),
    businessCount: countIn(groups, 'Business'),
    nonBusinessCount: countIn(groups, 'NonBusiness'),
  };
}

/** Read every DLP policy in the tenant. Never throws. */
export async function fetchTenantDlpPolicies(): Promise<DlpResult> {
  const token = await getArmToken();
  if (!token) {
    return {
      state: 'not_connected',
      reason:
        'Could not acquire a token. Check AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET.',
    };
  }

  const url =
    'https://api.bap.microsoft.com/providers/PowerPlatform.Governance/v1/policies?api-version=2016-11-01';

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 403) {
      return {
        state: 'not_connected',
        reason:
          'Authenticated but denied (HTTP 403). Register the service principal as a Power Platform admin management application: New-PowerAppManagementApp -ApplicationId <reader app id>. An administrator must run this in a user context.',
      };
    }
    if (res.status === 401) {
      return {
        state: 'not_connected',
        reason:
          'Token rejected (HTTP 401). Confirm admin consent for https://management.azure.com/.default on the reader app registration.',
      };
    }
    if (!res.ok) {
      return {
        state: 'not_connected',
        reason: `Power Platform governance API returned HTTP ${res.status}.`,
      };
    }

    const raw = (await res.json()) as { value?: BapPolicy[] };
    return { state: 'connected', policies: (raw.value ?? []).map(mapPolicy) };
  } catch (err) {
    return {
      state: 'not_connected',
      reason: `Network error calling the Power Platform governance API: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

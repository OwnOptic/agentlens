/**
 * dlp.ts - Read real tenant DLP policies from the BAP admin API.
 *
 * Endpoint: GET https://api.bap.microsoft.com/providers/PowerPlatform.Governance/v1/policies?api-version=2016-11-01
 *
 * T-501: replaced private MSAL flow with getArmToken() from tokenService so
 *        the token cache, retry logic, and MSAL singleton are shared across
 *        all connectors.
 *
 * Returns an honest "not_connected" state when credentials are absent or the
 * token call fails - never throws, never fakes data.
 *
 * @server
 */

import { getArmToken } from '@/lib/auth/tokenService';
import type { TenantDlpPolicy, DlpGap } from '@/lib/dlp/types';

// ---------------------------------------------------------------------------
// BAP API types (raw response shapes)
// ---------------------------------------------------------------------------

interface BapConnectorGroup {
  classification: 'Business' | 'NonBusiness' | 'Blocked';
  connectors: { id: string; name?: string }[];
}

interface BapEnvironmentFilter {
  filterType: 'AllEnvironments' | 'ExceptEnvironments' | 'OnlyEnvironments';
  environments?: { name: string }[];
}

interface BapPolicy {
  name: string;
  displayName?: string;
  type?: string;
  environments?: BapEnvironmentFilter;
  connectorGroups?: BapConnectorGroup[];
  // v2 shape uses environmentsFilter
  environmentsFilter?: BapEnvironmentFilter;
}

interface BapPoliciesResponse {
  value?: BapPolicy[];
}

// ---------------------------------------------------------------------------
// Map BAP response -> TenantDlpPolicy[]
// ---------------------------------------------------------------------------

function mapBapPolicy(raw: BapPolicy): TenantDlpPolicy {
  const groups = raw.connectorGroups ?? [];

  const businessCount = groups
    .filter((g) => g.classification === 'Business')
    .reduce((n, g) => n + (g.connectors?.length ?? 0), 0);

  const nonBusinessCount = groups
    .filter((g) => g.classification === 'NonBusiness')
    .reduce((n, g) => n + (g.connectors?.length ?? 0), 0);

  const blockedCount = groups
    .filter((g) => g.classification === 'Blocked')
    .reduce((n, g) => n + (g.connectors?.length ?? 0), 0);

  const filter = raw.environmentsFilter ?? raw.environments;
  const filterType = filter?.filterType ?? 'AllEnvironments';
  const scopedEnvs = filter?.environments ?? [];

  const scope: string =
    filterType === 'AllEnvironments'
      ? 'AllEnvironments'
      : filterType === 'ExceptEnvironments'
      ? 'ExceptEnvironments'
      : 'OnlyEnvironments';

  const envCount =
    scope === 'AllEnvironments' ? -1 : scopedEnvs.length;

  return {
    id: raw.name,
    displayName: raw.displayName ?? raw.name,
    scope,
    envCount,
    blockedCount,
    businessCount,
    nonBusinessCount,
  };
}

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

function detectGaps(policies: TenantDlpPolicy[]): DlpGap[] {
  const gaps: DlpGap[] = [];

  const hasGlobalPolicy = policies.some((p) => p.scope === 'AllEnvironments');
  if (!hasGlobalPolicy) {
    gaps.push({
      severity: 'critical',
      envName: 'Default Environment',
      message:
        'No policy is scoped to AllEnvironments. The default environment (where all licensed users can create) has no tenant-wide DLP coverage. This is a critical exposure: any maker can use any connector in the default env.',
    });
  }

  if (policies.length === 0) {
    gaps.push({
      severity: 'warning',
      envName: 'Tenant',
      message:
        'No DLP policies found. The tenant has no connector governance in place. All connectors are unrestricted in all environments.',
    });
    return gaps;
  }

  if (policies.length === 1 && hasGlobalPolicy) {
    gaps.push({
      severity: 'info',
      envName: 'Tenant',
      message:
        'Only one global DLP policy exists. Consider adding environment-specific policies for dev, UAT, and governance environments to allow controlled experimentation without weakening the global policy.',
    });
  }

  for (const p of policies) {
    if (p.blockedCount === 0 && p.businessCount === 0 && p.nonBusinessCount === 0) {
      gaps.push({
        severity: 'warning',
        envName: p.displayName,
        message: `Policy "${p.displayName}" has zero classified connectors. It may be empty or misconfigured and provides no actual governance.`,
      });
    }
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type DlpResult =
  | { state: 'connected'; policies: TenantDlpPolicy[]; gaps: DlpGap[] }
  | { state: 'not_connected'; reason: string };

/**
 * Fetch DLP policies from the BAP admin API.
 *
 * Returns honest "not_connected" when:
 *  - AZURE_CLIENT_ID or AZURE_TENANT_ID env vars are absent
 *  - ARM token acquisition fails (wrong credentials, consent not granted)
 *  - BAP API returns 403 (service principal lacks Power Platform admin role)
 *
 * Never throws.
 */
export async function fetchTenantDlpPolicies(): Promise<DlpResult> {
  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId || !tenantId) {
    return {
      state: 'not_connected',
      reason:
        'AZURE_CLIENT_ID and AZURE_TENANT_ID environment variables are required. Add them to .env.local (see .env.example). The service principal also needs the Power Platform Administrator role.',
    };
  }

  // T-501: use shared tokenService instead of a private MSAL flow
  const token = await getArmToken();
  if (!token) {
    return {
      state: 'not_connected',
      reason:
        'Failed to acquire an ARM token. Check that AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET (or Key Vault equivalent) are correct and that the service principal has been granted admin consent for the Management API scope.',
    };
  }

  const url =
    'https://api.bap.microsoft.com/providers/PowerPlatform.Governance/v1/policies?api-version=2016-11-01';

  let raw: BapPoliciesResponse;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 403) {
      return {
        state: 'not_connected',
        reason:
          'The service principal was authenticated but received HTTP 403 from the BAP admin API. Ensure the app registration has been granted the "Power Platform Administrator" role in the Power Platform admin center (not just Azure AD admin roles).',
      };
    }

    if (res.status === 401) {
      return {
        state: 'not_connected',
        reason:
          'HTTP 401 from the BAP admin API. The ARM token was acquired but rejected. Verify the service principal has admin consent for https://management.azure.com/.default.',
      };
    }

    if (!res.ok) {
      return {
        state: 'not_connected',
        reason: `BAP admin API returned HTTP ${res.status}. Check service principal permissions and tenant configuration.`,
      };
    }

    raw = (await res.json()) as BapPoliciesResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      state: 'not_connected',
      reason: `Network error calling BAP admin API: ${message}`,
    };
  }

  const policies = (raw.value ?? []).map(mapBapPolicy);
  const gaps = detectGaps(policies);

  return { state: 'connected', policies, gaps };
}

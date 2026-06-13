/**
 * dataverseDeepScan connector
 *
 * Performs a deep inspection of a single Copilot Studio agent's Dataverse
 * configuration to detect governance signals (auth mode, channels, connectors,
 * risky patterns, DLP review status, knowledge sources).
 *
 * Real endpoints queried per bot:
 *   - Bot record:
 *       GET {orgUrl}/api/data/v9.2/bots({botId})?$select=botid,name,schemaname,authmode,msdyn_publishedon,msdyn_dlpreviewed,msdyn_httpenabled,msdyn_httpapproved,msdyn_lifecycle,msdyn_tenantscope
 *   - Channels:
 *       GET {orgUrl}/api/data/v9.2/botcomponents?$filter=_parentbotid_value eq '{botId}' and componenttype eq 1&$select=name,componenttype
 *   - Connectors (Power Automate flows linked to the bot):
 *       GET {orgUrl}/api/data/v9.2/workflows?$filter=_parentbotid_value eq '{botId}'&$select=name,type,connectors
 *   - Knowledge sources:
 *       GET {orgUrl}/api/data/v9.2/msdyn_botknowledgesources?$filter=_msdyn_botid_value eq '{botId}'&$select=msdyn_name,msdyn_type,msdyn_siteurl
 *
 * Falls back to a deterministic mock payload when credentials are absent.
 */

import type { DataverseDeepScanConnector } from '@/lib/connectors/interfaces';
import { getDataverseToken } from '@/lib/auth/tokenService';

function hasCredentials(): boolean {
  return Boolean(
    process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_TENANT_ID,
  );
}

// ---------------------------------------------------------------------------
// Mock fallback - returns a representative offline payload
// ---------------------------------------------------------------------------
function mockScanPayload(botId: string): Record<string, unknown> {
  return {
    botId,
    source: 'mock',
    authMode: 'azure_ad',
    dlpReviewed: false,
    httpEnabled: false,
    httpApproved: false,
    lifecycle: 'pilot',
    tenantScope: false,
    channels: ['teams', 'directline'],
    connectors: ['dataverse', 'sharepoint'],
    knowledgeSources: [
      { name: 'Internal KB', type: 'sharepoint', siteUrl: 'https://contoso.sharepoint.com/sites/kb' },
    ],
    riskyPatterns: [] as string[],
    scannedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Dataverse Web API helpers
// ---------------------------------------------------------------------------
async function fetchDataverse<T>(
  orgUrl: string,
  path: string,
  token: string,
): Promise<T> {
  const base = orgUrl.replace(/\/$/, '');
  // {orgUrl}/api/data/v9.2/{path}
  const url = `${base}/api/data/v9.2/${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  if (!resp.ok) {
    throw new Error(
      `Dataverse query failed [${path}]: ${resp.status} ${resp.statusText}`,
    );
  }
  return resp.json() as Promise<T>;
}

interface BotRecord {
  botid: string;
  name: string;
  authmode?: string | null;
  msdyn_publishedon?: string | null;
  msdyn_dlpreviewed?: boolean | null;
  msdyn_httpenabled?: boolean | null;
  msdyn_httpapproved?: boolean | null;
  msdyn_lifecycle?: string | null;
  msdyn_tenantscope?: boolean | null;
}

interface BotComponent {
  name: string;
  componenttype: number;
}

interface BotWorkflow {
  name: string;
  type: number;
  connectors?: string | null;
}

interface KnowledgeSource {
  msdyn_name: string;
  msdyn_type?: string | null;
  msdyn_siteurl?: string | null;
}

interface ODataList<T> {
  value: T[];
}

// ---------------------------------------------------------------------------
// Live scan implementation
// ---------------------------------------------------------------------------
async function liveScan(
  orgUrl: string,
  botId: string,
): Promise<Record<string, unknown>> {
  const token = await getDataverseToken(orgUrl);
  if (!token) throw new Error(`No token available for Dataverse org: ${orgUrl}`);

  // Run all four Dataverse queries in parallel
  const [botResult, channelsResult, flowsResult, kbResult] =
    await Promise.allSettled([
      // Bot record
      fetchDataverse<BotRecord>(
        orgUrl,
        `bots(${botId})?$select=botid,name,authmode,msdyn_publishedon,msdyn_dlpreviewed,msdyn_httpenabled,msdyn_httpapproved,msdyn_lifecycle,msdyn_tenantscope`,
        token,
      ),
      // Channel components (componenttype = 1)
      fetchDataverse<ODataList<BotComponent>>(
        orgUrl,
        `botcomponents?$filter=_parentbotid_value eq '${botId}' and componenttype eq 1&$select=name,componenttype`,
        token,
      ),
      // Linked Power Automate workflows
      fetchDataverse<ODataList<BotWorkflow>>(
        orgUrl,
        `workflows?$filter=_parentbotid_value eq '${botId}'&$select=name,type,connectors`,
        token,
      ),
      // Knowledge sources
      fetchDataverse<ODataList<KnowledgeSource>>(
        orgUrl,
        `msdyn_botknowledgesources?$filter=_msdyn_botid_value eq '${botId}'&$select=msdyn_name,msdyn_type,msdyn_siteurl`,
        token,
      ),
    ]);

  const bot =
    botResult.status === 'fulfilled'
      ? botResult.value
      : ({ botid: botId } as BotRecord);

  const channels =
    channelsResult.status === 'fulfilled'
      ? channelsResult.value.value.map((c) => c.name)
      : [];

  const rawConnectors =
    flowsResult.status === 'fulfilled'
      ? flowsResult.value.value.flatMap((f) => {
          if (!f.connectors) return [];
          try {
            const parsed = JSON.parse(f.connectors) as string[];
            return parsed;
          } catch {
            return [f.connectors];
          }
        })
      : [];
  const connectors = [...new Set(rawConnectors)];

  const knowledgeSources =
    kbResult.status === 'fulfilled'
      ? kbResult.value.value.map((k) => ({
          name: k.msdyn_name,
          type: k.msdyn_type ?? 'unknown',
          siteUrl: k.msdyn_siteurl ?? null,
        }))
      : [];

  // Derive risky patterns from the scan results
  const riskyPatterns: string[] = [];
  if (bot.authmode === 'none' || bot.authmode === 'anonymous') {
    riskyPatterns.push('anonymous_auth');
  }
  if (bot.msdyn_httpenabled && !bot.msdyn_httpapproved) {
    riskyPatterns.push('http_action');
  }
  if (bot.msdyn_tenantscope) {
    riskyPatterns.push('shared_entire_tenant');
  }

  return {
    botId: bot.botid,
    source: 'live',
    authMode: bot.authmode ?? null,
    dlpReviewed: bot.msdyn_dlpreviewed ?? false,
    httpEnabled: bot.msdyn_httpenabled ?? false,
    httpApproved: bot.msdyn_httpapproved ?? false,
    lifecycle: bot.msdyn_lifecycle ?? null,
    tenantScope: bot.msdyn_tenantscope ?? false,
    channels,
    connectors,
    knowledgeSources,
    riskyPatterns,
    scannedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Exported connector object
// ---------------------------------------------------------------------------
export const dataverseDeepScan: DataverseDeepScanConnector = {
  async scan(
    orgUrl: string,
    botId: string,
  ): Promise<Record<string, unknown>> {
    if (!hasCredentials()) {
      return mockScanPayload(botId);
    }
    return liveScan(orgUrl, botId);
  },
};

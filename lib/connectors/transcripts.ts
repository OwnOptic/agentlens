/**
 * conversationtranscript connector - pulls real Copilot Studio transcripts from Dataverse,
 * then runs intent/sentiment analysis. PII-SAFE: transcript content is processed in-memory
 * and discarded; only aggregated per-agent signal counts leave this module.
 *
 * T-203: use `_msdyn_bot_value` (the msdyn_bot lookup) instead of
 *        `_bot_conversationtranscriptid_value` (the transcript's own id) so
 *        transcripts are grouped by the agent that produced them.
 * T-201: use fetchODataAll for pagination + timeout.
 */

import { getDataverseToken } from '@/lib/auth/tokenService';
import { fetchODataAll } from '@/lib/connectors/odata';
import {
  parseTranscriptContent,
  analyzeConversationSmart,
  aggregateAgentSignals,
  type AgentKpiSignals,
  type ConversationSignals,
} from '@/lib/analysis/intent';

export interface ConversationIntelResult {
  fetchedAt: string;
  source: 'dataverse' | 'none';
  envCount: number;
  transcriptCount: number;
  truncated: boolean;
  agents: AgentKpiSignals[];
  note?: string;
}

interface TranscriptRow {
  content: string;
  botId: string;
}

// OData response row from Dataverse conversationtranscripts
interface DataverseTranscriptRow {
  content: string;
  // msdyn_bot lookup - the agent that owns this transcript
  _msdyn_bot_value?: string | null;
}

/** Query the conversationtranscript table in one environment. */
async function fetchTranscriptsForEnv(
  orgUrl: string,
  sinceDays = 30,
  max = 500,
): Promise<{ rows: TranscriptRow[]; truncated: boolean }> {
  const token = await getDataverseToken(orgUrl);
  if (!token) throw new Error(`No token available for Dataverse org: ${orgUrl}`);

  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const filter = encodeURIComponent(`createdon gt ${since.toISOString()}`);

  // T-203: select _msdyn_bot_value (the bot lookup) not _bot_conversationtranscriptid_value
  const url =
    `${orgUrl.replace(/\/$/, '')}/api/data/v9.2/conversationtranscripts` +
    `?$select=content,createdon,_msdyn_bot_value&$filter=${filter}&$top=${max}`;

  const { rows: raw, truncated } = await fetchODataAll<DataverseTranscriptRow>(url, token, {
    timeoutMs: 20_000,
    maxRows: max,
  });

  const rows: TranscriptRow[] = raw.map((r) => ({
    content: String(r.content ?? ''),
    // T-203: use the bot lookup value; fall back to 'unknown' only as a last resort
    botId: String(r._msdyn_bot_value ?? 'unknown'),
  }));

  return { rows, truncated };
}

/**
 * Full pipeline: fetch transcripts across the given environments, analyze each
 * conversation (LLM or lexicon), aggregate per agent. Returns honest-empty when
 * no Dataverse credentials or no transcripts.
 */
export async function getConversationIntel(orgUrls: string[]): Promise<ConversationIntelResult> {
  const fetchedAt = new Date().toISOString();
  const hasCreds = Boolean(process.env.AZURE_CLIENT_ID && process.env.AZURE_TENANT_ID);
  if (!hasCreds || orgUrls.length === 0) {
    return {
      fetchedAt,
      source: 'none',
      envCount: 0,
      transcriptCount: 0,
      truncated: false,
      agents: [],
      note: 'No Dataverse connection - add the service-principal env vars and an environment with transcripts.',
    };
  }

  // 1) fetch transcripts from every env (failures per-env are non-fatal)
  const perEnv = await Promise.allSettled(orgUrls.map((u) => fetchTranscriptsForEnv(u)));
  const rows: TranscriptRow[] = [];
  let anyTruncated = false;
  for (const r of perEnv) {
    if (r.status === 'fulfilled') {
      rows.push(...r.value.rows);
      if (r.value.truncated) anyTruncated = true;
    }
  }

  if (rows.length === 0) {
    return {
      fetchedAt,
      source: 'dataverse',
      envCount: orgUrls.length,
      transcriptCount: 0,
      truncated: false,
      agents: [],
      note: 'No conversation transcripts found in the connected environments.',
    };
  }

  // 2) group by agent, parse + analyze each conversation
  const byAgent = new Map<string, ConversationSignals[]>();
  for (const row of rows) {
    const messages = parseTranscriptContent(row.content);
    if (messages.length === 0) continue;
    const signals = await analyzeConversationSmart(messages); // LLM if configured, else lexicon
    const list = byAgent.get(row.botId) ?? [];
    list.push(signals);
    byAgent.set(row.botId, list);
  }

  // 3) aggregate per agent (only counts/rates leave here - no raw text)
  const agents: AgentKpiSignals[] = [];
  for (const [botId, signals] of byAgent) {
    agents.push(aggregateAgentSignals(botId, signals));
  }
  agents.sort((a, b) => b.conversations - a.conversations);

  return {
    fetchedAt,
    source: 'dataverse',
    envCount: orgUrls.length,
    transcriptCount: rows.length,
    truncated: anyTruncated,
    agents,
  };
}

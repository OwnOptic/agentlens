/**
 * conversationtranscript connector - pulls real Copilot Studio transcripts from Dataverse,
 * then runs intent/sentiment analysis. PII-SAFE: transcript content is processed in-memory
 * and discarded; only aggregated per-agent signal counts leave this module.
 */

import { getDataverseToken } from '@/lib/auth/tokenService';
import { parseTranscriptContent, analyzeConversationSmart, aggregateAgentSignals, type AgentKpiSignals, type ConversationSignals } from '@/lib/analysis/intent';

export interface ConversationIntelResult {
  fetchedAt: string;
  source: 'dataverse' | 'none';
  envCount: number;
  transcriptCount: number;
  agents: AgentKpiSignals[];
  note?: string;
}

interface TranscriptRow {
  content: string;
  botId: string;
}

/** Query the conversationtranscript table in one environment. */
async function fetchTranscriptsForEnv(orgUrl: string, sinceDays = 30, max = 500): Promise<TranscriptRow[]> {
  const token = await getDataverseToken(orgUrl);
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const filter = encodeURIComponent(`createdon gt ${since.toISOString()}`);
  // conversationtranscript: content (JSON), bot lookup, createdon
  const url =
    `${orgUrl.replace(/\/$/, '')}/api/data/v9.2/conversationtranscripts` +
    `?$select=content,createdon,_bot_conversationtranscriptid_value&$filter=${filter}&$top=${max}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`conversationtranscripts ${res.status}`);
  const body = (await res.json()) as { value: Array<Record<string, unknown>> };
  return body.value.map((r) => ({
    content: String(r.content ?? ''),
    botId: String(r._bot_conversationtranscriptid_value ?? 'unknown'),
  }));
}

/**
 * Full pipeline: fetch transcripts across the given environments, analyze each
 * conversation (LLM or lexicon), aggregate per agent. Returns honest-empty when
 * no Dataverse credentials or no transcripts.
 */
export async function getConversationIntel(orgUrls: string[]): Promise<ConversationIntelResult> {
  const fetchedAt = new Date().toISOString();
  const hasCreds = Boolean(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID);
  if (!hasCreds || orgUrls.length === 0) {
    return { fetchedAt, source: 'none', envCount: 0, transcriptCount: 0, agents: [], note: 'No Dataverse connection - add the service-principal env vars and an environment with transcripts.' };
  }

  // 1) fetch transcripts from every env (failures per-env are non-fatal)
  const perEnv = await Promise.allSettled(orgUrls.map((u) => fetchTranscriptsForEnv(u)));
  const rows: TranscriptRow[] = [];
  for (const r of perEnv) if (r.status === 'fulfilled') rows.push(...r.value);

  if (rows.length === 0) {
    return { fetchedAt, source: 'dataverse', envCount: orgUrls.length, transcriptCount: 0, agents: [], note: 'No conversation transcripts found in the connected environments.' };
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

  return { fetchedAt, source: 'dataverse', envCount: orgUrls.length, transcriptCount: rows.length, agents };
}

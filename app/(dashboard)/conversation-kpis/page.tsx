'use client';

/**
 * Conversation KPIs - REAL intent + sentiment signals derived from Dataverse
 * conversationtranscript content (LLM classifier + lexicon fallback), aggregated
 * per agent. PII-safe: only counts, never raw text. Honest-empty when not connected.
 */

import { useEffect, useState } from 'react';
import {
  MessagesSquare, RefreshCw, ThumbsUp, CheckCircle2, PhoneForwarded, Frown, Heart, Activity, AlertTriangle, Loader2,
} from 'lucide-react';
import { Card, Badge, StatCard, PageHeader, SectionTitle, Button } from '@/components/ui';

interface AgentSignals {
  botId: string;
  conversations: number;
  resolutionRate: number;
  escalationRate: number;
  frustrationRate: number;
  gratitudeRate: number;
  abandonmentRate: number;
  avgSentiment: number;
  csatProxy: number;
  classifier: 'llm' | 'lexicon' | 'mixed';
}
interface IntelResult {
  fetchedAt: string;
  source: 'dataverse' | 'none';
  envCount: number;
  transcriptCount: number;
  agents: AgentSignals[];
  note?: string;
  error?: string;
}

function avg(xs: number[]): number {
  return xs.length ? parseFloat((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)) : 0;
}

export default function ConversationKpisPage() {
  const [data, setData] = useState<IntelResult | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/conversation-intel', { cache: 'no-store' });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const agents = data?.agents ?? [];
  const connected = data?.source === 'dataverse' && agents.length > 0;

  return (
    <div className="p-8">
      <PageHeader
        icon={MessagesSquare}
        tone="sky"
        title="Conversation KPIs"
        subtitle="Intent + sentiment from real conversation transcripts - gratitude, resolution, escalation, frustration - analyzed per agent (LLM classifier, PII-safe aggregate-only)."
        badge={connected ? <Badge variant="success" dot>live transcripts</Badge> : <Badge variant="neutral">not connected</Badge>}
        actions={<Button icon={RefreshCw} onClick={load}>Refresh</Button>}
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-sky-400" /> Analyzing transcripts...
        </div>
      )}

      {!loading && !connected && (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-amber-300">Conversation intelligence not connected</p>
              <p className="mt-1 text-sm text-slate-400">
                {data?.note ?? 'Add the service-principal env vars and an environment with transcripts.'}
              </p>
              <pre className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">{`AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID   # Dataverse access
AGENTLENS_ORG_URLS=https://orgXXXX.crm.dynamics.com       # envs to scan
AZURE_OPENAI_API_KEY=...                                  # LLM classifier (else lexicon)`}</pre>
              <p className="mt-2 text-xs text-slate-500">No fake numbers shown - this page is real or honestly empty.</p>
            </div>
          </div>
        </Card>
      )}

      {!loading && connected && (
        <div className="space-y-8">
          <p className="text-xs text-slate-500">
            {data!.transcriptCount.toLocaleString()} transcripts across {data!.envCount} env(s) ·{' '}
            classifier: <span className="text-slate-300">{agents[0]?.classifier ?? 'lexicon'}</span> ·{' '}
            <span suppressHydrationWarning>{new Date(data!.fetchedAt).toLocaleString()}</span>
          </p>

          {/* Tenant rollup */}
          <section>
            <SectionTitle icon={Activity}>Tenant rollup</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard icon={Heart} label="Avg CSAT proxy" value={`${avg(agents.map((a) => a.csatProxy))}`} tone="emerald" />
              <StatCard icon={CheckCircle2} label="Resolution rate" value={`${avg(agents.map((a) => a.resolutionRate))}%`} tone="emerald" />
              <StatCard icon={ThumbsUp} label="Gratitude rate" value={`${avg(agents.map((a) => a.gratitudeRate))}%`} tone="sky" />
              <StatCard icon={PhoneForwarded} label="Escalation rate" value={`${avg(agents.map((a) => a.escalationRate))}%`} tone="amber" />
              <StatCard icon={Frown} label="Frustration rate" value={`${avg(agents.map((a) => a.frustrationRate))}%`} tone="red" />
            </div>
          </section>

          {/* Per-agent */}
          <section>
            <SectionTitle icon={MessagesSquare}>Per agent ({agents.length})</SectionTitle>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Agent</th>
                      <th className="px-4 py-3">Convos</th>
                      <th className="px-4 py-3">CSAT</th>
                      <th className="px-4 py-3">Resolved</th>
                      <th className="px-4 py-3">Gratitude</th>
                      <th className="px-4 py-3">Escalated</th>
                      <th className="px-4 py-3">Frustrated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.botId} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">{a.botId}</td>
                        <td className="px-4 py-3 text-slate-400">{a.conversations}</td>
                        <td className="px-4 py-3">
                          <Badge variant={a.csatProxy >= 70 ? 'success' : a.csatProxy >= 45 ? 'warning' : 'critical'}>{a.csatProxy}</Badge>
                        </td>
                        <td className="px-4 py-3 text-emerald-400">{a.resolutionRate}%</td>
                        <td className="px-4 py-3 text-sky-400">{a.gratitudeRate}%</td>
                        <td className="px-4 py-3 text-amber-400">{a.escalationRate}%</td>
                        <td className="px-4 py-3 text-red-400">{a.frustrationRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

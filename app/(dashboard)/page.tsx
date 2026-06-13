'use client';

/**
 * Overview - the REAL landing page. Real tenant posture from Azure Resource Graph,
 * a data-flow diagram, and per-source connection transparency. KPIs that need a
 * source we haven't wired yet are shown honestly as "needs <source>", never faked.
 */

import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Bot, Globe, Network, UserX, RefreshCw, DollarSign, ShieldCheck, Gauge, HeartPulse, MessagesSquare, AlertTriangle, Loader2,
} from 'lucide-react';
import { Card, Badge, StatCard, PageHeader, SectionTitle, Button, InfoTip } from '@/components/ui';
import { DataFlowDiagram, type FlowSource } from '@/components/DataFlowDiagram';

interface OverviewData {
  connected: boolean;
  fetchedAt?: string;
  sources: FlowSource[];
  agents: number;
  environments: number;
  defaultEnvAgents: number;
  orphans: number;
  resourceSummary: { type: string; count: number }[];
  error?: string;
}

// Features that need a source not yet wired - shown honestly, never with fake numbers.
const PENDING = [
  { icon: DollarSign, label: 'Cost & Capacity', needs: 'PPAC Licensing API' },
  { icon: ShieldCheck, label: 'Compliance score', needs: 'evaluating now from ARG (wiring)' },
  { icon: Gauge, label: 'Maturity score', needs: 'deriving from ARG signals (wiring)' },
  { icon: HeartPulse, label: 'Health', needs: 'Azure App Insights' },
  { icon: MessagesSquare, label: 'Conversation KPIs', needs: 'Dataverse transcripts + env URLs' },
];

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/overview', { cache: 'no-store' });
      setData(await res.json());
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="p-8">
      <PageHeader
        icon={LayoutDashboard}
        title="Overview"
        subtitle="Real tenant posture from Azure Resource Graph. Hover any ⓘ to see what a metric means and where it comes from."
        badge={data?.connected ? <Badge variant="success" dot>Live ARG data</Badge> : <Badge variant="neutral">ARG not connected</Badge>}
        actions={<Button icon={RefreshCw} onClick={load}>Refresh</Button>}
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> Querying your tenant...
        </div>
      )}

      {!loading && fetchError && (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-amber-300">Could not load overview data</p>
              <p className="mt-1 text-sm text-slate-400">{fetchError}</p>
            </div>
            <Button icon={RefreshCw} onClick={load}>Retry</Button>
          </div>
        </Card>
      )}

      {!loading && !fetchError && data && (
        <div className="space-y-8">
          {!data.connected && (
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-amber-300">
                <AlertTriangle className="h-4 w-4" /> Azure Resource Graph not connected - set the ARG token / app registration to see real data.
              </div>
            </Card>
          )}

          {/* REAL KPIs from ARG */}
          <section>
            <SectionTitle>
              Live tenant metrics
              <span className="ml-2"><InfoTip label="source">All four come from a single Azure Resource Graph query (PowerPlatformResources) - the same source the Discovery and Inventory pages use. No estimates, no mock.</InfoTip></span>
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={Bot} tone="emerald" label="Copilot Studio agents"
                value={<span className="inline-flex items-center gap-1.5">{data.agents}<InfoTip>Total Copilot Studio agents across every environment, from ARG (`microsoft.copilotstudio/agents`).</InfoTip></span>} />
              <StatCard icon={Globe} tone="sky" label="Environments"
                value={<span className="inline-flex items-center gap-1.5">{data.environments}<InfoTip>Power Platform environments in the tenant (ARG).</InfoTip></span>} />
              <StatCard icon={Network} tone="amber" label="Default-env agents"
                value={<span className="inline-flex items-center gap-1.5">{data.defaultEnvAgents}<InfoTip>Agents sitting in the default environment - the sprawl/migration worklist. Computed from ARG `isDefault` + `environmentId`.</InfoTip></span>} />
              <StatCard icon={UserX} tone="red" label="Orphan agents"
                value={<span className="inline-flex items-center gap-1.5">{data.orphans}<InfoTip>Agents with no registered owner (ARG `ownerId` empty) - cleanup candidates.</InfoTip></span>} />
            </div>
          </section>

          {/* Data-flow diagram */}
          <section>
            <SectionTitle>How your data flows</SectionTitle>
            <DataFlowDiagram sources={data.sources} />
          </section>

          {/* Source connection transparency */}
          <section>
            <SectionTitle>Data sources <span className="ml-2"><InfoTip>Each AgentLens feature reads a specific Microsoft API. This shows exactly what's connected in your tenant right now and what each unlocks.</InfoTip></span></SectionTitle>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Powers</th>
                      <th className="px-4 py-3">Requires</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map((s) => (
                      <tr key={s.key} className="border-b border-slate-800/60 last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-200">{s.label}</td>
                        <td className="px-4 py-3 text-slate-400">{s.powers}</td>
                        <td className="px-4 py-3 text-slate-500">{s.role}</td>
                        <td className="px-4 py-3">
                          {s.state === 'live'
                            ? <Badge variant="success" dot>connected</Badge>
                            : <Badge variant="neutral">not connected</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* Honest "coming online" - features that need an unwired source */}
          <section>
            <SectionTitle>Awaiting a data source <span className="ml-2"><InfoTip>These features are built but show no numbers until their source is connected - we never display fake figures.</InfoTip></span></SectionTitle>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {PENDING.map((p) => (
                <Card key={p.label} className="p-4">
                  <p.icon className="h-5 w-5 text-slate-500" />
                  <p className="mt-2 text-sm font-medium text-slate-300">{p.label}</p>
                  <p className="mt-1 text-[11px] text-slate-500">needs: {p.needs}</p>
                </Card>
              ))}
            </div>
          </section>

          {data.fetchedAt && (
            <p className="text-xs text-slate-600">
              Live from Azure Resource Graph · <span suppressHydrationWarning>{new Date(data.fetchedAt).toLocaleString()}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

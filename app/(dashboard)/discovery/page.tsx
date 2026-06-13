'use client';

/**
 * Agent Discovery - identifies EVERY Microsoft agent in the tenant across all 4 stores:
 * Copilot Studio / M365 Agent Builder (live via ARG), M365 registry (Graph), Foundry, Fabric.
 */

import { useEffect, useState } from 'react';
import {
  Radar, RefreshCw, Bot, AppWindow, Sparkles, Database, CircleHelp,
  CheckCircle2, AlertTriangle, MinusCircle, type LucideIcon,
} from 'lucide-react';
import { Card, Badge, PageHeader, SectionTitle, Button, type BadgeVariant, type Tone } from '@/components/ui';
import type { DiscoveryResult, DiscoverySource, AgentPlatform } from '@/lib/connectors/discovery';

const SOURCE_ICON: Record<string, LucideIcon> = {
  power_platform: Bot,
  m365: AppWindow,
  foundry: Sparkles,
  fabric: Database,
};
const SOURCE_TONE: Record<string, Tone> = {
  power_platform: 'violet',
  m365: 'sky',
  foundry: 'emerald',
  fabric: 'amber',
};
const PLATFORM_BADGE: Record<AgentPlatform, BadgeVariant> = {
  copilot_studio: 'accent',
  m365_agentbuilder: 'info',
  m365_declarative: 'info',
  foundry: 'success',
  fabric: 'warning',
};
const PLATFORM_LABEL: Record<AgentPlatform, string> = {
  copilot_studio: 'Copilot Studio',
  m365_agentbuilder: 'Agent Builder',
  m365_declarative: 'M365',
  foundry: 'Foundry',
  fabric: 'Fabric',
};

function StatusBadge({ status }: { status: DiscoverySource['status'] }) {
  if (status === 'ok') return <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> connected</Badge>;
  if (status === 'error') return <Badge variant="critical"><AlertTriangle className="h-3 w-3" /> error</Badge>;
  return <Badge variant="neutral"><MinusCircle className="h-3 w-3" /> not configured</Badge>;
}

export default function DiscoveryPage() {
  const [data, setData] = useState<DiscoveryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/discover', { cache: 'no-store' });
      setData(await res.json());
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const allAgents = data?.sources.flatMap((s) => s.agents) ?? [];

  return (
    <div className="p-8">
      <PageHeader
        icon={Radar}
        tone="violet"
        title="Agent Discovery"
        subtitle="Every Microsoft agent in the tenant - Copilot Studio, M365 Agent Builder, the M365 registry, Azure AI Foundry, and Microsoft Fabric - swept across all four stores."
        badge={data && <Badge variant="accent" dot>{data.total} agents found</Badge>}
        actions={<Button icon={RefreshCw} onClick={load}>Refresh</Button>}
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Radar className="h-4 w-4 animate-pulse text-violet-400" /> Sweeping all agent stores...
        </div>
      )}

      {!loading && fetchError && (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-amber-300">Could not sweep agent stores</p>
              <p className="mt-1 text-sm text-slate-400">{fetchError}</p>
            </div>
            <Button icon={RefreshCw} onClick={load}>Retry</Button>
          </div>
        </Card>
      )}

      {!loading && !fetchError && data && (
        <div className="space-y-8">
          {/* Source cards */}
          <section>
            <SectionTitle icon={CircleHelp}>Sources</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {data.sources.map((s) => {
                const Icon = SOURCE_ICON[s.key] ?? Bot;
                return (
                  <Card key={s.key} hover className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-5 w-5 text-slate-300" />
                        <p className="text-sm font-medium text-slate-200">{s.label}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-2xl font-semibold text-slate-100">{s.count}</p>
                    <div className="mt-2"><StatusBadge status={s.status} /></div>
                    <p className="mt-3 text-[11px] text-slate-500">{s.api}</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">Requires: {s.requiredRole}</p>
                    {s.error && <p className="mt-1 text-[11px] text-red-400">{s.error}</p>}
                  </Card>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Each store needs its own token + admin role. Power Platform (ARG) is live; M365 (Graph copilotPackages),
              Foundry, and Fabric light up when their tokens are configured.
            </p>
          </section>

          {/* Unified agent list */}
          <section>
            <SectionTitle icon={Bot}>All agents ({allAgents.length})</SectionTitle>
            <Card>
              {allAgents.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">
                  No agents discovered yet. The Power Platform sweep is live; configure the other source tokens to widen the sweep.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Agent</th>
                        <th className="px-4 py-3">Platform</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3">Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allAgents.map((a) => (
                        <tr key={`${a.platform}-${a.id}`} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-medium text-slate-200">{a.name}</td>
                          <td className="px-4 py-3"><Badge variant={PLATFORM_BADGE[a.platform]}>{PLATFORM_LABEL[a.platform]}</Badge></td>
                          <td className="px-4 py-3 text-slate-400">{a.location ?? '-'}</td>
                          <td className="px-4 py-3 text-slate-400">{a.owner ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

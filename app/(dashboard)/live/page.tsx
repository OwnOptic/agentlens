'use client';

/**
 * Live (MVP) - the ONE page wired to real tenant data via Azure Resource Graph.
 * Every other page renders mock seed data; this one calls /api/live which queries
 * the real MVP tenant. Proves the ARG backbone end-to-end.
 */

import { useEffect, useState } from 'react';
import {
  ScanEye,
  Radio,
  RefreshCw,
  Boxes,
  Workflow,
  Network,
  Layers,
  AppWindow,
  Globe,
  Bot,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  Button,
} from '@/components/ui';

interface LiveEnv {
  id: string;
  displayName: string;
  environmentType: string;
  region: string;
  isDefault: boolean;
}
interface LiveData {
  source: string;
  tenant: string;
  fetchedAt: string;
  summary: { type: string; count: number }[];
  environments: LiveEnv[];
  agents: { name: string; properties: Record<string, unknown> }[];
  error?: string;
  hint?: string;
}

const TYPE_LABEL: Record<string, string> = {
  'microsoft.copilotstudio/agents': 'Copilot Studio agents',
  'microsoft.powerplatformconnector/connectors': 'Connectors',
  'microsoft.powerapps/modeldrivenapps': 'Model-driven apps',
  'microsoft.powerapps/canvasapps': 'Canvas apps',
  'microsoft.powerautomate/cloudflows': 'Cloud flows',
  'microsoft.powerplatform/environments': 'Environments',
};

// Icon mapping per resource type
import type { LucideIcon } from 'lucide-react';
const TYPE_ICON: Record<string, LucideIcon> = {
  'microsoft.copilotstudio/agents': Bot,
  'microsoft.powerplatformconnector/connectors': Network,
  'microsoft.powerapps/modeldrivenapps': Layers,
  'microsoft.powerapps/canvasapps': AppWindow,
  'microsoft.powerautomate/cloudflows': Workflow,
  'microsoft.powerplatform/environments': Globe,
};

// Tone per resource type
import type { Tone } from '@/components/ui';
const TYPE_TONE: Record<string, Tone> = {
  'microsoft.copilotstudio/agents': 'violet',
  'microsoft.powerplatformconnector/connectors': 'sky',
  'microsoft.powerapps/modeldrivenapps': 'emerald',
  'microsoft.powerapps/canvasapps': 'emerald',
  'microsoft.powerautomate/cloudflows': 'amber',
  'microsoft.powerplatform/environments': 'slate',
};

export default function LivePage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/live', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error + (json.hint ? ` - ${json.hint}` : ''));
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-8">
      <PageHeader
        icon={ScanEye}
        title="Live - MVP Tenant"
        subtitle="Real data from your tenant via Azure Resource Graph (PowerPlatformResources). Every other page uses demo seed data."
        badge={
          <Badge variant="accent" dot>
            Live ARG data
          </Badge>
        }
        actions={
          <Button icon={RefreshCw} onClick={load} variant="ghost">
            Refresh
          </Button>
        }
        tone="emerald"
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
          Querying Azure Resource Graph...
        </div>
      )}

      {err && (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div>
              <p className="font-semibold text-red-300">Live query failed</p>
              <p className="mt-1 text-sm text-red-400">{err}</p>
            </div>
          </div>
        </Card>
      )}

      {data && (
        <div className="space-y-8">
          <p className="text-xs text-slate-500">
            Tenant: <span className="text-slate-300">{data.tenant}</span> &middot; fetched{' '}
            <span suppressHydrationWarning className="text-slate-300">
              {new Date(data.fetchedAt).toLocaleString()}
            </span>
          </p>

          {/* Resource summary */}
          <section>
            <SectionTitle icon={Boxes}>Tenant resource inventory (live)</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.summary.map((s) => {
                const Icon = TYPE_ICON[s.type] ?? Boxes;
                const tone = TYPE_TONE[s.type] ?? 'slate';
                return (
                  <StatCard
                    key={s.type}
                    icon={Icon}
                    label={TYPE_LABEL[s.type] ?? s.type}
                    value={s.count.toLocaleString()}
                    tone={tone}
                  />
                );
              })}
              {data.agents.length > 0 && (
                <StatCard
                  icon={Bot}
                  label="Copilot Studio agents"
                  value={data.agents.length}
                  tone="violet"
                />
              )}
            </div>
            {data.agents.length === 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                No Copilot Studio agents in this tenant yet - create one in copilotstudio.microsoft.com
                and it appears here within ~15 min.
              </p>
            )}
          </section>

          {/* Environments */}
          <section>
            <SectionTitle icon={Globe}>
              Environments (live)
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
                &mdash; {data.environments.length}
              </span>
            </SectionTitle>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Region</th>
                      <th className="px-4 py-3">Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.environments.map((e) => (
                      <tr
                        key={e.id}
                        className="border-b border-slate-800/60 last:border-0 transition-colors hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3 font-medium text-slate-200">{e.displayName}</td>
                        <td className="px-4 py-3 text-slate-400">{String(e.environmentType)}</td>
                        <td className="px-4 py-3 text-slate-400">{String(e.region)}</td>
                        <td className="px-4 py-3">
                          {e.isDefault ? (
                            <Badge variant="info">Default</Badge>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* Agents (if any) */}
          {data.agents.length > 0 && (
            <section>
              <SectionTitle icon={Bot}>
                Copilot Studio agents (live)
              </SectionTitle>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Agent</th>
                        <th className="px-4 py-3">Owner</th>
                        <th className="px-4 py-3">Auth</th>
                        <th className="px-4 py-3">Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.agents.map((a) => {
                        const p = a.properties ?? {};
                        return (
                          <tr
                            key={a.name}
                            className="border-b border-slate-800/60 last:border-0 transition-colors hover:bg-slate-800/30"
                          >
                            <td className="px-4 py-3 font-medium text-slate-200">
                              {String(p.displayName ?? a.name)}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {String(p.ownerId ?? '-')}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {String(p.authentication ?? '-')}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {String(p.model ?? '-')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          )}

          {/* Connected indicator */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Connected to live tenant &middot; source: {data.source}
          </div>
        </div>
      )}
    </div>
  );
}

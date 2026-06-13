'use client';

/**
 * DLP Advisor page
 *
 * Section 1: Archetype selector (6 cards) -> selected archetype shows:
 *   - Strategy summary
 *   - Connector table with classification Badges and InfoTip reasons
 *   - Gotcha callout Cards (amber)
 *
 * Section 2: Your tenant vs baseline
 *   - Live policies table with gap Badges
 *   - Or honest not-connected Card with fix instructions
 *
 * Section 3: Copy block-list Button (clipboard copy of blocked connector names)
 *
 * Real or honest - no mock data.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  WifiOff,
  Info,
} from 'lucide-react';
import {
  Card,
  Badge,
  PageHeader,
  SectionTitle,
  Button,
  InfoTip,
  DataSourceBadge,
} from '@/components/ui';
import type {
  EnvArchetype,
  DlpRecommendation,
  ConnectorRec,
  TenantDlpPolicy,
  DlpGap,
} from '@/lib/dlp/types';

// ---------------------------------------------------------------------------
// Types matching the API response
// ---------------------------------------------------------------------------

type TenantPayload =
  | { state: 'connected'; policies: TenantDlpPolicy[]; gaps: DlpGap[] }
  | { state: 'not_connected'; reason: string };

interface ApiResponse {
  recommendations: DlpRecommendation[];
  tenant: TenantPayload;
}

// ---------------------------------------------------------------------------
// Archetype display config
// ---------------------------------------------------------------------------

const ARCHETYPE_META: Record<
  EnvArchetype,
  { label: string; icon: React.ReactNode; accentClass: string; badgeClass: string }
> = {
  default: {
    label: 'Default',
    icon: <ShieldAlert className="h-5 w-5" />,
    accentClass: 'border-red-500/40 bg-red-500/5',
    badgeClass: 'bg-red-500/10 text-red-300 ring-red-500/30',
  },
  dev: {
    label: 'Dev',
    icon: <ShieldCheck className="h-5 w-5" />,
    accentClass: 'border-sky-500/40 bg-sky-500/5',
    badgeClass: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  },
  sandbox_uat: {
    label: 'Sandbox / UAT',
    icon: <ShieldCheck className="h-5 w-5" />,
    accentClass: 'border-violet-500/40 bg-violet-500/5',
    badgeClass: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
  },
  production: {
    label: 'Production',
    icon: <ShieldAlert className="h-5 w-5" />,
    accentClass: 'border-emerald-500/40 bg-emerald-500/5',
    badgeClass: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  },
  trial: {
    label: 'Trial',
    icon: <AlertTriangle className="h-5 w-5" />,
    accentClass: 'border-amber-500/40 bg-amber-500/5',
    badgeClass: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  },
  governance: {
    label: 'Governance',
    icon: <ShieldCheck className="h-5 w-5" />,
    accentClass: 'border-teal-500/40 bg-teal-500/5',
    badgeClass: 'bg-teal-500/10 text-teal-300 ring-teal-500/30',
  },
};

const ARCHETYPE_ORDER: EnvArchetype[] = [
  'default',
  'dev',
  'sandbox_uat',
  'production',
  'trial',
  'governance',
];

// ---------------------------------------------------------------------------
// Connector classification -> Badge variant
// ---------------------------------------------------------------------------

function classificationVariant(c: ConnectorRec['classification']) {
  if (c === 'business') return 'success' as const;
  if (c === 'blocked') return 'critical' as const;
  return 'neutral' as const;
}

function classificationLabel(c: ConnectorRec['classification']) {
  if (c === 'business') return 'Business';
  if (c === 'blocked') return 'Blocked';
  return 'Non-Business';
}

// ---------------------------------------------------------------------------
// Gap severity -> Badge variant
// ---------------------------------------------------------------------------

function gapVariant(s: DlpGap['severity']) {
  if (s === 'critical') return 'critical' as const;
  if (s === 'warning') return 'warning' as const;
  return 'info' as const;
}

// ---------------------------------------------------------------------------
// Scope display
// ---------------------------------------------------------------------------

function scopeLabel(scope: string, envCount: number): string {
  if (scope === 'AllEnvironments') return 'All environments';
  if (scope === 'ExceptEnvironments')
    return envCount > 0 ? `Except ${envCount} env(s)` : 'Except (none specified)';
  if (scope === 'OnlyEnvironments')
    return envCount > 0 ? `${envCount} specific env(s)` : 'No envs targeted';
  return scope;
}

// ---------------------------------------------------------------------------
// ArchetypeCard
// ---------------------------------------------------------------------------

function ArchetypeCard({
  archetype,
  title,
  selected,
  onClick,
}: {
  archetype: EnvArchetype;
  title: string;
  selected: boolean;
  onClick: () => void;
}) {
  const meta = ARCHETYPE_META[archetype];
  return (
    <button
      onClick={onClick}
      className={[
        'flex w-full flex-col items-start rounded-xl border p-4 text-left transition-all',
        selected
          ? `${meta.accentClass} ring-1 ring-inset ring-current`
          : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80',
      ].join(' ')}
    >
      <span
        className={[
          'mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1',
          selected ? meta.badgeClass : 'bg-slate-800 text-slate-400 ring-slate-700',
        ].join(' ')}
      >
        {meta.icon}
        {meta.label}
      </span>
      <span className="text-sm font-medium leading-snug text-slate-200">{title}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ConnectorTable
// ---------------------------------------------------------------------------

function ConnectorTable({ connectors }: { connectors: ConnectorRec[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="pb-2 pr-4">Connector</th>
            <th className="pb-2 pr-4">Classification</th>
            <th className="pb-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          {connectors.map((c) => (
            <tr key={c.name} className="border-b border-slate-800/60 hover:bg-slate-800/30">
              <td className="py-2.5 pr-4 font-medium text-slate-200">{c.name}</td>
              <td className="py-2.5 pr-4">
                <Badge variant={classificationVariant(c.classification)}>
                  {classificationLabel(c.classification)}
                </Badge>
              </td>
              <td className="py-2.5 text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="truncate max-w-xs">{c.reason}</span>
                  <InfoTip>{c.reason}</InfoTip>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GotchaCards
// ---------------------------------------------------------------------------

function GotchaCards({ gotchas }: { gotchas: { title: string; detail: string }[] }) {
  return (
    <div className="space-y-3">
      {gotchas.map((g) => (
        <div
          key={g.title}
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" strokeWidth={2} />
            <div>
              <p className="text-sm font-semibold text-amber-300">{g.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{g.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TenantSection
// ---------------------------------------------------------------------------

function TenantSection({ tenant }: { tenant: TenantPayload | null; }) {
  if (!tenant) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading tenant DLP policies...</span>
        </div>
      </Card>
    );
  }

  if (tenant.state === 'not_connected') {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-slate-700">
            <WifiOff className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <p className="font-medium text-slate-200">Not connected to your tenant</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{tenant.reason}</p>
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-xs text-slate-400 font-mono leading-relaxed">
              <p className="mb-1 font-semibold text-slate-300 font-sans">Required in .env.local:</p>
              <p>AZURE_CLIENT_ID=&lt;app-registration-client-id&gt;</p>
              <p>AZURE_TENANT_ID=&lt;your-tenant-id&gt;</p>
              <p>AZURE_CLIENT_SECRET=&lt;client-secret&gt;</p>
              <p className="mt-1 text-slate-500">
                The service principal also needs the Power Platform Administrator role in the Power Platform admin center.
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const { policies, gaps } = tenant;

  return (
    <div className="space-y-4">
      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="space-y-2">
          {gaps.map((gap, i) => (
            <div
              key={i}
              className={[
                'flex items-start gap-3 rounded-lg border p-3',
                gap.severity === 'critical'
                  ? 'border-red-500/30 bg-red-500/5'
                  : gap.severity === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-sky-500/30 bg-sky-500/5',
              ].join(' ')}
            >
              <Badge variant={gapVariant(gap.severity)} className="mt-0.5 shrink-0">
                {gap.severity}
              </Badge>
              <div>
                <p className="text-xs font-semibold text-slate-300">{gap.envName}</p>
                <p className="mt-0.5 text-sm text-slate-400">{gap.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Policies table */}
      {policies.length === 0 ? (
        <Card className="p-6">
          <div className="flex items-center gap-3 text-slate-500">
            <Info className="h-4 w-4" />
            <span className="text-sm">No DLP policies found in this tenant.</span>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-2 pr-4">Policy Name</th>
                  <th className="pb-2 pr-4">Scope</th>
                  <th className="pb-2 pr-4">Business</th>
                  <th className="pb-2 pr-4">Non-Business</th>
                  <th className="pb-2">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-2.5 pr-4 font-medium text-slate-200">{p.displayName}</td>
                    <td className="py-2.5 pr-4 text-slate-400 text-xs">
                      {scopeLabel(p.scope, p.envCount)}
                    </td>
                    <td className="py-2.5 pr-4">
                      {p.businessCount > 0 ? (
                        <Badge variant="success">{p.businessCount}</Badge>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {p.nonBusinessCount > 0 ? (
                        <Badge variant="neutral">{p.nonBusinessCount}</Badge>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {p.blockedCount > 0 ? (
                        <Badge variant="critical">{p.blockedCount}</Badge>
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
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CopyBlocklistButton
// ---------------------------------------------------------------------------

function CopyBlocklistButton({ recommendation }: { recommendation: DlpRecommendation | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!recommendation) return;
    const blocked = recommendation.connectors
      .filter((c) => c.classification === 'blocked')
      .map((c) => c.name);
    if (blocked.length === 0) return;
    try {
      await navigator.clipboard.writeText(blocked.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-HTTPS or permissions denied) - silent fail
    }
  }, [recommendation]);

  if (!recommendation) return null;

  const blockedCount = recommendation.connectors.filter(
    (c) => c.classification === 'blocked',
  ).length;
  if (blockedCount === 0) return null;

  return (
    <Button
      icon={copied ? Check : Copy}
      variant="ghost"
      onClick={handleCopy}
    >
      {copied ? 'Copied!' : `Copy block-list (${blockedCount})`}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DlpAdvisorPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EnvArchetype>('default');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dlp');
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const recommendations = data?.recommendations ?? [];
  const selectedRec = recommendations.find((r) => r.archetype === selected) ?? null;
  const tenant = data?.tenant ?? null;

  const tenantState: 'live' | 'not_connected' =
    tenant?.state === 'connected' ? 'live' : 'not_connected';

  return (
    <div className="p-8 space-y-8">
      <PageHeader
        icon={ShieldAlert}
        tone="amber"
        title="DLP Advisor"
        subtitle="Which DLP policy fits which environment type - field-tested recommendations + your tenant vs the baseline."
        badge={
          !loading && tenant ? (
            <DataSourceBadge
              state={tenantState}
              source={tenantState === 'live' ? 'BAP Admin API' : 'Not connected'}
            />
          ) : null
        }
        actions={
          <Button icon={RefreshCw} variant="ghost" onClick={fetchData}>
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          Failed to load DLP data: {error}
        </div>
      )}

      {/* ------------------------------------------------------------------ *
       * Section 1 - Archetype selector + recommendation detail
       * ------------------------------------------------------------------ */}
      <section>
        <SectionTitle icon={ShieldCheck}>
          Archetype Recommendations
        </SectionTitle>

        {/* 6-card selector grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
          {ARCHETYPE_ORDER.map((arch) => {
            const rec = recommendations.find((r) => r.archetype === arch);
            return (
              <ArchetypeCard
                key={arch}
                archetype={arch}
                title={rec?.title ?? arch}
                selected={selected === arch}
                onClick={() => setSelected(arch)}
              />
            );
          })}
        </div>

        {/* Detail panel for selected archetype */}
        {loading && (
          <Card className="p-6">
            <div className="flex items-center gap-3 text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading recommendations...</span>
            </div>
          </Card>
        )}

        {!loading && selectedRec && (
          <div className="space-y-5">
            {/* Strategy summary */}
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-100">{selectedRec.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{selectedRec.summary}</p>
                  <div className="mt-3 rounded-md border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
                    <span className="font-semibold text-slate-200">Strategy: </span>
                    {selectedRec.strategy}
                  </div>
                </div>
                <CopyBlocklistButton recommendation={selectedRec} />
              </div>
            </Card>

            {/* Connector table */}
            <Card className="p-5">
              <SectionTitle>
                Connector Classifications ({selectedRec.connectors.length} total)
              </SectionTitle>
              <ConnectorTable connectors={selectedRec.connectors} />
            </Card>

            {/* Gotchas */}
            {selectedRec.gotchas.length > 0 && (
              <div>
                <SectionTitle icon={AlertTriangle}>
                  Field Gotchas
                </SectionTitle>
                <GotchaCards gotchas={selectedRec.gotchas} />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ *
       * Section 2 - Your tenant vs baseline
       * ------------------------------------------------------------------ */}
      <section>
        <SectionTitle icon={ShieldAlert}>
          Your Tenant vs Baseline
        </SectionTitle>
        <TenantSection tenant={tenant} />
      </section>
    </div>
  );
}

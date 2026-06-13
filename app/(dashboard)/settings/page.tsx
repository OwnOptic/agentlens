'use client';

/**
 * Settings page - three sections:
 *   1. SETUP   - live probe battery grouped by area, with status badges + fix hints
 *   2. CONFIG  - read-only non-secret config + secret source map
 *   3. FIRST-RUN guidance card (shown when >half checks are missing)
 *
 * All data is fetched from /api/setup-status. No mock. No secrets in the UI.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Settings,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  MinusCircle,
  Lock,
  Copy,
  ExternalLink,
} from 'lucide-react';
import {
  Card,
  Badge,
  PageHeader,
  SectionTitle,
  Button,
  InfoTip,
} from '@/components/ui';
import type { SetupCheck, SetupStatus } from '@/lib/setup/types';
import type { BadgeVariant } from '@/components/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'setup' | 'config' | 'firstrun';

type SecretSource = 'keyvault' | 'env' | 'missing';

interface ConfigPayload {
  tenantId: string | null;
  orgUrls: string | null;
  keyVaultUri: string | null;
  authMode: string;
  nextAuthUrl: string | null;
  hasTeamsWebhook: boolean;
  hasCronSecret: boolean;
}

interface SourceMapPayload {
  sourceMap: Record<string, SecretSource>;
}

// ---------------------------------------------------------------------------
// Status -> Badge variant + icon
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<SetupCheck['status'], BadgeVariant> = {
  ok:               'success',
  missing:          'neutral',
  error:            'critical',
  license_required: 'warning',
};

const STATUS_LABEL: Record<SetupCheck['status'], string> = {
  ok:               'ok',
  missing:          'missing',
  error:            'error',
  license_required: 'license required',
};

function StatusIcon({ status }: { status: SetupCheck['status'] }) {
  switch (status) {
    case 'ok':               return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
    case 'error':            return <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />;
    case 'license_required': return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
    default:                 return <MinusCircle className="h-4 w-4 text-slate-500 shrink-0" />;
  }
}

// ---------------------------------------------------------------------------
// CopyButton
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs
                 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
      title="Copy to clipboard"
    >
      <Copy className="h-3 w-3" />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Area label map
// ---------------------------------------------------------------------------

const AREA_LABELS: Record<SetupCheck['area'], string> = {
  identity: 'Identity & Auth',
  data:     'Data Sources',
  ai:       'AI / Azure OpenAI',
  storage:  'Storage & Secrets',
  hosting:  'Hosting & Webhooks',
};

const AREA_ORDER: SetupCheck['area'][] = ['identity', 'data', 'ai', 'storage', 'hosting'];

// ---------------------------------------------------------------------------
// CheckRow - single probe row, expandable
// ---------------------------------------------------------------------------

function CheckRow({ check }: { check: SetupCheck }) {
  const [open, setOpen] = useState(false);
  const ChevronIcon = open ? ChevronDown : ChevronRight;

  return (
    <div className="border-b border-slate-800/60 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors"
      >
        <StatusIcon status={check.status} />
        <span className="flex-1 text-sm text-slate-200">{check.label}</span>
        <Badge variant={STATUS_BADGE[check.status]}>{STATUS_LABEL[check.status]}</Badge>
        <ChevronIcon className="h-3.5 w-3.5 text-slate-600 shrink-0" />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 ml-7">
          <p className="text-sm text-slate-400">{check.detail}</p>
          {check.fix && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Fix</p>
              <div className="flex items-start gap-2 rounded-md bg-slate-950 border border-slate-800 px-3 py-2">
                <code className="flex-1 text-xs text-emerald-300 break-all leading-relaxed">
                  {check.fix}
                </code>
                <CopyButton text={check.fix} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SetupSection - probe battery grouped by area
// ---------------------------------------------------------------------------

function SetupSection({
  status,
  loading,
  onRerun,
}: {
  status: SetupStatus | null;
  loading: boolean;
  onRerun: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Readiness checks</SectionTitle>
          <Button variant="ghost" icon={RefreshCw} onClick={onRerun}>
            Re-run checks
          </Button>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-500">
          Running checks...
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Readiness checks</SectionTitle>
          <Button variant="ghost" icon={RefreshCw} onClick={onRerun}>
            Re-run checks
          </Button>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-red-400">
          Failed to load check results. Check browser console for errors.
        </div>
      </div>
    );
  }

  const byArea = AREA_ORDER.reduce<Record<SetupCheck['area'], SetupCheck[]>>(
    (acc, area) => {
      acc[area] = status.checks.filter((c) => c.area === area);
      return acc;
    },
    { identity: [], data: [], ai: [], storage: [], hosting: [] },
  );

  const checkedAt = new Date(status.checkedAt).toLocaleTimeString();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionTitle>Readiness checks</SectionTitle>
          <InfoTip label="About these checks">
            Each check probes a real integration. Results are cached for 5 minutes server-side.
            Click a row to see details and a copy-paste fix command.
          </InfoTip>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600">Last run: {checkedAt}</span>
          <Button variant="ghost" icon={RefreshCw} onClick={onRerun}>
            Re-run checks
          </Button>
        </div>
      </div>

      {AREA_ORDER.map((area) => {
        const areaChecks = byArea[area];
        if (areaChecks.length === 0) return null;
        const okCount = areaChecks.filter((c) => c.status === 'ok').length;
        return (
          <Card key={area}>
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-300">{AREA_LABELS[area]}</h3>
              <span className="text-xs text-slate-600">
                {okCount}/{areaChecks.length} ok
              </span>
            </div>
            <div>
              {areaChecks.map((check) => (
                <CheckRow key={check.key} check={check} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SecretSourceRow
// ---------------------------------------------------------------------------

const SOURCE_STYLE: Record<SecretSource, { label: string; cls: string }> = {
  keyvault: { label: 'Key Vault', cls: 'text-emerald-400' },
  env:      { label: 'Env var',   cls: 'text-sky-400' },
  missing:  { label: 'missing',   cls: 'text-red-400' },
};

function SecretSourceRow({ name, source }: { name: string; source: SecretSource }) {
  const s = SOURCE_STYLE[source];
  return (
    <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-slate-600 shrink-0" />
        <span className="font-mono text-xs text-slate-300">{name}</span>
      </div>
      <span className={`text-xs font-medium ${s.cls}`}>{s.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfigSection
// ---------------------------------------------------------------------------

function ConfigSection({ status }: { status: SetupStatus | null }) {
  const [sourceMap, setSourceMap] = useState<Record<string, SecretSource> | null>(null);
  const [smLoading, setSmLoading] = useState(false);

  useEffect(() => {
    if (!sourceMap) {
      setSmLoading(true);
      fetch('/api/setup-status')
        .then((r) => r.json() as Promise<SetupStatus>)
        .then(() => {
          // Source map is served via the same endpoint; we derive it from
          // an additional dedicated endpoint. For now, show what we have
          // from the probe results: keyvault check tells us whether KV is live.
          setSmLoading(false);
        })
        .catch(() => setSmLoading(false));
    }
  }, [sourceMap]);

  // Derive config values from environment (server-rendered props not available
  // in 'use client' pages - show placeholders for values not in probes)
  const kvCheck = status?.checks.find((c) => c.key === 'storage_keyvault');
  const authCheck = status?.checks.find((c) => c.key === 'identity_auth_enabled');
  const spCheck = status?.checks.find((c) => c.key === 'identity_sp_configured');

  const configRows: Array<{ label: string; value: string; tip: string }> = [
    {
      label: 'Service principal (AZURE_CLIENT_ID)',
      value: spCheck?.status === 'ok' ? 'Configured' : 'Not set',
      tip: 'The app registration client ID used to authenticate to Azure APIs.',
    },
    {
      label: 'Key Vault URI',
      value:
        kvCheck?.status === 'ok'
          ? 'Connected'
          : kvCheck?.status === 'missing'
          ? 'Not configured'
          : 'Error - see Setup tab',
      tip: 'When set, secrets are read from Azure Key Vault rather than environment variables.',
    },
    {
      label: 'Auth mode',
      value: authCheck?.status === 'ok' ? 'Azure AD SSO enabled' : 'Auth-optional (dev mode)',
      tip: 'Auth-optional means the app runs without sign-in. Suitable for local dev and initial setup only.',
    },
    {
      label: 'NEXTAUTH_URL',
      value: status?.checks.find((c) => c.key === 'hosting_env_vars')?.status === 'ok'
        ? 'Set'
        : 'Not set',
      tip: 'The public URL of the app. Required for next-auth callbacks.',
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="border-b border-slate-800/60 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-300">Non-secret configuration</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Read-only view. Change values in .env.local or Key Vault.
          </p>
        </div>
        <div>
          {configRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3 last:border-0"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-300">{row.label}</span>
                <InfoTip label={row.label}>{row.tip}</InfoTip>
              </div>
              <span className="text-sm text-slate-400">{row.value}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="border-b border-slate-800/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-300">Secret sources</h3>
            <InfoTip label="Secret sources">
              Shows WHERE each secret is resolved from. Values are never shown.
              Run &apos;Re-run checks&apos; on the Setup tab to refresh.
            </InfoTip>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Name → resolution source. Values are never displayed.
          </p>
        </div>
        {smLoading ? (
          <p className="px-4 py-4 text-xs text-slate-500">Loading secret sources...</p>
        ) : status ? (
          <div>
            {/* Derive from the KV probe whether KV is live */}
            {[
              'AZURE-CLIENT-SECRET',
              'AZURE-OPENAI-API-KEY',
              'SUPABASE-SERVICE-KEY',
              'CRON-SECRET',
              'TEAMS-WEBHOOK-URL',
              'AUTH-SECRET',
              'WEBAPP-CLIENT-SECRET',
            ].map((name) => {
              const kvOk = kvCheck?.status === 'ok';
              // We don't have per-secret source info client-side without a
              // dedicated endpoint; show a note pointing to the real source.
              const source: SecretSource = kvOk ? 'keyvault' : 'env';
              return (
                <SecretSourceRow
                  key={name}
                  name={name}
                  source={
                    sourceMap?.[name] ??
                    // Conservative default: if KV not connected, mark as env
                    // (actual missing state would only be known server-side)
                    source
                  }
                />
              );
            })}
            <p className="border-t border-slate-800/60 px-4 py-2 text-xs text-slate-600">
              Source shown is inferred from probe results. For exact per-secret resolution,
              check server logs or run the probe API directly: <code className="text-slate-500">GET /api/setup-status</code>
            </p>
          </div>
        ) : (
          <p className="px-4 py-4 text-xs text-slate-500">Run checks first to see secret sources.</p>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FirstRunCard - shown when >half checks are missing/error
// ---------------------------------------------------------------------------

function FirstRunCard() {
  const steps: Array<{ label: string; detail: string; href?: string }> = [
    {
      label: 'Run the setup script',
      detail: 'From the repo root: ./scripts/setup.sh (creates service principal, KV, assigns roles)',
      href: 'https://github.com/your-org/agentlens/blob/main/scripts/setup.sh',
    },
    {
      label: 'Register and admin-consent the app',
      detail: 'In Azure Portal > App registrations, grant admin consent for Microsoft Graph and Power Platform API permissions.',
      href: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
    },
    {
      label: 'Assign RBAC roles',
      detail: 'Grant the service principal Reader on the subscription and Dataverse System Reader on your Power Platform environments.',
    },
    {
      label: 'Deploy with azd up',
      detail: 'Run: azd up — this provisions infrastructure (Key Vault, App Service) and deploys the app.',
    },
    {
      label: 'Set Key Vault secrets',
      detail: 'Run: azd env set ... or use the Azure Portal to add AZURE-CLIENT-SECRET, AZURE-OPENAI-API-KEY, etc.',
      href: 'https://learn.microsoft.com/azure/key-vault/secrets/quick-create-portal',
    },
  ];

  return (
    <Card className="border-amber-500/30">
      <div className="border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <h3 className="text-sm font-semibold text-amber-300">First-run setup required</h3>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Most checks are not configured yet. Follow these steps to make AgentLens
          deployment-ready.
        </p>
      </div>
      <ol className="divide-y divide-slate-800/60">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-4 px-5 py-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-400">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-200">{step.label}</p>
                {step.href && (
                  <a
                    href={step.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={`Docs for ${step.label}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'setup',    label: 'Setup' },
  { id: 'config',   label: 'Configuration' },
  { id: 'firstrun', label: 'First-run guide' },
];

function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1 w-fit">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={[
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            active === tab.id
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-500 hover:text-slate-300',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('setup');
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStatus = useCallback((forceRefresh = false) => {
    setLoading(true);
    setFetchError(null);
    const url = forceRefresh ? '/api/setup-status?refresh=1' : '/api/setup-status';
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SetupStatus>;
      })
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setFetchError(msg);
        setLoading(false);
      });
  }, []);

  // Load on mount
  useEffect(() => {
    fetchStatus(false);
  }, [fetchStatus]);

  // Determine if first-run card should be shown (>half checks missing/error)
  const totalChecks = status?.checks.length ?? 0;
  const notOkCount = status?.checks.filter((c) => c.status !== 'ok').length ?? 0;
  const showFirstRun = totalChecks > 0 && notOkCount > totalChecks / 2;

  // Auto-switch to first-run tab if most checks fail on first load
  useEffect(() => {
    if (showFirstRun && tab === 'setup') {
      // Don't auto-redirect; just let the guide be visible via tab
    }
  }, [showFirstRun, tab]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Deployment readiness, configuration, and first-run guidance."
        tone="slate"
      />

      {fetchError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Could not load check results: {fetchError}
        </div>
      )}

      {showFirstRun && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-300">
            Most checks are not yet configured. See the{' '}
            <button
              className="underline hover:text-amber-200"
              onClick={() => setTab('firstrun')}
            >
              First-run guide
            </button>
            .
          </p>
        </div>
      )}

      <TabBar active={tab} onSelect={setTab} />

      {tab === 'setup' && (
        <SetupSection
          status={status}
          loading={loading}
          onRerun={() => fetchStatus(true)}
        />
      )}

      {tab === 'config' && (
        <ConfigSection status={status} />
      )}

      {tab === 'firstrun' && (
        <FirstRunCard />
      )}
    </div>
  );
}

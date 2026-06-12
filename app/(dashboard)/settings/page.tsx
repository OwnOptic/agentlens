'use client';

/**
 * Settings page
 *
 * Form for: App Registration (service principal config), Alert Thresholds,
 * Notification Channels, and Rule Packs (compliance rule pack toggles).
 *
 * All values are local state (no persistence) - wire to Supabase or env vars
 * in production. The rule packs list is derived from mockComplianceRules.
 */

import React, { useState } from 'react';
import type { ComplianceRule } from '@/lib/types';
import { mockComplianceRules } from '@/lib/mock/seed';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppRegSettings {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  appInsightsConnectionString: string;
}

interface ThresholdSettings {
  budgetCapUsd: number;
  volumeSpikeMultiplier: number;
  idleDays: number;
  errorRatePct: number;
  avgLatencyMs: number;
  capacityWarnPct: number;
}

interface ChannelSettings {
  teamsWebhookUrl: string;
  emailRecipients: string;
  slackWebhookUrl: string;
  digestEnabled: boolean;
  digestCronUtc: string;
}

// ---------------------------------------------------------------------------
// Default values (safe placeholders - never include real secrets here)
// ---------------------------------------------------------------------------

const DEFAULT_APP_REG: AppRegSettings = {
  tenantId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  clientSecret: '',
  supabaseUrl: 'https://<project>.supabase.co',
  supabaseAnonKey: '',
  appInsightsConnectionString: '',
};

const DEFAULT_THRESHOLDS: ThresholdSettings = {
  budgetCapUsd: 1000,
  volumeSpikeMultiplier: 3,
  idleDays: 90,
  errorRatePct: 5,
  avgLatencyMs: 2000,
  capacityWarnPct: 80,
};

const DEFAULT_CHANNELS: ChannelSettings = {
  teamsWebhookUrl: '',
  emailRecipients: '',
  slackWebhookUrl: '',
  digestEnabled: true,
  digestCronUtc: '0 7 * * 1',
};

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5 border-b border-slate-800 pb-3">
      <h2 className="text-base font-semibold text-slate-200">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:items-start">
      <div className="sm:pt-1">
        <label className="block text-sm font-medium text-slate-300">{label}</label>
        {hint && <p className="mt-0.5 text-xs text-slate-600">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

const inputCls =
  'block w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm ' +
  'text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-600';

const numberInputCls = inputCls + ' [appearance:textfield]';

// ---------------------------------------------------------------------------
// Section: App Registration
// ---------------------------------------------------------------------------
function AppRegSection({
  value,
  onChange,
}: {
  value: AppRegSettings;
  onChange: (v: AppRegSettings) => void;
}) {
  function set<K extends keyof AppRegSettings>(key: K, val: string) {
    onChange({ ...value, [key]: val });
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        title="App Registration"
        description="Service principal used by AgentLens to read the Power Platform tenant and call Microsoft Graph."
      />
      <Field label="Tenant ID">
        <input
          type="text"
          className={inputCls}
          value={value.tenantId}
          onChange={(e) => set('tenantId', e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </Field>
      <Field label="Client ID">
        <input
          type="text"
          className={inputCls}
          value={value.clientId}
          onChange={(e) => set('clientId', e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </Field>
      <Field label="Client Secret" hint="Store in Azure Key Vault or environment variable - never commit.">
        <input
          type="password"
          className={inputCls}
          value={value.clientSecret}
          onChange={(e) => set('clientSecret', e.target.value)}
          placeholder="••••••••••••••••"
          autoComplete="new-password"
        />
      </Field>
      <Field label="Supabase URL">
        <input
          type="url"
          className={inputCls}
          value={value.supabaseUrl}
          onChange={(e) => set('supabaseUrl', e.target.value)}
          placeholder="https://<project>.supabase.co"
        />
      </Field>
      <Field label="Supabase Anon Key">
        <input
          type="password"
          className={inputCls}
          value={value.supabaseAnonKey}
          onChange={(e) => set('supabaseAnonKey', e.target.value)}
          placeholder="eyJ..."
          autoComplete="new-password"
        />
      </Field>
      <Field label="App Insights Connection String">
        <input
          type="password"
          className={inputCls}
          value={value.appInsightsConnectionString}
          onChange={(e) => set('appInsightsConnectionString', e.target.value)}
          placeholder="InstrumentationKey=..."
          autoComplete="new-password"
        />
      </Field>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: Thresholds
// ---------------------------------------------------------------------------
function ThresholdsSection({
  value,
  onChange,
}: {
  value: ThresholdSettings;
  onChange: (v: ThresholdSettings) => void;
}) {
  function setNum<K extends keyof ThresholdSettings>(key: K, raw: string) {
    const num = parseFloat(raw);
    if (!isNaN(num)) onChange({ ...value, [key]: num });
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Alert Thresholds"
        description="Numeric thresholds that trigger governance alerts."
      />
      <Field label="Budget cap (USD/month)" hint="Triggers budget_breach alert when projected monthly spend exceeds this value.">
        <input
          type="number"
          className={numberInputCls}
          value={value.budgetCapUsd}
          onChange={(e) => setNum('budgetCapUsd', e.target.value)}
          min={0}
          step={100}
        />
      </Field>
      <Field label="Volume spike multiplier" hint="Triggers volume_spike alert when daily messages are N times the 7-day average.">
        <input
          type="number"
          className={numberInputCls}
          value={value.volumeSpikeMultiplier}
          onChange={(e) => setNum('volumeSpikeMultiplier', e.target.value)}
          min={1.5}
          step={0.5}
        />
      </Field>
      <Field label="Idle threshold (days)" hint="Agents with no activity for this many days are flagged as orphan_idle.">
        <input
          type="number"
          className={numberInputCls}
          value={value.idleDays}
          onChange={(e) => setNum('idleDays', e.target.value)}
          min={7}
          step={1}
        />
      </Field>
      <Field label="Error rate threshold (%)" hint="Triggers a health alert when the daily error rate exceeds this value.">
        <input
          type="number"
          className={numberInputCls}
          value={value.errorRatePct}
          onChange={(e) => setNum('errorRatePct', e.target.value)}
          min={0}
          max={100}
          step={0.5}
        />
      </Field>
      <Field label="Avg latency threshold (ms)" hint="Triggers a health alert when average response latency exceeds this value.">
        <input
          type="number"
          className={numberInputCls}
          value={value.avgLatencyMs}
          onChange={(e) => setNum('avgLatencyMs', e.target.value)}
          min={100}
          step={100}
        />
      </Field>
      <Field label="Capacity warning (%)" hint="Environment capacity utilisation percentage at which a warning is raised.">
        <input
          type="number"
          className={numberInputCls}
          value={value.capacityWarnPct}
          onChange={(e) => setNum('capacityWarnPct', e.target.value)}
          min={50}
          max={100}
          step={5}
        />
      </Field>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: Channels
// ---------------------------------------------------------------------------
function ChannelsSection({
  value,
  onChange,
}: {
  value: ChannelSettings;
  onChange: (v: ChannelSettings) => void;
}) {
  function set<K extends keyof ChannelSettings>(key: K, val: string | boolean) {
    onChange({ ...value, [key]: val });
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Notification Channels"
        description="Where to send governance alerts and the weekly digest."
      />
      <Field label="Teams Webhook URL" hint="Incoming Webhook URL for a Teams channel.">
        <input
          type="url"
          className={inputCls}
          value={value.teamsWebhookUrl}
          onChange={(e) => set('teamsWebhookUrl', e.target.value)}
          placeholder="https://outlook.office.com/webhook/..."
        />
      </Field>
      <Field label="Email recipients" hint="Comma-separated list of email addresses for alert notifications.">
        <input
          type="text"
          className={inputCls}
          value={value.emailRecipients}
          onChange={(e) => set('emailRecipients', e.target.value)}
          placeholder="admin@contoso.com, governance@contoso.com"
        />
      </Field>
      <Field label="Slack Webhook URL" hint="Optional. Leave empty to disable Slack notifications.">
        <input
          type="url"
          className={inputCls}
          value={value.slackWebhookUrl}
          onChange={(e) => set('slackWebhookUrl', e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
        />
      </Field>
      <Field label="Weekly digest">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.digestEnabled}
            onChange={(e) => set('digestEnabled', e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-emerald-500"
          />
          <span className="text-sm text-slate-300">Send weekly governance digest</span>
        </label>
      </Field>
      {value.digestEnabled && (
        <Field label="Digest schedule (cron UTC)" hint="Standard 5-field UTC cron expression. Default: Mondays 07:00 UTC.">
          <input
            type="text"
            className={inputCls}
            value={value.digestCronUtc}
            onChange={(e) => set('digestCronUtc', e.target.value)}
            placeholder="0 7 * * 1"
          />
        </Field>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: Rule Packs
// ---------------------------------------------------------------------------
function RulePacksSection({
  rules,
  enabled,
  onToggle,
}: {
  rules: ComplianceRule[];
  enabled: Set<string>;
  onToggle: (id: string) => void;
}) {
  const typeColors: Record<ComplianceRule['type'], string> = {
    authentication: 'bg-blue-900/40 text-blue-300',
    data_loss: 'bg-red-900/40 text-red-300',
    knowledge_source: 'bg-purple-900/40 text-purple-300',
    channel: 'bg-amber-900/40 text-amber-300',
    connector: 'bg-orange-900/40 text-orange-300',
  };

  const severityColors: Record<ComplianceRule['severity'], string> = {
    critical: 'text-red-400',
    warning: 'text-amber-400',
    info: 'text-slate-400',
  };

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Rule Packs"
        description="Toggle individual compliance rules. Disabled rules produce no violations."
      />
      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
              enabled.has(rule.id)
                ? 'border-slate-700 bg-slate-900'
                : 'border-slate-800 bg-slate-950 opacity-60'
            }`}
          >
            <input
              type="checkbox"
              id={`rule-${rule.id}`}
              checked={enabled.has(rule.id)}
              onChange={() => onToggle(rule.id)}
              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 accent-emerald-500 cursor-pointer"
            />
            <label htmlFor={`rule-${rule.id}`} className="flex-1 cursor-pointer">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-200">{rule.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${typeColors[rule.type]}`}>
                  {rule.type.replace('_', ' ')}
                </span>
                <span className={`text-xs font-medium ${severityColors[rule.severity]}`}>
                  {rule.severity}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-slate-600 break-all">{rule.expression}</p>
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const [appReg, setAppReg] = useState<AppRegSettings>(DEFAULT_APP_REG);
  const [thresholds, setThresholds] = useState<ThresholdSettings>(DEFAULT_THRESHOLDS);
  const [channels, setChannels] = useState<ChannelSettings>(DEFAULT_CHANNELS);
  const [enabledRules, setEnabledRules] = useState<Set<string>>(
    new Set(mockComplianceRules.filter((r) => r.enabled).map((r) => r.id))
  );
  const [saved, setSaved] = useState(false);

  function toggleRule(id: string) {
    setEnabledRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // In production: persist to Supabase / env vars / Key Vault
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure app registration credentials, alert thresholds, notification channels,
          and compliance rule packs.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-10">
        <AppRegSection value={appReg} onChange={setAppReg} />
        <ThresholdsSection value={thresholds} onChange={setThresholds} />
        <ChannelsSection value={channels} onChange={setChannels} />
        <RulePacksSection
          rules={mockComplianceRules}
          enabled={enabledRules}
          onToggle={toggleRule}
        />

        {/* Save bar */}
        <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-4 py-3">
          <p className="text-xs text-slate-600">
            Settings are local state only. Wire <code className="text-slate-500">handleSave</code> to
            your persistence layer for production use.
          </p>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white
                       transition-colors hover:bg-emerald-600"
          >
            {saved ? 'Saved!' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

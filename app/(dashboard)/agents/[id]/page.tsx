'use client';

import React, { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { BookOpen as BookOpenEmpty } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import type { Agent, ConversationKpi, HealthMetric } from '@/lib/types';
import {
  mockAgents,
  mockEnvironments,
  mockMetrics,
  mockConversationKpis,
  mockHealthMetrics,
  mockViolations,
} from '@/lib/mock/seed';
import {
  Bot,
  Server,
  Calendar,
  Clock,
  Info,
  BookOpen,
  DollarSign,
  ShieldCheck,
  BarChart2,
  AlertTriangle,
  Sparkles,
  Workflow,
  Activity,
  TrendingUp,
} from 'lucide-react';
import {
  Card,
  Badge,
  StatCard,
  PageHeader,
  SectionTitle,
  DataSourceBadge,
} from '@/components/ui';

type TabType = 'overview' | 'knowledge' | 'credits' | 'compliance' | 'analytics';

export default function AgentDetailPage() {
  const params = useParams();
  const botId = params.id as string;
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Stable timestamp - computed once on mount to avoid SSR/client hydration mismatch
  const now = useMemo(() => Date.now(), []);

  const agent = useMemo(() => {
    return mockAgents.find((a) => a.botId === botId);
  }, [botId]);

  const environment = useMemo(() => {
    if (!agent) return null;
    return mockEnvironments.find((e) => e.id === agent.envId);
  }, [agent]);

  const agentMetrics = useMemo(() => {
    if (!agent) return [];
    return mockMetrics.filter(
      (m) => m.envId === agent.envId && m.botId === agent.botId
    );
  }, [agent]);

  const kpis = useMemo(() => {
    if (!agent) return [];
    return mockConversationKpis.filter(
      (k) => k.envId === agent.envId && k.botId === agent.botId
    );
  }, [agent]);

  const health = useMemo(() => {
    if (!agent) return [];
    return mockHealthMetrics.filter(
      (h) => h.envId === agent.envId && h.botId === agent.botId
    );
  }, [agent]);

  const violations = useMemo(() => {
    if (!agent) return [];
    const agentRef = `${agent.envId}/${agent.botId}`;
    return mockViolations.filter((v) => v.agentRef === agentRef);
  }, [agent]);

  if (!agent || !environment) {
    return (
      <div className="p-8">
        <Card className="p-8 text-center text-slate-400">
          <p>Agent not found.</p>
        </Card>
      </div>
    );
  }

  const lifecycleBadgeVariant = (lc: string | undefined) => {
    if (lc === 'poc') return 'info' as const;
    if (lc === 'pilot') return 'warning' as const;
    if (lc === 'prod') return 'success' as const;
    return 'neutral' as const;
  };

  const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: Info },
    { key: 'knowledge', label: 'Knowledge', icon: BookOpen },
    { key: 'credits', label: 'Credits', icon: DollarSign },
    { key: 'compliance', label: 'Compliance', icon: ShieldCheck },
    { key: 'analytics', label: 'Analytics', icon: BarChart2 },
  ];

  return (
    <div className="p-8">
      <PageHeader
        icon={Bot}
        title={agent.name}
        subtitle={`${environment.name} • ${agent.botId}`}
        tone="emerald"
        badge={
          <div className="flex items-center gap-2">
            <Badge variant={agent.state === 'Active' ? 'success' : 'neutral'} dot={agent.state === 'Active'}>
              {agent.state}
            </Badge>
            {agent.lifecycle && (
              <Badge variant={lifecycleBadgeVariant(agent.lifecycle)}>
                {agent.lifecycle.toUpperCase()}
              </Badge>
            )}
            <DataSourceBadge state="demo" source="sample data" />
          </div>
        }
      />

      {/* Status Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Bot}
          label="State"
          value={agent.state}
          tone={agent.state === 'Active' ? 'emerald' : 'slate'}
        />
        <StatCard
          icon={Sparkles}
          label="Lifecycle"
          value={agent.lifecycle?.toUpperCase() || 'UNTAGGED'}
          tone={lifecycleBadgeVariant(agent.lifecycle) === 'success' ? 'emerald' : lifecycleBadgeVariant(agent.lifecycle) === 'warning' ? 'amber' : 'sky'}
        />
        <StatCard
          icon={Calendar}
          label="Created"
          value={new Date(agent.createdOn).toLocaleDateString()}
          sublabel={`${Math.floor((now - new Date(agent.createdOn).getTime()) / (1000 * 60 * 60 * 24))} days ago`}
          tone="violet"
        />
        <StatCard
          icon={Clock}
          label="Last Activity"
          value={agent.lastActivity ? new Date(agent.lastActivity).toLocaleDateString() : 'Never'}
          sublabel={
            agent.lastActivity
              ? `${Math.floor((now - new Date(agent.lastActivity).getTime()) / (1000 * 60 * 60 * 24))} days ago`
              : undefined
          }
          tone="slate"
        />
      </div>

      {/* Pill Tab Bar */}
      <Card className="mb-4 px-2 py-2">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={[
                'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                activeTab === key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </Card>

      {/* Tab Content */}
      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <SectionTitle icon={Bot}>Agent Information</SectionTitle>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between border-b border-slate-800/50 py-2">
                <span className="text-slate-400">Kind</span>
                <span className="font-medium text-slate-200">{agent.kind}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/50 py-2">
                <span className="text-slate-400">Owner Email</span>
                <span className="font-medium text-slate-200">{agent.ownerEmail || '-'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/50 py-2">
                <span className="text-slate-400">Owner Name</span>
                <span className="font-medium text-slate-200">{agent.ownerName || '-'}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400">Modified On</span>
                <span className="font-medium text-slate-200">{new Date(agent.modifiedOn).toLocaleString()}</span>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle icon={Server}>Environment Info</SectionTitle>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between border-b border-slate-800/50 py-2">
                <span className="text-slate-400">Region</span>
                <span className="font-medium text-slate-200">{environment.region}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/50 py-2">
                <span className="text-slate-400">Type</span>
                <span className="font-medium text-slate-200">{environment.type}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800/50 py-2">
                <span className="text-slate-400">Is Default</span>
                <Badge variant={environment.isDefault ? 'info' : 'neutral'}>
                  {environment.isDefault ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="flex items-start justify-between py-2">
                <span className="text-slate-400">Org URL</span>
                <span className="break-all font-mono text-xs text-slate-400 max-w-[60%] text-right">
                  {environment.orgUrl}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Knowledge Tab */}
      {activeTab === 'knowledge' && (
        <Card className="p-6">
          <SectionTitle icon={BookOpen}>Knowledge Sources</SectionTitle>
          <EmptyState
            icon={BookOpenEmpty}
            title="No knowledge sources wired"
            message="Connect Dataverse or SharePoint to see indexed knowledge bases, document status, and last ingestion timestamps."
          />
        </Card>
      )}

      {/* Credits Tab */}
      {activeTab === 'credits' && (
        <div className="space-y-4">
          {agentMetrics.length === 0 ? (
            <Card className="p-6">
              <p className="text-slate-400">No metrics available.</p>
            </Card>
          ) : (
            <>
              <Card>
                <div className="p-4">
                  <SectionTitle icon={DollarSign}>Recent Metrics</SectionTitle>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-800 bg-slate-950/50">
                      <tr>
                        {['Date', 'Messages', 'Sessions', 'Cost', 'Projected Mo', 'Meter'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agentMetrics.map((m, i) => (
                        <tr key={i} className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-slate-300">{m.date}</td>
                          <td className="px-4 py-3 text-slate-300">{m.messageCount}</td>
                          <td className="px-4 py-3 text-slate-300">{m.sessionCount}</td>
                          <td className="px-4 py-3 font-medium text-emerald-400">${m.estimatedCost.toFixed(2)}</td>
                          <td className="px-4 py-3 text-slate-300">${(m.projectedMonthly || 0).toFixed(2)}</td>
                          <td className="px-4 py-3">
                            {m.modelMeter ? (
                              <Badge variant="neutral">{m.modelMeter}</Badge>
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

              {agentMetrics.length > 0 && agentMetrics[0].featureBreakdown && (
                <Card className="p-4">
                  <SectionTitle icon={Workflow}>Credit Breakdown (Latest)</SectionTitle>
                  <div className="grid gap-4 md:grid-cols-2">
                    <StatCard
                      icon={Sparkles}
                      label="Generative Answers"
                      value={agentMetrics[0].featureBreakdown?.generativeAnswers ?? 0}
                      tone="violet"
                    />
                    <StatCard
                      icon={Activity}
                      label="Agent Actions"
                      value={agentMetrics[0].featureBreakdown?.agentActions ?? 0}
                      tone="emerald"
                    />
                    <StatCard
                      icon={Workflow}
                      label="Agent Flows"
                      value={agentMetrics[0].featureBreakdown?.agentFlows ?? 0}
                      tone="sky"
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Text Tools"
                      value={agentMetrics[0].featureBreakdown?.textTools ?? 0}
                      tone="amber"
                    />
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Compliance Tab */}
      {activeTab === 'compliance' && (
        <Card className="p-6">
          <SectionTitle icon={ShieldCheck} right={
            violations.length > 0 ? (
              <Badge variant="critical">{violations.length} violation{violations.length !== 1 ? 's' : ''}</Badge>
            ) : (
              <Badge variant="success">Clean</Badge>
            )
          }>
            Compliance Violations
          </SectionTitle>
          {violations.length === 0 ? (
            <div className="rounded-lg bg-emerald-500/10 p-4 ring-1 ring-emerald-500/25">
              <p className="text-sm text-emerald-300">No compliance violations detected.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {violations.map((v) => (
                <div
                  key={v.id}
                  className={[
                    'rounded-lg border-l-4 p-4',
                    v.severity === 'critical'
                      ? 'border-red-500 bg-red-500/10'
                      : v.severity === 'warning'
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-sky-500 bg-sky-500/10',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-200">Rule: {v.ruleId}</p>
                      <p className="mt-0.5 text-sm text-slate-400">State: {v.state}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Detected: {new Date(v.detectedAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        v.severity === 'critical' ? 'critical'
                          : v.severity === 'warning' ? 'warning'
                            : 'info'
                      }
                    >
                      {v.severity.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {kpis.length > 0 && (
            <Card>
              <div className="p-4">
                <SectionTitle icon={BarChart2}>Conversation KPIs</SectionTitle>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/50">
                    <tr>
                      {['Date', 'Sessions', 'Deflection Rate', 'Escalation Rate'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map((k, i) => (
                      <tr key={i} className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-300">{k.date}</td>
                        <td className="px-4 py-3 text-slate-300">{k.sessions}</td>
                        <td className="px-4 py-3 text-emerald-400">{(k.deflectionRate * 100).toFixed(1)}%</td>
                        <td className="px-4 py-3">
                          <Badge variant={k.escalationRate > 0.2 ? 'warning' : 'success'}>
                            {(k.escalationRate * 100).toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {health.length > 0 && (
            <Card>
              <div className="p-4">
                <SectionTitle icon={Activity}>Health Metrics</SectionTitle>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/50">
                    <tr>
                      {['Date', 'Error Rate', 'Avg Latency', 'Failed Sessions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {health.map((h, i) => (
                      <tr key={i} className="border-b border-slate-800/60 transition-colors hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-300">{h.date}</td>
                        <td className="px-4 py-3">
                          <Badge variant={h.errorRate > 0.05 ? 'critical' : h.errorRate > 0.02 ? 'warning' : 'success'}>
                            {(h.errorRate * 100).toFixed(2)}%
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{h.avgLatencyMs}ms</td>
                        <td className="px-4 py-3">
                          {h.failedSessions > 0 ? (
                            <Badge variant="warning">{h.failedSessions}</Badge>
                          ) : (
                            <span className="text-emerald-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {kpis.length === 0 && health.length === 0 && (
            <Card className="p-6">
              <p className="text-slate-400">No analytics data available.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

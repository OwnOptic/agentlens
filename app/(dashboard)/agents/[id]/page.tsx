'use client';

import React, { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import type { Agent, ConversationKpi, HealthMetric } from '@/lib/types';
import {
  mockAgents,
  mockEnvironments,
  mockMetrics,
  mockConversationKpis,
  mockHealthMetrics,
  mockViolations,
} from '@/lib/mock/seed';

export const metadata = {
  title: 'Agent Detail',
};

type TabType = 'overview' | 'knowledge' | 'credits' | 'compliance' | 'analytics';

export default function AgentDetailPage() {
  const params = useParams();
  const botId = params.id as string;
  const [activeTab, setActiveTab] = useState<TabType>('overview');

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
      <div className="space-y-6">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <p>Agent not found.</p>
        </div>
      </div>
    );
  }

  const TabButton = ({
    tab,
    label,
  }: {
    tab: TabType;
    label: string;
  }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={[
        'px-4 py-2 text-sm font-medium transition-colors border-b-2',
        activeTab === tab
          ? 'border-emerald-500 text-emerald-400'
          : 'border-transparent text-slate-400 hover:text-slate-300',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="mb-2 text-3xl font-bold">{agent.name}</h2>
        <div className="flex flex-wrap gap-3 text-sm text-slate-400">
          <span>
            <span className="font-medium text-slate-300">Environment:</span> {environment.name}
          </span>
          <span>
            <span className="font-medium text-slate-300">Bot ID:</span> {agent.botId}
          </span>
          {agent.ownerEmail && (
            <span>
              <span className="font-medium text-slate-300">Owner:</span> {agent.ownerEmail}
            </span>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">State</p>
          <p className="mt-2 text-xl font-bold">
            <span
              className={[
                'inline-block rounded-full px-3 py-1 text-sm',
                agent.state === 'Active'
                  ? 'bg-emerald-900/60 text-emerald-200'
                  : 'bg-slate-700/60 text-slate-400',
              ].join(' ')}
            >
              {agent.state}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Lifecycle</p>
          <p className="mt-2 text-xl font-bold">
            <span
              className={[
                'inline-block rounded-full px-3 py-1 text-sm',
                agent.lifecycle === 'poc'
                  ? 'bg-blue-900/60 text-blue-200'
                  : agent.lifecycle === 'pilot'
                    ? 'bg-amber-900/60 text-amber-200'
                    : 'bg-emerald-900/60 text-emerald-200',
              ].join(' ')}
            >
              {agent.lifecycle?.toUpperCase() || 'UNTAGGED'}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Created</p>
          <p className="mt-2 text-lg font-bold">
            {new Date(agent.createdOn).toLocaleDateString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {Math.floor(
              (new Date().getTime() - new Date(agent.createdOn).getTime()) /
                (1000 * 60 * 60 * 24)
            )}{' '}
            days ago
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm font-medium text-slate-400">Last Activity</p>
          <p className="mt-2 text-lg font-bold">
            {agent.lastActivity
              ? new Date(agent.lastActivity).toLocaleDateString()
              : 'Never'}
          </p>
          {agent.lastActivity && (
            <p className="mt-1 text-xs text-slate-500">
              {Math.floor(
                (new Date().getTime() - new Date(agent.lastActivity).getTime()) /
                  (1000 * 60 * 60 * 24)
              )}{' '}
              days ago
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex gap-4 border-b border-slate-700">
          <TabButton tab="overview" label="Overview" />
          <TabButton tab="knowledge" label="Knowledge" />
          <TabButton tab="credits" label="Credits" />
          <TabButton tab="compliance" label="Compliance" />
          <TabButton tab="analytics" label="Analytics" />
        </div>

        {/* Tab Content */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 text-lg font-semibold">Agent Information</h3>
                <div className="space-y-2 text-sm">
                  <div className="grid md:grid-cols-2">
                    <span className="text-slate-400">Kind:</span>
                    <span className="font-medium">{agent.kind}</span>
                  </div>
                  <div className="grid md:grid-cols-2">
                    <span className="text-slate-400">Owner Email:</span>
                    <span className="font-medium">
                      {agent.ownerEmail || '-'}
                    </span>
                  </div>
                  <div className="grid md:grid-cols-2">
                    <span className="text-slate-400">Owner Name:</span>
                    <span className="font-medium">
                      {agent.ownerName || '-'}
                    </span>
                  </div>
                  <div className="grid md:grid-cols-2">
                    <span className="text-slate-400">Modified On:</span>
                    <span className="font-medium">
                      {new Date(agent.modifiedOn).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-semibold">Environment Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="grid md:grid-cols-2">
                    <span className="text-slate-400">Region:</span>
                    <span className="font-medium">{environment.region}</span>
                  </div>
                  <div className="grid md:grid-cols-2">
                    <span className="text-slate-400">Type:</span>
                    <span className="font-medium">{environment.type}</span>
                  </div>
                  <div className="grid md:grid-cols-2">
                    <span className="text-slate-400">Is Default:</span>
                    <span className="font-medium">
                      {environment.isDefault ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="grid md:grid-cols-2">
                    <span className="text-slate-400">Org URL:</span>
                    <span className="break-all font-mono text-xs">
                      {environment.orgUrl}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Knowledge Tab */}
          {activeTab === 'knowledge' && (
            <div className="space-y-4">
              <p className="text-slate-400">
                Knowledge source configuration not yet available.
              </p>
              <div className="rounded-md bg-slate-900/50 p-4 text-sm text-slate-500">
                This section would display:
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>Connected knowledge bases</li>
                  <li>SharePoint site sources</li>
                  <li>Document indexing status</li>
                  <li>Last ingestion timestamp</li>
                </ul>
              </div>
            </div>
          )}

          {/* Credits Tab */}
          {activeTab === 'credits' && (
            <div className="space-y-6">
              {agentMetrics.length === 0 ? (
                <p className="text-slate-400">No metrics available.</p>
              ) : (
                <>
                  <div>
                    <h3 className="mb-3 text-lg font-semibold">Recent Metrics</h3>
                    <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900">
                      <table className="w-full text-sm">
                        <thead className="border-b border-slate-700 bg-slate-900">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium">
                              Date
                            </th>
                            <th className="px-4 py-2 text-left font-medium">
                              Messages
                            </th>
                            <th className="px-4 py-2 text-left font-medium">
                              Sessions
                            </th>
                            <th className="px-4 py-2 text-left font-medium">
                              Cost
                            </th>
                            <th className="px-4 py-2 text-left font-medium">
                              Projected Mo
                            </th>
                            <th className="px-4 py-2 text-left font-medium">
                              Meter
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {agentMetrics.map((m, i) => (
                            <tr
                              key={i}
                              className="border-b border-slate-800 hover:bg-slate-800/50"
                            >
                              <td className="px-4 py-2">{m.date}</td>
                              <td className="px-4 py-2">{m.messageCount}</td>
                              <td className="px-4 py-2">{m.sessionCount}</td>
                              <td className="px-4 py-2 font-medium text-emerald-400">
                                ${m.estimatedCost.toFixed(2)}
                              </td>
                              <td className="px-4 py-2">
                                ${(m.projectedMonthly || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-xs text-slate-500">
                                {m.modelMeter || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {agentMetrics.length > 0 && agentMetrics[0].featureBreakdown && (
                    <div>
                      <h3 className="mb-3 text-lg font-semibold">
                        Credit Breakdown (Latest)
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-md bg-slate-900/50 p-4">
                          <p className="text-sm text-slate-400">Generative Answers</p>
                          <p className="mt-1 text-2xl font-bold">
                            {agentMetrics[0].featureBreakdown?.generativeAnswers}
                          </p>
                        </div>
                        <div className="rounded-md bg-slate-900/50 p-4">
                          <p className="text-sm text-slate-400">Agent Actions</p>
                          <p className="mt-1 text-2xl font-bold">
                            {agentMetrics[0].featureBreakdown?.agentActions}
                          </p>
                        </div>
                        <div className="rounded-md bg-slate-900/50 p-4">
                          <p className="text-sm text-slate-400">Agent Flows</p>
                          <p className="mt-1 text-2xl font-bold">
                            {agentMetrics[0].featureBreakdown?.agentFlows}
                          </p>
                        </div>
                        <div className="rounded-md bg-slate-900/50 p-4">
                          <p className="text-sm text-slate-400">Text Tools</p>
                          <p className="mt-1 text-2xl font-bold">
                            {agentMetrics[0].featureBreakdown?.textTools}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Compliance Tab */}
          {activeTab === 'compliance' && (
            <div className="space-y-4">
              {violations.length === 0 ? (
                <div className="rounded-md bg-emerald-900/20 p-4 text-emerald-300">
                  No compliance violations detected.
                </div>
              ) : (
                <>
                  <p className="font-semibold text-slate-300">
                    {violations.length} Violation(s) Found
                  </p>
                  <div className="space-y-2">
                    {violations.map((v) => (
                      <div
                        key={v.id}
                        className={[
                          'rounded-md p-4 border-l-4',
                          v.severity === 'critical'
                            ? 'border-red-500 bg-red-900/20'
                            : v.severity === 'warning'
                              ? 'border-amber-500 bg-amber-900/20'
                              : 'border-blue-500 bg-blue-900/20',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              Rule: {v.ruleId}
                            </p>
                            <p className="mt-1 text-sm text-slate-400">
                              State: {v.state}
                            </p>
                            <p className="text-xs text-slate-500">
                              Detected: {new Date(v.detectedAt).toLocaleString()}
                            </p>
                          </div>
                          <span
                            className={[
                              'rounded-full px-3 py-1 text-xs font-medium',
                              v.severity === 'critical'
                                ? 'bg-red-900/60 text-red-200'
                                : v.severity === 'warning'
                                  ? 'bg-amber-900/60 text-amber-200'
                                  : 'bg-blue-900/60 text-blue-200',
                            ].join(' ')}
                          >
                            {v.severity.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* Conversation KPIs */}
              {kpis.length > 0 && (
                <div>
                  <h3 className="mb-3 text-lg font-semibold">Conversation KPIs</h3>
                  <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-700 bg-slate-900">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">
                            Date
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            Sessions
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            Deflection Rate
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            Escalation Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {kpis.map((k, i) => (
                          <tr
                            key={i}
                            className="border-b border-slate-800 hover:bg-slate-800/50"
                          >
                            <td className="px-4 py-2">{k.date}</td>
                            <td className="px-4 py-2">{k.sessions}</td>
                            <td className="px-4 py-2">
                              {(k.deflectionRate * 100).toFixed(1)}%
                            </td>
                            <td className="px-4 py-2">
                              {(k.escalationRate * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Health Metrics */}
              {health.length > 0 && (
                <div>
                  <h3 className="mb-3 text-lg font-semibold">Health Metrics</h3>
                  <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-700 bg-slate-900">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">
                            Date
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            Error Rate
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            Avg Latency
                          </th>
                          <th className="px-4 py-2 text-left font-medium">
                            Failed Sessions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {health.map((h, i) => (
                          <tr
                            key={i}
                            className="border-b border-slate-800 hover:bg-slate-800/50"
                          >
                            <td className="px-4 py-2">{h.date}</td>
                            <td className="px-4 py-2">
                              {(h.errorRate * 100).toFixed(2)}%
                            </td>
                            <td className="px-4 py-2">{h.avgLatencyMs}ms</td>
                            <td className="px-4 py-2">{h.failedSessions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {kpis.length === 0 && health.length === 0 && (
                <p className="text-slate-400">No analytics data available.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * GET /api/cost
 *
 * Unified cost data endpoint.
 * Returns: { metrics, capacity, topBurners, summary }
 *
 * Falls back to mock data when connector fails or env vars missing.
 */

import { NextResponse } from 'next/server';
import type { AgentMetricDaily, Capacity, Agent } from '@/lib/types';
import { mockMetrics, mockCapacity, mockAgents } from '@/lib/mock/seed';
import {
  baseline7Day,
  baseline30Day,
  mtdCost,
  projectedMonthly,
  formatCost,
} from '@/lib/cost/projections';

interface TopBurner {
  agent: Agent;
  metrics: AgentMetricDaily[];
  mtdCost: number;
  projectedMonthly: number;
  avgDaily: number;
}

interface CostSummary {
  totalMtd: number;
  totalProjectedMonthly: number;
  totalBaseline7: number;
  totalBaseline30: number;
  agentCount: number;
  topBurnerCount: number;
}

/**
 * Identify top N burners by projected monthly cost
 */
function findTopBurners(
  metrics: AgentMetricDaily[],
  agents: Agent[],
  limit: number = 5
): TopBurner[] {
  // Group metrics by agent
  const metricsPerAgent = new Map<string, AgentMetricDaily[]>();
  metrics.forEach((m) => {
    const key = `${m.envId}/${m.botId}`;
    if (!metricsPerAgent.has(key)) {
      metricsPerAgent.set(key, []);
    }
    metricsPerAgent.get(key)!.push(m);
  });

  // Create burner list
  const burners: TopBurner[] = [];
  metricsPerAgent.forEach((agentMetrics, key) => {
    const agent = agents.find((a) => `${a.envId}/${a.botId}` === key);
    if (!agent) return;

    const mtd = mtdCost(agentMetrics);
    const projected = projectedMonthly(agentMetrics);
    const avg = agentMetrics.length > 0 ? mtd / agentMetrics.length : 0;

    burners.push({
      agent,
      metrics: agentMetrics,
      mtdCost: mtd,
      projectedMonthly: projected,
      avgDaily: avg,
    });
  });

  // Sort descending by projected monthly
  burners.sort((a, b) => b.projectedMonthly - a.projectedMonthly);
  return burners.slice(0, limit);
}

export async function GET() {
  try {
    // Use mock data (in production, would call connectors here)
    const metrics = mockMetrics;
    const capacity = mockCapacity;
    const agents = mockAgents;

    // Calculate summaries
    const topBurners = findTopBurners(metrics, agents, 5);

    const summary: CostSummary = {
      totalMtd: mtdCost(metrics),
      totalProjectedMonthly: topBurners.reduce(
        (sum, b) => sum + b.projectedMonthly,
        0
      ),
      totalBaseline7: baseline7Day(metrics),
      totalBaseline30: baseline30Day(metrics),
      agentCount: new Set(
        metrics.map((m) => `${m.envId}/${m.botId}`)
      ).size,
      topBurnerCount: topBurners.length,
    };

    return NextResponse.json(
      {
        metrics,
        capacity,
        topBurners: topBurners.map((b) => ({
          agent: b.agent,
          mtdCost: b.mtdCost,
          projectedMonthly: b.projectedMonthly,
          avgDaily: b.avgDaily,
          estimatedLabel: '(estimated)',
        })),
        summary,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('Cost API error:', error);
    // Fallback: return mock data
    return NextResponse.json(
      {
        metrics: mockMetrics,
        capacity: mockCapacity,
        topBurners: mockMetrics
          .slice(0, 3)
          .map((m, idx) => ({
            agent: mockAgents.find(
              (a) => a.envId === m.envId && a.botId === m.botId
            ),
            mtdCost: m.estimatedCost,
            projectedMonthly: m.projectedMonthly || 0,
            avgDaily: m.estimatedCost,
            estimatedLabel: '(estimated)',
          })),
        summary: {
          totalMtd: mtdCost(mockMetrics),
          totalProjectedMonthly: mockMetrics.reduce(
            (sum, m) => sum + (m.projectedMonthly || 0),
            0
          ),
          totalBaseline7: baseline7Day(mockMetrics),
          totalBaseline30: baseline30Day(mockMetrics),
          agentCount: new Set(
            mockMetrics.map((m) => `${m.envId}/${m.botId}`)
          ).size,
          topBurnerCount: 3,
        },
        timestamp: new Date().toISOString(),
        fallback: true,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  }
}

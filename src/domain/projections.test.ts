import { describe, it, expect } from 'vitest';
import type { AgentConsumptionDaily } from '../connectors/consumption.js';
import { resolveRates } from './rates.js';
import {
  summarisePerAgent,
  totalCost,
  projectedMonthly,
  aggregateFeatureBreakdown,
  featurePercentages,
} from './projections.js';

const rates = resolveRates(); // list price: 0.01 standard, 0.025 premium

function row(over: Partial<AgentConsumptionDaily> = {}): AgentConsumptionDaily {
  return {
    envId: 'env-1',
    botId: 'bot-a',
    date: '2026-08-01',
    messageCount: 100,
    sessionCount: 10,
    modelMeter: null,
    ...over,
  };
}

describe('summarisePerAgent', () => {
  it('prices each row on its own meter rather than the agent total on one', () => {
    // The bug this guards: 2000 messages at a single rate would give 20 or 50.
    // Charged per row it is 1000 x 0.01 + 1000 x 0.025 = 35.
    const [agent] = summarisePerAgent(
      [
        row({ messageCount: 1000, modelMeter: null }),
        row({ messageCount: 1000, modelMeter: 'premium', date: '2026-08-02' }),
      ],
      rates,
    );

    expect(agent!.messages).toBe(2000);
    expect(agent!.cost).toBe(35);
  });

  it('reports a null meter as standard, because that is how it was priced', () => {
    // Dropping nulls here once left an agent priced at the standard rate while
    // showing no meter at all, which made the figure untraceable.
    const [agent] = summarisePerAgent([row({ modelMeter: null })], rates);
    expect(agent!.meters).toEqual(['standard']);
  });

  it('lists every distinct meter an agent was charged on', () => {
    const [agent] = summarisePerAgent(
      [row({ modelMeter: null }), row({ modelMeter: 'premium', date: '2026-08-02' })],
      rates,
    );
    expect(agent!.meters.sort()).toEqual(['premium', 'standard']);
  });

  it('counts distinct active days, not rows', () => {
    const [agent] = summarisePerAgent(
      [row({ date: '2026-08-01' }), row({ date: '2026-08-01' }), row({ date: '2026-08-02' })],
      rates,
    );
    expect(agent!.activeDays).toBe(2);
  });

  it('gives a null cost per session when there were no sessions, never zero', () => {
    // Zero would read as "free per session". Unknown is the honest answer.
    const [agent] = summarisePerAgent([row({ sessionCount: 0, messageCount: 500 })], rates);
    expect(agent!.sessions).toBe(0);
    expect(agent!.costPerSession).toBeNull();
  });

  it('computes cost per session when sessions exist', () => {
    const [agent] = summarisePerAgent([row({ messageCount: 1000, sessionCount: 100 })], rates);
    expect(agent!.cost).toBe(10);
    expect(agent!.costPerSession).toBe(0.1);
  });

  it('separates agents and sorts the most expensive first', () => {
    const summaries = summarisePerAgent(
      [
        row({ botId: 'cheap', messageCount: 100 }),
        row({ botId: 'pricey', messageCount: 5000 }),
      ],
      rates,
    );
    expect(summaries.map((s) => s.botId)).toEqual(['pricey', 'cheap']);
  });

  it('keeps a feature breakdown even when only some days carry one', () => {
    const [agent] = summarisePerAgent(
      [
        row({
          featureBreakdown: { generativeAnswers: 60, agentActions: 20, agentFlows: 15, textTools: 5 },
        }),
        row({ date: '2026-08-02' }), // no breakdown on this day
      ],
      rates,
    );
    expect(agent!.featureBreakdown?.generativeAnswers).toBe(60);
  });

  it('omits the breakdown entirely when no day carried one', () => {
    const [agent] = summarisePerAgent([row()], rates);
    expect(agent!.featureBreakdown).toBeUndefined();
  });

  it('returns nothing for no rows, rather than a zero-valued agent', () => {
    expect(summarisePerAgent([], rates)).toEqual([]);
  });
});

describe('totalCost', () => {
  it('sums across agents', () => {
    const summaries = summarisePerAgent(
      [row({ botId: 'a', messageCount: 1000 }), row({ botId: 'b', messageCount: 500 })],
      rates,
    );
    expect(totalCost(summaries)).toBe(15);
  });
});

describe('projectedMonthly', () => {
  it('extrapolates the observed window to 30 days', () => {
    expect(projectedMonthly(40, 10)).toBe(120);
  });

  it('divides by the window, not by days that happened to have data', () => {
    // An agent idle for half the window really is averaging less per day.
    expect(projectedMonthly(30, 30)).toBe(30);
  });

  it('returns null for a zero-length window instead of 0 or Infinity', () => {
    expect(projectedMonthly(100, 0)).toBeNull();
    expect(projectedMonthly(100, -1)).toBeNull();
  });
});

describe('feature breakdown', () => {
  it('aggregates across agents and converts to percentages summing to 100', () => {
    const summaries = summarisePerAgent(
      [
        row({
          botId: 'a',
          featureBreakdown: { generativeAnswers: 50, agentActions: 25, agentFlows: 15, textTools: 10 },
        }),
        row({
          botId: 'b',
          featureBreakdown: { generativeAnswers: 50, agentActions: 25, agentFlows: 15, textTools: 10 },
        }),
      ],
      rates,
    );

    const totals = aggregateFeatureBreakdown(summaries);
    expect(totals?.generativeAnswers).toBe(100);

    const pct = featurePercentages(totals);
    const sum =
      pct!.generativeAnswers + pct!.agentActions + pct!.agentFlows + pct!.textTools;
    expect(Math.round(sum)).toBe(100);
    expect(pct!.generativeAnswers).toBe(50);
  });

  it('returns null rather than a row of zeros when there is no breakdown', () => {
    expect(featurePercentages(undefined)).toBeNull();
  });

  it('returns null rather than dividing by zero on an all-zero breakdown', () => {
    expect(
      featurePercentages({ generativeAnswers: 0, agentActions: 0, agentFlows: 0, textTools: 0 }),
    ).toBeNull();
  });
});

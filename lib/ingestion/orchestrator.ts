/**
 * Ingestion Orchestrator
 *
 * Fans out ingestion across all Power Platform environments and upserts
 * results to Supabase. Returns an IngestionRun summary.
 *
 * Pipeline:
 *   1. argInventory.listEnvironments()  - discover all accessible envs
 *   2. argInventory.listAgents()        - ONE tenant-wide call (hoisted)
 *   3. Per-env (p-limit 5):
 *      a. filter agents slice by envId
 *      b. graph.resolveOwners()         - enrich owner name/email
 *      c. cost.getDailyMetrics()        - daily credit consumption
 *   4. kpis.getAggregates()            - conversation KPIs (all envs at once)
 *   5. appInsights.getHealth()         - health metrics (all envs at once)
 *   6. cost.getCapacity()              - env capacity/overage
 *   7. Upsert everything to Supabase   - environments, agents, metrics, kpis, health, capacity
 *   8. Persist IngestionRun record
 */

import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';

import type {
  Environment,
  Agent,
  AgentMetricDaily,
  IngestionRun,
  ConversationKpi,
  HealthMetric,
  Capacity,
} from '@/lib/types';

import { argInventory } from '@/lib/connectors/argInventory';
import { cost } from '@/lib/connectors/cost';
import { graph } from '@/lib/connectors/graph';
import { appInsights } from '@/lib/connectors/appInsights';
import { kpis } from '@/lib/connectors/kpis';
import { getSupabaseClient } from '@/lib/db/supabaseClient';

// ---------------------------------------------------------------------------
// Supabase helpers - call getSupabaseClient() directly so resetSupabaseClient()
// from lib/db/supabaseClient works correctly (no module-level singleton here).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// A typed helper that lets us call Supabase for tables not in the generated
// schema (v2 tables added by migration 0002) without TS complaints.
// ---------------------------------------------------------------------------
type AnySupabaseClient = ReturnType<typeof getSupabaseClient>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromAny(db: AnySupabaseClient, table: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as any).from(table);
}

function getDb(): AnySupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return null;
  }
  return getSupabaseClient();
}

async function upsertEnvironments(envs: Environment[]): Promise<void> {
  const db = getDb();
  if (!db || envs.length === 0) return;
  const rows = envs.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    is_default: e.isDefault,
    region: e.region,
    org_url: e.orgUrl,
  }));
  const { error } = await fromAny(db, 'environments').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`upsert environments: ${(error as { message: string }).message}`);
}

async function upsertAgents(agents: Agent[]): Promise<void> {
  const db = getDb();
  if (!db || agents.length === 0) return;
  const rows = agents.map((a) => ({
    env_id: a.envId,
    bot_id: a.botId,
    name: a.name,
    owner_name: a.ownerName,
    owner_email: a.ownerEmail,
    state: a.state,
    created_on: a.createdOn,
    modified_on: a.modifiedOn,
    last_activity: a.lastActivity,
    kind: a.kind,
    // v2 lifecycle column added by migration 0002
    lifecycle: a.lifecycle ?? null,
  }));
  const { error } = await fromAny(db, 'agents').upsert(rows, { onConflict: 'env_id,bot_id' });
  if (error) throw new Error(`upsert agents: ${(error as { message: string }).message}`);
}

async function upsertMetrics(metrics: AgentMetricDaily[]): Promise<void> {
  const db = getDb();
  if (!db || metrics.length === 0) return;
  const rows = metrics.map((m) => ({
    env_id: m.envId,
    bot_id: m.botId,
    date: m.date,
    message_count: m.messageCount,
    session_count: m.sessionCount,
    estimated_cost: m.estimatedCost,
    model_meter: m.modelMeter,
    // v2 breakdown columns added by migration 0002
    breakdown_generative_answers: m.featureBreakdown?.generativeAnswers ?? null,
    breakdown_agent_actions: m.featureBreakdown?.agentActions ?? null,
    breakdown_agent_flows: m.featureBreakdown?.agentFlows ?? null,
    breakdown_text_tools: m.featureBreakdown?.textTools ?? null,
    projected_monthly: m.projectedMonthly ?? null,
  }));
  const { error } = await fromAny(db, 'agent_metrics_daily').upsert(rows, {
    onConflict: 'env_id,bot_id,date',
  });
  if (error) throw new Error(`upsert metrics: ${(error as { message: string }).message}`);
}

async function upsertConversationKpis(rows: ConversationKpi[]): Promise<void> {
  const db = getDb();
  if (!db || rows.length === 0) return;
  const mapped = rows.map((r) => ({
    env_id: r.envId,
    bot_id: r.botId,
    date: r.date,
    sessions: r.sessions,
    deflection_rate: r.deflectionRate,
    escalation_rate: r.escalationRate,
  }));
  const { error } = await fromAny(db, 'conversation_kpis').upsert(mapped, {
    onConflict: 'env_id,bot_id,date',
  });
  if (error) throw new Error(`upsert conversation_kpis: ${(error as { message: string }).message}`);
}

async function upsertHealthMetrics(rows: HealthMetric[]): Promise<void> {
  const db = getDb();
  if (!db || rows.length === 0) return;
  const mapped = rows.map((r) => ({
    env_id: r.envId,
    bot_id: r.botId,
    date: r.date,
    error_rate: r.errorRate,
    avg_latency_ms: r.avgLatencyMs,
    failed_sessions: r.failedSessions,
  }));
  const { error } = await fromAny(db, 'health_metrics').upsert(mapped, {
    onConflict: 'env_id,bot_id,date',
  });
  if (error) throw new Error(`upsert health_metrics: ${(error as { message: string }).message}`);
}

async function upsertCapacity(rows: Capacity[]): Promise<void> {
  const db = getDb();
  if (!db || rows.length === 0) return;
  const mapped = rows.map((r) => ({
    env_id: r.envId,
    credit_limit: r.creditLimit,
    credit_used: r.creditUsed,
    pct: r.pct,
    overage: r.overage,
  }));
  const { error } = await fromAny(db, 'env_capacity').upsert(mapped, {
    onConflict: 'env_id',
  });
  if (error) throw new Error(`upsert env_capacity: ${(error as { message: string }).message}`);
}

async function upsertIngestionRun(run: IngestionRun): Promise<void> {
  const db = getDb();
  if (!db) return;
  const row = {
    id: run.id,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    status: run.status,
    env_count: run.envCount,
    agent_count: run.agentCount,
    errors: run.errors,
  };
  const { error } = await fromAny(db, 'ingestion_runs').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsert ingestion_run: ${(error as { message: string }).message}`);
}

// ---------------------------------------------------------------------------
// Per-environment ingestion
// ---------------------------------------------------------------------------
interface EnvResult {
  agents: Agent[];
  metrics: AgentMetricDaily[];
  errors: string[];
  persisted: boolean;
}

async function ingestEnvironment(
  env: Environment,
  allAgents: Agent[],
): Promise<EnvResult> {
  const errors: string[] = [];
  let metrics: AgentMetricDaily[] = [];
  let persisted = false;

  // 1. Filter pre-fetched agents for this environment (no extra ARG call)
  let agents = allAgents.filter((a) => a.envId === env.id);

  // 2. Resolve owner identities via Graph
  if (agents.length > 0) {
    try {
      const ownerIds = [
        ...new Set(
          agents
            .map((a) => a.ownerEmail) // ownerEmail may hold an Entra ID in raw form
            .filter((v): v is string => v != null && v.includes('-')), // simple GUID heuristic
        ),
      ];
      if (ownerIds.length > 0) {
        const ownerMap = await graph.resolveOwners(ownerIds);
        agents = agents.map((a) => {
          if (a.ownerEmail && ownerMap.has(a.ownerEmail)) {
            const resolved = ownerMap.get(a.ownerEmail)!;
            return { ...a, ownerName: resolved.name, ownerEmail: resolved.email };
          }
          return a;
        });
      }
    } catch (e) {
      // Non-fatal: owner resolution failure leaves ownerName/Email as-is
      errors.push(
        `${env.id}: graph: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 3. Daily cost metrics for this environment
  if (env.orgUrl) {
    try {
      metrics = await cost.getDailyMetrics(env.orgUrl);
    } catch (e) {
      errors.push(
        `${env.id}: metrics: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 4. Upsert agents + metrics; track whether anything actually persisted
  try {
    await upsertAgents(agents);
    await upsertMetrics(metrics);
    if (agents.length > 0 || metrics.length > 0) {
      persisted = true;
    }
  } catch (e) {
    errors.push(
      `${env.id}: upsert: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return { agents, metrics, errors, persisted };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * runIngestion
 *
 * Orchestrates the full ingestion pipeline across all environments.
 * Returns an IngestionRun summary with status, counts, and any per-env errors.
 */
export async function runIngestion(): Promise<IngestionRun> {
  const runId = uuidv4();
  const startedAt = new Date().toISOString();

  const run: IngestionRun = {
    id: runId,
    startedAt,
    finishedAt: null,
    status: 'running',
    envCount: 0,
    agentCount: 0,
    errors: [],
  };

  // Track whether any upsert actually succeeded across the whole run
  let anyPersisted = false;

  try {
    // --- Step 1: Discover environments ---
    let environments: Environment[] = [];
    try {
      environments = await argInventory.listEnvironments();
    } catch (e) {
      run.errors.push(
        `listEnvironments: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (environments.length > 0) {
      // --- Step 2: Upsert environments ---
      try {
        await upsertEnvironments(environments);
        anyPersisted = true;
      } catch (e) {
        run.errors.push(
          `upsertEnvironments: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // --- Step 3: Single tenant-wide ARG agents fetch (hoisted) ---
      let allAgents: Agent[] = [];
      try {
        allAgents = await argInventory.listAgents();
      } catch (e) {
        run.errors.push(
          `listAgents: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      // --- Step 4: Fan-out per-environment ingestion (max 5 parallel) ---
      const limit = pLimit(5);
      const envResults = await Promise.all(
        environments.map((env) => limit(() => ingestEnvironment(env, allAgents))),
      );

      const collectedAgents: Agent[] = [];
      const collectedMetrics: AgentMetricDaily[] = [];

      for (const result of envResults) {
        collectedAgents.push(...result.agents);
        collectedMetrics.push(...result.metrics);
        run.errors.push(...result.errors);
        if (result.persisted) anyPersisted = true;
      }

      run.envCount = environments.length;
      run.agentCount = collectedAgents.length;
    }

    // --- Step 5: Conversation KPIs (all envs in one call) ---
    try {
      const kpiRows = await kpis.getAggregates();
      await upsertConversationKpis(kpiRows);
      if (kpiRows.length > 0) anyPersisted = true;
    } catch (e) {
      run.errors.push(
        `kpis: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // --- Step 6: Health metrics (all envs via App Insights workspace) ---
    try {
      const healthRows = await appInsights.getHealth();
      await upsertHealthMetrics(healthRows);
      if (healthRows.length > 0) anyPersisted = true;
    } catch (e) {
      run.errors.push(
        `appInsights: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // --- Step 7: Env capacity ---
    try {
      const capacityRows = await cost.getCapacity();
      await upsertCapacity(capacityRows);
      if (capacityRows.length > 0) anyPersisted = true;
    } catch (e) {
      run.errors.push(
        `capacity: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // --- Determine final status ---
    // 'partial' only when at least one upsert succeeded but there were errors.
    // 'failed' when nothing persisted at all.
    if (run.errors.length === 0) {
      run.status = 'success';
    } else if (anyPersisted) {
      run.status = 'partial';
    } else {
      run.status = 'failed';
    }
  } catch (e) {
    run.errors.push(
      `orchestrator: ${e instanceof Error ? e.message : String(e)}`,
    );
    run.status = 'failed';
  }

  run.finishedAt = new Date().toISOString();

  // Persist the run record itself - non-throwing, log on failure
  try {
    await upsertIngestionRun(run);
  } catch (e) {
    console.error(
      '[runIngestion] Failed to persist ingestion run record:',
      e instanceof Error ? e.message : String(e),
    );
  }

  return run;
}

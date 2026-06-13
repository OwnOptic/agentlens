/**
 * Gate Decisions Repository
 *
 * Persists GateDecision records to Supabase when configured; falls back to a
 * module-level in-memory Map when SUPABASE_URL / SUPABASE_SERVICE_KEY are absent
 * (local / demo mode). The fallback is seeded from the mock data on first access
 * so the UI is populated without a database.
 *
 * Exported functions:
 *   listDecisions()          - all decisions, newest first
 *   getDecisionById(id)      - single decision or null
 *   saveDecision(d)          - upsert
 *   revokeDecisionById(id)   - set revoked=true; returns updated decision or null
 */

import type { GateDecision } from '@/lib/types';
import { mockGateDecisions } from '@/lib/mock/seed';
import { tryGetSupabaseClient } from './supabaseClient';

// ---------------------------------------------------------------------------
// In-memory fallback store (module-level; persists for the process lifetime)
// ---------------------------------------------------------------------------

let _memStore: Map<string, GateDecision> | null = null;

function getMemStore(): Map<string, GateDecision> {
  if (_memStore === null) {
    _memStore = new Map(mockGateDecisions.map((d) => [d.id, d]));
  }
  return _memStore;
}

// ---------------------------------------------------------------------------
// Row <-> domain mappers
// ---------------------------------------------------------------------------

type GateDecisionRow =
  import('./types').Database['public']['Tables']['gate_decisions']['Row'];

function rowToDomain(row: GateDecisionRow): GateDecision {
  return {
    id: row.id,
    agentRef: row.agent_ref,
    verdict: row.verdict,
    reasons: row.reasons,
    signedAt: row.signed_at,
    signature: row.signature,
    revoked: row.revoked,
  };
}

function domainToInsert(
  d: GateDecision,
): import('./types').Database['public']['Tables']['gate_decisions']['Insert'] {
  return {
    id: d.id,
    agent_ref: d.agentRef,
    verdict: d.verdict,
    reasons: d.reasons,
    signed_at: d.signedAt,
    signature: d.signature,
    revoked: d.revoked,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all gate decisions, ordered newest-first by signedAt.
 */
export async function listDecisions(): Promise<GateDecision[]> {
  const db = tryGetSupabaseClient();

  if (!db) {
    const store = getMemStore();
    return Array.from(store.values()).sort(
      (a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime(),
    );
  }

  const { data, error } = await db
    .from('gate_decisions')
    .select('*')
    .order('signed_at', { ascending: false });

  if (error) {
    console.error('[gateDecisions] listDecisions error:', error.message);
    throw new Error(error.message);
  }

  return (data ?? []).map(rowToDomain);
}

/**
 * Get a single decision by id; returns null if not found.
 */
export async function getDecisionById(id: string): Promise<GateDecision | null> {
  const db = tryGetSupabaseClient();

  if (!db) {
    return getMemStore().get(id) ?? null;
  }

  const { data, error } = await db
    .from('gate_decisions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[gateDecisions] getDecisionById error:', error.message);
    throw new Error(error.message);
  }

  return data ? rowToDomain(data) : null;
}

/**
 * Upsert a gate decision (insert or replace by id).
 */
export async function saveDecision(decision: GateDecision): Promise<void> {
  const db = tryGetSupabaseClient();

  if (!db) {
    getMemStore().set(decision.id, decision);
    return;
  }

  const { error } = await db
    .from('gate_decisions')
    .upsert(domainToInsert(decision), { onConflict: 'id' });

  if (error) {
    console.error('[gateDecisions] saveDecision error:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Revoke a decision by id.
 * Returns the updated decision, or null if the id was not found.
 * Throws if the decision is already revoked.
 */
export async function revokeDecisionById(id: string): Promise<GateDecision | null> {
  const db = tryGetSupabaseClient();

  if (!db) {
    const store = getMemStore();
    const existing = store.get(id);
    if (!existing) return null;
    const updated: GateDecision = { ...existing, revoked: true };
    store.set(id, updated);
    return updated;
  }

  // Fetch first so we can return the full domain object (and surface "not found")
  const existing = await getDecisionById(id);
  if (!existing) return null;

  const { error } = await db
    .from('gate_decisions')
    .update({ revoked: true })
    .eq('id', id);

  if (error) {
    console.error('[gateDecisions] revokeDecisionById error:', error.message);
    throw new Error(error.message);
  }

  return { ...existing, revoked: true };
}

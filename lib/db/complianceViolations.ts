/**
 * Compliance Violation States Repository
 *
 * Persists violation state overrides (acknowledged / resolved) to Supabase when
 * configured; falls back to a module-level in-memory Map when SUPABASE_URL /
 * SUPABASE_SERVICE_KEY are absent (local / demo mode).
 *
 * Design note: the compliance/route.ts evaluateAgents() call produces the full
 * violation list from live or mock data on every request. This repo stores ONLY
 * the user-applied state overrides (ack / resolve). At read time the route merges
 * the override map over the evaluated violations so the UI reflects both computed
 * and manually updated states, without re-running evaluation on every POST.
 *
 * Exported functions:
 *   getViolationStates()                 - Map<id, state> of all overrides
 *   setViolationState(id, state)         - upsert one override
 *   setViolationStates(ids, state)       - bulk upsert (used by the route)
 */

import type { ComplianceViolation } from '@/lib/types';
import { tryGetSupabaseClient } from './supabaseClient';

type ViolationState = ComplianceViolation['state'];

// ---------------------------------------------------------------------------
// In-memory fallback store (module-level; persists for the process lifetime)
// ---------------------------------------------------------------------------

let _memStore: Map<string, ViolationState> | null = null;

function getMemStore(): Map<string, ViolationState> {
  if (_memStore === null) {
    _memStore = new Map();
  }
  return _memStore;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return all state overrides as a Map<violationId, state>.
 * Consumers should merge this map over their evaluated violation list.
 */
export async function getViolationStates(): Promise<Map<string, ViolationState>> {
  const db = tryGetSupabaseClient();

  if (!db) {
    return new Map(getMemStore());
  }

  const { data, error } = await db
    .from('compliance_violation_states')
    .select('id, state');

  if (error) {
    console.error('[complianceViolations] getViolationStates error:', error.message);
    throw new Error(error.message);
  }

  const map = new Map<string, ViolationState>();
  for (const row of data ?? []) {
    map.set(row.id, row.state);
  }
  return map;
}

/**
 * Upsert a single violation state override.
 */
export async function setViolationState(
  id: string,
  state: ViolationState,
): Promise<void> {
  const db = tryGetSupabaseClient();

  if (!db) {
    getMemStore().set(id, state);
    return;
  }

  const { error } = await db
    .from('compliance_violation_states')
    .upsert({ id, state }, { onConflict: 'id' });

  if (error) {
    console.error('[complianceViolations] setViolationState error:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Bulk upsert violation state overrides for a list of ids.
 */
export async function setViolationStates(
  ids: string[],
  state: ViolationState,
): Promise<void> {
  if (ids.length === 0) return;

  const db = tryGetSupabaseClient();

  if (!db) {
    const store = getMemStore();
    for (const id of ids) {
      store.set(id, state);
    }
    return;
  }

  const rows = ids.map((id) => ({ id, state }));
  const { error } = await db
    .from('compliance_violation_states')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('[complianceViolations] setViolationStates error:', error.message);
    throw new Error(error.message);
  }
}

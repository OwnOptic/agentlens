-- AgentLens v3 - Governance Persistence Layer
-- Adds the compliance_violation_states overlay table used by the compliance
-- repo module to persist user-applied ack/resolve overrides across restarts.
--
-- NOTE: gate_decisions was already created in 0002_v2.sql.
-- This migration only adds the new table needed for violation state persistence.
-- Safe to run on top of 0001 + 0002: uses CREATE TABLE IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- compliance_violation_states
-- Stores user-applied state overrides for compliance violations.
-- Only records that have been explicitly ack'd or resolved are stored here.
-- The evaluator computes the base 'open' state; this table overlays mutations.
-- id references compliance_violations(id) but without a FK to allow
-- in-memory mock violations (which are not stored in compliance_violations).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS compliance_violation_states (
  id          TEXT PRIMARY KEY,
  state       TEXT NOT NULL CHECK (state IN ('open', 'acknowledged', 'resolved', 'suppressed')),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cvs_state ON compliance_violation_states(state);

CREATE OR REPLACE FUNCTION update_cvs_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_compliance_violation_states_updated_at
  BEFORE UPDATE ON compliance_violation_states
  FOR EACH ROW EXECUTE FUNCTION update_cvs_updated_at();

ALTER TABLE compliance_violation_states ENABLE ROW LEVEL SECURITY;

-- AgentLens v2 Schema Extension
-- Adds tables for capacity, compliance, maturity, release gates, KPIs, and health metrics.
-- Safe to run on top of 0001_init.sql: all CREATE TABLE / INDEX statements use IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- Extend agents table with lifecycle stage (v2)
-- ---------------------------------------------------------------------------
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS lifecycle TEXT CHECK (lifecycle IN ('poc', 'pilot', 'prod'));

-- ---------------------------------------------------------------------------
-- Extend agent_metrics_daily with feature breakdown and projection (v2)
-- ---------------------------------------------------------------------------
ALTER TABLE agent_metrics_daily
  ADD COLUMN IF NOT EXISTS breakdown_generative_answers  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS breakdown_agent_actions       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS breakdown_agent_flows         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS breakdown_text_tools          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS projected_monthly             NUMERIC(10, 4);

-- ---------------------------------------------------------------------------
-- env_capacity
-- Credit capacity and consumption per environment.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS env_capacity (
  env_id         TEXT PRIMARY KEY,
  credit_limit   NUMERIC(12, 2) NOT NULL,
  credit_used    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pct            NUMERIC(6, 2)  NOT NULL GENERATED ALWAYS AS (
                   CASE WHEN credit_limit = 0 THEN 0
                        ELSE ROUND((credit_used / credit_limit) * 100, 2)
                   END
                 ) STORED,
  overage        BOOLEAN NOT NULL GENERATED ALWAYS AS (credit_used >= credit_limit) STORED,
  refreshed_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_env_capacity_environment FOREIGN KEY (env_id) REFERENCES environments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_env_capacity_overage ON env_capacity(overage) WHERE overage = TRUE;

CREATE TRIGGER update_env_capacity_updated_at BEFORE UPDATE ON env_capacity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE env_capacity ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- compliance_rules
-- Declarative governance rules evaluated against agents.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compliance_rules (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('authentication', 'data_loss', 'knowledge_source', 'channel', 'connector')),
  severity    TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  expression  TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_type     ON compliance_rules(type);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_severity ON compliance_rules(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_enabled  ON compliance_rules(enabled) WHERE enabled = TRUE;

CREATE TRIGGER update_compliance_rules_updated_at BEFORE UPDATE ON compliance_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- compliance_violations
-- Recorded instances where an agent broke a compliance rule.
-- agent_ref stores "{env_id}/{bot_id}" as a denormalised reference
-- to avoid a composite FK across a text-only column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compliance_violations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_ref   TEXT NOT NULL,
  rule_id     TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'acknowledged', 'resolved', 'suppressed')),
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_compliance_violations_rule FOREIGN KEY (rule_id) REFERENCES compliance_rules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_compliance_violations_agent_ref   ON compliance_violations(agent_ref);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_rule_id     ON compliance_violations(rule_id);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_state       ON compliance_violations(state);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_severity    ON compliance_violations(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_detected_at ON compliance_violations(detected_at DESC);
-- Composite for the "open critical by agent" query pattern
CREATE INDEX IF NOT EXISTS idx_compliance_violations_agent_state_sev
  ON compliance_violations(agent_ref, state, severity);

CREATE TRIGGER update_compliance_violations_updated_at BEFORE UPDATE ON compliance_violations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- maturity_controls
-- Controls in the agent governance maturity model.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maturity_controls (
  id               TEXT PRIMARY KEY,
  pillar           TEXT NOT NULL CHECK (pillar IN ('security', 'management', 'reporting')),
  name             TEXT NOT NULL,
  auto_evaluable   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_maturity_controls_pillar ON maturity_controls(pillar);

CREATE TRIGGER update_maturity_controls_updated_at BEFORE UPDATE ON maturity_controls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE maturity_controls ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- maturity_results
-- Evaluated scores per control per assessment run.
-- assessment_run_id groups results from the same evaluation pass.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maturity_results (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_run_id  UUID NOT NULL,
  control_id         TEXT NOT NULL,
  score              SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 4),
  capped             BOOLEAN NOT NULL DEFAULT FALSE,
  residual_burden    TEXT NOT NULL DEFAULT '',
  assessed_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_maturity_results_control FOREIGN KEY (control_id) REFERENCES maturity_controls(id) ON DELETE CASCADE,
  UNIQUE (assessment_run_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_maturity_results_run       ON maturity_results(assessment_run_id);
CREATE INDEX IF NOT EXISTS idx_maturity_results_control   ON maturity_results(control_id);
CREATE INDEX IF NOT EXISTS idx_maturity_results_assessed  ON maturity_results(assessed_at DESC);

CREATE TRIGGER update_maturity_results_updated_at BEFORE UPDATE ON maturity_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE maturity_results ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- gate_policies
-- Release gate policy definitions (YAML-encoded rule sets).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gate_policies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  yaml        TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gate_policies_enabled ON gate_policies(enabled) WHERE enabled = TRUE;

CREATE TRIGGER update_gate_policies_updated_at BEFORE UPDATE ON gate_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE gate_policies ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- gate_decisions
-- Audit trail of gate evaluation results for agent promotion attempts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gate_decisions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_ref   TEXT NOT NULL,
  policy_id   TEXT,
  verdict     TEXT NOT NULL CHECK (verdict IN ('pass', 'block')),
  reasons     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  signed_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  signature   TEXT NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gate_decisions_policy FOREIGN KEY (policy_id) REFERENCES gate_policies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gate_decisions_agent_ref ON gate_decisions(agent_ref);
CREATE INDEX IF NOT EXISTS idx_gate_decisions_verdict   ON gate_decisions(verdict);
CREATE INDEX IF NOT EXISTS idx_gate_decisions_revoked   ON gate_decisions(revoked) WHERE revoked = TRUE;
CREATE INDEX IF NOT EXISTS idx_gate_decisions_signed_at ON gate_decisions(signed_at DESC);

CREATE TRIGGER update_gate_decisions_updated_at BEFORE UPDATE ON gate_decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE gate_decisions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- conversation_kpis
-- Aggregate daily conversation KPIs. NO content, NO user identifiers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_kpis (
  env_id           TEXT NOT NULL,
  bot_id           TEXT NOT NULL,
  date             DATE NOT NULL,
  sessions         INTEGER NOT NULL DEFAULT 0,
  deflection_rate  NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (deflection_rate BETWEEN 0 AND 1),
  escalation_rate  NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (escalation_rate BETWEEN 0 AND 1),
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (env_id, bot_id, date),
  CONSTRAINT fk_conversation_kpis_agent FOREIGN KEY (env_id, bot_id) REFERENCES agents(env_id, bot_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_kpis_date     ON conversation_kpis(date DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_kpis_env_date ON conversation_kpis(env_id, date DESC);

CREATE TRIGGER update_conversation_kpis_updated_at BEFORE UPDATE ON conversation_kpis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE conversation_kpis ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- health_metrics
-- Operational health measurements per bot per day (error rate, latency).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_metrics (
  env_id           TEXT NOT NULL,
  bot_id           TEXT NOT NULL,
  date             DATE NOT NULL,
  error_rate       NUMERIC(7, 6) NOT NULL DEFAULT 0 CHECK (error_rate BETWEEN 0 AND 1),
  avg_latency_ms   INTEGER NOT NULL DEFAULT 0,
  failed_sessions  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (env_id, bot_id, date),
  CONSTRAINT fk_health_metrics_agent FOREIGN KEY (env_id, bot_id) REFERENCES agents(env_id, bot_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_metrics_date        ON health_metrics(date DESC);
CREATE INDEX IF NOT EXISTS idx_health_metrics_env_date    ON health_metrics(env_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_health_metrics_error_rate  ON health_metrics(error_rate DESC);
CREATE INDEX IF NOT EXISTS idx_health_metrics_latency     ON health_metrics(avg_latency_ms DESC);

CREATE TRIGGER update_health_metrics_updated_at BEFORE UPDATE ON health_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE health_metrics ENABLE ROW LEVEL SECURITY;

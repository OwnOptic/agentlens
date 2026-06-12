-- AgentLens Schema Initialization
-- Creates core tables for environment, agent, metrics, alerts, and ingestion tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for full-text search optimization
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Environments table
-- Represents Power Platform environments (tenants, regions)
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  region TEXT NOT NULL,
  org_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by default environment
CREATE INDEX idx_environments_is_default ON environments(is_default) WHERE is_default = TRUE;

-- Index for faster lookups by organization URL
CREATE INDEX idx_environments_org_url ON environments(org_url);

-- Agents table
-- Represents Copilot Studio agents within environments
-- Composite primary key: (env_id, bot_id)
CREATE TABLE IF NOT EXISTS agents (
  env_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_name TEXT,
  owner_email TEXT,
  state TEXT NOT NULL,
  created_on TIMESTAMP WITH TIME ZONE NOT NULL,
  modified_on TIMESTAMP WITH TIME ZONE NOT NULL,
  last_activity TIMESTAMP WITH TIME ZONE,
  kind TEXT NOT NULL DEFAULT 'copilot_studio',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (env_id, bot_id),
  CONSTRAINT fk_agents_environment FOREIGN KEY (env_id) REFERENCES environments(id) ON DELETE CASCADE
);

-- Index for faster lookups by owner email (for stakeholder searches)
CREATE INDEX idx_agents_owner_email ON agents(owner_email);

-- Index for faster lookups by agent name
CREATE INDEX idx_agents_name ON agents USING GIN(name gin_trgm_ops);

-- Index for faster lookups by state
CREATE INDEX idx_agents_state ON agents(state);

-- Index for faster lookups by last activity (for idle detection)
CREATE INDEX idx_agents_last_activity ON agents(last_activity);

-- Agent metrics daily table
-- Daily aggregated metrics: cost, usage, message/session counts
CREATE TABLE IF NOT EXISTS agent_metrics_daily (
  env_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  date DATE NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  model_meter TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (env_id, bot_id, date),
  CONSTRAINT fk_agent_metrics_agent FOREIGN KEY (env_id, bot_id) REFERENCES agents(env_id, bot_id) ON DELETE CASCADE
);

-- Index for faster lookups by date range
CREATE INDEX idx_agent_metrics_daily_date ON agent_metrics_daily(date DESC);

-- Index for faster lookups by environment and date
CREATE INDEX idx_agent_metrics_daily_env_date ON agent_metrics_daily(env_id, date DESC);

-- Index for cost analysis (estimated_cost DESC)
CREATE INDEX idx_agent_metrics_daily_cost ON agent_metrics_daily(estimated_cost DESC);

-- Alerts table
-- Governance alerts raised by the system
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  env_id TEXT NOT NULL,
  bot_id TEXT,
  message TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alerts_environment FOREIGN KEY (env_id) REFERENCES environments(id) ON DELETE CASCADE,
  CONSTRAINT fk_alerts_agent FOREIGN KEY (env_id, bot_id) REFERENCES agents(env_id, bot_id) ON DELETE SET NULL
);

-- Index for faster alert lookups by state
CREATE INDEX idx_alerts_state ON alerts(state);

-- Index for faster alert lookups by type
CREATE INDEX idx_alerts_type ON alerts(type);

-- Index for faster alert lookups by severity
CREATE INDEX idx_alerts_severity ON alerts(severity);

-- Index for faster alert lookups by environment
CREATE INDEX idx_alerts_env_id ON alerts(env_id);

-- Index for faster alert lookups by creation date
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

-- Index for combined searches (environment + state + severity)
CREATE INDEX idx_alerts_env_state_severity ON alerts(env_id, state, severity);

-- Migration tracker table
-- Tracks migration status of agents and environments
CREATE TABLE IF NOT EXISTS migration_tracker (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  env_id TEXT NOT NULL,
  bot_id TEXT,
  migration_status TEXT NOT NULL,
  reason TEXT,
  notified_at TIMESTAMP WITH TIME ZONE,
  moved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_migration_tracker_environment FOREIGN KEY (env_id) REFERENCES environments(id) ON DELETE CASCADE,
  CONSTRAINT fk_migration_tracker_agent FOREIGN KEY (env_id, bot_id) REFERENCES agents(env_id, bot_id) ON DELETE SET NULL
);

-- Index for faster migration lookups by status
CREATE INDEX idx_migration_tracker_status ON migration_tracker(migration_status);

-- Index for faster migration lookups by environment
CREATE INDEX idx_migration_tracker_env_id ON migration_tracker(env_id);

-- Index for combined searches
CREATE INDEX idx_migration_tracker_env_status ON migration_tracker(env_id, migration_status);

-- Ingestion runs table
-- Represents single runs of the agent/environment ingestion pipeline
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  finished_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL,
  env_count INTEGER NOT NULL DEFAULT 0,
  agent_count INTEGER NOT NULL DEFAULT 0,
  errors TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by status
CREATE INDEX idx_ingestion_runs_status ON ingestion_runs(status);

-- Index for faster lookups by started_at
CREATE INDEX idx_ingestion_runs_started_at ON ingestion_runs(started_at DESC);

-- Index for faster lookups by finished_at
CREATE INDEX idx_ingestion_runs_finished_at ON ingestion_runs(finished_at DESC) WHERE finished_at IS NOT NULL;

-- Config table
-- Application configuration and settings
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by key pattern
CREATE INDEX idx_config_key ON config(key);

-- Set up automatic updated_at timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables with updated_at
CREATE TRIGGER update_environments_updated_at BEFORE UPDATE ON environments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_metrics_daily_updated_at BEFORE UPDATE ON agent_metrics_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_migration_tracker_updated_at BEFORE UPDATE ON migration_tracker
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ingestion_runs_updated_at BEFORE UPDATE ON ingestion_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_config_updated_at BEFORE UPDATE ON config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS (Row Level Security) for future authentication layer
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_tracker ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

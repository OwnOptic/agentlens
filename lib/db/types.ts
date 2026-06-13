/**
 * Database Schema Types
 *
 * Supabase-generated types that correspond to the SQL schema.
 * These types are used for type-safe database operations.
 *
 * Every table entry includes `Relationships: never[]` so that the `public`
 * schema satisfies Supabase's GenericSchema constraint, enabling fully-typed
 * `.from('table')` calls (instead of an `any` cast).
 */

export interface Database {
  public: {
    Tables: {
      environments: {
        Row: {
          id: string;
          name: string;
          type: string;
          is_default: boolean;
          region: string;
          org_url: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          type: string;
          is_default?: boolean;
          region: string;
          org_url: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: string;
          is_default?: boolean;
          region?: string;
          org_url?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: never[];
      };
      agents: {
        Row: {
          env_id: string;
          bot_id: string;
          name: string;
          owner_name: string | null;
          owner_email: string | null;
          state: string;
          created_on: string;
          modified_on: string;
          last_activity: string | null;
          kind: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          env_id: string;
          bot_id: string;
          name: string;
          owner_name?: string | null;
          owner_email?: string | null;
          state: string;
          created_on: string;
          modified_on: string;
          last_activity?: string | null;
          kind?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          env_id?: string;
          bot_id?: string;
          name?: string;
          owner_name?: string | null;
          owner_email?: string | null;
          state?: string;
          created_on?: string;
          modified_on?: string;
          last_activity?: string | null;
          kind?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: never[];
      };
      agent_metrics_daily: {
        Row: {
          env_id: string;
          bot_id: string;
          date: string;
          message_count: number;
          session_count: number;
          estimated_cost: string;
          model_meter: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          env_id: string;
          bot_id: string;
          date: string;
          message_count?: number;
          session_count?: number;
          estimated_cost?: string | number;
          model_meter?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          env_id?: string;
          bot_id?: string;
          date?: string;
          message_count?: number;
          session_count?: number;
          estimated_cost?: string | number;
          model_meter?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: never[];
      };
      alerts: {
        Row: {
          id: string;
          type: string;
          severity: string;
          env_id: string;
          bot_id: string | null;
          message: string;
          state: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          severity: string;
          env_id: string;
          bot_id?: string | null;
          message: string;
          state?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          severity?: string;
          env_id?: string;
          bot_id?: string | null;
          message?: string;
          state?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: never[];
      };
      migration_tracker: {
        Row: {
          id: string;
          env_id: string;
          bot_id: string | null;
          migration_status: string;
          reason: string | null;
          notified_at: string | null;
          moved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          env_id: string;
          bot_id?: string | null;
          migration_status: string;
          reason?: string | null;
          notified_at?: string | null;
          moved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          env_id?: string;
          bot_id?: string | null;
          migration_status?: string;
          reason?: string | null;
          notified_at?: string | null;
          moved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: never[];
      };
      ingestion_runs: {
        Row: {
          id: string;
          started_at: string;
          finished_at: string | null;
          status: string;
          env_count: number;
          agent_count: number;
          errors: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          started_at: string;
          finished_at?: string | null;
          status: string;
          env_count?: number;
          agent_count?: number;
          errors?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          status?: string;
          env_count?: number;
          agent_count?: number;
          errors?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: never[];
      };
      config: {
        Row: {
          key: string;
          value: Record<string, unknown>;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Record<string, unknown>;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Record<string, unknown>;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: never[];
      };
      gate_decisions: {
        Row: {
          id: string;
          agent_ref: string;
          policy_id: string | null;
          verdict: 'pass' | 'block';
          reasons: string[];
          signed_at: string;
          signature: string;
          revoked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_ref: string;
          policy_id?: string | null;
          verdict: 'pass' | 'block';
          reasons?: string[];
          signed_at?: string;
          signature: string;
          revoked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_ref?: string;
          policy_id?: string | null;
          verdict?: 'pass' | 'block';
          reasons?: string[];
          signed_at?: string;
          signature?: string;
          revoked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: never[];
      };
      compliance_violation_states: {
        Row: {
          id: string;
          state: 'open' | 'acknowledged' | 'resolved' | 'suppressed';
          updated_at: string;
        };
        Insert: {
          id: string;
          state: 'open' | 'acknowledged' | 'resolved' | 'suppressed';
          updated_at?: string;
        };
        Update: {
          id?: string;
          state?: 'open' | 'acknowledged' | 'resolved' | 'suppressed';
          updated_at?: string;
        };
        Relationships: never[];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

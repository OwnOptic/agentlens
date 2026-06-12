/**
 * Database Schema Types
 *
 * Supabase-generated types that correspond to the SQL schema.
 * These types are used for type-safe database operations.
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
      };
    };
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
  };
}

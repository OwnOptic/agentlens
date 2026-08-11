/**
 * Shared data contract for everything the tools read.
 *
 * These types describe REAL tenant records only. There is deliberately no
 * "sample" or "example" variant of any of them: if a source cannot be read the
 * tool reports it as not connected rather than substituting a shape like this.
 */

/** A Power Platform environment, as returned by the BAP admin API. */
export interface Environment {
  id: string;
  name: string;
  /** environmentSku: Default | Sandbox | Production | Trial | Developer ... */
  type: string;
  isDefault: boolean;
  region: string;
  /** Dataverse org URL. Empty when the environment has no Dataverse database. */
  orgUrl: string;
}

/** Where an agent lives. One agent belongs to exactly one store. */
export type AgentPlatform =
  | 'copilot_studio'
  | 'm365_agentbuilder'
  | 'm365_declarative'
  | 'foundry'
  | 'fabric';

export const PLATFORM_LABEL: Record<AgentPlatform, string> = {
  copilot_studio: 'Copilot Studio',
  m365_agentbuilder: 'M365 Agent Builder',
  m365_declarative: 'M365 Declarative',
  foundry: 'Azure AI Foundry',
  fabric: 'Fabric Data Agent',
};

/**
 * One agent, normalised across the stores.
 *
 * `owner` is the only personal data this server ever emits: an agent owner is
 * an accountable party, not a data subject of a conversation.
 */
export interface Agent {
  id: string;
  name: string;
  platform: AgentPlatform;
  owner: string | null;
  /** Environment / project / workspace the agent lives in. */
  location: string | null;
  /** Environment ID when the agent came from a Power Platform environment. */
  envId?: string;
  /** The API this record was discovered through. */
  source: string;
  state?: string;
  createdOn?: string;
  modifiedOn?: string;
  lastActivity?: string | null;
}

/**
 * Aggregate conversation KPIs for one agent on one day.
 * Counts and rates only - never message content, never an end user identity.
 */
export interface ConversationKpi {
  envId: string;
  botId: string;
  date: string;
  sessions: number;
  deflectionRate: number;
  escalationRate: number;
}

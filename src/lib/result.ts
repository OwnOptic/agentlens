/**
 * The honesty contract.
 *
 * AgentLens is a governance tool. Its credibility rests on one rule: every number
 * it reports is real, or it clearly says the source is not connected. It NEVER
 * fabricates, estimates, or fills gaps with plausible-looking sample data.
 *
 * Every tool returns a ToolResult. A tool that cannot reach its data source
 * returns `status: "not_connected"` with the exact reason and the fix. The agent
 * instructions tell the model to relay that verbatim rather than invent a figure.
 *
 * This is why the unimplemented tools in this scaffold are SAFE to ship: they
 * report themselves as not connected. Implementing a tool means replacing the
 * not-connected branch with real data, never removing the branch.
 */

/** Which upstream system a piece of data came from. Always name it to the user. */
export type DataSource =
  | 'Azure Resource Graph'
  | 'Microsoft Graph'
  | 'Power Platform Admin API'
  | 'Power Platform Governance API'
  | 'Dataverse'
  | 'Azure Cost Management'
  | 'Azure AI Foundry'
  | 'Microsoft Fabric';

export type SourceStatus = 'connected' | 'not_connected' | 'partial';

export interface SourceReport {
  source: DataSource;
  status: SourceStatus;
  /** Plain-language reason, shown to the administrator when not fully connected. */
  detail?: string;
}

export interface ToolResult<T = unknown> {
  status: 'ok' | 'not_connected' | 'partial' | 'error';
  /**
   * Human-readable summary. The model may quote this. It must never state a
   * figure that is not present in `data`.
   */
  summary: string;
  /** The actual payload. Absent when nothing could be read. */
  data?: T;
  /** Per-source connection state. Always populated so the agent can be explicit. */
  sources: SourceReport[];
  /** Present only when status is 'error'. */
  error?: string;
  /** Actionable next step for the administrator, when something is missing. */
  remediation?: string;
}

export function ok<T>(summary: string, data: T, sources: SourceReport[]): ToolResult<T> {
  return { status: 'ok', summary, data, sources };
}

export function partial<T>(
  summary: string,
  data: T,
  sources: SourceReport[],
  remediation?: string,
): ToolResult<T> {
  return { status: 'partial', summary, data, sources, remediation };
}

export function notConnected(
  summary: string,
  sources: SourceReport[],
  remediation: string,
): ToolResult<never> {
  return { status: 'not_connected', summary, sources, remediation };
}

export function failed(summary: string, error: unknown, sources: SourceReport[] = []): ToolResult<never> {
  return {
    status: 'error',
    summary,
    error: error instanceof Error ? error.message : String(error),
    sources,
  };
}

/** Wrap a ToolResult in the MCP content envelope. */
export function toMcpContent(result: ToolResult) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    isError: result.status === 'error',
  };
}

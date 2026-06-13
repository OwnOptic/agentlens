/**
 * types.ts - Setup probe contract
 *
 * Used by the /settings page and the /api/setup/check route to surface
 * an honest readiness state for each integration area.
 */

export interface SetupCheck {
  /** Unique machine-readable key, e.g. "azure_sp_client_id" */
  key: string;

  /** Human-readable label shown in the UI */
  label: string;

  /** Logical area this check belongs to */
  area: 'identity' | 'data' | 'ai' | 'storage' | 'hosting';

  /** Resolution status */
  status: 'ok' | 'missing' | 'error' | 'license_required';

  /** One-line explanation of the current status */
  detail: string;

  /**
   * Optional copy-paste command or portal action that fixes the issue.
   * Keep it terse - it renders as a code snippet or button label.
   * Examples:
   *   "az keyvault secret set --name AZURE-CLIENT-SECRET --value <value>"
   *   "Set AZURE_CLIENT_SECRET in .env.local"
   *   "Grant Copilot Studio license in M365 admin center"
   */
  fix?: string;
}

export interface SetupStatus {
  /** ISO-8601 timestamp of when the probe ran */
  checkedAt: string;

  checks: SetupCheck[];
}

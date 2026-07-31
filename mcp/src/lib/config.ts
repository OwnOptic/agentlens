/**
 * Configuration, read from the environment.
 *
 * Nothing tenant-specific is ever committed. See .env.example.
 * Secrets belong in Azure Key Vault in production; the App Service / Container
 * App injects them as environment variables via Key Vault references.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

export const config = {
  /** Transport: 'http' for Copilot (production), 'stdio' for local testing. */
  transport: (process.env.MCP_TRANSPORT ?? 'http') as 'http' | 'stdio',
  port: Number(process.env.PORT ?? 3000),

  /**
   * Inbound auth (AgentLens-MCP). Validates the token Copilot presents.
   * When MCP_AUDIENCE is unset the server runs UNAUTHENTICATED - acceptable for
   * local development only. See src/lib/auth.ts.
   */
  auth: {
    tenantId: optional('MCP_TENANT_ID'),
    /** Expected token audience, e.g. api://<mcp-app-id> or the SSO Application ID URI. */
    audience: optional('MCP_AUDIENCE'),
    /**
     * Microsoft Enterprise token store. If the server validates the calling
     * client, this is the only client ID Copilot presents.
     * https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso
     */
    allowedClientId: process.env.MCP_ALLOWED_CLIENT_ID ?? 'ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b',
  },

  /**
   * Outbound identity (AgentLens-Reader). Reads the five sources, read-only.
   * These are the SAME values the Next.js console uses, so a single app
   * registration serves both surfaces.
   */
  reader: {
    tenantId: optional('AZURE_TENANT_ID'),
    clientId: optional('AZURE_CLIENT_ID'),
    clientSecret: optional('AZURE_CLIENT_SECRET'),
    subscriptionId: optional('AZURE_SUBSCRIPTION_ID'),
  },

  /** Dataverse environment org URLs, comma separated. Usage data is aggregate only. */
  dataverseOrgUrls: (optional('DATAVERSE_ORG_URLS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  requiredEnv: required,
} as const;

/** True when the reader service principal is fully configured. */
export function readerConfigured(): boolean {
  return Boolean(config.reader.tenantId && config.reader.clientId && config.reader.clientSecret);
}

/** True when inbound token validation is enabled. */
export function authEnabled(): boolean {
  return Boolean(config.auth.audience && config.auth.tenantId);
}

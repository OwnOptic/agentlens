/**
 * /api/config/save  (POST + GET)
 *
 * -------------------------------------------------------------------------
 * POST - Validate non-secret config shape and return the .env.local / Key
 *        Vault lines the operator must set manually.
 *
 *   THIS ROUTE DOES NOT PERSIST SECRETS.
 *
 *   Secrets (client secret, API keys, webhook URLs) belong in Azure Key Vault
 *   (production) or .env.local (local dev only). Accepting them over HTTP
 *   and writing them to disk or a database would create a new attack surface.
 *   Instead this route validates the non-secret identifiers and returns a
 *   ready-to-copy .env block so the operator can paste it into the right store.
 *
 * Request body:
 *   {
 *     tenantId:        string   - Entra tenant GUID
 *     clientId:        string   - App registration client ID GUID
 *     orgUrls?:        string   - Comma-separated Dataverse org URLs
 *     budgetThreshold?: number  - Alert threshold (USD)
 *     escalationThreshold?: number - Alert threshold (%)
 *   }
 *
 * Response 200:
 *   {
 *     ok: true,
 *     envBlock: string    - .env.local lines the operator should paste
 *   }
 *
 * -------------------------------------------------------------------------
 * GET - Return the per-secret source map (name -> keyvault | env | missing).
 *       Values are NEVER included.
 *
 * Response 200:
 *   { sourceMap: Record<string, 'keyvault' | 'env' | 'missing'> }
 *
 * @server
 */

import { NextResponse } from 'next/server';
import { requireSession, safeError } from '@/lib/auth/guard';
import { getSecretSourceMap } from '@/lib/config/secrets';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_RE = /^[0-9a-zA-Z-]+\.onmicrosoft\.com$/i;

function isValidTenant(s: string): boolean {
  return GUID_RE.test(s) || TENANT_RE.test(s);
}

function isValidGuid(s: string): boolean {
  return GUID_RE.test(s);
}

// ---------------------------------------------------------------------------
// POST body type
// ---------------------------------------------------------------------------

interface SaveBody {
  tenantId: string;
  clientId: string;
  orgUrls?: string;
  budgetThreshold?: number;
  escalationThreshold?: number;
}

function isSaveBody(v: unknown): v is SaveBody {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.tenantId === 'string' && typeof obj.clientId === 'string';
}

// ---------------------------------------------------------------------------
// GET handler - real per-secret source map
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  try {
    const sourceMap = await getSecretSourceMap();
    return NextResponse.json({ sourceMap });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read secret source map: ${safeError(err)}` },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler - validate non-secret config, return .env block
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isSaveBody(body)) {
    return NextResponse.json(
      { error: 'Body must contain tenantId (string) and clientId (string)' },
      { status: 400 },
    );
  }

  const { tenantId, clientId, orgUrls, budgetThreshold, escalationThreshold } = body;

  // Validate non-secret identifiers
  if (!isValidTenant(tenantId)) {
    return NextResponse.json(
      { ok: false, error: 'tenantId must be a GUID or <name>.onmicrosoft.com' },
    );
  }
  if (!isValidGuid(clientId)) {
    return NextResponse.json(
      { ok: false, error: 'clientId must be a GUID (app registration client ID)' },
    );
  }
  if (orgUrls !== undefined && typeof orgUrls !== 'string') {
    return NextResponse.json({ ok: false, error: 'orgUrls must be a string' });
  }
  if (budgetThreshold !== undefined && (typeof budgetThreshold !== 'number' || budgetThreshold < 0)) {
    return NextResponse.json({ ok: false, error: 'budgetThreshold must be a non-negative number' });
  }
  if (escalationThreshold !== undefined && (typeof escalationThreshold !== 'number' || escalationThreshold < 0 || escalationThreshold > 100)) {
    return NextResponse.json({ ok: false, error: 'escalationThreshold must be between 0 and 100' });
  }

  // Build the .env block from non-secret values only.
  // Secrets (AZURE_CLIENT_SECRET, AZURE_OPENAI_API_KEY, etc.) are NOT included
  // here - the operator must set those directly in Key Vault or .env.local.
  const lines: string[] = [
    '# ---- AgentLens non-secret configuration ----',
    '# Paste into .env.local for local dev, or set as App Service env vars / Key Vault',
    '# for production. Do NOT commit this file to source control.',
    '#',
    '# Secrets (AZURE_CLIENT_SECRET, AZURE_OPENAI_API_KEY, SUPABASE_SERVICE_KEY,',
    '# CRON_SECRET, TEAMS_WEBHOOK_URL, AUTH_SECRET, WEBAPP_CLIENT_SECRET) are NOT',
    '# listed here. Set them in Azure Key Vault (prod) or .env.local (dev only).',
    '',
    `AZURE_TENANT_ID=${tenantId}`,
    `AZURE_CLIENT_ID=${clientId}`,
  ];

  if (orgUrls && orgUrls.trim()) {
    lines.push(`AGENTLENS_ORG_URLS=${orgUrls.trim()}`);
  }

  if (budgetThreshold !== undefined) {
    lines.push(`AGENTLENS_BUDGET_THRESHOLD=${budgetThreshold}`);
  }

  if (escalationThreshold !== undefined) {
    lines.push(`AGENTLENS_ESCALATION_THRESHOLD=${escalationThreshold}`);
  }

  lines.push('');
  lines.push('# Required secrets - set these in Key Vault (prod) or .env.local (dev):');
  lines.push('# AZURE_CLIENT_SECRET=<your-service-principal-secret>');
  lines.push('# AZURE_OPENAI_API_KEY=<your-aoai-key>');
  lines.push('# AZURE_OPENAI_ENDPOINT=<https://your-instance.openai.azure.com>');
  lines.push('# AZURE_OPENAI_DEPLOYMENT=<your-deployment-name>');
  lines.push('# SUPABASE_SERVICE_KEY=<your-supabase-key>');
  lines.push('# AUTH_SECRET=<random-32-char-string>');
  lines.push('# NEXTAUTH_URL=<https://agentlens.yourdomain.com>');
  lines.push('# CRON_SECRET=<random-string>');
  lines.push('# TEAMS_WEBHOOK_URL=<optional-teams-webhook>');

  return NextResponse.json({ ok: true, envBlock: lines.join('\n') });
}

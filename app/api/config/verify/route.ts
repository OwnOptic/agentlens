/**
 * POST /api/config/verify
 *
 * Verifies that the supplied tenantId + clientId can obtain an ARM token via
 * the configured service-principal credentials. The route does NOT accept or
 * store secrets - it reads credentials from Key Vault / environment via the
 * existing token service.
 *
 * Response:
 *   200 { ok: true }
 *   200 { ok: false, error: string }   (credential check failed - not a 4xx so the
 *                                       UI can render the message without a catch)
 *   401                                (unauthenticated)
 *   400                                (malformed body)
 *   500                                (unexpected server error)
 *
 * @server
 */

import { NextResponse } from 'next/server';
import { requireSession, safeError } from '@/lib/auth/guard';
import { getToken } from '@/lib/auth/tokenService';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Body shape
// ---------------------------------------------------------------------------

interface VerifyBody {
  tenantId: string;
  clientId: string;
}

function isVerifyBody(v: unknown): v is VerifyBody {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.tenantId === 'string' && typeof obj.clientId === 'string';
}

// Basic GUID / onmicrosoft.com format guard - prevents log-injection
const GUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_RE = /^[0-9a-zA-Z-]+\.onmicrosoft\.com$/i;

function isValidTenant(s: string): boolean {
  return GUID_RE.test(s) || TENANT_RE.test(s);
}

function isValidGuid(s: string): boolean {
  return GUID_RE.test(s);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  // Guard: must be authenticated (or auth-optional dev mode)
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isVerifyBody(body)) {
    return NextResponse.json(
      { error: 'Body must contain tenantId (string) and clientId (string)' },
      { status: 400 },
    );
  }

  const { tenantId, clientId } = body;

  // Basic format validation - reject clearly malformed values early
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

  // Check that the running SP credentials match what the user supplied.
  // We do NOT accept a secret from the browser - credentials live server-side.
  // If the configured AZURE_TENANT_ID / AZURE_CLIENT_ID do not match what the
  // user typed, surface a clear mismatch rather than silently succeeding against
  // the wrong tenant.
  const configuredTenant = process.env.AZURE_TENANT_ID ?? '';
  const configuredClient = process.env.AZURE_CLIENT_ID ?? '';

  if (configuredTenant && tenantId !== configuredTenant) {
    return NextResponse.json({
      ok: false,
      error:
        'The supplied tenantId does not match the server-configured AZURE_TENANT_ID. ' +
        'Update the server environment rather than passing a different tenant here.',
    });
  }

  if (configuredClient && clientId !== configuredClient) {
    return NextResponse.json({
      ok: false,
      error:
        'The supplied clientId does not match the server-configured AZURE_CLIENT_ID. ' +
        'Update the server environment rather than passing a different client ID here.',
    });
  }

  // If neither is configured yet, we can still try - the token service will
  // return null and we surface a clear "not configured" message.
  if (!configuredTenant || !configuredClient) {
    return NextResponse.json({
      ok: false,
      error:
        'AZURE_TENANT_ID and AZURE_CLIENT_ID are not yet set on the server. ' +
        'Add them to .env.local (dev) or Key Vault (prod), then restart the server.',
    });
  }

  // Attempt ARM token acquisition via the server-side SP credentials
  try {
    const token = await getToken('https://management.azure.com/.default');
    if (!token) {
      return NextResponse.json({
        ok: false,
        error:
          'Could not acquire an ARM token. Check that AZURE_CLIENT_SECRET is set ' +
          'and the service principal has not expired.',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: safeError(err) });
  }
}

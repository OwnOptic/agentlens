import { NextResponse } from 'next/server';
import { discoverAllAgents } from '@/lib/connectors/discovery';
import { requireSession, safeError } from '@/lib/auth/guard';

/** GET /api/discover - sweep all 4 agent stores and return a unified inventory. */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  try {
    const result = await discoverAllAgents();
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: safeError(e) },
      { status: 502 },
    );
  }
}

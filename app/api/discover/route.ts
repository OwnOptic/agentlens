import { NextResponse } from 'next/server';
import { discoverAllAgents } from '@/lib/connectors/discovery';

/** GET /api/discover - sweep all 4 agent stores and return a unified inventory. */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await discoverAllAgents();
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

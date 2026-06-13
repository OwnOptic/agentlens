import { NextResponse } from 'next/server';
import type { Agent } from '@/lib/types';
import { mockAgents } from '@/lib/mock/seed';
import { requireSession } from '@/lib/auth/guard';

/**
 * GET /api/agents
 * Returns a list of all Copilot Studio agents across all environments.
 * Currently serves mock data; integrate with Supabase as needed.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  try {
    // TODO: Query Supabase for agents
    // const { data, error } = await supabase
    //   .from('agents')
    //   .select('*')
    //   .eq('kind', 'copilot_studio');
    // if (error) throw error;
    // return NextResponse.json(data);

    return NextResponse.json<{ agents: Agent[]; dataSource: 'mock' }>({
      agents: mockAgents,
      dataSource: 'mock',
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

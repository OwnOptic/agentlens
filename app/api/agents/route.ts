import { NextResponse } from 'next/server';
import type { Agent } from '@/lib/types';
import { mockAgents } from '@/lib/mock/seed';

/**
 * GET /api/agents
 * Returns a list of all Copilot Studio agents across all environments.
 * Currently serves mock data; integrate with Supabase as needed.
 */
export async function GET() {
  try {
    // TODO: Query Supabase for agents
    // const { data, error } = await supabase
    //   .from('agents')
    //   .select('*')
    //   .eq('kind', 'copilot_studio');
    // if (error) throw error;
    // return NextResponse.json(data);

    return NextResponse.json<Agent[]>(mockAgents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

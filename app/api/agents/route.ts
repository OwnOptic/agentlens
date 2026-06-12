import { NextResponse } from 'next/server';
import type { Agent } from '@/lib/types';

/**
 * GET /api/agents
 * Returns a list of all Copilot Studio agents across all environments.
 * TODO: Integrate with Supabase to fetch real agent data.
 */
export async function GET(): Promise<NextResponse<Agent[] | { error: string }>> {
  try {
    // TODO: Query Supabase for agents
    // const { data, error } = await supabase
    //   .from('agents')
    //   .select('*')
    //   .eq('kind', 'copilot_studio');

    const agents: Agent[] = [];

    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

/**
 * AgentLens MCP server.
 *
 * Exposes five read-only governance tools to the AgentLens declarative agent.
 *
 * Transports:
 *   http  (default)  - required by Microsoft 365 Copilot. Streamable HTTP at /mcp.
 *   stdio            - local testing only, e.g. with MCP Inspector.
 *
 * Run:
 *   npm run dev                       # http on :3000
 *   MCP_TRANSPORT=stdio npm run dev   # stdio
 */

import express, { type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { config, authEnabled, readerConfigured } from './lib/config.js';
import { validateBearer, AuthError } from './lib/auth.js';

import { sweepInventoryTool } from './tools/sweep-inventory.js';
import { dlpPostureTool } from './tools/dlp-posture.js';
import { valueAndCostTool } from './tools/value-and-cost.js';
import { consolidationPlanTool } from './tools/consolidation-plan.js';
import { agentMapTool } from './tools/agent-map.js';

const TOOLS = [
  sweepInventoryTool,
  dlpPostureTool,
  valueAndCostTool,
  consolidationPlanTool,
  agentMapTool,
];

function buildServer(): McpServer {
  const server = new McpServer({ name: 'agentlens', version: '0.1.0' });

  for (const tool of TOOLS) {
    // The SDK's registerTool signature: (name, config, handler)
    server.registerTool(tool.name, tool.config as never, tool.handler as never);
  }

  return server;
}

function logStartupPosture(): void {
  console.log('AgentLens MCP server');
  console.log(`  tools            : ${TOOLS.map((t) => t.name).join(', ')}`);
  console.log(`  inbound auth     : ${authEnabled() ? `Entra SSO (audience ${config.auth.audience})` : 'DISABLED - development only, do not expose publicly'}`);
  console.log(`  reader SP        : ${readerConfigured() ? 'configured' : 'NOT configured - every tool will report not_connected'}`);
  console.log(`  dataverse envs   : ${config.dataverseOrgUrls.length || 'none'}`);
  console.log(`  subscription     : ${config.reader.subscriptionId ?? 'not set - cost unavailable'}`);
  if (!readerConfigured()) {
    console.log('');
    console.log('  Tools will return status "not_connected" with remediation text.');
    console.log('  That is intentional: AgentLens never fabricates data.');
  }
}

async function startStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AgentLens MCP listening on stdio');
}

async function startHttp(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Liveness probe. Never leaks configuration values, only whether they are set.
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      authEnabled: authEnabled(),
      readerConfigured: readerConfigured(),
      tools: TOOLS.map((t) => t.name),
    });
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      await validateBearer(req.header('authorization'));
    } catch (err) {
      if (err instanceof AuthError) {
        // 401 makes Copilot prompt the user to sign in.
        res.status(401).json({ error: 'unauthorized', detail: err.message });
        return;
      }
      throw err;
    }

    // Stateless: a fresh server + transport per request. Simplest correct model
    // for a read-only tool server behind a load balancer.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(config.port, () => {
    logStartupPosture();
    console.log(`  listening        : http://localhost:${config.port}/mcp`);
  });
}

async function main(): Promise<void> {
  if (config.transport === 'stdio') {
    await startStdio();
    return;
  }
  await startHttp();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

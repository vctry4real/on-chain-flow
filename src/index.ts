import 'dotenv/config';
import { randomUUID, createHmac } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createContextMiddleware } from '@ctxprotocol/sdk';
import { connectRedis } from './cache/client.js';
import { registerAllTools } from './tools/index.js';
import { startAccumulationScanner } from './ingest/accumulation-scanner.js';
import { startBridgeMonitor } from './ingest/bridge-monitor.js';
import { startProvenanceScanner } from './ingest/provenance-scanner.js';
import { processStreamPayload, type StreamPayload } from './ingest/event-processor.js';
import { runGraphBackfill } from './ingest/graph-backfill.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'onchain-flow-mcp',
    version: '1.0.0',
  });
  registerAllTools(server);
  return server;
}

async function main(): Promise<void> {
  await connectRedis();

  if (process.env['NODE_ENV'] !== 'test') {
    startAccumulationScanner();
    startBridgeMonitor();
    startProvenanceScanner();
    // Fire-and-forget: pre-populate Redis with historical Uniswap V3 swap data
    runGraphBackfill('ethereum').catch((err) =>
      console.error('[graph-backfill] Failed:', err),
    );
  }

  const app = express();

  // Health check — used by Context Protocol validator and container probes
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      server: 'onchain-flow-mcp',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // QuickNode Streams webhook — raw body required for HMAC signature verification
  app.post('/ingest/streams', express.raw({ type: '*/*', limit: '10mb' }), async (req: Request, res: Response) => {
    const secret = process.env['QUICKNODE_STREAM_SECRET'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    if (secret) {
      const sig = req.headers['x-qn-signature'] as string | undefined;
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      if (!sig || sig !== expected) {
        res.status(401).json({ error: 'invalid signature' });
        return;
      }
    }

    try {
      const chain = (req.headers['x-qn-chain'] as string | undefined) ?? 'ethereum';
      const bodyStr = rawBody.toString().trim();
      const payload = bodyStr ? JSON.parse(bodyStr) as StreamPayload : { data: [] };
      const stored = await processStreamPayload(payload, chain);
      console.log(`[streams] chain=${chain} processed ${payload.data?.length ?? 0} logs, stored ${stored} events`);
      res.status(200).json({ received: payload.data?.length ?? 0, stored });
    } catch {
      res.status(200).json({ received: 0, stored: 0 });
    }
  });

  // Apply JSON parsing only to MCP routes
  app.use('/mcp', express.json());

  // Context Protocol auth middleware — verifies JWTs for paid tool calls.
  // Set CTX_AUTH_ENABLED=true in production (after marketplace submission).
  // Leave unset during development and pre-submission testing.
  if (process.env['CTX_AUTH_ENABLED'] === 'true') {
    app.use('/mcp', createContextMiddleware());
  }

  // Session store — maps session ID → live {transport, server} pair so that
  // initialize + tools/list + tools/call work across separate HTTP requests.
  type Session = { transport: StreamableHTTPServerTransport; server: McpServer; lastUsed: number };
  const sessions = new Map<string, Session>();

  // Evict sessions idle for more than 30 minutes
  setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, s] of sessions) {
      if (s.lastUsed < cutoff) {
        s.transport.close().catch(() => undefined);
        s.server.close().catch(() => undefined);
        sessions.delete(id);
      }
    }
  }, 5 * 60 * 1000).unref();

  // StreamableHTTP transport with session persistence
  app.post('/mcp', async (req, res) => {
    const incomingId = req.headers['mcp-session-id'] as string | undefined;

    // Resume an existing initialized session
    if (incomingId && sessions.has(incomingId)) {
      const session = sessions.get(incomingId)!;
      session.lastUsed = Date.now();
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — pre-generate the ID so we can store it before handleRequest fires
    const sessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });
    const server = createMcpServer();
    sessions.set(sessionId, { transport, server, lastUsed: Date.now() });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      sessions.delete(sessionId);
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
      throw err;
    }
  });

  // GET /mcp — return server capabilities without authentication
  app.get('/mcp', async (req, res) => {
    const sessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[onchain-flow-mcp] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[onchain-flow-mcp] MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`[onchain-flow-mcp] Health:       http://localhost:${PORT}/health`);
  });
}

main().catch((err) => {
  console.error('[onchain-flow-mcp] Fatal startup error:', err);
  process.exit(1);
});

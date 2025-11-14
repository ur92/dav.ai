import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import * as dotenv from 'dotenv';
import { BrowserTools } from '@dav-ai/core/dist/tools/browser-tools.js';
import { Neo4jTools } from '@dav-ai/core/dist/tools/neo4j-tools.js';
import { DavAgent } from '@dav-ai/core/dist/agent/dav-agent.js';
import type { DavAgentState } from '@dav-ai/core/dist/types/state.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(cors());
app.use(express.json());

// Store active agent sessions
const activeSessions = new Map<string, {
  agent: DavAgent;
  browserTools: BrowserTools;
  neo4jTools: Neo4jTools;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentState?: any;
}>();

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data.type);

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({ type: 'error', message: String(error) }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Broadcast to all connected clients
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(data));
    }
  });
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get configuration
app.get('/api/config', (req, res) => {
  res.json({
    llmProvider: process.env.LLM_PROVIDER || 'openai',
    neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    maxIterations: parseInt(process.env.MAX_ITERATIONS || '20', 10),
  });
});

// Start exploration
app.post('/api/explore', async (req, res) => {
  const { url, maxIterations } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const sessionId = `session-${Date.now()}`;

  try {
    // Initialize tools
    const browserTools = new BrowserTools();
    const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const neo4jUser = process.env.NEO4J_USER || 'neo4j';
    const neo4jPassword = process.env.NEO4J_PASSWORD || 'password';
    const neo4jTools = new Neo4jTools(neo4jUri, neo4jUser, neo4jPassword);

    // Initialize browser
    await browserTools.initialize();

    // Verify Neo4j connection
    const neo4jConnected = await neo4jTools.verifyConnectivity();
    if (!neo4jConnected) {
      throw new Error('Failed to connect to Neo4j database.');
    }

    // Get LLM configuration
    const llmProvider = (process.env.LLM_PROVIDER || 'openai').toLowerCase() as 'openai' | 'anthropic';
    const apiKey = llmProvider === 'anthropic' 
      ? (process.env.ANTHROPIC_API_KEY || '')
      : (process.env.OPENAI_API_KEY || '');
    const llmModel = process.env.LLM_MODEL || (llmProvider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o');

    if (!apiKey) {
      throw new Error(`API key for ${llmProvider} is required`);
    }

    // Create agent
    const agent = new DavAgent(browserTools, neo4jTools, apiKey, llmProvider, llmModel);

    // Store session
    activeSessions.set(sessionId, {
      agent,
      browserTools,
      neo4jTools,
      status: 'running',
    });

    // Start exploration in background
    const iterations = maxIterations || parseInt(process.env.MAX_ITERATIONS || '20', 10);
    
    agent.run(url, iterations)
      .then((finalState: DavAgentState) => {
        const session = activeSessions.get(sessionId);
        if (session) {
          session.status = 'completed';
          session.currentState = finalState;
        }
        broadcast({
          type: 'exploration_complete',
          sessionId,
          state: finalState,
        });
      })
      .catch((error: Error) => {
        const session = activeSessions.get(sessionId);
        if (session) {
          session.status = 'error';
        }
        broadcast({
          type: 'exploration_error',
          sessionId,
          error: error.message,
        });
      });

    res.json({
      sessionId,
      status: 'started',
      url,
      message: 'Exploration started',
    });
  } catch (error) {
    console.error('Error starting exploration:', error);
    res.status(500).json({
      error: 'Failed to start exploration',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get session status
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId,
    status: session.status,
    currentState: session.currentState,
  });
});

// Stop exploration
app.post('/api/session/:sessionId/stop', async (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    await session.browserTools.close();
    await session.neo4jTools.close();
    activeSessions.delete(sessionId);

    res.json({ message: 'Session stopped and cleaned up' });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stop session',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// List all sessions
app.get('/api/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
    sessionId: id,
    status: session.status,
    hasState: !!session.currentState,
  }));

  res.json({ sessions });
});

// Query Neo4j graph
app.get('/api/graph', async (req, res) => {
  try {
    const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const neo4jUser = process.env.NEO4J_USER || 'neo4j';
    const neo4jPassword = process.env.NEO4J_PASSWORD || 'password';
    const neo4jTools = new Neo4jTools(neo4jUri, neo4jUser, neo4jPassword);

    // Access the private driver property - we'll need to add a getter or make it public
    const driver = (neo4jTools as any).driver;
    const session = driver.session();
    const result = await session.run(`
      MATCH (n:State)
      OPTIONAL MATCH (n)-[r:TRANSITIONED_BY]->(m:State)
      RETURN n, r, m
      LIMIT 100
    `);

    const nodes = new Map();
    const edges: any[] = [];

    result.records.forEach((record: any) => {
      const node = record.get('n');
      const rel = record.get('r');
      const target = record.get('m');

      if (node) {
        nodes.set(node.properties.url, {
          id: node.properties.url,
          label: node.properties.url,
          url: node.properties.url,
          fingerprint: node.properties.fingerprint,
        });
      }

      if (target) {
        nodes.set(target.properties.url, {
          id: target.properties.url,
          label: target.properties.url,
          url: target.properties.url,
          fingerprint: target.properties.fingerprint,
        });
      }

      if (rel && node && target) {
        edges.push({
          source: node.properties.url,
          target: target.properties.url,
          label: rel.properties.action,
          selector: rel.properties.selector,
        });
      }
    });

    await session.close();
    await neo4jTools.close();

    res.json({
      nodes: Array.from(nodes.values()),
      edges,
    });
  } catch (error) {
    console.error('Error querying graph:', error);
    res.status(500).json({
      error: 'Failed to query graph',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 BFF Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}/ws`);
});


import { Router } from 'express';
import { SessionService } from '@dav-ai/core/dist/services/session-service.js';
import { GraphService } from '@dav-ai/core/dist/services/graph-service.js';
import { ConfigService } from '@dav-ai/core/dist/services/config-service.js';
import type { DavAgentState } from '@dav-ai/core/dist/types/state.js';
import { logger } from '../utils/logger.js';

// Broadcast function will be set by the main server
export let broadcast: ((data: any) => void) | null = null;

export function setBroadcastFunction(fn: (data: any) => void) {
  broadcast = fn;
}

const router = Router();

// Health check
router.get('/health', (req, res) => {
  logger.info('API', 'Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get configuration
router.get('/config', (req, res) => {
  logger.info('API', 'Configuration requested');
  try {
    const config = ConfigService.getConfig();
    // Return only safe configuration (exclude sensitive data like API keys)
    const safeConfig = {
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      neo4jUri: config.neo4jUri,
      maxIterations: config.maxIterations,
      startingUrl: config.startingUrl,
    };
    logger.info('API', 'Configuration retrieved', safeConfig);
    res.json(safeConfig);
  } catch (error) {
    logger.error('API', 'Error retrieving configuration', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to retrieve configuration',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Start exploration
router.post('/explore', async (req, res) => {
  const { url, maxIterations } = req.body;
  logger.info('API', 'Exploration request', { url, maxIterations });

  if (!url) {
    logger.error('API', 'Exploration failed: URL is required');
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const iterations = maxIterations || ConfigService.getConfig().maxIterations;
    logger.info('API', 'Creating new session', { url, iterations });
    
    // Create session via SessionService (all logic in core)
    const session = await SessionService.createSession(url, iterations);
    
    logger.info('API', 'Session created', { sessionId: session.sessionId });

    // Set up WebSocket notifications
    session.runPromise
      .then((finalState: DavAgentState) => {
        logger.info('API', 'Exploration completed', {
          sessionId: session.sessionId,
          status: finalState.explorationStatus,
          finalUrl: finalState.currentUrl,
          actionCount: finalState.actionHistory.length,
        });
        if (broadcast) {
          broadcast({
            type: 'exploration_complete',
            sessionId: session.sessionId,
            state: finalState,
          });
        }
      })
      .catch((error: Error) => {
        logger.error('API', 'Exploration failed', {
          sessionId: session.sessionId,
          error: error.message,
          stack: error.stack,
        });
        if (broadcast) {
          broadcast({
            type: 'exploration_error',
            sessionId: session.sessionId,
            error: error.message,
          });
        }
      });

    logger.info('API', 'Exploration started successfully', { sessionId: session.sessionId });
    res.json({
      sessionId: session.sessionId,
      status: 'started',
      url,
      message: 'Exploration started',
    });
  } catch (error) {
    logger.error('API', 'Error starting exploration', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      error: 'Failed to start exploration',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get session status
router.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  logger.info('API', 'Session status requested', { sessionId });

  try {
    const session = SessionService.getSession(sessionId);

    if (!session) {
      logger.warn('API', 'Session not found', { sessionId });
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.info('API', 'Session status', {
      sessionId,
      status: session.status,
      hasState: !!session.currentState,
    });
    res.json({
      sessionId,
      status: session.status,
      currentState: session.currentState,
    });
  } catch (error) {
    logger.error('API', 'Error retrieving session', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to retrieve session',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Stop exploration
router.post('/session/:sessionId/stop', async (req, res) => {
  const { sessionId } = req.params;
  logger.info('API', 'Stop session requested', { sessionId });

  try {
    await SessionService.stopSession(sessionId);
    logger.info('API', 'Session stopped and cleaned up', { sessionId });
    res.json({ message: 'Session stopped and cleaned up' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      logger.warn('API', 'Session not found for stop', { sessionId });
      return res.status(404).json({ error: 'Session not found' });
    }

    logger.error('API', 'Error stopping session', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      error: 'Failed to stop session',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// List all sessions
router.get('/sessions', (req, res) => {
  logger.info('API', 'List sessions requested');
  try {
    const sessions = SessionService.getAllSessionSummaries();
    logger.info('API', 'Active sessions', { count: sessions.length });
    res.json({ sessions });
  } catch (error) {
    logger.error('API', 'Error listing sessions', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to list sessions',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Query Neo4j graph
router.get('/graph', async (req, res) => {
  logger.info('API', 'Graph query requested');
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const graphData = await GraphService.queryGraph(limit);
    logger.info('API', 'Graph query result', {
      nodeCount: graphData.nodes.length,
      edgeCount: graphData.edges.length,
    });
    res.json(graphData);
  } catch (error) {
    logger.error('API', 'Error querying graph', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      error: 'Failed to query graph',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;


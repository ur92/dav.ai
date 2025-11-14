import { Router } from 'express';
import { logger } from '../utils/logger.js';

// Core service URL - can be configured via environment variable
const CORE_SERVICE_URL = process.env.CORE_SERVICE_URL || 'http://localhost:3002';

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
router.get('/config', async (req, res) => {
  logger.info('API', 'Configuration requested');
  try {
    const response = await fetch(`${CORE_SERVICE_URL}/config`);
    if (!response.ok) {
      throw new Error(`Core service returned ${response.status}`);
    }
    const config = await response.json();
    logger.info('API', 'Configuration retrieved', config);
    res.json(config);
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
  const { url, maxIterations, credentials } = req.body;
  logger.info('API', 'Exploration request', { 
    url, 
    maxIterations, 
    hasCredentials: !!(credentials?.username || credentials?.password) 
  });

  if (!url) {
    logger.error('API', 'Exploration failed: URL is required');
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    logger.info('API', 'Calling core service to start exploration', { url, maxIterations });
    
    const response = await fetch(`${CORE_SERVICE_URL}/explore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, maxIterations, credentials }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.message || `Core service returned ${response.status}`);
    }

    const result = await response.json();
    logger.info('API', 'Exploration started successfully', { sessionId: result.sessionId });

    // Set up polling for completion (or use WebSocket from core service in future)
    // For now, we'll rely on the client polling /session/:id

    res.json(result);
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
router.get('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  logger.info('API', 'Session status requested', { sessionId });

  try {
    const response = await fetch(`${CORE_SERVICE_URL}/session/${sessionId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('API', 'Session not found', { sessionId });
        return res.status(404).json({ error: 'Session not found' });
      }
      throw new Error(`Core service returned ${response.status}`);
    }

    const session = await response.json();
    logger.info('API', 'Session status', {
      sessionId,
      status: session.status,
      hasState: !!session.currentState,
    });
    res.json(session);
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
    const response = await fetch(`${CORE_SERVICE_URL}/session/${sessionId}/stop`, {
      method: 'POST',
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('API', 'Session not found for stop', { sessionId });
        return res.status(404).json({ error: 'Session not found' });
      }
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.message || `Core service returned ${response.status}`);
    }

    const result = await response.json();
    logger.info('API', 'Session stopped and cleaned up', { sessionId });
    res.json(result);
  } catch (error) {
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
router.get('/sessions', async (req, res) => {
  logger.info('API', 'List sessions requested');
  try {
    const response = await fetch(`${CORE_SERVICE_URL}/sessions`);
    if (!response.ok) {
      throw new Error(`Core service returned ${response.status}`);
    }
    const data = await response.json();
    logger.info('API', 'Active sessions', { count: data.sessions?.length || 0 });
    res.json(data);
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

// Query Neo4j graph, optionally filtered by sessionId
router.get('/graph', async (req, res) => {
  logger.info('API', 'Graph query requested', { sessionId: req.query.sessionId });
  try {
    const limitParam = req.query.limit;
    const limit = limitParam ? Math.floor(Number(limitParam)) || 100 : 100;
    const url = new URL(`${CORE_SERVICE_URL}/graph`);
    url.searchParams.set('limit', limit.toString());
    
    // Add sessionId if provided
    if (req.query.sessionId) {
      url.searchParams.set('sessionId', req.query.sessionId as string);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Core service returned ${response.status}`);
    }

    const graphData = await response.json();
    logger.info('API', 'Graph query result', {
      nodeCount: graphData.nodes?.length || 0,
      edgeCount: graphData.edges?.length || 0,
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


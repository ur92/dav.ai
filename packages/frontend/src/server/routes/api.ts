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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get configuration
router.get('/config', async (req, res) => {
  try {
    const response = await fetch(`${CORE_SERVICE_URL}/config`);
    if (!response.ok) {
      throw new Error(`Core service returned ${response.status}`);
    }
    const config = await response.json();
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

// Get credentials from config
router.get('/credentials', async (req, res) => {
  try {
    const response = await fetch(`${CORE_SERVICE_URL}/credentials`);
    if (!response.ok) {
      throw new Error(`Core service returned ${response.status}`);
    }
    const credentials = await response.json();
    res.json(credentials);
  } catch (error) {
    logger.error('API', 'Error retrieving credentials', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to retrieve credentials',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Start exploration
router.post('/explore', async (req, res) => {
  const { url, credentials } = req.body;

  if (!url) {
    logger.error('API', 'Exploration failed: URL is required');
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await fetch(`${CORE_SERVICE_URL}/explore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, credentials }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.message || `Core service returned ${response.status}`);
    }

    const result = await response.json();

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

  try {
    const response = await fetch(`${CORE_SERVICE_URL}/session/${sessionId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Session not found' });
      }
      throw new Error(`Core service returned ${response.status}`);
    }

    const session = await response.json();
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

  try {
    const response = await fetch(`${CORE_SERVICE_URL}/session/${sessionId}/stop`, {
      method: 'POST',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Session not found' });
      }
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.message || `Core service returned ${response.status}`);
    }

    const result = await response.json();
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
  try {
    const response = await fetch(`${CORE_SERVICE_URL}/sessions`);
    if (!response.ok) {
      throw new Error(`Core service returned ${response.status}`);
    }
    const data = await response.json();
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

// Start retry for a user story
router.post('/retry', async (req, res) => {
  const { sessionId, storyIndex, credentials } = req.body;

  if (!sessionId || storyIndex === undefined) {
    return res.status(400).json({ error: 'sessionId and storyIndex are required' });
  }

  try {
    const response = await fetch(`${CORE_SERVICE_URL}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, storyIndex, credentials }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.message || `Core service returned ${response.status}`);
    }

    const result = await response.json();
    res.json(result);
  } catch (error) {
    logger.error('API', 'Error starting retry', {
      sessionId,
      storyIndex,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      error: 'Failed to start retry',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get retry status
router.get('/retry/:retryId', async (req, res) => {
  const { retryId } = req.params;

  try {
    const response = await fetch(`${CORE_SERVICE_URL}/retry/${retryId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Retry session not found' });
      }
      throw new Error(`Core service returned ${response.status}`);
    }

    const retrySession = await response.json();
    res.json(retrySession);
  } catch (error) {
    logger.error('API', 'Error getting retry status', {
      retryId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to get retry status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get all retries for a session
router.get('/session/:sessionId/retries', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const response = await fetch(`${CORE_SERVICE_URL}/session/${sessionId}/retries`);
    
    if (!response.ok) {
      throw new Error(`Core service returned ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('API', 'Error getting retries for session', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to get retries',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;


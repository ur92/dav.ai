import express from 'express';
import cors from 'cors';
import { main } from './index.js';
import { SessionService } from './services/session-service.js';
import { GraphService } from './services/graph-service.js';
import { ConfigService } from './services/config-service.js';
import { UserStoryService } from './services/user-story-service.js';
import { RetryService } from './services/retry-service.js';
import type { DavAgentState } from './types/state.js';
import { logger } from './utils/logger.js';
import type { LogEntry } from './utils/logger.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from root .env file
// Try multiple possible paths to find the .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const possiblePaths = [
  join(process.cwd(), '.env'), // From project root (when running yarn dev)
  join(__dirname, '../../../.env'), // From packages/core/src to root
  join(__dirname, '../../.env'), // From packages/core/dist to root (if compiled)
];

let envLoaded = false;
for (const envPath of possiblePaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('Warning: Could not load .env file from any of the expected locations:', possiblePaths);
}

// Initialize ConfigService
ConfigService.initialize();

// Initialize logger with configured log level
const config = ConfigService.getConfig();
logger.initialize(config.logLevel);

// Initialize session persistence and load sessions from Neo4j
SessionService.initializePersistence();
SessionService.loadSessionsFromPersistence().catch((error) => {
  logger.error('Server', 'Failed to load sessions from persistence', {
    error: error instanceof Error ? error.message : String(error),
  });
});

// WebSocket broadcast function (will be set by frontend when available)
let broadcastToClients: ((data: any) => void) | null = null;

// Set up retry step update callback for WebSocket broadcasting
RetryService.setStepUpdateCallback((retryId, step) => {
  if (broadcastToClients) {
    broadcastToClients({
      type: 'retry_step_update',
      retryId,
      step,
    });
  }
});

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'core', timestamp: new Date().toISOString() });
});

// Get configuration (safe, no sensitive data)
app.get('/config', (req, res) => {
  try {
    const config = ConfigService.getConfig();
    const safeConfig = {
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      neo4jUri: config.neo4jUri,
      maxIterations: config.maxIterations,
      startingUrl: config.startingUrl,
      headless: config.headless,
      logLevel: config.logLevel,
    };
    res.json(safeConfig);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve configuration',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get credentials from config (if available)
app.get('/credentials', (req, res) => {
  try {
    const credentials = ConfigService.getCredentials();
    // Return credentials if they exist, otherwise return empty object
    res.json(credentials || {});
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve credentials',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Start exploration
app.post('/explore', async (req, res) => {
  const { url, maxIterations, credentials } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Use provided maxIterations if it's a valid number, otherwise use config
    const iterations = (maxIterations && typeof maxIterations === 'number' && maxIterations > 0) 
      ? maxIterations 
      : ConfigService.getConfig().maxIterations;
    
    // Use provided credentials or fall back to config credentials
    const finalCredentials = credentials ?? ConfigService.getCredentials();
    
    logger.info('Server', 'Using iterations', { 
      provided: maxIterations, 
      final: iterations,
      fromConfig: ConfigService.getConfig().maxIterations 
    });
    logger.info('Server', 'Using credentials', {
      provided: !!credentials,
      fromConfig: !!ConfigService.getCredentials(),
      hasCredentials: !!(finalCredentials?.username || finalCredentials?.password)
    });
    
    // Generate sessionId before starting exploration
    const sessionId = `session-${Date.now()}`;
    
    // Call main() with autoCleanup=false so we can manage the session
    const explorationResult = await main(url, iterations, false, sessionId, finalCredentials);
    
    // Register session from the exploration result
    const session = SessionService.registerSession({
      sessionId,
      browserTools: explorationResult.browserTools,
      neo4jTools: explorationResult.neo4jTools,
      agent: explorationResult.agent,
      runPromise: explorationResult.runPromise,
      url,
      maxIterations: iterations,
    });

    // Set up completion/error handlers
    session.runPromise
      .then(async (finalState: DavAgentState) => {
        logger.info('Server', 'Exploration completed', {
          sessionId: session.sessionId,
          status: finalState.explorationStatus,
          finalUrl: finalState.currentUrl,
          actionCount: finalState.actionHistory.length,
        }, session.sessionId);

        // Generate user stories from the exploration graph
        try {
          logger.info('Server', 'Generating user stories from exploration graph...', { sessionId: session.sessionId }, session.sessionId);
          
          const userStoryService = new UserStoryService();
          
          // Set up token tracking for user story generation
          userStoryService.setTokenUsageCallback((inputTokens: number, outputTokens: number) => {
            if (session.tokenUsage) {
              session.tokenUsage.userStories.inputTokens += inputTokens;
              session.tokenUsage.userStories.outputTokens += outputTokens;
              session.tokenUsage.total.inputTokens += inputTokens;
              session.tokenUsage.total.outputTokens += outputTokens;
              // Update session metadata in Neo4j
              SessionService.updateSessionMetadata(session.sessionId, {
                tokenUsage: session.tokenUsage,
              }).catch((error) => {
                logger.error('Server', 'Failed to update token usage', {
                  sessionId: session.sessionId,
                  error: error instanceof Error ? error.message : String(error),
                }, session.sessionId);
              });
            }
          });
          
          const userStories = await userStoryService.generateUserStories(session.sessionId);
          
          // Save updated token usage after user story generation
          if (session.tokenUsage) {
            await SessionService.updateSessionMetadata(session.sessionId, {
              tokenUsage: session.tokenUsage,
            });
          }
          
          // Store user stories in session for retrieval
          (session as any).userStories = userStories;
          
          // Persist user stories to Neo4j
          try {
            await session.neo4jTools.saveUserStories(session.sessionId, userStories);
            logger.info('Server', 'User stories persisted to Neo4j', {
              sessionId: session.sessionId,
            }, session.sessionId);
          } catch (error) {
            logger.error('Server', 'Failed to persist user stories to Neo4j', {
              sessionId: session.sessionId,
              error: error instanceof Error ? error.message : String(error),
            }, session.sessionId);
            // Don't fail if persistence fails, user stories are still in memory
          }
          
          logger.info('Server', 'User stories generated successfully', {
            sessionId: session.sessionId,
            storyCount: userStories.stories.length,
          }, session.sessionId);
        } catch (error) {
          logger.error('Server', 'Failed to generate user stories', {
            sessionId: session.sessionId,
            error: error instanceof Error ? error.message : String(error),
          }, session.sessionId);
          // Don't fail the session if user story generation fails
        }

        // Session status will be updated by SessionService
      })
      .catch((error: Error) => {
        logger.error('Server', 'Exploration failed', {
          sessionId: session.sessionId,
          error: error.message,
          stack: error.stack,
        }, session.sessionId);
        // Store error in session for debugging
        (session as any).error = {
          message: error.message,
          stack: error.stack,
        };
        // Session status will be updated by SessionService
      });

    res.json({
      sessionId: session.sessionId,
      status: 'started',
      url,
      message: 'Exploration started',
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start exploration',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get session status
app.get('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    // First, try to get session from memory
    let session = SessionService.getSession(sessionId);

    if (!session) {
      // Session not in memory, try to load from Neo4j
      try {
        const tools = SessionService.getPersistenceTools();
        const metadata = await tools.loadSessionMetadata(sessionId);
        
        if (!metadata) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Return session metadata from Neo4j
        // Note: For persisted sessions, we don't have currentState or logs
        // These are only available for in-memory sessions
        const response: any = {
          sessionId: metadata.sessionId,
          status: metadata.status,
          currentState: undefined,
          logs: [], // Logs are only available for in-memory sessions
          tokenUsage: metadata.tokenUsage,
        };
        
        if (metadata.error) {
          response.error = metadata.error;
        }
        
        // Load user stories from Neo4j if they exist
        try {
          const userStories = await tools.loadUserStories(sessionId);
          if (userStories) {
            response.userStories = userStories;
          }
        } catch (error) {
          // If loading fails, just continue without user stories
          logger.warn('Server', 'Failed to load user stories from Neo4j', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        
        return res.json(response);
      } catch (error) {
        logger.error('Server', 'Error loading session from Neo4j', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        return res.status(404).json({ error: 'Session not found' });
      }
    }

    // Get logs from logger for this session
    const logs = logger.getSessionLogs(sessionId);
    
    // Session is in memory, return full data
    const response: any = {
      sessionId,
      status: session.status,
      currentState: session.currentState,
      logs: logs, // Include CORE logs
      tokenUsage: session.tokenUsage, // Include token usage
    };
    
    // Include error details if available
    if ((session as any).error) {
      response.error = (session as any).error;
    }
    
    // Include user stories if available
    if ((session as any).userStories) {
      response.userStories = (session as any).userStories;
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve session',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Stop exploration
app.post('/session/:sessionId/stop', async (req, res) => {
  const { sessionId } = req.params;

  try {
    await SessionService.stopSession(sessionId);
    res.json({ message: 'Session stopped and cleaned up' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.status(500).json({
      error: 'Failed to stop session',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// List all sessions
app.get('/sessions', async (req, res) => {
  try {
    const sessions = await SessionService.getAllSessionSummaries();
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list sessions',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Query Neo4j graph
app.get('/graph', async (req, res) => {
  try {
    // Ensure limit is an integer - handle string, number, or undefined
    const limitParam = req.query.limit;
    let limit = 100;
    if (limitParam) {
      const num = typeof limitParam === 'string' ? parseInt(limitParam, 10) : Number(limitParam);
      limit = Math.floor(num) || 100;
    }
    const sessionId = req.query.sessionId as string | undefined;
    const graphData = await GraphService.queryGraph(limit, sessionId);
    res.json(graphData);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to query graph',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Start retry for a user story
app.post('/retry', async (req, res) => {
  const { sessionId, storyIndex, credentials } = req.body;

  if (!sessionId || storyIndex === undefined) {
    return res.status(400).json({ error: 'sessionId and storyIndex are required' });
  }

  try {
    // Get session to retrieve user stories
    const session = SessionService.getSession(sessionId);
    
    if (!session) {
      // Try loading from persistence
      const tools = SessionService.getPersistenceTools();
      const metadata = await tools.loadSessionMetadata(sessionId);
      
      if (!metadata) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Load user stories
      const userStories = await tools.loadUserStories(sessionId);
      
      if (!userStories || !userStories.stories || !userStories.stories[storyIndex]) {
        return res.status(404).json({ error: 'User story not found' });
      }
      
      const story = userStories.stories[storyIndex];
      
      // Use provided credentials or fall back to config credentials
      const finalCredentials = credentials ?? ConfigService.getCredentials();
      
      const retryId = await RetryService.startRetry(sessionId, story, storyIndex, finalCredentials);
      
      res.json({
        retryId,
        status: 'started',
        message: 'Retry started',
      });
    } else {
      // Session in memory
      const userStories = (session as any).userStories;
      
      if (!userStories || !userStories.stories || !userStories.stories[storyIndex]) {
        return res.status(404).json({ error: 'User story not found' });
      }
      
      const story = userStories.stories[storyIndex];
      
      // Use provided credentials or fall back to config credentials
      const finalCredentials = credentials ?? ConfigService.getCredentials();
      
      const retryId = await RetryService.startRetry(sessionId, story, storyIndex, finalCredentials);
      
      res.json({
        retryId,
        status: 'started',
        message: 'Retry started',
      });
    }
  } catch (error) {
    logger.error('Server', 'Error starting retry', {
      sessionId,
      storyIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to start retry',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get retry status
app.get('/retry/:retryId', async (req, res) => {
  const { retryId } = req.params;

  try {
    const retrySession = RetryService.getRetrySession(retryId);
    
    if (!retrySession) {
      return res.status(404).json({ error: 'Retry session not found' });
    }
    
    res.json(retrySession);
  } catch (error) {
    logger.error('Server', 'Error getting retry status', {
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
app.get('/session/:sessionId/retries', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const retries = RetryService.getRetrySessionsBySessionId(sessionId);
    res.json({ retries });
  } catch (error) {
    logger.error('Server', 'Error getting retries for session', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to get retries',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export function startServer(port: number = 3000) {
  app.listen(port, () => {
    const config = ConfigService.getConfig();
    const apiKey = ConfigService.getLLMApiKey();
    const maskedApiKey = apiKey 
      ? (apiKey.length > 12 
          ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` 
          : `${apiKey.substring(0, 4)}...`)
      : '(not set)';
    
    logger.info('Server', `🚀 Core service running on http://localhost:${port}`);
    logger.info('Config', 'Current configuration:', {
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      llmApiKey: maskedApiKey,
      neo4jUri: config.neo4jUri,
      neo4jUser: config.neo4jUser,
      maxIterations: config.maxIterations,
      startingUrl: config.startingUrl,
    });
  });
}

// Export function to set broadcast callback from frontend
export function setBroadcastFunction(fn: (data: any) => void) {
  broadcastToClients = fn;
}

// Run server if this is the main module
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.js')) {
  const port = parseInt(process.env.CORE_PORT || '3002', 10);
  startServer(port);
}


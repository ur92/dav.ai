import { BrowserTools } from '../tools/browser-tools.js';
import { Neo4jTools } from '../tools/neo4j-tools.js';
import { DavAgent } from '../agent/dav-agent.js';
import type { DavAgentState } from '../types/state.js';
import { AgentService } from './agent-service.js';
import { ConfigService } from './config-service.js';
import { logger } from '../utils/logger.js';

export interface Session {
  sessionId: string;
  browserTools: BrowserTools;
  neo4jTools: Neo4jTools;
  agent: DavAgent;
  runPromise: Promise<DavAgentState>;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentState?: DavAgentState;
  url: string;
  maxIterations: number;
  createdAt: Date;
  decisions: string[]; // Agent decisions for frontend display
}

/**
 * SessionService - Manages agent exploration sessions
 * All session management logic lives in core
 */
export class SessionService {
  private static sessions = new Map<string, Session>();
  private static persistenceTools: Neo4jTools | null = null;

  /**
   * Initialize persistence connection (call once at startup)
   */
  static initializePersistence(): void {
    if (this.persistenceTools) {
      return; // Already initialized
    }
    
    const config = ConfigService.getConfig();
    this.persistenceTools = new Neo4jTools(config.neo4jUri, config.neo4jUser, config.neo4jPassword);
    
    // Ensure indexes exist
    this.persistenceTools.ensureIndexes().catch((error) => {
      logger.error('SessionService', 'Failed to ensure indexes', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Get or create persistence tools
   */
  static getPersistenceTools(): Neo4jTools {
    if (!this.persistenceTools) {
      this.initializePersistence();
    }
    return this.persistenceTools!;
  }

  /**
   * Load all sessions from Neo4j on startup
   * This restores session metadata from previous runs
   */
  static async loadSessionsFromPersistence(): Promise<void> {
    try {
      const tools = this.getPersistenceTools();
      const metadataList = await tools.loadAllSessionMetadata();
      
      logger.info('SessionService', `Loaded ${metadataList.length} sessions from Neo4j`);
      
      // Note: We only restore metadata, not runtime objects
      // Runtime sessions will be recreated when needed
      for (const metadata of metadataList) {
        // Mark old running sessions as error (they can't be resumed)
        if (metadata.status === 'running') {
          metadata.status = 'error';
          metadata.error = 'Session was running when server restarted';
          await this.updateSessionMetadata(metadata.sessionId, {
            status: 'error',
            error: 'Session was running when server restarted',
          });
        }
      }
    } catch (error) {
      logger.error('SessionService', 'Failed to load sessions from Neo4j', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - allow service to continue without persistence
    }
  }

  /**
   * Save session metadata to Neo4j
   */
  private static async saveSessionMetadata(session: Session): Promise<void> {
    try {
      const tools = this.getPersistenceTools();
      await tools.saveSessionMetadata({
        sessionId: session.sessionId,
        status: session.status,
        url: session.url,
        maxIterations: session.maxIterations,
        createdAt: session.createdAt,
        updatedAt: new Date(),
        error: (session as any).error,
      });
    } catch (error) {
      logger.error('SessionService', 'Failed to save session metadata', {
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - persistence failure shouldn't break the service
    }
  }

  /**
   * Update session metadata in Neo4j
   */
  private static async updateSessionMetadata(
    sessionId: string,
    updates: {
      status?: Session['status'];
      error?: string;
    }
  ): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        // Try to load from Neo4j and update
        const tools = this.getPersistenceTools();
        const allMetadata = await tools.loadAllSessionMetadata();
        const metadata = allMetadata.find(m => m.sessionId === sessionId);
        if (metadata) {
          await tools.saveSessionMetadata({
            ...metadata,
            ...updates,
            updatedAt: new Date(),
          });
        }
        return;
      }
      
      await this.saveSessionMetadata(session);
    } catch (error) {
      logger.error('SessionService', 'Failed to update session metadata', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Create a new exploration session
   */
  static async createSession(
    url: string,
    maxIterations: number = 20
  ): Promise<Session> {
    const sessionId = `session-${Date.now()}`;

    // Use AgentService to initialize and run exploration with sessionId
    const { browserTools, neo4jTools, agent, runPromise } = await AgentService.runExploration(url, maxIterations, sessionId);

    return this.registerSession({
      sessionId,
      browserTools,
      neo4jTools,
      agent,
      runPromise,
      url,
      maxIterations,
    });
  }

  /**
   * Register a session from an exploration result (e.g., from main() function)
   */
  static registerSession(result: {
    sessionId?: string;
    browserTools: BrowserTools;
    neo4jTools: Neo4jTools;
    agent: DavAgent;
    runPromise: Promise<DavAgentState>;
    url: string;
    maxIterations: number;
  }): Session {
    const sessionId = result.sessionId || `session-${Date.now()}`;

    const session: Session = {
      sessionId,
      browserTools: result.browserTools,
      neo4jTools: result.neo4jTools,
      agent: result.agent,
      runPromise: result.runPromise,
      status: 'running',
      url: result.url,
      maxIterations: result.maxIterations,
      createdAt: new Date(),
      decisions: [],
    };

    // Set up decision callback to store decisions in session
    result.agent.setDecisionCallback((decision: string) => {
      session.decisions.push(decision);
      // Keep only last 100 decisions to avoid memory issues
      if (session.decisions.length > 100) {
        session.decisions = session.decisions.slice(-100);
      }
    });

    // Handle completion/error
    result.runPromise
      .then(async (finalState: DavAgentState) => {
        session.status = 'completed';
        session.currentState = finalState;
        // Note: Exploration completion and user story compilation decisions
        // are added in server.ts after the promise resolves
        await this.saveSessionMetadata(session);
      })
      .catch(async (error: Error) => {
        session.status = 'error';
        // Optionally store error in session
        (session as any).error = error.message;
        // Emit error decision
        session.decisions.push(`❌ Session error: ${error.message}`);
        await this.saveSessionMetadata(session);
      });

    this.sessions.set(sessionId, session);
    
    // Save to Neo4j
    this.saveSessionMetadata(session).catch((error) => {
      logger.error('SessionService', 'Failed to persist session on creation', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    
    return session;
  }

  /**
   * Get a session by ID
   */
  static getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  static getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session summary (for listing)
   */
  static getSessionSummary(sessionId: string): {
    sessionId: string;
    status: Session['status'];
    url: string;
    hasState: boolean;
    createdAt: Date;
  } | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    return {
      sessionId: session.sessionId,
      status: session.status,
      url: session.url,
      hasState: !!session.currentState,
      createdAt: session.createdAt,
    };
  }

  /**
   * Get all session summaries
   * Combines in-memory sessions with persisted sessions from Neo4j
   */
  static async getAllSessionSummaries(): Promise<Array<{
    sessionId: string;
    status: Session['status'];
    url: string;
    hasState: boolean;
    createdAt: Date;
  }>> {
    // Get in-memory sessions
    const inMemorySessions = Array.from(this.sessions.values()).map((session) => ({
      sessionId: session.sessionId,
      status: session.status,
      url: session.url,
      hasState: !!session.currentState,
      createdAt: session.createdAt,
    }));

    // Get persisted sessions from Neo4j
    try {
      const tools = this.getPersistenceTools();
      const persistedMetadata = await tools.loadAllSessionMetadata();
      
      // Create a map of in-memory sessions by sessionId
      const inMemoryMap = new Map(inMemorySessions.map(s => [s.sessionId, s]));
      
      // Merge: use in-memory if exists, otherwise use persisted
      const allSessions = persistedMetadata.map((metadata) => {
        const inMemory = inMemoryMap.get(metadata.sessionId);
        if (inMemory) {
          return inMemory; // Prefer in-memory (more up-to-date)
        }
        
        // Return persisted metadata
        return {
          sessionId: metadata.sessionId,
          status: metadata.status,
          url: metadata.url,
          hasState: false, // Can't have state if not in memory
          createdAt: metadata.createdAt,
        };
      });
      
      // Add any in-memory sessions not in persisted list
      for (const inMemory of inMemorySessions) {
        if (!allSessions.find(s => s.sessionId === inMemory.sessionId)) {
          allSessions.push(inMemory);
        }
      }
      
      // Sort by createdAt descending
      return allSessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      logger.error('SessionService', 'Failed to load persisted sessions', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Return in-memory sessions only if persistence fails
      return inMemorySessions;
    }
  }

  /**
   * Stop and cleanup a session
   */
  static async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Try to delete from Neo4j even if not in memory
      try {
        const tools = this.getPersistenceTools();
        await tools.deleteSessionMetadata(sessionId);
      } catch (error) {
        // Ignore errors when deleting non-existent session
      }
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      await session.browserTools.close();
      await session.neo4jTools.close();
      this.sessions.delete(sessionId);
      
      // Delete from Neo4j
      try {
        const tools = this.getPersistenceTools();
        await tools.deleteSessionMetadata(sessionId);
      } catch (error) {
        logger.error('SessionService', 'Failed to delete session from Neo4j', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      // Ensure cleanup even if there's an error
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Cleanup all sessions
   */
  static async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.sessions.values()).map(async (session) => {
      try {
        await session.browserTools.close();
        await session.neo4jTools.close();
      } catch (error) {
        // Log but don't throw - continue cleanup
        logger.error('Session', `Error cleaning up session ${session.sessionId}`, { error: error instanceof Error ? error.message : String(error) });
      }
    });

    await Promise.all(cleanupPromises);
    this.sessions.clear();
  }
}


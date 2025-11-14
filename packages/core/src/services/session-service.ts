import { BrowserTools } from '../tools/browser-tools.js';
import { Neo4jTools } from '../tools/neo4j-tools.js';
import { DavAgent } from '../agent/dav-agent.js';
import type { DavAgentState } from '../types/state.js';
import { AgentService } from './agent-service.js';
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
}

/**
 * SessionService - Manages agent exploration sessions
 * All session management logic lives in core
 */
export class SessionService {
  private static sessions = new Map<string, Session>();

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
    };

    // Handle completion/error
    result.runPromise
      .then((finalState: DavAgentState) => {
        session.status = 'completed';
        session.currentState = finalState;
      })
      .catch((error: Error) => {
        session.status = 'error';
        // Optionally store error in session
        (session as any).error = error.message;
      });

    this.sessions.set(sessionId, session);
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
   */
  static getAllSessionSummaries(): Array<{
    sessionId: string;
    status: Session['status'];
    url: string;
    hasState: boolean;
    createdAt: Date;
  }> {
    return Array.from(this.sessions.values()).map((session) => ({
      sessionId: session.sessionId,
      status: session.status,
      url: session.url,
      hasState: !!session.currentState,
      createdAt: session.createdAt,
    }));
  }

  /**
   * Stop and cleanup a session
   */
  static async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      await session.browserTools.close();
      await session.neo4jTools.close();
      this.sessions.delete(sessionId);
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


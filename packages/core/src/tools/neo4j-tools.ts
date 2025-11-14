import neo4j, { Driver, Session } from 'neo4j-driver';
import { logger } from '../utils/logger.js';

/**
 * Neo4jTools - Handles all Neo4j database operations
 */
export class Neo4jTools {
  private driver: Driver;

  constructor(uri: string, user: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  /**
   * Execute a batch of Cypher queries
   */
  async executeQueries(queries: string[]): Promise<void> {
    if (queries.length === 0) {
      return;
    }

    const session = this.driver.session();

    try {
      // Execute all queries in a single transaction
      await session.executeWrite(async (tx) => {
        for (const query of queries) {
          await tx.run(query);
        }
      });
    } catch (error) {
      logger.error('Neo4j', 'Error executing Neo4j queries', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Generate Cypher query to merge a State node with sessionId
   */
  static generateMergeStateQuery(url: string, fingerprint: string, sessionId: string): string {
    // Escape single quotes in URL, fingerprint, and sessionId
    const safeUrl = url.replace(/'/g, "\\'");
    const safeFingerprint = fingerprint.replace(/'/g, "\\'");
    const safeSessionId = sessionId.replace(/'/g, "\\'");
    
    return `MERGE (s:State {url: '${safeUrl}', sessionId: '${safeSessionId}'})
            ON CREATE SET s.fingerprint = '${safeFingerprint}',
                          s.createdAt = datetime(),
                          s.sessionId = '${safeSessionId}'
            ON MATCH SET s.lastVisited = datetime(),
                         s.fingerprint = '${safeFingerprint}'
            RETURN s`;
  }

  /**
   * Generate Cypher query to create a TRANSITIONED_BY relationship with sessionId
   */
  static generateTransitionQuery(
    fromUrl: string,
    toUrl: string,
    action: string,
    sessionId: string,
    selector?: string
  ): string {
    const safeFromUrl = fromUrl.replace(/'/g, "\\'");
    const safeToUrl = toUrl.replace(/'/g, "\\'");
    const safeAction = action.replace(/'/g, "\\'");
    const safeSessionId = sessionId.replace(/'/g, "\\'");
    const safeSelector = selector ? selector.replace(/'/g, "\\'") : '';

    let query = `MATCH (a:State {url: '${safeFromUrl}', sessionId: '${safeSessionId}'})
                 MATCH (b:State {url: '${safeToUrl}', sessionId: '${safeSessionId}'})
                 CREATE (a)-[r:TRANSITIONED_BY {action: '${safeAction}', sessionId: '${safeSessionId}'`;

    if (safeSelector) {
      query += `, selector: '${safeSelector}'`;
    }

    query += `, timestamp: datetime()}]->(b)
              RETURN r`;

    return query;
  }

  /**
   * Close the Neo4j driver connection
   */
  async close(): Promise<void> {
    await this.driver.close();
  }

  /**
   * Test the connection
   */
  async verifyConnectivity(): Promise<boolean> {
    try {
      const session = this.driver.session();
      await session.run('RETURN 1 as test');
      await session.close();
      return true;
    } catch (error) {
      logger.error('Neo4j', 'Neo4j connectivity test failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Delete all graph data for a specific session
   * This ensures each session starts with a fresh, empty graph
   */
  async deleteSessionData(sessionId: string): Promise<void> {
    const session = this.driver.session();
    
    try {
      // Escape single quotes in sessionId
      const safeSessionId = sessionId.replace(/'/g, "\\'");
      
      // Delete all relationships for this session first (required before deleting nodes)
      const deleteRelationshipsQuery = `
        MATCH ()-[r:TRANSITIONED_BY {sessionId: '${safeSessionId}'}]-()
        DELETE r
      `;
      
      // Delete all nodes for this session
      const deleteNodesQuery = `
        MATCH (n:State {sessionId: '${safeSessionId}'})
        DELETE n
      `;
      
      await session.executeWrite(async (tx) => {
        await tx.run(deleteRelationshipsQuery);
        await tx.run(deleteNodesQuery);
      });
      
      logger.info('Neo4j', `Deleted all graph data for session: ${sessionId}`);
    } catch (error) {
      logger.error('Neo4j', 'Error deleting session data', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Ensure indexes exist for better query performance
   * This should be called once at application startup
   */
  async ensureIndexes(): Promise<void> {
    const session = this.driver.session();
    
    try {
      // Create index on sessionId for faster session-based queries
      const createIndexQuery = `
        CREATE INDEX sessionId_index IF NOT EXISTS
        FOR (n:State) ON (n.sessionId)
      `;
      
      // Create index on Session nodes for sessionId
      const createSessionIndexQuery = `
        CREATE INDEX session_sessionId_index IF NOT EXISTS
        FOR (n:Session) ON (n.sessionId)
      `;
      
      await session.run(createIndexQuery);
      await session.run(createSessionIndexQuery);
      logger.info('Neo4j', 'Ensured indexes exist for sessionId and Session nodes');
    } catch (error) {
      // Index might already exist, which is fine
      logger.warn('Neo4j', 'Could not create index (might already exist)', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Save or update session metadata in Neo4j
   */
  async saveSessionMetadata(metadata: {
    sessionId: string;
    status: 'idle' | 'running' | 'completed' | 'error';
    url: string;
    maxIterations: number;
    createdAt: Date;
    updatedAt?: Date;
    error?: string;
  }): Promise<void> {
    const dbSession = this.driver.session();
    
    try {
      // Convert dates to ISO strings for storage
      const createdAt = metadata.createdAt.toISOString();
      const updatedAt = (metadata.updatedAt || new Date()).toISOString();
      
      const query = `
        MERGE (s:Session {sessionId: $sessionId})
        ON CREATE SET s.createdAt = $createdAt,
                      s.status = $status,
                      s.url = $url,
                      s.maxIterations = $maxIterations,
                      s.updatedAt = $updatedAt,
                      s.error = $error
        ON MATCH SET s.status = $status,
                     s.url = $url,
                     s.maxIterations = $maxIterations,
                     s.updatedAt = $updatedAt,
                     s.error = $error
        RETURN s
      `;
      
      const params: any = {
        sessionId: metadata.sessionId,
        status: metadata.status,
        url: metadata.url,
        maxIterations: neo4j.int(metadata.maxIterations),
        createdAt: createdAt,
        updatedAt: updatedAt,
        error: metadata.error || null,
      };
      
      await dbSession.run(query, params);
      logger.info('Neo4j', `Saved session metadata: ${metadata.sessionId}`);
    } catch (error) {
      logger.error('Neo4j', 'Error saving session metadata', {
        sessionId: metadata.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await dbSession.close();
    }
  }

  /**
   * Load all session metadata from Neo4j
   */
  async loadAllSessionMetadata(): Promise<Array<{
    sessionId: string;
    status: 'idle' | 'running' | 'completed' | 'error';
    url: string;
    maxIterations: number;
    createdAt: Date;
    updatedAt: Date;
    error?: string;
  }>> {
    const dbSession = this.driver.session();
    
    try {
      const query = `
        MATCH (s:Session)
        RETURN s
        ORDER BY s.createdAt DESC
      `;
      
      const result = await dbSession.run(query);
      
      return result.records.map((record) => {
        const node = record.get('s');
        const properties = node.properties;
        
        // Handle both string and neo4j datetime types
        const createdAt = typeof properties.createdAt === 'string' 
          ? new Date(properties.createdAt) 
          : new Date(properties.createdAt.toString());
        const updatedAt = typeof properties.updatedAt === 'string'
          ? new Date(properties.updatedAt)
          : new Date(properties.updatedAt.toString());
        
        return {
          sessionId: properties.sessionId,
          status: properties.status as 'idle' | 'running' | 'completed' | 'error',
          url: properties.url,
          maxIterations: typeof properties.maxIterations === 'number' 
            ? properties.maxIterations 
            : properties.maxIterations.toNumber(),
          createdAt,
          updatedAt,
          error: properties.error || undefined,
        };
      });
    } catch (error) {
      logger.error('Neo4j', 'Error loading session metadata', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await dbSession.close();
    }
  }

  /**
   * Load a single session's metadata from Neo4j
   */
  async loadSessionMetadata(sessionId: string): Promise<{
    sessionId: string;
    status: 'idle' | 'running' | 'completed' | 'error';
    url: string;
    maxIterations: number;
    createdAt: Date;
    updatedAt: Date;
    error?: string;
  } | null> {
    const dbSession = this.driver.session();
    
    try {
      const query = `
        MATCH (s:Session {sessionId: $sessionId})
        RETURN s
      `;
      
      const result = await dbSession.run(query, { sessionId });
      
      if (result.records.length === 0) {
        return null;
      }
      
      const record = result.records[0];
      const node = record.get('s');
      const properties = node.properties;
      
      // Handle both string and neo4j datetime types
      const createdAt = typeof properties.createdAt === 'string' 
        ? new Date(properties.createdAt) 
        : new Date(properties.createdAt.toString());
      const updatedAt = typeof properties.updatedAt === 'string'
        ? new Date(properties.updatedAt)
        : new Date(properties.updatedAt.toString());
      
      return {
        sessionId: properties.sessionId,
        status: properties.status as 'idle' | 'running' | 'completed' | 'error',
        url: properties.url,
        maxIterations: typeof properties.maxIterations === 'number' 
          ? properties.maxIterations 
          : properties.maxIterations.toNumber(),
        createdAt,
        updatedAt,
        error: properties.error || undefined,
      };
    } catch (error) {
      logger.error('Neo4j', 'Error loading session metadata', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await dbSession.close();
    }
  }

  /**
   * Save user stories for a session to Neo4j
   */
  async saveUserStories(sessionId: string, userStories: {
    stories: Array<{
      title: string;
      description: string;
      steps: string[];
      flow: Array<{ from: string; to: string; action: string }>;
    }>;
    summary: string;
  }): Promise<void> {
    const dbSession = this.driver.session();
    
    try {
      const query = `
        MATCH (s:Session {sessionId: $sessionId})
        SET s.userStories = $userStories
        RETURN s
      `;
      
      await dbSession.run(query, {
        sessionId,
        userStories: JSON.stringify(userStories),
      });
      
      logger.info('Neo4j', `Saved user stories for session: ${sessionId}`);
    } catch (error) {
      logger.error('Neo4j', 'Error saving user stories', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await dbSession.close();
    }
  }

  /**
   * Load user stories for a session from Neo4j
   */
  async loadUserStories(sessionId: string): Promise<{
    stories: Array<{
      title: string;
      description: string;
      steps: string[];
      flow: Array<{ from: string; to: string; action: string }>;
    }>;
    summary: string;
  } | null> {
    const dbSession = this.driver.session();
    
    try {
      const query = `
        MATCH (s:Session {sessionId: $sessionId})
        RETURN s.userStories as userStories
      `;
      
      const result = await dbSession.run(query, { sessionId });
      
      if (result.records.length === 0) {
        return null;
      }
      
      const userStoriesStr = result.records[0].get('userStories');
      if (!userStoriesStr) {
        return null;
      }
      
      return JSON.parse(userStoriesStr);
    } catch (error) {
      logger.error('Neo4j', 'Error loading user stories', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      await dbSession.close();
    }
  }

  /**
   * Delete session metadata from Neo4j
   */
  async deleteSessionMetadata(sessionId: string): Promise<void> {
    const dbSession = this.driver.session();
    
    try {
      const query = `
        MATCH (s:Session {sessionId: $sessionId})
        DELETE s
      `;
      
      await dbSession.run(query, { sessionId });
      logger.info('Neo4j', `Deleted session metadata: ${sessionId}`);
    } catch (error) {
      logger.error('Neo4j', 'Error deleting session metadata', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await dbSession.close();
    }
  }

  /**
   * Delete all nodes and relationships from the database
   * WARNING: This will delete ALL data in the Neo4j database
   */
  async dropAllData(): Promise<void> {
    const session = this.driver.session();
    
    try {
      // Delete all relationships first (required before deleting nodes)
      const deleteRelationshipsQuery = `MATCH ()-[r]-() DELETE r`;
      
      // Delete all nodes
      const deleteNodesQuery = `MATCH (n) DELETE n`;
      
      await session.executeWrite(async (tx) => {
        const relResult = await tx.run(deleteRelationshipsQuery);
        const nodeResult = await tx.run(deleteNodesQuery);
        logger.info('Neo4j', `Deleted ${relResult.summary.counters.updates().relationshipsDeleted || 0} relationships and ${nodeResult.summary.counters.updates().nodesDeleted || 0} nodes`);
      });
      
      logger.info('Neo4j', 'Successfully dropped all data from Neo4j database');
    } catch (error) {
      logger.error('Neo4j', 'Error dropping all data', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await session.close();
    }
  }
}


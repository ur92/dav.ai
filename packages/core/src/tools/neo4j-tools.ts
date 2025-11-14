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
      
      await session.run(createIndexQuery);
      logger.info('Neo4j', 'Ensured indexes exist for sessionId');
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


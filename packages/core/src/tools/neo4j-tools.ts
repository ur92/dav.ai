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
}


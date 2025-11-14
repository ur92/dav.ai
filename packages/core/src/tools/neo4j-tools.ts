import neo4j, { Driver, Session } from 'neo4j-driver';

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
      console.error('Error executing Neo4j queries:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Generate Cypher query to merge a State node
   */
  static generateMergeStateQuery(url: string, fingerprint: string): string {
    // Escape single quotes in URL and fingerprint
    const safeUrl = url.replace(/'/g, "\\'");
    const safeFingerprint = fingerprint.replace(/'/g, "\\'");
    
    return `MERGE (s:State {url: '${safeUrl}', fingerprint: '${safeFingerprint}'})
            ON CREATE SET s.createdAt = datetime()
            ON MATCH SET s.lastVisited = datetime()
            RETURN s`;
  }

  /**
   * Generate Cypher query to create a TRANSITIONED_BY relationship
   */
  static generateTransitionQuery(
    fromUrl: string,
    toUrl: string,
    action: string,
    selector?: string
  ): string {
    const safeFromUrl = fromUrl.replace(/'/g, "\\'");
    const safeToUrl = toUrl.replace(/'/g, "\\'");
    const safeAction = action.replace(/'/g, "\\'");
    const safeSelector = selector ? selector.replace(/'/g, "\\'") : '';

    let query = `MATCH (a:State {url: '${safeFromUrl}'})
                 MATCH (b:State {url: '${safeToUrl}'})
                 CREATE (a)-[r:TRANSITIONED_BY {action: '${safeAction}'`;

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
      console.error('Neo4j connectivity test failed:', error);
      return false;
    }
  }
}


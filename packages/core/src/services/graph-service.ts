import { Neo4jTools } from '../tools/neo4j-tools.js';
import { ConfigService } from './config-service.js';

export interface GraphNode {
  id: string;
  label: string;
  url: string;
  fingerprint?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  selector?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * GraphService - Handles Neo4j graph queries
 * All graph query logic lives in core
 */
export class GraphService {
  /**
   * Query the exploration graph from Neo4j
   */
  static async queryGraph(limit: number = 100): Promise<GraphData> {
    // Get configuration from ConfigService (single source of truth)
    const config = ConfigService.getConfig();
    const neo4jTools = new Neo4jTools(config.neo4jUri, config.neo4jUser, config.neo4jPassword);

    try {
      // Access the private driver property
      const driver = (neo4jTools as any).driver;
      const session = driver.session();

      const queryResult = await session.run(`
        MATCH (n:State)
        OPTIONAL MATCH (n)-[r:TRANSITIONED_BY]->(m:State)
        RETURN n, r, m
        LIMIT $limit
      `, { limit });

      const nodes = new Map<string, GraphNode>();
      const edges: GraphEdge[] = [];

      queryResult.records.forEach((record: any) => {
        const node = record.get('n');
        const rel = record.get('r');
        const target = record.get('m');

        if (node) {
          nodes.set(node.properties.url, {
            id: node.properties.url,
            label: node.properties.url,
            url: node.properties.url,
            fingerprint: node.properties.fingerprint,
          });
        }

        if (target) {
          nodes.set(target.properties.url, {
            id: target.properties.url,
            label: target.properties.url,
            url: target.properties.url,
            fingerprint: target.properties.fingerprint,
          });
        }

        if (rel && node && target) {
          edges.push({
            source: node.properties.url,
            target: target.properties.url,
            label: rel.properties.action,
            selector: rel.properties.selector,
          });
        }
      });

      await session.close();
      await neo4jTools.close();

      return {
        nodes: Array.from(nodes.values()),
        edges,
      };
    } catch (error) {
      await neo4jTools.close();
      throw error;
    }
  }
}


import neo4j from 'neo4j-driver';
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
   * Query the exploration graph from Neo4j, optionally filtered by sessionId
   */
  static async queryGraph(limit: number = 100, sessionId?: string): Promise<GraphData> {
    // Get configuration from ConfigService (single source of truth)
    const config = ConfigService.getConfig();
    const neo4jTools = new Neo4jTools(config.neo4jUri, config.neo4jUser, config.neo4jPassword);

    try {
      // Access the private driver property
      const driver = (neo4jTools as any).driver;
      const session = driver.session();

      // Ensure limit is an integer (Neo4j requires integer for LIMIT clause)
      const limitInt = Math.floor(limit) || 100;
      // Use neo4j.int() to create a proper Neo4j integer type
      const limitValue = neo4j.int(limitInt);

      // Build query with optional sessionId filter
      // Use separate queries to get all nodes and all edges properly
      let nodeQuery = `MATCH (n:State)`;
      let edgeQuery = `MATCH (n:State)-[r:TRANSITIONED_BY]->(m:State)`;
      const params: any = {};
      
      if (sessionId) {
        nodeQuery = `MATCH (n:State {sessionId: $sessionId})`;
        edgeQuery = `MATCH (n:State {sessionId: $sessionId})-[r:TRANSITIONED_BY {sessionId: $sessionId}]->(m:State {sessionId: $sessionId})`;
        params.sessionId = sessionId;
      }
      
      // First, get all nodes
      const nodeResult = await session.run(`${nodeQuery} RETURN n LIMIT $limit`, { 
        ...params, 
        limit: limitValue 
      });

      const nodes = new Map<string, GraphNode>();
      nodeResult.records.forEach((record: any) => {
        const node = record.get('n');
        if (node) {
          nodes.set(node.properties.url, {
            id: node.properties.url,
            label: node.properties.url,
            url: node.properties.url,
            fingerprint: node.properties.fingerprint,
          });
        }
      });

      // Then, get all edges (up to limit)
      const edgeResult = await session.run(`${edgeQuery} RETURN n, r, m LIMIT $limit`, {
        ...params,
        limit: limitValue,
      });

      const edges: GraphEdge[] = [];
      edgeResult.records.forEach((record: any) => {
        const node = record.get('n');
        const rel = record.get('r');
        const target = record.get('m');

        if (rel && node && target) {
          // Ensure both source and target nodes exist in our nodes map
          if (!nodes.has(node.properties.url)) {
            nodes.set(node.properties.url, {
              id: node.properties.url,
              label: node.properties.url,
              url: node.properties.url,
              fingerprint: node.properties.fingerprint,
            });
          }
          if (!nodes.has(target.properties.url)) {
            nodes.set(target.properties.url, {
              id: target.properties.url,
              label: target.properties.url,
              url: target.properties.url,
              fingerprint: target.properties.fingerprint,
            });
          }

          edges.push({
            source: node.properties.url,
            target: target.properties.url,
            label: rel.properties.action || 'action',
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


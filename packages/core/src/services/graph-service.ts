import neo4j from 'neo4j-driver';
import { Neo4jTools } from '../utils/neo4j-tools.js';
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
      // Use a Set to track unique edges by composite key (source, target, label, selector)
      const edgeKeys = new Set<string>();
      
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

          const source = node.properties.url;
          const targetUrl = target.properties.url;
          const label = rel.properties.action || 'action';
          const selector = rel.properties.selector || '';
          
          // Create a unique key for this edge
          const edgeKey = `${source}|${targetUrl}|${label}|${selector}`;
          
          // Only add edge if we haven't seen this exact edge before
          if (!edgeKeys.has(edgeKey)) {
            edgeKeys.add(edgeKey);
            edges.push({
              source,
              target: targetUrl,
              label,
              selector,
            });
          }
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

  /**
   * Get graph counts (nodes and edges) for a specific session
   * This is more efficient than querying the full graph
   */
  static async getGraphCounts(sessionId: string): Promise<{ nodes: number; edges: number }> {
    const config = ConfigService.getConfig();
    const neo4jTools = new Neo4jTools(config.neo4jUri, config.neo4jUser, config.neo4jPassword);

    try {
      const driver = (neo4jTools as any).driver;
      const session = driver.session();

      // Count nodes for this session
      const nodeCountResult = await session.run(
        `MATCH (n:State {sessionId: $sessionId}) RETURN count(n) as count`,
        { sessionId }
      );
      const nodeCount = nodeCountResult.records[0]?.get('count')?.toNumber() || 0;

      // Count edges for this session
      const edgeCountResult = await session.run(
        `MATCH (n:State {sessionId: $sessionId})-[r:TRANSITIONED_BY {sessionId: $sessionId}]->(m:State {sessionId: $sessionId}) RETURN count(r) as count`,
        { sessionId }
      );
      const edgeCount = edgeCountResult.records[0]?.get('count')?.toNumber() || 0;

      await session.close();
      await neo4jTools.close();

      return { nodes: nodeCount, edges: edgeCount };
    } catch (error) {
      await neo4jTools.close();
      // Return zeros if there's an error (session might not have graph data yet)
      return { nodes: 0, edges: 0 };
    }
  }

  /**
   * Get graph counts for multiple sessions efficiently
   */
  static async getGraphCountsForSessions(sessionIds: string[]): Promise<Map<string, { nodes: number; edges: number }>> {
    const config = ConfigService.getConfig();
    const neo4jTools = new Neo4jTools(config.neo4jUri, config.neo4jUser, config.neo4jPassword);
    const countsMap = new Map<string, { nodes: number; edges: number }>();

    if (sessionIds.length === 0) {
      await neo4jTools.close();
      return countsMap;
    }

    try {
      const driver = (neo4jTools as any).driver;
      const dbSession = driver.session();

      // Get counts for all sessions in a single query
      const nodeCountsResult = await dbSession.run(
        `MATCH (n:State) 
         WHERE n.sessionId IN $sessionIds 
         RETURN n.sessionId as sessionId, count(n) as count`,
        { sessionIds }
      );

      nodeCountsResult.records.forEach((record: any) => {
        const sessionId = record.get('sessionId');
        const count = record.get('count')?.toNumber() || 0;
        if (!countsMap.has(sessionId)) {
          countsMap.set(sessionId, { nodes: 0, edges: 0 });
        }
        countsMap.get(sessionId)!.nodes = count;
      });

      // Get edge counts for all sessions
      // Group by the sessionId from the relationship (edges belong to a session)
      const edgeCountsResult = await dbSession.run(
        `MATCH (n:State)-[r:TRANSITIONED_BY]->(m:State) 
         WHERE r.sessionId IN $sessionIds
         RETURN r.sessionId as sessionId, count(r) as count`,
        { sessionIds }
      );

      edgeCountsResult.records.forEach((record: any) => {
        const sessionId = record.get('sessionId');
        const count = record.get('count')?.toNumber() || 0;
        if (!countsMap.has(sessionId)) {
          countsMap.set(sessionId, { nodes: 0, edges: 0 });
        }
        countsMap.get(sessionId)!.edges = count;
      });

      // Ensure all sessionIds have entries (even if they have 0 counts)
      sessionIds.forEach((sessionId) => {
        if (!countsMap.has(sessionId)) {
          countsMap.set(sessionId, { nodes: 0, edges: 0 });
        }
      });

      await dbSession.close();
      await neo4jTools.close();

      return countsMap;
    } catch (error) {
      await neo4jTools.close();
      // Return empty counts for all sessions if there's an error
      sessionIds.forEach((sessionId) => {
        countsMap.set(sessionId, { nodes: 0, edges: 0 });
      });
      return countsMap;
    }
  }
}


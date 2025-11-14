import { BrowserTools } from '../tools/browser-tools.js';
import { Neo4jTools } from '../tools/neo4j-tools.js';
import { DavAgent } from '../agent/dav-agent.js';
import type { DavAgentState } from '../types/state.js';
import { ConfigService } from './config-service.js';
import { logger } from '../utils/logger.js';

/**
 * AgentService - Service for managing agent lifecycle
 * Extracted from main() to be reusable by API endpoints
 */
export class AgentService {
  /**
   * Initialize and run an exploration
   */
  static async runExploration(
    url: string,
    maxIterations?: number,
    sessionId?: string,
    credentials?: { username?: string; password?: string }
  ): Promise<{ browserTools: BrowserTools; neo4jTools: Neo4jTools; agent: DavAgent; runPromise: Promise<DavAgentState> }> {
    // Get configuration from ConfigService (single source of truth)
    const config = ConfigService.getConfig();
    const apiKey = ConfigService.getLLMApiKey();
    
    // Use provided maxIterations or fall back to config
    const iterations = maxIterations ?? config.maxIterations;
    
    // Use provided credentials or fall back to config credentials
    const finalCredentials = credentials ?? ConfigService.getCredentials();
    
    logger.info('AgentService', 'Iterations configuration', {
      provided: maxIterations,
      fromConfig: config.maxIterations,
      final: iterations,
    });
    logger.info('AgentService', 'Credentials configuration', {
      provided: !!credentials,
      fromConfig: !!ConfigService.getCredentials(),
      hasCredentials: !!(finalCredentials?.username || finalCredentials?.password)
    });

    if (!apiKey) {
      throw new Error(`API key for ${config.llmProvider} is required`);
    }

    // Initialize tools
    const browserTools = new BrowserTools(config.headless);
    const neo4jTools = new Neo4jTools(config.neo4jUri, config.neo4jUser, config.neo4jPassword);

    // Initialize browser
    await browserTools.initialize();

    // Verify Neo4j connection
    const neo4jConnected = await neo4jTools.verifyConnectivity();
    if (!neo4jConnected) {
      await browserTools.close();
      await neo4jTools.close();
      throw new Error('Failed to connect to Neo4j database.');
    }

    // Ensure indexes exist for better performance
    await neo4jTools.ensureIndexes();

    // Create a fresh, empty graph for this session by deleting any existing data
    // This ensures each session starts with a clean slate
    const finalSessionId = sessionId || `session-${Date.now()}`;
    try {
      await neo4jTools.deleteSessionData(finalSessionId);
      logger.info('AgentService', `Cleared any existing graph data for session: ${finalSessionId}`);
    } catch (error) {
      // If deletion fails (e.g., session doesn't exist yet), that's fine
      logger.info('AgentService', `No existing data to clear for session: ${finalSessionId}`);
    }

    // Create agent with sessionId and credentials
    const agent = new DavAgent(
      browserTools, 
      neo4jTools, 
      apiKey, 
      config.llmProvider, 
      config.llmModel, 
      finalSessionId,
      finalCredentials
    );

    // Start exploration - wrap in a promise that handles errors and logs
    const runPromise = (async () => {
      try {
        logger.info('AgentService', `Starting agent.run() for URL: ${url} with maxIterations: ${iterations}`);
        const result = await agent.run(url, iterations);
        logger.info('AgentService', `Agent run completed with status: ${result.explorationStatus}`);
        return result;
      } catch (error) {
        logger.error('AgentService', 'Error in agent.run()', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    })();

    return {
      browserTools,
      neo4jTools,
      agent,
      runPromise,
    };
  }
}


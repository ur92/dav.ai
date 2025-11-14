import { BrowserTools } from './tools/browser-tools.js';
import { Neo4jTools } from './tools/neo4j-tools.js';
import { DavAgent } from './agent/dav-agent.js';
import { AgentService } from './services/agent-service.js';
import { ConfigService } from './services/config-service.js';
import { logger } from './utils/logger.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Go from packages/core/dist/ or packages/core/src/ to root
const rootEnvPath = join(__dirname, '../../.env');
dotenv.config({ path: rootEnvPath });

/**
 * Main entry point for DAV.ai agent
 * Can be used as a function (returns exploration result) or as CLI entry point
 * 
 * @param url - Optional URL to explore. If not provided, uses config.startingUrl
 * @param maxIterations - Optional max iterations. If not provided, uses config.maxIterations
 * @param autoCleanup - Whether to automatically cleanup resources after completion (default: true for CLI, false for API)
 * @returns Promise with exploration result containing browserTools, neo4jTools, agent, and runPromise
 */
async function main(
  url?: string,
  maxIterations?: number,
  autoCleanup: boolean = true
): Promise<{
  browserTools: BrowserTools;
  neo4jTools: Neo4jTools;
  agent: any;
  runPromise: Promise<any>;
}> {
  // Initialize configuration service (loads all env vars)
  ConfigService.initialize();
  
  // Validate required configuration
  try {
    ConfigService.validate();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Config', `Error: ${errorMessage}`);
    if (autoCleanup) {
      process.exit(1);
    }
    throw error;
  }

  // Get configuration from ConfigService (single source of truth)
  const config = ConfigService.getConfig();
  const explorationUrl = url ?? config.startingUrl;
  const iterations = maxIterations ?? config.maxIterations;

  logger.info('Agent', '🚀 DAV.ai Agent Starting...');
  logger.info('Agent', `Starting URL: ${explorationUrl}`);
  logger.info('Agent', `Neo4j URI: ${config.neo4jUri}`);
  logger.info('Agent', `LLM Provider: ${config.llmProvider}`);
  logger.info('Agent', `LLM Model: ${config.llmModel}`);
  logger.info('Agent', `Max Iterations: ${iterations}`);

  let browserTools: BrowserTools | null = null;
  let neo4jTools: Neo4jTools | null = null;

  try {
    // Use AgentService to initialize and run exploration
    logger.info('Agent', 'Initializing agent service...');
    const serviceResult = await AgentService.runExploration(explorationUrl, iterations);
    browserTools = serviceResult.browserTools;
    neo4jTools = serviceResult.neo4jTools;
    logger.info('Agent', '✓ Agent service initialized');

    // If autoCleanup is false, return the result for the caller to manage
    if (!autoCleanup) {
      return serviceResult;
    }

    // Wait for exploration to complete (only for CLI mode with autoCleanup)
    const finalState = await serviceResult.runPromise;

    // Print final results
    logger.info('Agent', '📊 Exploration Complete!');
    logger.info('Agent', `Final Status: ${finalState.explorationStatus}`);
    logger.info('Agent', `Final URL: ${finalState.currentUrl}`);
    logger.info('Agent', `Total Actions: ${finalState.actionHistory.length}`);
    logger.info('Agent', 'Action History:');
    finalState.actionHistory.forEach((action, idx) => {
      logger.info('Agent', `  ${idx + 1}. ${action}`);
    });

    // TODO: Post-flow summarization for User Story generation
    // This would query Neo4j for the path and use LLM to generate User Stories

    return serviceResult;

  } catch (error) {
    logger.error('Agent', 'Fatal error', { error: error instanceof Error ? error.message : String(error) });
    if (autoCleanup) {
      process.exit(1);
    }
    throw error;
  } finally {
    // Cleanup only if autoCleanup is enabled
    if (autoCleanup) {
      logger.info('Agent', 'Cleaning up...');
      if (browserTools) {
        await browserTools.close();
      }
      if (neo4jTools) {
        await neo4jTools.close();
      }
      logger.info('Agent', '✓ Cleanup complete');
    }
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.js')) {
  main().catch((error) => {
    logger.error('Agent', 'Unhandled error in main', { error: error instanceof Error ? error.message : String(error) });
  });
}

export { main };
export { logger, LogLevel } from './utils/logger.js';


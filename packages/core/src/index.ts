import { BrowserTools } from './utils/browser-tools.js';
import { Neo4jTools } from './utils/neo4j-tools.js';
import { DavAgent } from './agent/dav-agent.js';
import { AgentService } from './services/agent-service.js';
import { ConfigService } from './services/config-service.js';
import { logger } from './utils/logger.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from root .env file
// Try multiple possible paths to find the .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const possiblePaths = [
  join(process.cwd(), '.env'), // From project root (when running yarn dev)
  join(__dirname, '../../../.env'), // From packages/core/src to root
  join(__dirname, '../../.env'), // From packages/core/dist to root (if compiled)
];

let envLoaded = false;
for (const envPath of possiblePaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('Warning: Could not load .env file from any of the expected locations:', possiblePaths);
}

/**
 * Main entry point for DAV.ai agent
 * Can be used as a function (returns exploration result) or as CLI entry point
 * 
 * @param url - Optional URL to explore. If not provided, uses config.startingUrl
 * @param autoCleanup - Whether to automatically cleanup resources after completion (default: true for CLI, false for API)
 * @param sessionId - Optional sessionId for graph isolation. If not provided, generates one.
 * @param credentials - Optional app credentials {username, password} for automatic login
 * @returns Promise with exploration result containing browserTools, neo4jTools, agent, and runPromise
 */
async function main(
  url?: string,
  autoCleanup: boolean = true,
  sessionId?: string,
  credentials?: { username?: string; password?: string }
): Promise<{
  browserTools: BrowserTools;
  neo4jTools: Neo4jTools;
  agent: any;
  runPromise: Promise<any>;
}> {
  // Initialize configuration service (loads all env vars)
  ConfigService.initialize();
  
  // Initialize logger with configured log level
  const config = ConfigService.getConfig();
  logger.initialize(config.logLevel);
  
  // Validate required configuration
  try {
    ConfigService.validate();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Create a helpful error message for logging (with newlines)
    const logMessage = `${errorMessage}\n\n` +
      `Please create a .env file in the root directory with:\n` +
      `  LLM_API_KEY=your_api_key_here\n` +
      `  LLM_PROVIDER=${config.llmProvider}\n\n` +
      `Or set the LLM_API_KEY environment variable before running.\n` +
      `See README.md for more details.`;
    
    // Create a cleaner message for API responses (single line)
    const apiMessage = `${errorMessage} Please create a .env file in the root directory with LLM_API_KEY=your_api_key_here and LLM_PROVIDER=${config.llmProvider}. See README.md for details.`;
    
    logger.error('Config', logMessage);
    if (autoCleanup) {
      process.exit(1);
    }
    // Throw error with API-friendly message
    throw new Error(apiMessage);
  }

  // Get configuration from ConfigService (single source of truth)
  const explorationUrl = url ?? config.startingUrl;
  // Use provided credentials or fall back to config credentials
  const finalCredentials = credentials ?? ConfigService.getCredentials();

  logger.info('Agent', '🚀 DAV.ai Agent Starting...');
  logger.info('Agent', `Starting URL: ${explorationUrl}`);
  logger.info('Agent', `Neo4j URI: ${config.neo4jUri}`);
  logger.info('Agent', `LLM Provider: ${config.llmProvider}`);
  logger.info('Agent', `LLM Model: ${config.llmModel}`);

  let browserTools: BrowserTools | null = null;
  let neo4jTools: Neo4jTools | null = null;

  try {
    // Use AgentService to initialize and run exploration
    const finalSessionId = sessionId || `session-${Date.now()}`;
    logger.info('Agent', 'Initializing agent service...', { 
      sessionId: finalSessionId,
      hasCredentials: !!(finalCredentials?.username || finalCredentials?.password),
      credentialsSource: credentials ? 'provided' : (ConfigService.getCredentials() ? 'config' : 'none')
    });
    const serviceResult = await AgentService.runExploration(explorationUrl, finalSessionId, finalCredentials);
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
export { logger } from './utils/logger.js';
export type { LogLevel } from './utils/logger.js';
export { RetryService } from './services/retry-service.js';
export type { RetryStep, RetrySession } from './services/retry-service.js';


import { BrowserTools } from './tools/browser-tools.js';
import { Neo4jTools } from './tools/neo4j-tools.js';
import { DavAgent } from './agent/dav-agent.js';
import { AgentService } from './services/agent-service.js';
import { ConfigService } from './services/config-service.js';
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
 */
async function main() {
  // Initialize configuration service (loads all env vars)
  ConfigService.initialize();
  
  // Validate required configuration
  try {
    ConfigService.validate();
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Get configuration from ConfigService (single source of truth)
  const config = ConfigService.getConfig();

  console.log('🚀 DAV.ai Agent Starting...');
  console.log(`Starting URL: ${config.startingUrl}`);
  console.log(`Neo4j URI: ${config.neo4jUri}`);
  console.log(`LLM Provider: ${config.llmProvider}`);
  console.log(`LLM Model: ${config.llmModel}`);
  console.log(`Max Iterations: ${config.maxIterations}\n`);

  let browserTools: BrowserTools | null = null;
  let neo4jTools: Neo4jTools | null = null;

  try {
    // Use AgentService to initialize and run exploration
    console.log('Initializing agent service...');
    const serviceResult = await AgentService.runExploration(config.startingUrl, config.maxIterations);
    browserTools = serviceResult.browserTools;
    neo4jTools = serviceResult.neo4jTools;
    console.log('✓ Agent service initialized\n');

    // Wait for exploration to complete
    const finalState = await serviceResult.runPromise;

    // Print final results
    console.log('\n📊 Exploration Complete!');
    console.log(`Final Status: ${finalState.explorationStatus}`);
    console.log(`Final URL: ${finalState.currentUrl}`);
    console.log(`Total Actions: ${finalState.actionHistory.length}`);
    console.log('\nAction History:');
    finalState.actionHistory.forEach((action, idx) => {
      console.log(`  ${idx + 1}. ${action}`);
    });

    // TODO: Post-flow summarization for User Story generation
    // This would query Neo4j for the path and use LLM to generate User Stories

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    if (browserTools) {
      await browserTools.close();
    }
    if (neo4jTools) {
      await neo4jTools.close();
    }
    console.log('✓ Cleanup complete');
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.js')) {
  main().catch(console.error);
}

export { main };


import { BrowserTools } from './tools/browser-tools.js';
import { Neo4jTools } from './tools/neo4j-tools.js';
import { DavAgent } from './agent/dav-agent.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Main entry point for DAV.ai agent
 */
async function main() {
  // Configuration from environment variables
  const startingUrl = process.env.STARTING_URL || 'https://example.com';
  const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const neo4jUser = process.env.NEO4J_USER || 'neo4j';
  const neo4jPassword = process.env.NEO4J_PASSWORD || 'password';
  
  // LLM Configuration - support both OpenAI and Anthropic
  const llmProvider = (process.env.LLM_PROVIDER || 'openai').toLowerCase() as 'openai' | 'anthropic';
  const openAIApiKey = process.env.OPENAI_API_KEY || '';
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
  const llmModel = process.env.LLM_MODEL || (llmProvider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o');
  const maxIterations = parseInt(process.env.MAX_ITERATIONS || '20', 10);

  // Validate required configuration
  const apiKey = llmProvider === 'anthropic' ? anthropicApiKey : openAIApiKey;
  if (!apiKey) {
    const keyName = llmProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    console.error(`Error: ${keyName} environment variable is required.`);
    process.exit(1);
  }

  console.log('🚀 DAV.ai Agent Starting...');
  console.log(`Starting URL: ${startingUrl}`);
  console.log(`Neo4j URI: ${neo4jUri}`);
  console.log(`LLM Provider: ${llmProvider}`);
  console.log(`LLM Model: ${llmModel}`);
  console.log(`Max Iterations: ${maxIterations}\n`);

  // Initialize tools
  const browserTools = new BrowserTools();
  const neo4jTools = new Neo4jTools(neo4jUri, neo4jUser, neo4jPassword);

  try {
    // Initialize browser
    console.log('Initializing browser...');
    await browserTools.initialize();

    // Verify Neo4j connection
    console.log('Verifying Neo4j connection...');
    const neo4jConnected = await neo4jTools.verifyConnectivity();
    if (!neo4jConnected) {
      throw new Error('Failed to connect to Neo4j database.');
    }
    console.log('✓ Neo4j connection verified\n');

    // Create and run agent
    const agent = new DavAgent(browserTools, neo4jTools, apiKey, llmProvider, llmModel);
    const finalState = await agent.run(startingUrl, maxIterations);

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
    await browserTools.close();
    await neo4jTools.close();
    console.log('✓ Cleanup complete');
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.js')) {
  main().catch(console.error);
}

export { main };


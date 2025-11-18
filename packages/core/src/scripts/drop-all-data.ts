#!/usr/bin/env node

/**
 * Script to drop all data from Neo4j database
 * Usage: tsx src/scripts/drop-all-data.ts
 */

import * as dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ConfigService } from '../services/config-service.js';
import { Neo4jTools } from '../utils/neo4j-tools.js';
import { logger } from '../utils/logger.js';

// Load environment variables from root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const possiblePaths = [
  join(process.cwd(), '.env'), // From project root
  join(__dirname, '../../../.env'), // From packages/core/src/scripts to root
  join(__dirname, '../../.env'), // From packages/core/dist/scripts to root (if compiled)
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

// Initialize logger with info level to see all messages
logger.initialize('info');

async function main() {
  try {
    // Initialize configuration
    ConfigService.initialize();
    const config = ConfigService.getConfig();

    logger.info('Script', 'Connecting to Neo4j...', {
      uri: config.neo4jUri,
      user: config.neo4jUser,
    });

    // Create Neo4j tools instance
    const neo4jTools = new Neo4jTools(config.neo4jUri, config.neo4jUser, config.neo4jPassword);

    // Verify connectivity
    const connected = await neo4jTools.verifyConnectivity();
    if (!connected) {
      logger.error('Script', 'Failed to connect to Neo4j database');
      process.exit(1);
    }

    logger.info('Script', 'Connected to Neo4j successfully');

    // Drop all data
    logger.warn('Script', 'WARNING: About to delete ALL data from Neo4j database');
    await neo4jTools.dropAllData();

    logger.info('Script', 'Successfully dropped all data from Neo4j database');

    // Close connection
    await neo4jTools.close();
    process.exit(0);
  } catch (error) {
    logger.error('Script', 'Error dropping Neo4j data', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();


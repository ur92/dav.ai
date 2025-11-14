import { createServer } from 'http';
import { createApp } from './app.js';
import { setupWebSocket } from './websocket.js';
import { logger } from './utils/logger.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const possiblePaths = [
  join(process.cwd(), '.env'),
  join(__dirname, '../../../.env'),
  join(__dirname, '../../.env'),
];

let envLoaded = false;
for (const envPath of possiblePaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    envLoaded = true;
    break;
  }
}

// Initialize logger with configured log level
const logLevel = (process.env.LOG_LEVEL?.toLowerCase() || 'error') as 'info' | 'warn' | 'error';
logger.initialize(logLevel);

/**
 * Main server entry point
 */
function main() {
  // Create Express app
  const app = createApp();

  // Create HTTP server
  const server = createServer(app);

  // Setup WebSocket server
  setupWebSocket(server, '/ws');

  // Start server
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    // Server started - no logging needed (only errors are logged)
  });
}

// Run server
main();

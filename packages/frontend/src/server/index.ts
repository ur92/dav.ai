import { createServer } from 'http';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { createApp } from './app.js';
import { setupWebSocket } from './websocket.js';
import { logger } from './utils/logger.js';
import { ConfigService } from '@dav-ai/core/dist/services/config-service.js';

// Load environment variables from root .env file
// When running via yarn dev, cwd is packages/frontend, so go up TWO levels to root
// When running from root, cwd is root
let rootEnvPath = join(process.cwd(), '../../.env'); // From packages/frontend -> root (up 2 levels)
if (!existsSync(rootEnvPath)) {
  rootEnvPath = join(process.cwd(), '../.env'); // Try one level up
}
if (!existsSync(rootEnvPath)) {
  rootEnvPath = join(process.cwd(), '.env'); // Try current directory (if already at root)
}
if (!existsSync(rootEnvPath)) {
  // Fallback: try relative path from this file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  rootEnvPath = join(__dirname, '../../../.env');
}
dotenv.config({ path: rootEnvPath });

// Initialize ConfigService to load all configuration
ConfigService.initialize();

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
    logger.info('Server', `BFF Server running on http://localhost:${PORT}`);
    logger.info('Server', `WebSocket server running on ws://localhost:${PORT}/ws`);
  });
}

// Run server
main();

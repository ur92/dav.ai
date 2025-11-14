import { createServer } from 'http';
import { createApp } from './app.js';
import { setupWebSocket } from './websocket.js';
import { logger } from './utils/logger.js';

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

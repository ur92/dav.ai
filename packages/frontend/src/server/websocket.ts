import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { setBroadcastFunction } from './routes/api.js';
import { logger } from './utils/logger.js';

export function setupWebSocket(server: Server, path: string = '/ws') {
  const wss = new WebSocketServer({ server, path });

  // Broadcast function to send messages to all connected clients
  const broadcast = (data: any) => {
    const openClients = Array.from(wss.clients).filter(client => client.readyState === 1);
    openClients.forEach((client) => {
      client.send(JSON.stringify(data));
    });
  };

  // Set the broadcast function so API routes can use it
  setBroadcastFunction(broadcast);

  // WebSocket connection handler
  wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        logger.error('WebSocket', 'Error processing message', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        ws.send(JSON.stringify({ type: 'error', message: String(error) }));
      }
    });

    ws.on('close', () => {
      // Client disconnected - no logging needed
    });

    ws.on('error', (error) => {
      logger.error('WebSocket', 'Connection error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });

  return wss;
}


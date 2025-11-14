# @dav-ai/frontend

Web UI and BFF (Backend For Frontend) server for DAV.ai.

## Architecture

- **BFF Server** (`src/server/`) - Express.js server that interacts with `@dav-ai/core`
- **Frontend** (`src/client/`) - React application for controlling the agent

## Features

- Start/stop web exploration sessions
- View active sessions and their status
- Real-time updates via WebSocket
- Visualize exploration graph from Neo4j
- RESTful API for programmatic access

## Development

```bash
# Start both BFF server and frontend
yarn dev

# Or start separately
yarn dev:server  # BFF server on port 3001
yarn dev:client  # Frontend on port 3000
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/config` - Get configuration
- `POST /api/explore` - Start exploration
- `GET /api/sessions` - List all sessions
- `GET /api/session/:sessionId` - Get session status
- `POST /api/session/:sessionId/stop` - Stop session
- `GET /api/graph` - Get Neo4j graph data

## WebSocket

Connect to `ws://localhost:3001/ws` for real-time updates:
- `exploration_complete` - Exploration finished
- `exploration_error` - Exploration failed


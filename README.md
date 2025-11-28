# DAV.ai (Discovery Analysis Validation)

An **Agentic Web Operator** that autonomously maps all possible user interaction flows and implicit user stories within web applications. The output is a persistent, queryable graph database with AI-generated user stories and interactive visualizations.

## 🎯 Overview

DAV.ai is an autonomous system that:
- **Explores** web applications by navigating and interacting with UI elements
- **Maps** all discovered user flows into a graph database (Neo4j)
- **Generates** user stories from exploration data using AI
- **Visualizes** exploration paths and state transitions in real-time
- **Validates** user stories by replaying them automatically

## 🏗️ Architecture

This is a **Yarn Workspaces Monorepo** containing:

- **`@dav-ai/core`** - Main agent implementation using LangGraph, Playwright, and Neo4j
  - Agent service with LangGraph StateGraph
  - Browser automation tools (Playwright)
  - Neo4j graph persistence
  - User story generation service
  - Retry/validation service
  - Session management
  - REST API server

- **`@dav-ai/frontend`** - Web UI and BFF server for controlling the agent
  - React frontend with interactive graph visualization
  - Express BFF server
  - WebSocket support for real-time updates
  - User story management and retry interface

- **`@dav-ai/test-app`** - End-to-end test application for validating core service
  - React application with authentication
  - User management features
  - Used for testing agent exploration capabilities

## 🚀 Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Language/Runtime** | Node.js / TypeScript | Native Playwright support, excellent async concurrency |
| **Web Automation** | Playwright | High-performance browser automation with auto-waiting |
| **Agent Framework** | LangGraph.js | StateGraph and ReAct cycle for autonomous agents |
| **Graph Database** | Neo4j | Stores DAG of States (Nodes) and Actions (Relationships) |
| **LLM** | OpenAI/Anthropic/Gemini | ReAct decision engine and user story generation |
| **Frontend** | React + ReactFlow | Interactive graph visualization and UI |
| **Backend** | Express.js | REST API and WebSocket server |

## 📦 Project Structure

```
dav-ai/
├── packages/
│   ├── core/                    # Main agent package
│   │   ├── src/
│   │   │   ├── agent/           # LangGraph StateGraph implementation
│   │   │   ├── tools/           # BrowserTools & Neo4jTools
│   │   │   ├── services/        # Agent, Config, Graph, Retry, Session, UserStory services
│   │   │   ├── types/           # TypeScript type definitions
│   │   │   ├── scripts/         # Utility scripts (e.g., drop-all-data)
│   │   │   ├── utils/           # Logger and utilities
│   │   │   ├── index.ts         # CLI entry point
│   │   │   └── server.ts        # REST API server
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── frontend/                # Web UI and BFF server
│   │   ├── src/
│   │   │   ├── server/          # Express BFF server
│   │   │   │   ├── app.ts       # Express app setup
│   │   │   │   ├── index.ts     # Server entry point
│   │   │   │   ├── routes/      # API routes
│   │   │   │   └── websocket.ts # WebSocket server
│   │   │   └── client/          # React frontend
│   │   │       ├── App.tsx      # Main application component
│   │   │       └── RetryProgressPanel.tsx
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── test-app/                # Test application
│       ├── src/
│       │   ├── components/      # React components
│       │   └── App.tsx
│       └── package.json
├── docker-compose.yml           # Neo4j service configuration
├── package.json                 # Root workspace configuration
└── yarn.lock
```

## 🛠️ Setup

### Prerequisites

- **Node.js** 20+ 
- **Yarn** 4.0+ (Berry)
- **Neo4j** database (local or remote)
- **OpenAI API Key** (or compatible LLM provider)

### Installation

1. **Clone and install dependencies:**
   ```bash
   yarn install
   ```

2. **Install Playwright browsers:**
   ```bash
   yarn workspace @dav-ai/core exec playwright install chromium
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```env
   # LLM Provider Configuration (required)
   LLM_PROVIDER=anthropic  # or 'openai' or 'gemini'
   LLM_API_KEY=your_llm_api_key_here
   
   # LLM Model (optional, has defaults based on provider)
   # Anthropic default: claude-sonnet-4-5
   # OpenAI default: gpt-4o
   # Gemini default: gemini-2.5-pro
   LLM_MODEL=claude-sonnet-4-5
   
   # Neo4j Configuration (optional, has defaults)
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=password
   
   # Agent Configuration (optional, has defaults)
   STARTING_URL=https://example.com
   HEADLESS=true  # Run browser in headless mode
   LOG_LEVEL=info  # debug, info, warn, error
   
   # App Credentials (optional, for automatic login)
   APP_USERNAME=admin
   APP_PASSWORD=admin123
   
   # Service Ports (optional, has defaults)
   CORE_PORT=3002
   FRONTEND_PORT=3001
   ```

4. **Start Neo4j:**
   ```bash
   # Using Docker Compose (recommended)
   yarn neo4j:up
   
   # Or manually with docker compose
   docker compose up -d neo4j
   ```
   
   **Neo4j Management Commands:**
   ```bash
   yarn neo4j:up      # Start Neo4j
   yarn neo4j:down    # Stop Neo4j
   yarn neo4j:logs    # View logs
   yarn neo4j:restart # Restart Neo4j
   yarn neo4j:status  # Check status
   ```
   
   Neo4j will be available at:
   - **HTTP**: http://localhost:7474
   - **Bolt**: bolt://localhost:7687
   - **Username**: neo4j
   - **Password**: password

## 🎯 Usage

### Development Mode

Start all services in development mode:

```bash
yarn dev
```

This starts:
- Core service on port `3002` (REST API)
- Frontend BFF server on port `3001`
- Frontend client on port `3000` (Vite dev server)

Or start services individually:

```bash
# Core service only
yarn dev:core:server

# Frontend only
yarn dev:frontend

# Test app only
yarn dev:test-app
```

### Production Build

```bash
# Build all packages
yarn build

# Run the built services
yarn start
```

### CLI Usage

Run the agent directly from the command line:

```bash
# Using the core package
yarn workspace @dav-ai/core start

# Or in development mode
yarn workspace @dav-ai/core dev
```

### Workspace Commands

```bash
# Run commands in specific workspace
yarn workspace @dav-ai/core <command>
yarn workspace @dav-ai/frontend <command>
yarn workspace @dav-ai/test-app <command>

# Examples
yarn workspace @dav-ai/core watch        # Watch mode for core
yarn workspace @dav-ai/core drop-all-data # Clear Neo4j data
```

## 🔄 Agent Flow

The DAV agent operates as a **Finite State Machine** with the following ReAct cycle:

```
START → observe_state → decide_action → execute_tool → persist_data
                                                           ↓
                                                      (Conditional)
                                                      ↙        ↘
                                              CONTINUE      FLOW_END
                                                 ↓              ↓
                                         observe_state         END
```

### Nodes

1. **`observe_state`** - Navigate to URL and extract Simplified DOM
2. **`decide_action`** - LLM decides next action or flow termination
3. **`execute_tool`** - Execute browser action (click, type, etc.)
4. **`persist_data`** - Save State → Action → State transitions to Neo4j
5. **`check_continue`** - Conditional routing based on exploration status

## 📊 Neo4j Schema

### Nodes
- **`State`** - Represents a page state
  - `url` (string) - Page URL
  - `fingerprint` (string) - DOM hash for uniqueness
  - `createdAt` (datetime)
  - `lastVisited` (datetime)

### Relationships
- **`TRANSITIONED_BY`** - Action that transitions between states
  - `action` (string) - Action description
  - `selector` (string) - Element selector
  - `timestamp` (datetime)

### Example Query

```cypher
// Find all paths from a starting state
MATCH path = (start:State {url: 'https://example.com'})-[*]->(end:State)
RETURN path
LIMIT 10
```

## 🔍 Simplified DOM Extraction

The `BrowserTools.observe()` method extracts only **actionable elements** to minimize LLM token costs:

- Links (`a[href]`)
- Buttons (`button`, `[role="button"]`)
- Inputs (`input`, `textarea`)
- Selects (`select`)
- Interactive elements (`[onclick]`, `[role="link"]`)

Each element includes:
- Tag name
- Text/label (max 30 chars)
- Simplified selector (prefers `#id`, then `[name]`, then CSS)

## 🔌 API Reference

### Core Service API (Port 3002)

#### Health & Configuration
- `GET /health` - Health check
- `GET /config` - Get current configuration (safe, no sensitive data)
- `GET /credentials` - Get configured credentials (if available)

#### Exploration
- `POST /explore` - Start a new exploration session
  ```json
  {
    "url": "https://example.com",
    "credentials": {
      "username": "optional",
      "password": "optional"
    }
  }
  ```

#### Sessions
- `GET /sessions` - List all sessions
- `GET /session/:sessionId` - Get session status and details
- `POST /session/:sessionId/stop` - Stop a running session

#### Graph Data
- `GET /graph?limit=100&sessionId=xxx` - Query Neo4j graph data
  - `limit` - Maximum number of nodes to return (default: 100)
  - `sessionId` - Optional filter by session ID

#### User Stories & Retry
- `GET /session/:sessionId` - Includes user stories in response
- `POST /retry` - Start retry/validation for a user story
  ```json
  {
    "sessionId": "session-123",
    "storyIndex": 0,
    "credentials": { "username": "optional", "password": "optional" }
  }
  ```
- `GET /retry/:retryId` - Get retry session status
- `GET /session/:sessionId/retries` - Get all retries for a session

### Frontend BFF API (Port 3001)

The frontend BFF server proxies requests to the core service and adds WebSocket support:

- `GET /api/*` - Proxies to core service
- `WS /ws` - WebSocket connection for real-time updates
  - `exploration_complete` - Exploration finished
  - `exploration_error` - Exploration failed
  - `retry_step_update` - Retry step progress update

## 🎨 Features

### ✅ Implemented

- ✅ **Autonomous Web Exploration** - Agent navigates and interacts with web applications
- ✅ **Graph Database Persistence** - All states and transitions stored in Neo4j
- ✅ **User Story Generation** - AI-generated user stories from exploration data
- ✅ **Interactive Visualization** - ReactFlow-based graph visualization with hierarchical layout
- ✅ **Session Management** - Track multiple exploration sessions
- ✅ **Retry/Validation** - Replay user stories to validate them
- ✅ **Real-time Updates** - WebSocket support for live progress monitoring
- ✅ **Authentication Support** - Automatic login with provided credentials
- ✅ **Simplified DOM Extraction** - Token-efficient element extraction for LLM processing
- ✅ **Self-loop Detection** - Visual indicators for state transitions that loop back

### 🔮 Future Enhancements

- [ ] Multi-path exploration (parallel flows)
- [ ] Export graph data to various formats (JSON, CSV, etc.)
- [ ] Advanced filtering and search in graph visualization
- [ ] User story editing and customization
- [ ] Batch exploration of multiple URLs
- [ ] Performance metrics and analytics

## 📊 Example Workflow

1. **Start Services**
   ```bash
   yarn neo4j:up    # Start Neo4j
   yarn dev         # Start core and frontend
   ```

2. **Open Web UI**
   - Navigate to `http://localhost:3000`
   - Enter target URL (e.g., `http://localhost:5173/`)
   - Optionally provide credentials for authentication
   - Click "Deploy Agent"

3. **Monitor Exploration**
   - Watch real-time activity feed
   - View graph visualization as it builds
   - See agent decisions and actions

4. **Review Results**
   - View generated user stories after completion
   - Explore the interactive graph visualization
   - Retry user stories to validate them

5. **Query Neo4j**
   - Access Neo4j Browser at `http://localhost:7474`
   - Query the graph database directly
   - Analyze exploration patterns

## 🔍 Troubleshooting

### Neo4j Connection Issues
- Ensure Neo4j is running: `yarn neo4j:status`
- Check credentials in `.env` file
- Verify Neo4j is accessible at `bolt://localhost:7687`

### LLM API Issues
- Verify `LLM_API_KEY` is set in `.env`
- Check API key is valid and has sufficient credits
- Ensure `LLM_PROVIDER` matches your API key type

### Browser Automation Issues
- Ensure Playwright browsers are installed: `yarn workspace @dav-ai/core exec playwright install chromium`
- Check that target URL is accessible
- Verify no firewall is blocking browser automation

### Port Conflicts
- Core service: `3002` (configurable via `CORE_PORT`)
- Frontend BFF: `3001` (configurable via `FRONTEND_PORT`)
- Frontend client: `3000` (Vite default)
- Neo4j HTTP: `7474`
- Neo4j Bolt: `7687`

## 📄 License

MIT


# DAV.ai (Discovery Analysis Validation)

An **Agentic Web Operator** that autonomously maps all possible user interaction flows and implicit user stories within web applications. The output is a persistent, queryable graph database.

## 🏗️ Architecture

This is a **Yarn Workspaces Monorepo** containing:

- **`@dav-ai/core`** - Main agent implementation using LangGraph, Playwright, and Neo4j
- **`@dav-ai/frontend`** - Web UI and BFF server for controlling the agent

## 🚀 Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Language/Runtime** | Node.js / TypeScript | Native Playwright support, excellent async concurrency |
| **Web Automation** | Playwright | High-performance browser automation with auto-waiting |
| **Agent Framework** | LangGraph.js | StateGraph and ReAct cycle for autonomous agents |
| **Graph Database** | Neo4j | Stores DAG of States (Nodes) and Actions (Relationships) |
| **LLM** | OpenAI/Anthropic/Gemini | ReAct decision engine and post-flow summarization |

## 📦 Project Structure

```
dav-ai/
├── packages/
│   ├── core/              # Main agent package
│   │   ├── src/
│   │   │   ├── agent/     # LangGraph StateGraph implementation
│   │   │   ├── tools/     # BrowserTools & Neo4jTools
│   │   │   ├── types/     # TypeScript type definitions
│   │   │   └── index.ts   # Entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/          # Web UI and BFF server
│       ├── src/
│       │   ├── server/    # Express BFF server
│       │   └── client/    # React frontend
│       ├── package.json
│       └── tsconfig.json
├── package.json           # Root workspace configuration
└── .yarnrc.yml           # Yarn configuration
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
   # LLM Provider Configuration (choose one)
   LLM_PROVIDER=anthropic  # or 'openai'
   LLM_API_KEY=your_llm_api_key_here
   
   # LLM Model (optional, has defaults based on provider)
   LLM_MODEL=claude-3-5-sonnet-20241022  # or 'gpt-4o' for OpenAI
   
   # Optional (with defaults)
   STARTING_URL=https://example.com
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=password
   MAX_ITERATIONS=20
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

```bash
yarn dev
```

### Production Build

```bash
# Build all packages
yarn build

# Run the built agent
yarn start
```

### Workspace Commands

```bash
# Run commands in specific workspace
yarn workspace @dav-ai/core <command>

# Example: Watch mode
yarn workspace @dav-ai/core watch
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

## 📝 Future Enhancements

- [ ] Post-flow summarization for User Story generation
- [ ] Multi-path exploration (parallel flows)
- [ ] Visual flow diagram generation
- [ ] Integration with additional LLM providers
- [ ] Web UI for monitoring exploration progress

## 📄 License

MIT


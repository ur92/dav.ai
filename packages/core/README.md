# @dav-ai/core

Core DAV.ai agent package implementing the LangGraph-based web exploration agent.

## Overview

This package contains:
- **DavAgent** - Main LangGraph StateGraph implementation
- **BrowserTools** - Playwright-based browser automation with simplified DOM extraction
- **Neo4jTools** - Neo4j database operations for state/action persistence
- **Type Definitions** - TypeScript interfaces for agent state and actions

## Usage

```typescript
import { BrowserTools } from '@dav-ai/core/tools/browser-tools';
import { Neo4jTools } from '@dav-ai/core/tools/neo4j-tools';
import { DavAgent } from '@dav-ai/core/agent/dav-agent';

const browserTools = new BrowserTools();
const neo4jTools = new Neo4jTools(uri, user, password);

await browserTools.initialize();
const agent = new DavAgent(browserTools, neo4jTools, apiKey, model);
const result = await agent.run(startingUrl);
```

## Development

```bash
# Build
yarn build

# Watch mode
yarn watch

# Run in dev mode
yarn dev
```


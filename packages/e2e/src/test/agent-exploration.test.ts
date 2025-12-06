import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import {
  startNeo4j,
  startCoreService,
  startFrontend,
  startTestApp,
  stopAllServices,
} from '../utils/service-manager.js';
import {
  startExploration,
  waitForCompletion,
  getSession,
  getGraph,
  type SessionData,
  type GraphData,
} from '../utils/api-client.js';
import { matchGraph } from '../utils/graph-matcher.js';
import { matchUserStories } from '../utils/user-story-matcher.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const expectedData = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/expected-session-5.json'), 'utf-8')
);

describe('Agent Exploration E2E Test', () => {
  const TEST_APP_URL = 'http://localhost:5173';
  const TEST_CREDENTIALS = {
    username: 'admin',
    password: 'admin123',
  };

  // Shared state between tests
  let sessionId: string;
  let completedSession: SessionData;
  let graphData: GraphData;

  beforeAll(async () => {
    // Start all services
    console.log('Setting up services...');
    await startNeo4j();
    await startCoreService();
    await startFrontend();
    await startTestApp();
    console.log('All services are ready');
  }, 120000); // 2 minutes for setup

  afterAll(async () => {
    // Cleanup all services
    console.log('Cleaning up services...');
    await stopAllServices();
  }, 30000); // 30 seconds for cleanup

  it('should deploy agent and start exploration', async () => {
    console.log('Starting agent exploration...');
    const explorationResponse = await startExploration({
      url: TEST_APP_URL,
      credentials: TEST_CREDENTIALS,
    });

    expect(explorationResponse.sessionId).toBeDefined();
    expect(explorationResponse.status).toBe('started');
    
    sessionId = explorationResponse.sessionId;
    console.log(`Agent session started: ${sessionId}`);
  }, 120000); // 2 minutes timeout

  it('should complete exploration and validate session structure', async () => {
    console.log('Waiting for exploration to complete...');
    completedSession = await waitForCompletion(sessionId, 120000);

    expect(completedSession.status).toBe('completed');
    expect(completedSession.sessionId).toBe(sessionId);
    console.log('Exploration completed');

    console.log('Validating session data...');
    expect(completedSession.tokenUsage).toBeDefined();
    expect(completedSession.tokenUsage?.exploration).toBeDefined();
    expect(completedSession.tokenUsage?.userStories).toBeDefined();
    expect(completedSession.tokenUsage?.total).toBeDefined();
  }, 120000); // 2 minutes timeout

  it('should fetch and validate graph structure', async () => {
    console.log('Fetching graph data...');
    graphData = await getGraph(sessionId);
    
    expect(graphData.nodes).toBeDefined();
    expect(graphData.edges).toBeDefined();
    expect(Array.isArray(graphData.nodes)).toBe(true);
    expect(Array.isArray(graphData.edges)).toBe(true);

    console.log('Validating graph structure...');
    const graphMatch = matchGraph(graphData, expectedData.graph as GraphData);
    
    if (graphMatch.warnings.length > 0) {
      console.warn('Graph validation warnings:');
      graphMatch.warnings.forEach((warning) => console.warn(`  - ${warning}`));
    }

    if (!graphMatch.success) {
      console.error('Graph validation errors:');
      graphMatch.errors.forEach((error) => console.error(`  - ${error}`));
    }

    expect(graphMatch.success).toBe(true);
    expect(graphMatch.errors.length).toBe(0);
  }, 120000); // 2 minutes timeout

  it('should validate user stories', async () => {
    console.log('Validating user stories...');
    expect(completedSession.userStories).toBeDefined();
    expect(completedSession.userStories?.stories).toBeDefined();
    expect(Array.isArray(completedSession.userStories?.stories)).toBe(true);

    const userStoryMatch = matchUserStories(
      completedSession.userStories!,
      expectedData.userStories
    );

    if (userStoryMatch.warnings.length > 0) {
      console.warn('User story validation warnings:');
      userStoryMatch.warnings.forEach((warning) => console.warn(`  - ${warning}`));
    }

    if (!userStoryMatch.success) {
      console.error('User story validation errors:');
      userStoryMatch.errors.forEach((error) => console.error(`  - ${error}`));
    }

    expect(userStoryMatch.success).toBe(true);
    expect(userStoryMatch.errors.length).toBe(0);
    console.log('All validations passed!');
  }, 120000); // 2 minutes timeout
});


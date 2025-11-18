const CORE_API_URL = 'http://localhost:3002';

export interface ExplorationRequest {
  url: string;
  maxIterations?: number;
  credentials?: {
    username?: string;
    password?: string;
  };
}

export interface ExplorationResponse {
  sessionId: string;
  status: string;
  url: string;
  message: string;
}

export interface SessionData {
  sessionId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  logs?: any[];
  tokenUsage?: {
    exploration: {
      inputTokens: number;
      outputTokens: number;
    };
    userStories: {
      inputTokens: number;
      outputTokens: number;
    };
    total: {
      inputTokens: number;
      outputTokens: number;
    };
  };
  userStories?: UserStoriesResult;
  error?: any;
}

export interface UserStoriesResult {
  stories: UserStory[];
  summary: string;
}

export interface UserStory {
  title: string;
  description: string;
  steps: string[];
  flow: Array<{
    from: string;
    to: string;
    action: string;
  }>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  url: string;
  fingerprint?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  selector?: string;
}

/**
 * Start an exploration session
 */
export async function startExploration(
  request: ExplorationRequest
): Promise<ExplorationResponse> {
  const response = await fetch(`${CORE_API_URL}/explore`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Failed to start exploration: ${error.message || error.error}`);
  }

  return response.json();
}

/**
 * Get session data
 */
export async function getSession(sessionId: string): Promise<SessionData> {
  const response = await fetch(`${CORE_API_URL}/session/${sessionId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Failed to get session: ${error.message || error.error}`);
  }

  return response.json();
}

/**
 * Get graph data for a session
 */
export async function getGraph(sessionId: string): Promise<GraphData> {
  const url = new URL(`${CORE_API_URL}/graph`);
  url.searchParams.set('sessionId', sessionId);
  url.searchParams.set('limit', '1000');

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Failed to get graph: ${error.message || error.error}`);
  }

  return response.json();
}

/**
 * Wait for session to complete with exponential backoff
 */
export async function waitForCompletion(
  sessionId: string,
  timeout: number = 600000, // 10 minutes default
  waitForUserStories: boolean = true // Wait for user stories to be generated
): Promise<SessionData> {
  const startTime = Date.now();
  let pollInterval = 2000; // Start with 2 seconds
  const maxInterval = 10000; // Max 10 seconds
  let completed = false;

  while (Date.now() - startTime < timeout) {
    try {
      const session = await getSession(sessionId);

      if (session.status === 'error') {
        throw new Error(
          `Session failed: ${session.error?.message || JSON.stringify(session.error)}`
        );
      }

      if (session.status === 'completed') {
        completed = true;
        
        // If we need to wait for user stories, check if they're available
        if (waitForUserStories) {
          if (session.userStories && session.userStories.stories && session.userStories.stories.length > 0) {
            return session;
          }
          // Session is completed but user stories not ready yet, continue polling
        } else {
          return session;
        }
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollInterval = Math.min(pollInterval * 1.5, maxInterval);
    } catch (error) {
      // If it's a 404, the session might not exist yet, continue polling
      if (error instanceof Error && error.message.includes('not found')) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }
      throw error;
    }
  }

  if (completed && waitForUserStories) {
    throw new Error(
      `Session ${sessionId} completed but user stories were not generated within ${timeout}ms`
    );
  }

  throw new Error(`Session ${sessionId} did not complete within ${timeout}ms`);
}


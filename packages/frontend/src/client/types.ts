export interface ActionTypeConfig {
  color: string;
  strokeWidth: number;
  strokeDasharray?: string;
  icon: string;
  labelColor: string;
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

export interface UserStoriesResult {
  stories: UserStory[];
  summary: string;
}

export interface Session {
  sessionId: string;
  status: string;
  hasState: boolean;
  url?: string;
  createdAt?: string | Date;
  currentState?: {
    currentUrl?: string;
    actionHistory?: string[];
    explorationStatus?: string;
  };
  logs?: Array<{
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    context: string;
    message: string;
    data?: any;
  }>; // CORE logs for display
  userStories?: UserStoriesResult; // Compiled user stories
  tokenUsage?: {
    exploration: { inputTokens: number; outputTokens: number };
    userStories: { inputTokens: number; outputTokens: number };
    total: { inputTokens: number; outputTokens: number };
  };
  graphCounts?: { nodes: number; edges: number }; // Graph counts from API
}

export interface SessionGraphCounts {
  nodes: number;
  edges: number;
}

export interface GraphData {
  nodes: Array<{ id: string; label: string; url: string }>;
  edges: Array<{ source: string; target: string; label: string }>;
}

export interface RetryStep {
  index: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  timestamp?: number;
}

export interface RetrySession {
  retryId: string;
  sessionId: string;
  storyIndex: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: RetryStep[];
  startTime: number;
  endTime?: number;
}

export type ActivityLog = string | {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  data?: any;
};


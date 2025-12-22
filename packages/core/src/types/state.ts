/**
 * ExplorationState - Tracks exploration progress for a single page state
 * Uses arrays instead of Sets for LangGraph serialization compatibility
 */
export interface ExplorationState {
  fingerprint: string;
  url: string;
  availableActions: string[];  // Selectors extracted from DOM
  exploredActions: string[];   // Selectors already executed
  parentFingerprint?: string;  // For backtracking navigation
}

/**
 * BacktrackTarget - Represents a state we can backtrack to
 */
export interface BacktrackTarget {
  fingerprint: string;
  url: string;
  unexploredCount: number;  // Number of unexplored actions remaining
}

/**
 * DavAgentState - The shared state object passed between all LangGraph nodes
 */
export interface DavAgentState {
  currentUrl: string;
  domState: string;
  currentFingerprint: string;  // Current page fingerprint
  actionHistory: string[];
  neo4jQueries: string[];
  explorationStatus: 'CONTINUE' | 'FLOW_END' | 'FAILURE' | 'BACKTRACK';
  pendingAction: PendingAction | null; // Deprecated: use pendingActions instead
  pendingActions: PendingAction[]; // Array of actions to execute in batch
  visitedFingerprints: string[]; // Track visited page fingerprints (kept for compatibility)
  
  // New action-based exploration state
  explorationFrontier: Record<string, ExplorationState>;  // fingerprint -> ExplorationState
  backtrackStack: BacktrackTarget[];  // Stack of states with unexplored actions
  unexploredActions: string[];  // Current page's unexplored action selectors
}

/**
 * PendingAction - Represents a tool call requested by the LLM
 */
export interface PendingAction {
  tool: 'clickElement' | 'typeText' | 'selectOption' | 'navigate';
  selector?: string;
  text?: string;
  value?: string;
  url?: string;
}

/**
 * Simplified DOM Element - Represents an actionable element for LLM consumption
 */
export interface SimplifiedElement {
  tag: string;
  text: string;
  selector: string;
  type?: string;
  role?: string;
  isInModal?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
}


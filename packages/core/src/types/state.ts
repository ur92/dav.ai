/**
 * DavAgentState - The shared state object passed between all LangGraph nodes
 */
export interface DavAgentState {
  currentUrl: string;
  domState: string;
  actionHistory: string[];
  neo4jQueries: string[];
  explorationStatus: 'CONTINUE' | 'FLOW_END' | 'FAILURE';
  pendingAction: PendingAction | null; // Deprecated: use pendingActions instead
  pendingActions: PendingAction[]; // Array of actions to execute in batch
  visitedFingerprints: string[]; // Track visited page fingerprints to detect cycles
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
}


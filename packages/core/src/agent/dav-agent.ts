import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DavAgentState, PendingAction, ExplorationState, BacktrackTarget } from '../types/state.js';
import { BrowserTools } from '../utils/browser-tools.js';
import { Neo4jTools } from '../utils/neo4j-tools.js';
import { logger } from '../utils/logger.js';
import { StageContext } from './stages/stage-context.js';
import { createObserveStage } from './stages/observe-stage.js';
import { createDecideStage } from './stages/decide-stage.js';
import { createExecuteStage } from './stages/execute-stage.js';
import { createPersistStage } from './stages/persist-stage.js';

/**
 * DAV Agent - Main LangGraph StateGraph implementation
 * 
 * Uses action-based frontier exploration instead of cycle detection.
 * Tracks explored/unexplored actions per page state and backtracks
 * when a page is exhausted to continue exploring other states.
 */
export class DavAgent {
  private graph: StateGraph<DavAgentState>;
  private browserTools: BrowserTools;
  private neo4jTools: Neo4jTools;
  private llm: BaseChatModel;
  private sessionId: string;
  private credentials?: { username?: string; password?: string };
  private loginAttempted: Set<string> = new Set(); // Track URLs where login was attempted
  private loginSuccessful: boolean = false; // Track if login was successful
  private executedTransitions: Set<string> = new Set(); // Track executed transitions to avoid duplicates
  private interactedModalSelectors: Set<string> = new Set(); // Track which modal elements have been interacted with
  private onTokenUsageCallback?: (inputTokens: number, outputTokens: number) => void; // Callback for tracking token usage
  private recursionLimit: number; // Maximum recursion limit for graph execution
  
  // Action-based exploration state
  private explorationFrontier: Map<string, ExplorationState> = new Map(); // fingerprint -> ExplorationState
  private backtrackStack: BacktrackTarget[] = []; // Stack of states with unexplored actions
  
  private stageContext: StageContext;

  constructor(
    browserTools: BrowserTools,
    neo4jTools: Neo4jTools,
    llmApiKey: string,
    llmProvider: 'openai' | 'anthropic' | 'gemini' = 'openai',
    llmModel: string = 'gpt-4o',
    sessionId: string = `session-${Date.now()}`,
    credentials?: { username?: string; password?: string },
    recursionLimit: number = 200
  ) {
    this.browserTools = browserTools;
    this.neo4jTools = neo4jTools;
    this.sessionId = sessionId;
    this.credentials = credentials;
    this.recursionLimit = recursionLimit;
    
    // Initialize LLM based on provider
    if (llmProvider === 'anthropic') {
      this.llm = new ChatAnthropic({
        anthropicApiKey: llmApiKey,
        modelName: llmModel || 'claude-sonnet-4-5',
        temperature: 0.1, // Low temperature for deterministic decisions
      }) as BaseChatModel;
    } else if (llmProvider === 'gemini') {
      this.llm = new ChatGoogleGenerativeAI({
        apiKey: llmApiKey,
        model: llmModel || 'gemini-2.5-pro',
        temperature: 0.1, // Low temperature for deterministic decisions
      }) as BaseChatModel;
    } else {
      this.llm = new ChatOpenAI({
        openAIApiKey: llmApiKey,
        modelName: llmModel || 'gpt-4o',
        temperature: 0.1, // Low temperature for deterministic decisions
      }) as BaseChatModel;
    }

    // Create stage context for stage handlers
    // Use object wrappers for mutable state (loginSuccessful, credentials) so changes reflect back
    this.stageContext = {
      browserTools: this.browserTools,
      neo4jTools: this.neo4jTools,
      llm: this.llm,
      credentials: { value: this.credentials },
      loginAttempted: this.loginAttempted,
      loginSuccessful: { value: this.loginSuccessful },
      executedTransitions: this.executedTransitions,
      interactedModalSelectors: this.interactedModalSelectors,
      sessionId: this.sessionId,
      onTokenUsageCallback: this.onTokenUsageCallback,
      // Action-based exploration state (shared across stages)
      explorationFrontier: this.explorationFrontier,
      backtrackStack: this.backtrackStack,
      // Loop detection
      consecutiveSkipCount: { value: 0 },
    } as StageContext;

    // Initialize the StateGraph with state schema
    // LangGraph uses a reducer pattern for state updates
    this.graph = new StateGraph<DavAgentState>({
      channels: {
        currentUrl: {
          reducer: (x: string | undefined, y: string | undefined) => y ?? x ?? '',
          default: () => '',
        },
        currentFingerprint: {
          reducer: (x: string | undefined, y: string | undefined) => y ?? x ?? '',
          default: () => '',
        },
        domState: {
          reducer: (x: string | undefined, y: string | undefined) => y ?? x ?? '',
          default: () => '',
        },
        actionHistory: {
          reducer: (x: string[] | undefined, y: string[] | undefined) => {
            const xArr = x ?? [];
            const yArr = y ?? [];
            return [...xArr, ...yArr];
          },
          default: () => [],
        },
        neo4jQueries: {
          reducer: (x: string[] | undefined, y: string[] | undefined) => {
            const xArr = x ?? [];
            const yArr = y ?? [];
            return [...xArr, ...yArr];
          },
          default: () => [],
        },
        explorationStatus: {
          reducer: (x: string | undefined, y: string | undefined) => {
            return (y ?? x ?? 'CONTINUE') as 'CONTINUE' | 'FLOW_END' | 'FAILURE' | 'BACKTRACK';
          },
          default: () => 'CONTINUE' as const,
        },
        pendingAction: {
          reducer: (x: PendingAction | null | undefined, y: PendingAction | null | undefined) => y ?? x ?? null,
          default: () => null,
        },
        pendingActions: {
          reducer: (x: PendingAction[] | undefined, y: PendingAction[] | undefined) => {
            // If new actions are provided (including empty array), use them; otherwise keep existing
            if (y !== undefined) {
              return y;
            }
            return x ?? [];
          },
          default: () => [],
        },
        visitedFingerprints: {
          reducer: (x: string[] | undefined, y: string[] | undefined) => {
            const xArr = x ?? [];
            const yArr = y ?? [];
            // Merge and deduplicate
            const merged = [...xArr, ...yArr];
            return Array.from(new Set(merged));
          },
          default: () => [],
        },
        // New action-based exploration channels
        explorationFrontier: {
          reducer: (x: Record<string, ExplorationState> | undefined, y: Record<string, ExplorationState> | undefined) => {
            // Merge frontiers, with newer values taking precedence
            const merged = { ...(x ?? {}), ...(y ?? {}) };
            return merged;
          },
          default: () => ({} as Record<string, ExplorationState>),
        },
        backtrackStack: {
          reducer: (x: BacktrackTarget[] | undefined, y: BacktrackTarget[] | undefined) => {
            // Use newer stack if provided, otherwise keep existing
            if (y !== undefined) {
              return y;
            }
            return x ?? [];
          },
          default: () => [] as BacktrackTarget[],
        },
        unexploredActions: {
          reducer: (x: string[] | undefined, y: string[] | undefined) => {
            // Use newer list if provided
            if (y !== undefined) {
              return y;
            }
            return x ?? [];
          },
          default: () => [] as string[],
        },
      },
    });

    // Add nodes using extracted stage handlers
    this.graph.addNode('observe_state', createObserveStage(this.stageContext));
    this.graph.addNode('decide_action', createDecideStage(this.stageContext));
    this.graph.addNode('execute_tool', createExecuteStage(this.stageContext));
    this.graph.addNode('persist_data', createPersistStage(this.stageContext));

    // Define edges - LangGraph API
    // Using type assertions to work around TypeScript strict typing
    const graph = this.graph as any;
    graph.setEntryPoint('observe_state');
    graph.addEdge('observe_state', 'decide_action');
    graph.addEdge('decide_action', 'execute_tool');
    graph.addEdge('execute_tool', 'persist_data');
    graph.addConditionalEdges('persist_data', this.shouldContinue.bind(this), {
      CONTINUE: 'observe_state',
      BACKTRACK: 'observe_state',  // Backtrack also goes to observe to re-observe the page
      END: END,
    });
  }


  /**
   * Conditional edge function for routing
   * Now handles BACKTRACK status in addition to CONTINUE and END states
   */
  private shouldContinue(state: DavAgentState): string {
    if (state.explorationStatus === 'CONTINUE') {
      return 'CONTINUE';
    }
    if (state.explorationStatus === 'BACKTRACK') {
      return 'BACKTRACK';
    }
    return 'END';
  }

  /**
   * Compile and return the graph
   */
  compile() {
    return this.graph.compile();
  }

  /**
   * Set callback for tracking token usage
   */
  setTokenUsageCallback(callback: (inputTokens: number, outputTokens: number) => void): void {
    this.onTokenUsageCallback = callback;
    // Update stage context with new callback
    this.stageContext.onTokenUsageCallback = callback;
  }

  /**
   * Update class properties from context (called after stage execution to sync state)
   */
  private syncStateFromContext(): void {
    this.loginSuccessful = this.stageContext.loginSuccessful.value;
    this.credentials = this.stageContext.credentials.value;
  }

  /**
   * Run the agent starting from a given URL
   */
  async run(startingUrl: string): Promise<DavAgentState> {
      logger.info('AGENT', `[run] Starting run method`, {
      startingUrl,
    }, this.sessionId);
    
    try {
      logger.info('AGENT', '[run] Compiling graph...', undefined, this.sessionId);
      const compiledGraph = this.compile();
      logger.info('AGENT', '[run] Graph compiled successfully', undefined, this.sessionId);

      const initialState: DavAgentState = {
        currentUrl: startingUrl,
        currentFingerprint: '',
        domState: '',
        actionHistory: [],
        neo4jQueries: [],
        explorationStatus: 'CONTINUE',
        pendingAction: null,
        pendingActions: [],
        visitedFingerprints: [],
        // Initialize new action-based exploration state
        explorationFrontier: {},
        backtrackStack: [],
        unexploredActions: [],
      };

      let currentState = initialState;

      logger.info('AGENT', `[run] Starting exploration from: ${startingUrl}`, undefined, this.sessionId);

      // Continue while CONTINUE or BACKTRACK status
      let iterationCount = 0;
      while (currentState.explorationStatus === 'CONTINUE' || currentState.explorationStatus === 'BACKTRACK') {
        try {
          iterationCount++;
          
          // Warn when approaching recursion limit
          const remainingIterations = this.recursionLimit - iterationCount;
          if (remainingIterations <= 20 && remainingIterations > 0) {
            logger.warn('AGENT', `[run] Approaching recursion limit: ${remainingIterations} iterations remaining. Prioritizing breadth-first exploration.`, undefined, this.sessionId);
          }
          
          // Set recursion limit - each cycle through the graph (observe -> decide -> execute -> persist) is multiple steps
          const result = await compiledGraph.invoke(currentState, {
            recursionLimit: this.recursionLimit,
          } as any);
          currentState = result as DavAgentState;

          logger.info('AGENT', `[run] Status: ${currentState.explorationStatus}`, undefined, this.sessionId);
          
          // Log exploration progress
          const frontierSize = Object.keys(currentState.explorationFrontier || {}).length;
          const stackSize = (currentState.backtrackStack || []).length;
          const unexploredCount = (currentState.unexploredActions || []).length;
          logger.info('AGENT', `[run] Exploration progress: ${frontierSize} states in frontier, ${stackSize} in backtrack stack, ${unexploredCount} unexplored actions on current page`, undefined, this.sessionId);
        } catch (error) {
          // Check if it's a recursion limit error - if FLOW_END was already set, treat as success
          if (error instanceof Error && error.message.includes('Recursion limit')) {
            // If we already have FLOW_END status, the exploration completed successfully
            // The recursion limit was hit but the graph had already decided to end
            if (currentState.explorationStatus === 'FLOW_END') {
              logger.info('AGENT', `[run] Recursion limit reached but exploration completed successfully`, {
                status: currentState.explorationStatus,
              }, this.sessionId);
              break;
            }
            // Otherwise, it's a failure
            logger.error('AGENT', `[run] Recursion limit reached before completion`, { 
              error: error instanceof Error ? error.message : String(error),
            }, this.sessionId);
            currentState.explorationStatus = 'FAILURE';
            break;
          }
          
          logger.error('AGENT', `[run] Error in exploration`, { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }, this.sessionId);
          currentState.explorationStatus = 'FAILURE';
          break;
        }
      }

      logger.info('AGENT', `[run] Exploration finished. Final status: ${currentState.explorationStatus}`, undefined, this.sessionId);
      logger.info('AGENT', `━━━ Exploration Complete ━━━`, undefined, this.sessionId);
      logger.info('AGENT', `Final status: ${currentState.explorationStatus}`, undefined, this.sessionId);
      logger.info('AGENT', `Final URL: ${currentState.currentUrl}`, undefined, this.sessionId);
      logger.info('AGENT', `Total actions: ${currentState.actionHistory.length}`, undefined, this.sessionId);
      
      // Log final exploration stats
      const frontierSize = Object.keys(currentState.explorationFrontier || {}).length;
      const totalExploredActions = Object.values(currentState.explorationFrontier || {})
        .reduce((sum, state) => sum + state.exploredActions.length, 0);
      logger.info('AGENT', `Explored ${totalExploredActions} actions across ${frontierSize} page states`, undefined, this.sessionId);
      
      return currentState;
    } catch (error) {
      logger.error('AGENT', '[run] Fatal error in run method', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, this.sessionId);
      throw error;
    }
  }
}

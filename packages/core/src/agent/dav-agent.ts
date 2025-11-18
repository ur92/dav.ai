import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DavAgentState, PendingAction } from '../types/state.js';
import { BrowserTools } from '../tools/browser-tools.js';
import { Neo4jTools } from '../tools/neo4j-tools.js';
import { logger } from '../utils/logger.js';
import { StageContext } from './stages/stage-context.js';
import { createObserveStage } from './stages/observe-stage.js';
import { createDecideStage } from './stages/decide-stage.js';
import { createExecuteStage } from './stages/execute-stage.js';
import { createPersistStage } from './stages/persist-stage.js';

/**
 * DAV Agent - Main LangGraph StateGraph implementation
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
  private onTokenUsageCallback?: (inputTokens: number, outputTokens: number) => void; // Callback for tracking token usage
  private stageContext: StageContext;

  constructor(
    browserTools: BrowserTools,
    neo4jTools: Neo4jTools,
    llmApiKey: string,
    llmProvider: 'openai' | 'anthropic' | 'gemini' = 'openai',
    llmModel: string = 'gpt-4o',
    sessionId: string = `session-${Date.now()}`,
    credentials?: { username?: string; password?: string }
  ) {
    this.browserTools = browserTools;
    this.neo4jTools = neo4jTools;
    this.sessionId = sessionId;
    this.credentials = credentials;
    
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
      sessionId: this.sessionId,
      onTokenUsageCallback: this.onTokenUsageCallback,
    } as StageContext;

    // Initialize the StateGraph with state schema
    // LangGraph uses a reducer pattern for state updates
    this.graph = new StateGraph<DavAgentState>({
      channels: {
        currentUrl: {
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
            return (y ?? x ?? 'CONTINUE') as 'CONTINUE' | 'FLOW_END' | 'FAILURE';
          },
          default: () => 'CONTINUE' as const,
        },
        pendingAction: {
          reducer: (x: PendingAction | null | undefined, y: PendingAction | null | undefined) => y ?? x ?? null,
          default: () => null,
        },
        pendingActions: {
          reducer: (x: PendingAction[] | undefined, y: PendingAction[] | undefined) => {
            // If new actions are provided, use them; otherwise keep existing
            if (y && y.length > 0) {
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
      END: END,
    });
  }


  /**
   * Conditional edge function for routing
   */
  private shouldContinue(state: DavAgentState): string {
    if (state.explorationStatus === 'CONTINUE') {
      return 'CONTINUE';
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
  async run(startingUrl: string, maxIterations: number = 20): Promise<DavAgentState> {
      logger.info('AGENT', `[run] Starting run method`, {
      startingUrl,
      maxIterations,
      note: maxIterations === 20 ? 'Using default value (20) - check if value was passed correctly' : 'Using provided value',
    }, this.sessionId);
    
    try {
      logger.info('AGENT', '[run] Compiling graph...', undefined, this.sessionId);
      const compiledGraph = this.compile();
      logger.info('AGENT', '[run] Graph compiled successfully', undefined, this.sessionId);

              const initialState: DavAgentState = {
                currentUrl: startingUrl,
                domState: '',
                actionHistory: [],
                neo4jQueries: [],
                explorationStatus: 'CONTINUE',
                pendingAction: null,
                pendingActions: [],
                visitedFingerprints: [],
              };

      let currentState = initialState;
      let iterations = 0;

      logger.info('AGENT', `[run] Starting exploration from: ${startingUrl}`, undefined, this.sessionId);
      logger.info('AGENT', `[run] Maximum iterations: ${maxIterations}`, undefined, this.sessionId);

      while (currentState.explorationStatus === 'CONTINUE' && iterations < maxIterations) {
        try {
          logger.info('AGENT', `[run] Invoking graph for iteration ${iterations + 1}...`, undefined, this.sessionId);
          logger.info('AGENT', `━━━ Iteration ${iterations + 1}/${maxIterations} ━━━`, undefined, this.sessionId);
          // Set recursion limit to allow for multiple graph steps per iteration
          // Each iteration can involve: observe -> decide -> execute -> persist (4 steps)
          // Use a high recursion limit to prevent premature termination
          const result = await compiledGraph.invoke(currentState, {
            recursionLimit: maxIterations * 10,
          } as any); // Type assertion needed due to LangGraph type definitions
          currentState = result as DavAgentState;
          iterations++;

          logger.info('AGENT', `[run] Iteration ${iterations}/${maxIterations} - Status: ${currentState.explorationStatus}`, undefined, this.sessionId);
        } catch (error) {
          // Check if it's a recursion limit error - if so, treat as graceful completion
          if (error instanceof Error && error.message.includes('Recursion limit')) {
            logger.info('AGENT', `[run] Recursion limit reached, treating as graceful completion`, {
              iterations,
              status: currentState.explorationStatus,
            });
            currentState.explorationStatus = 'FLOW_END';
            break;
          }
          
          logger.error('AGENT', `[run] Error in iteration ${iterations}`, { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          currentState.explorationStatus = 'FAILURE';
          break;
        }
      }

      if (iterations >= maxIterations) {
        logger.info('AGENT', '[run] Reached maximum iterations limit', {
          iterations,
          maxIterations,
          limitReached: true,
        }, this.sessionId);
        currentState.explorationStatus = 'FLOW_END';
      }

      logger.info('AGENT', `[run] Exploration finished. Final status: ${currentState.explorationStatus}, Iterations: ${iterations}`, undefined, this.sessionId);
      logger.info('AGENT', `━━━ Exploration Complete ━━━`, undefined, this.sessionId);
      logger.info('AGENT', `Final status: ${currentState.explorationStatus}`, undefined, this.sessionId);
      logger.info('AGENT', `Total iterations: ${iterations}`, undefined, this.sessionId);
      logger.info('AGENT', `Final URL: ${currentState.currentUrl}`, undefined, this.sessionId);
      logger.info('AGENT', `Total actions: ${currentState.actionHistory.length}`, undefined, this.sessionId);
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


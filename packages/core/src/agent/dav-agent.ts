import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DavAgentState, PendingAction } from '../types/state.js';
import { BrowserTools } from '../tools/browser-tools.js';
import { Neo4jTools } from '../tools/neo4j-tools.js';
import { logger } from '../utils/logger.js';

/**
 * DAV Agent - Main LangGraph StateGraph implementation
 */
export class DavAgent {
  private graph: StateGraph<DavAgentState>;
  private browserTools: BrowserTools;
  private neo4jTools: Neo4jTools;
  private llm: BaseChatModel;
  private previousUrl: string = '';

  constructor(
    browserTools: BrowserTools,
    neo4jTools: Neo4jTools,
    llmApiKey: string,
    llmProvider: 'openai' | 'anthropic' = 'openai',
    llmModel: string = 'gpt-4o'
  ) {
    this.browserTools = browserTools;
    this.neo4jTools = neo4jTools;
    
    // Initialize LLM based on provider
    if (llmProvider === 'anthropic') {
      this.llm = new ChatAnthropic({
        anthropicApiKey: llmApiKey,
        modelName: llmModel || 'claude-sonnet-4-5',
        temperature: 0.1, // Low temperature for deterministic decisions
      });
    } else {
      this.llm = new ChatOpenAI({
        openAIApiKey: llmApiKey,
        modelName: llmModel || 'gpt-4o',
        temperature: 0.1, // Low temperature for deterministic decisions
      });
    }

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
      },
    });

    // Add nodes
    this.graph.addNode('observe_state', this.observeState.bind(this));
    this.graph.addNode('decide_action', this.decideAction.bind(this));
    this.graph.addNode('execute_tool', this.executeTool.bind(this));
    this.graph.addNode('persist_data', this.persistData.bind(this));

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
   * Node 1: observe_state - Navigate and extract Simplified DOM
   */
  private async observeState(state: DavAgentState): Promise<Partial<DavAgentState>> {
    try {
      const url = state.currentUrl;
      logger.info('OBSERVE', `Navigating to: ${url}`);

      const observation = await this.browserTools.observe(url);

      // Count actionable elements (subtract 1 for the header line)
      const elementCount = observation.domState.split('\n').length - 1;
      const historyEntry = `[OBSERVE] Visited ${observation.currentUrl}. Found ${elementCount} actionable elements.`;
      
      // Log the DOM state for debugging
      logger.info('OBSERVE', `DOM State (first 500 chars): ${observation.domState.substring(0, 500)}`);
      logger.info('OBSERVE', `Current URL: ${observation.currentUrl}, Fingerprint: ${observation.fingerprint}`);

      return {
        currentUrl: observation.currentUrl,
        domState: observation.domState,
        actionHistory: [historyEntry],
      };
    } catch (error) {
      logger.error('OBSERVE', 'Error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      return {
        explorationStatus: 'FAILURE',
        actionHistory: [`[OBSERVE] Error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Node 2: decide_action - LLM decides next action or flow end
   */
  private async decideAction(state: DavAgentState): Promise<Partial<DavAgentState>> {
    try {
      const systemPrompt = `You are an autonomous web exploration agent. Your task is to analyze the current page state and decide the next action.

Available Tools:
- clickElement: Click on a button, link, or interactive element
- typeText: Type text into an input field
- selectOption: Select an option from a dropdown
- navigate: Navigate to a specific URL

Current Page State:
${state.domState}

Action History:
${state.actionHistory.slice(-5).join('\n')}

Instructions:
1. Analyze the actionable elements on the page
2. Decide on the next logical action to explore the application
3. If you've reached a natural endpoint (form submitted, final page reached, no new actions available), respond with "FLOW_END"
4. Format your response as JSON: {"tool": "clickElement|typeText|selectOption|navigate", "selector": "...", "text": "...", "value": "...", "url": "..."} OR {"status": "FLOW_END"}

Be concise and focus on exploring new paths. Avoid repeating actions you've already taken.`;

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage('What is the next action I should take?'),
      ];

      const response = await this.llm.invoke(messages);
      const content = response.content as string;

      logger.info('DECIDE', `LLM Response: ${content}`);

      // Parse LLM response
      let decision: Partial<DavAgentState>;

      if (content.includes('FLOW_END') || content.includes('"status": "FLOW_END"')) {
        decision = {
          explorationStatus: 'FLOW_END',
          pendingAction: null,
          actionHistory: ['[DECIDE] Agent decided to end flow.'],
        };
      } else {
        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            const pendingAction: PendingAction = {
              tool: parsed.tool || 'clickElement',
              selector: parsed.selector,
              text: parsed.text,
              value: parsed.value,
              url: parsed.url,
            };

            decision = {
              pendingAction,
              explorationStatus: 'CONTINUE',
              actionHistory: [`[DECIDE] Selected action: ${pendingAction.tool} on ${pendingAction.selector || pendingAction.url}`],
            };
          } catch (e) {
            // Fallback: try to infer action from text
            decision = {
              explorationStatus: 'FLOW_END',
              pendingAction: null,
              actionHistory: [`[DECIDE] Could not parse LLM response: ${content}`],
            };
          }
        } else {
          decision = {
            explorationStatus: 'FLOW_END',
            pendingAction: null,
            actionHistory: [`[DECIDE] No valid action found in response: ${content}`],
          };
        }
      }

      return decision;
    } catch (error) {
      logger.error('DECIDE', 'Error', { error: error instanceof Error ? error.message : String(error) });
      return {
        explorationStatus: 'FAILURE',
        actionHistory: [`[DECIDE] Error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Node 3: execute_tool - Execute the pending action and generate Cypher queries
   */
  private async executeTool(state: DavAgentState): Promise<Partial<DavAgentState>> {
    if (!state.pendingAction) {
      return {
        explorationStatus: 'FAILURE',
        actionHistory: ['[EXECUTE] No pending action to execute.'],
      };
    }

    try {
      const action = state.pendingAction;
      const fromUrl = state.currentUrl;
      this.previousUrl = fromUrl;

      logger.info('EXECUTE', `Executing ${action.tool}...`);

      // Execute the browser action
      switch (action.tool) {
        case 'clickElement':
          if (!action.selector) {
            throw new Error('Selector required for clickElement');
          }
          await this.browserTools.clickElement(action.selector);
          break;

        case 'typeText':
          if (!action.selector || !action.text) {
            throw new Error('Selector and text required for typeText');
          }
          await this.browserTools.typeText(action.selector, action.text);
          break;

        case 'selectOption':
          if (!action.selector || !action.value) {
            throw new Error('Selector and value required for selectOption');
          }
          await this.browserTools.selectOption(action.selector, action.value);
          break;

        case 'navigate':
          if (!action.url) {
            throw new Error('URL required for navigate');
          }
          await this.browserTools.navigate(action.url);
          break;
      }

      // Wait a bit for page to update
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get the new URL after action
      const toUrl = this.browserTools.getCurrentUrl();

      // Generate Cypher queries for State -> Action -> State transition
      const queries: string[] = [];

      // Observe the current page state (no navigation needed, we're already there)
      const newObservation = await this.browserTools.observe();

      // Merge the "from" state
      queries.push(Neo4jTools.generateMergeStateQuery(fromUrl, 'temp')); // We'll update fingerprint later

      // Merge the "to" state
      queries.push(Neo4jTools.generateMergeStateQuery(toUrl, newObservation.fingerprint));

      // Create the transition relationship
      const actionDescription = `${action.tool}${action.selector ? ` on ${action.selector}` : ''}${action.text ? ` with text "${action.text}"` : ''}`;
      queries.push(
        Neo4jTools.generateTransitionQuery(fromUrl, toUrl, actionDescription, action.selector)
      );

      const historyEntry = `[EXECUTE] ${actionDescription}. Transitioned from ${fromUrl} to ${toUrl}.`;

      return {
        currentUrl: toUrl,
        neo4jQueries: queries,
        actionHistory: [historyEntry],
        explorationStatus: 'CONTINUE',
      };
    } catch (error) {
      logger.error('EXECUTE', 'Error', { error: error instanceof Error ? error.message : String(error) });
      return {
        explorationStatus: 'FAILURE',
        actionHistory: [`[EXECUTE] Error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Node 4: persist_data - Execute accumulated Neo4j queries
   */
  private async persistData(state: DavAgentState): Promise<Partial<DavAgentState>> {
    if (state.neo4jQueries.length === 0) {
      return {};
    }

    try {
      logger.info('PERSIST', `Executing ${state.neo4jQueries.length} Neo4j queries...`);
      await this.neo4jTools.executeQueries(state.neo4jQueries);

      return {
        neo4jQueries: [], // Clear queries after persistence
        actionHistory: [`[PERSIST] Successfully persisted ${state.neo4jQueries.length} queries to Neo4j.`],
      };
    } catch (error) {
      logger.error('PERSIST', 'Error', { error: error instanceof Error ? error.message : String(error) });
      return {
        actionHistory: [`[PERSIST] Error: ${error instanceof Error ? error.message : String(error)}`],
        // Don't fail the flow on persistence errors, just log them
      };
    }
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
   * Run the agent starting from a given URL
   */
  async run(startingUrl: string, maxIterations: number = 20): Promise<DavAgentState> {
    logger.info('AGENT', `[run] Starting run method for URL: ${startingUrl}, maxIterations: ${maxIterations}`);
    
    try {
      logger.info('AGENT', '[run] Compiling graph...');
      const compiledGraph = this.compile();
      logger.info('AGENT', '[run] Graph compiled successfully');

      const initialState: DavAgentState = {
        currentUrl: startingUrl,
        domState: '',
        actionHistory: [],
        neo4jQueries: [],
        explorationStatus: 'CONTINUE',
        pendingAction: null,
      };

      let currentState = initialState;
      let iterations = 0;

      logger.info('AGENT', `[run] Starting exploration from: ${startingUrl}`);

      while (currentState.explorationStatus === 'CONTINUE' && iterations < maxIterations) {
        try {
          logger.info('AGENT', `[run] Invoking graph for iteration ${iterations + 1}...`);
          const result = await compiledGraph.invoke(currentState);
          currentState = result as DavAgentState;
          iterations++;

          logger.info('AGENT', `[run] Iteration ${iterations}/${maxIterations} - Status: ${currentState.explorationStatus}`);
        } catch (error) {
          logger.error('AGENT', `[run] Error in iteration ${iterations}`, { 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          currentState.explorationStatus = 'FAILURE';
          break;
        }
      }

      if (iterations >= maxIterations) {
        logger.info('AGENT', '[run] Reached maximum iterations limit.');
        currentState.explorationStatus = 'FLOW_END';
      }

      logger.info('AGENT', `[run] Exploration finished. Final status: ${currentState.explorationStatus}, Iterations: ${iterations}`);
      return currentState;
    } catch (error) {
      logger.error('AGENT', '[run] Fatal error in run method', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}


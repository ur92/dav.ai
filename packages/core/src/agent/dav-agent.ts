import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DavAgentState, PendingAction } from '../types/state.js';
import { BrowserTools } from '../tools/browser-tools.js';
import { Neo4jTools } from '../tools/neo4j-tools.js';
import { logger } from '../utils/logger.js';
import { extractTokenUsage } from '../utils/token-usage.js';

/**
 * DAV Agent - Main LangGraph StateGraph implementation
 */
export class DavAgent {
  private graph: StateGraph<DavAgentState>;
  private browserTools: BrowserTools;
  private neo4jTools: Neo4jTools;
  private llm: BaseChatModel;
  private previousUrl: string = '';
  private sessionId: string;
  private credentials?: { username?: string; password?: string };
  private loginAttempted: Set<string> = new Set(); // Track URLs where login was attempted
  private loginSuccessful: boolean = false; // Track if login was successful
  private executedTransitions: Set<string> = new Set(); // Track executed transitions to avoid duplicates
  private onDecisionCallback?: (decision: string) => void; // Callback for emitting decisions to frontend
  private onTokenUsageCallback?: (inputTokens: number, outputTokens: number) => void; // Callback for tracking token usage

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
      });
    } else if (llmProvider === 'gemini') {
      this.llm = new ChatGoogleGenerativeAI({
        apiKey: llmApiKey,
        model: llmModel || 'gemini-2.5-pro',
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
      this.emitDecision(`🔍 Analyzing page: ${url}`);

      const observation = await this.browserTools.observe(url);
      this.emitDecision(`✅ Page loaded successfully`);

      // Count actionable elements (subtract 1 for the header line)
      const elementCount = observation.domState.split('\n').length - 1;
      let historyEntry = `[OBSERVE] Visited ${observation.currentUrl}. Found ${elementCount} actionable elements.`;
      
      // Check for cycle: if we've seen this fingerprint before, we've completed a cycle
      const visitedFingerprints = state.visitedFingerprints || [];
      const isCycle = visitedFingerprints.includes(observation.fingerprint);
      
      if (isCycle) {
        logger.info('OBSERVE', `Cycle detected! Fingerprint ${observation.fingerprint} was visited before. Ending exploration gracefully.`);
        historyEntry += ' [CYCLE DETECTED - Exploration complete]';
        this.emitDecision('🔄 Cycle detected');
        return {
          currentUrl: observation.currentUrl,
          domState: observation.domState,
          actionHistory: [historyEntry],
          visitedFingerprints: [...visitedFingerprints, observation.fingerprint],
          explorationStatus: 'FLOW_END', // Gracefully end when cycle detected
        };
      }
      
      // Check if this is a login screen and we have credentials
      const isLoginScreen = this.detectLoginScreen(observation.domState);
      
      // If we previously attempted login and we're no longer on a login screen, login was successful
      if (this.loginAttempted.size > 0 && !isLoginScreen && !this.loginSuccessful) {
        this.loginSuccessful = true;
        // Clear credentials to prevent further login attempts
        this.credentials = undefined;
        logger.info('OBSERVE', 'Login successful - credentials disabled to prevent reuse');
        this.emitDecision('✅ Login successful - credentials disabled');
      }
      
      if (isLoginScreen && this.credentials?.username && this.credentials?.password && !this.loginAttempted.has(observation.currentUrl) && !this.loginSuccessful) {
        historyEntry += ' [LOGIN DETECTED - Will use credentials]';
        logger.info('OBSERVE', 'Login screen detected, credentials available');
        this.emitDecision('🔐 Login form detected - Credentials available for auto-login');
      } else if (isLoginScreen) {
        this.emitDecision('🔐 Login form detected');
      }
      
      // Extract and log key page information
      const domLines = observation.domState.split('\n');
      const buttons = domLines.filter(line => line.toLowerCase().includes('button')).length;
      const inputs = domLines.filter(line => line.toLowerCase().includes('input')).length;
      const links = domLines.filter(line => line.toLowerCase().includes('a href')).length;
      
      if (buttons > 0 || inputs > 0 || links > 0) {
        this.emitDecision(`📋 Page elements: ${buttons} buttons, ${inputs} inputs, ${links} links`);
      }
      
      // Log the DOM state for debugging
      logger.info('OBSERVE', `DOM State (first 500 chars): ${observation.domState.substring(0, 500)}`);
      logger.info('OBSERVE', `Current URL: ${observation.currentUrl}, Fingerprint: ${observation.fingerprint}`);
      this.emitDecision(`🔗 Current URL: ${observation.currentUrl}`);

      return {
        currentUrl: observation.currentUrl,
        domState: observation.domState,
        actionHistory: [historyEntry],
        visitedFingerprints: [...visitedFingerprints, observation.fingerprint],
      };
    } catch (error) {
      logger.error('OBSERVE', 'Error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      this.emitDecision(`❌ Error analyzing page: ${error instanceof Error ? error.message : String(error)}`);
      return {
        explorationStatus: 'FAILURE',
        actionHistory: [`[OBSERVE] Error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Detect if the current page is a login screen
   */
  private detectLoginScreen(domState: string): boolean {
    const lowerDom = domState.toLowerCase();
    // Look for common login indicators
    const loginIndicators = [
      'type="password"',
      'password',
      'username',
      'login',
      'sign in',
      'autocomplete="username"',
      'autocomplete="current-password"',
      'id="username"',
      'id="password"',
      'name="username"',
      'name="password"',
    ];
    
    // Count how many indicators we find
    const foundIndicators = loginIndicators.filter(indicator => lowerDom.includes(indicator)).length;
    
    // If we find at least 2 indicators (e.g., password field + username field), it's likely a login screen
    return foundIndicators >= 2;
  }

  /**
   * Find the selector for a login field (username or password)
   */
  private findLoginField(domState: string, fieldType: 'username' | 'password'): string | null {
    const lines = domState.split('\n');
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      // Look for input fields with relevant attributes
      if (fieldType === 'password') {
        if (lowerLine.includes('type="password"') || lowerLine.includes('type=password')) {
          // Extract selector from the line (format: "input[type='password']#password" or similar)
          const selectorMatch = line.match(/([a-zA-Z0-9_#.\-\[\]="' ]+)/);
          if (selectorMatch) {
            // Try to find id, name, or class
            const idMatch = line.match(/id[=:](['"]?)([^'"\s]+)\1/i);
            if (idMatch) return `#${idMatch[2]}`;
            const nameMatch = line.match(/name[=:](['"]?)([^'"\s]+)\1/i);
            if (nameMatch) return `[name="${nameMatch[2]}"]`;
            const classMatch = line.match(/class[=:](['"]?)([^'"\s]+)\1/i);
            if (classMatch) return `.${classMatch[2].split(' ')[0]}`;
          }
        }
      } else {
        // Username field
        if ((lowerLine.includes('username') || lowerLine.includes('autocomplete="username"')) && 
            !lowerLine.includes('password')) {
          const idMatch = line.match(/id[=:](['"]?)([^'"\s]+)\1/i);
          if (idMatch) return `#${idMatch[2]}`;
          const nameMatch = line.match(/name[=:](['"]?)([^'"\s]+)\1/i);
          if (nameMatch) return `[name="${nameMatch[2]}"]`;
          const classMatch = line.match(/class[=:](['"]?)([^'"\s]+)\1/i);
          if (classMatch) return `.${classMatch[2].split(' ')[0]}`;
        }
      }
    }
    
    // Fallback: try common selectors
    if (fieldType === 'password') {
      return '#password, [name="password"], [type="password"]';
    } else {
      return '#username, [name="username"], input[autocomplete="username"]';
    }
  }

  /**
   * Find the submit/login button selector
   */
  private findSubmitButton(domState: string): string | null {
    const lines = domState.split('\n');
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      // Look for submit buttons, login buttons
      if ((lowerLine.includes('type="submit"') || 
           lowerLine.includes('button') && (lowerLine.includes('login') || lowerLine.includes('sign in'))) &&
          !lowerLine.includes('input')) {
        const idMatch = line.match(/id[=:](['"]?)([^'"\s]+)\1/i);
        if (idMatch) return `#${idMatch[2]}`;
        const classMatch = line.match(/class[=:](['"]?)([^'"\s]+)\1/i);
        if (classMatch) {
          const firstClass = classMatch[2].split(' ')[0];
          return `.${firstClass}`;
        }
        const textMatch = line.match(/>([^<]*login[^<]*)</i);
        if (textMatch) {
          // Try to find button by text content
          return 'button:has-text("Login"), button:has-text("Sign in"), [type="submit"]';
        }
      }
    }
    
    // Fallback: common selectors
    return 'button[type="submit"], .login-button, button:has-text("Login"), button:has-text("Sign in")';
  }

  /**
   * Node 2: decide_action - LLM decides next action or flow end
   */
  private async decideAction(state: DavAgentState): Promise<Partial<DavAgentState>> {
    try {
      // Check if this is a login screen and we haven't attempted login yet
      const isLoginScreen = this.detectLoginScreen(state.domState);
      const shouldAutoLogin = isLoginScreen && 
                              this.credentials?.username && 
                              this.credentials?.password && 
                              !this.loginAttempted.has(state.currentUrl) &&
                              !this.loginSuccessful; // Don't attempt login if already successfully logged in

      if (shouldAutoLogin) {
        logger.info('DECIDE', 'Login screen detected with credentials available - will guide LLM to login');
        // Mark this URL as login attempted to avoid infinite loops
        this.loginAttempted.add(state.currentUrl);
      }

      // For login forms, return batch actions directly without LLM call
      if (shouldAutoLogin) {
        this.emitDecision('🤖 Decision: Auto-login detected - Preparing login sequence');
        const usernameSelector = this.findLoginField(state.domState, 'username');
        const passwordSelector = this.findLoginField(state.domState, 'password');
        const submitSelector = this.findSubmitButton(state.domState);

        if (usernameSelector && passwordSelector && submitSelector) {
          logger.info('DECIDE', 'Auto-generating batch login actions', {
            usernameSelector,
            passwordSelector,
            submitSelector,
          });

          this.emitDecision(`🔍 Found login fields: username (${usernameSelector}), password (${passwordSelector})`);
          this.emitDecision(`🔍 Found submit button: ${submitSelector}`);

          const batchActions: PendingAction[] = [
            {
              tool: 'typeText',
              selector: usernameSelector,
              text: this.credentials!.username!,
            },
            {
              tool: 'typeText',
              selector: passwordSelector,
              text: this.credentials!.password!,
            },
            {
              tool: 'clickElement',
              selector: submitSelector,
            },
          ];

          this.emitDecision('🔐 Auto-login');
          return {
            pendingActions: batchActions,
            explorationStatus: 'CONTINUE',
            actionHistory: [`[DECIDE] Auto-login: Batch actions prepared (fill username, fill password, click login)`],
          };
        } else {
          this.emitDecision('⚠️ Auto-login: Could not find all required login fields, falling back to LLM');
        }
      } else {
        this.emitDecision('🤖 Decision: Analyzing page with LLM to determine next action...');
      }

      const credentialsHint = this.credentials?.username && this.credentials?.password && !this.loginSuccessful
        ? `\n\n🔐 CREDENTIALS AVAILABLE FOR LOGIN:
If you see a login form (username and password input fields), you can return MULTIPLE actions in an array:
[
  {"tool": "typeText", "selector": "#username", "text": "${this.credentials.username}"},
  {"tool": "typeText", "selector": "#password", "text": "${this.credentials.password}"},
  {"tool": "clickElement", "selector": "button[type='submit']"}
]

This allows executing all login steps in one batch, saving tokens and improving efficiency.`
        : '';

      const systemPrompt = `You are an autonomous web exploration agent. Your task is to analyze the current page state and decide actions.

Available Tools:
- clickElement: Click on a button, link, or interactive element
- typeText: Type text into an input field
- selectOption: Select an option from a dropdown
- navigate: Navigate to a specific URL

Current Page State:
${state.domState}

Action History:
${state.actionHistory.slice(-5).join('\n')}
${credentialsHint}

Instructions:
1. Analyze the actionable elements on the page
2. You can return a SINGLE action OR MULTIPLE actions in an array for batch execution
3. For login forms or multi-step interactions, return multiple actions to execute them efficiently
4. If you've reached a natural endpoint, respond with "FLOW_END"
5. Format your response as JSON:
   - Single action: {"tool": "clickElement|typeText|selectOption|navigate", "selector": "...", "text": "...", "value": "...", "url": "..."}
   - Multiple actions: {"actions": [{"tool": "...", "selector": "..."}, {"tool": "...", "selector": "..."}]}
   - End flow: {"status": "FLOW_END"}

Be concise and focus on exploring new paths. Batch related actions together when possible.`;

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage('What is the next action I should take?'),
      ];

      const response = await this.llm.invoke(messages);
      const content = response.content as string;

      // Track token usage
      const tokenUsage = extractTokenUsage(response);
      if (tokenUsage && this.onTokenUsageCallback) {
        this.onTokenUsageCallback(tokenUsage.inputTokens, tokenUsage.outputTokens);
      } else if (this.onTokenUsageCallback) {
        // Log warning if we couldn't extract usage (for debugging)
        logger.warn('DECIDE', 'Could not extract token usage from LLM response', {
          responseKeys: Object.keys(response as any),
          responseMetadata: (response as any).response_metadata,
        });
      }

      logger.info('DECIDE', `LLM Response: ${content}`);

      // Parse LLM response
      let decision: Partial<DavAgentState>;

      if (content.includes('FLOW_END') || content.includes('"status": "FLOW_END"')) {
        this.emitDecision('🏁 Flow ended');
        decision = {
          explorationStatus: 'FLOW_END',
          pendingAction: null,
          pendingActions: [],
          actionHistory: ['[DECIDE] Agent decided to end flow.'],
        };
      } else {
        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Check if it's a batch of actions
            if (parsed.actions && Array.isArray(parsed.actions)) {
              const batchActions: PendingAction[] = parsed.actions.map((action: any) => ({
                tool: action.tool || 'clickElement',
                selector: action.selector,
                text: action.text,
                value: action.value,
                url: action.url,
              }));

              // Only emit decision for batch actions (more interesting than single actions)
              // Format: concise action descriptions
              const actionDescriptions = batchActions.map(a => {
                if (a.tool === 'clickElement') {
                  // Extract meaningful part of selector (e.g., #login-button -> login-button)
                  const selector = a.selector || 'element';
                  const cleanSelector = selector.replace(/^[#.]/, '').replace(/\[.*?\]/g, '');
                  return cleanSelector || 'element';
                }
                if (a.tool === 'typeText') {
                  const selector = a.selector || 'field';
                  const cleanSelector = selector.replace(/^[#.]/, '').replace(/\[.*?\]/g, '');
                  return `fill ${cleanSelector}`;
                }
                if (a.tool === 'selectOption') return `select ${a.value}`;
                if (a.tool === 'navigate') return `navigate`;
                return a.tool;
              });
              this.emitDecision(`${actionDescriptions.join(' → ')}`);

              decision = {
                pendingActions: batchActions,
                explorationStatus: 'CONTINUE',
                actionHistory: [`[DECIDE] Selected ${batchActions.length} batch actions: ${batchActions.map(a => a.tool).join(', ')}`],
              };
                    } else {
                      // Single action (backward compatible)
                      const pendingAction: PendingAction = {
                        tool: parsed.tool || 'clickElement',
                        selector: parsed.selector,
                        text: parsed.text,
                        value: parsed.value,
                        url: parsed.url,
                      };

                      // Don't emit decisions for single actions - they're too verbose
                      // Only batch actions and special events (login, cycle, flow end) are emitted

                      decision = {
                        pendingAction,
                        pendingActions: [pendingAction], // Convert single to array for batch execution
                        explorationStatus: 'CONTINUE',
                        actionHistory: [`[DECIDE] Selected action: ${pendingAction.tool} on ${pendingAction.selector || pendingAction.url}`],
                      };
                    }
          } catch (e) {
            // Fallback: try to infer action from text
            decision = {
              explorationStatus: 'FLOW_END',
              pendingAction: null,
              pendingActions: [],
              actionHistory: [`[DECIDE] Could not parse LLM response: ${content}`],
            };
          }
        } else {
          decision = {
            explorationStatus: 'FLOW_END',
            pendingAction: null,
            pendingActions: [],
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
   * Node 3: execute_tool - Execute pending actions in batch and generate Cypher queries
   */
  private async executeTool(state: DavAgentState): Promise<Partial<DavAgentState>> {
    // Support both old single action and new batch actions
    const actionsToExecute: PendingAction[] = state.pendingActions.length > 0 
      ? state.pendingActions 
      : (state.pendingAction ? [state.pendingAction] : []);

    if (actionsToExecute.length === 0) {
      return {
        explorationStatus: 'FAILURE',
        actionHistory: ['[EXECUTE] No pending actions to execute.'],
      };
    }

    try {
      const fromUrl = state.currentUrl;
      this.previousUrl = fromUrl;

      // Build action description for checking duplicates
      const actionDescriptions = actionsToExecute.map(a => {
        if (a.tool === 'clickElement') return `${a.tool} on ${a.selector}`;
        if (a.tool === 'typeText') return `${a.tool} on ${a.selector} with text "${a.text}"`;
        if (a.tool === 'selectOption') return `${a.tool} on ${a.selector} with value "${a.value}"`;
        if (a.tool === 'navigate') return `${a.tool} to ${a.url}`;
        return a.tool;
      });
      const batchDescription = actionsToExecute.length > 1
        ? `Batch: ${actionDescriptions.join(' → ')}`
        : actionDescriptions[0];

      // Create a unique key for this transition attempt (fromUrl + action description + selector)
      const transitionKey = `${fromUrl}|||${batchDescription}|||${actionsToExecute[0]?.selector || ''}`;
      
      // Check if we've already executed this exact transition in this session
      if (this.executedTransitions.has(transitionKey)) {
        logger.info('EXECUTE', `Skipping duplicate transition: ${fromUrl} -> [${batchDescription}]`);
        this.emitDecision(`⏭️ Skipping duplicate action sequence`);
        
        // Still need to observe the current state to continue exploration
        const currentObservation = await this.browserTools.observe();
        return {
          currentUrl: currentObservation.currentUrl,
          actionHistory: [`[EXECUTE] Skipped duplicate transition: ${batchDescription} from ${fromUrl}`],
          explorationStatus: 'CONTINUE',
          pendingActions: [],
          pendingAction: null,
        };
      }

      logger.info('EXECUTE', `Executing ${actionsToExecute.length} action(s) in batch...`);
      this.emitDecision(`⚙️ Executing ${actionsToExecute.length} action(s) in batch...`);

      const executedActions: string[] = [];
      let finalUrl = fromUrl;

      // Execute all actions in sequence
      for (let i = 0; i < actionsToExecute.length; i++) {
        const action = actionsToExecute[i];
        logger.info('EXECUTE', `[${i + 1}/${actionsToExecute.length}] Executing ${action.tool}...`);

        try {
          // Execute the browser action
          switch (action.tool) {
            case 'clickElement':
              if (!action.selector) {
                throw new Error('Selector required for clickElement');
              }
              this.emitDecision(`🖱️ [${i + 1}/${actionsToExecute.length}] Clicking: ${action.selector}`);
              await this.browserTools.clickElement(action.selector);
              executedActions.push(`${action.tool} on ${action.selector}`);
              this.emitDecision(`✅ Clicked successfully`);
              break;

            case 'typeText':
              if (!action.selector || !action.text) {
                throw new Error('Selector and text required for typeText');
              }
              const textPreview = action.text.length > 30 ? action.text.substring(0, 30) + '...' : action.text;
              this.emitDecision(`⌨️ [${i + 1}/${actionsToExecute.length}] Typing into ${action.selector}: "${textPreview}"`);
              await this.browserTools.typeText(action.selector, action.text);
              executedActions.push(`${action.tool} on ${action.selector} with text "${action.text.substring(0, 20)}${action.text.length > 20 ? '...' : ''}"`);
              this.emitDecision(`✅ Text entered successfully`);
              break;

            case 'selectOption':
              if (!action.selector || !action.value) {
                throw new Error('Selector and value required for selectOption');
              }
              this.emitDecision(`📋 [${i + 1}/${actionsToExecute.length}] Selecting "${action.value}" from ${action.selector}`);
              await this.browserTools.selectOption(action.selector, action.value);
              executedActions.push(`${action.tool} on ${action.selector} with value "${action.value}"`);
              this.emitDecision(`✅ Option selected successfully`);
              break;

            case 'navigate':
              if (!action.url) {
                throw new Error('URL required for navigate');
              }
              this.emitDecision(`🧭 [${i + 1}/${actionsToExecute.length}] Navigating to: ${action.url}`);
              await this.browserTools.navigate(action.url);
              executedActions.push(`${action.tool} to ${action.url}`);
              this.emitDecision(`✅ Navigation successful`);
              break;
          }

          // Small delay between actions (except for the last one)
          if (i < actionsToExecute.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (error) {
          logger.error('EXECUTE', `Error executing action ${i + 1}`, { 
            error: error instanceof Error ? error.message : String(error),
            action: action.tool,
          });
          this.emitDecision(`❌ Error executing action ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      }

      // Wait a bit for page to update after all actions
      this.emitDecision('⏳ Waiting for page to update...');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get the final URL after all actions
      finalUrl = this.browserTools.getCurrentUrl();
      this.emitDecision(`🔗 Final URL after actions: ${finalUrl}`);

      // Generate Cypher queries for State -> Actions -> State transition
      const queries: string[] = [];

      // Observe the current page state after batch execution
      this.emitDecision('🔍 Observing page state after actions...');
      const newObservation = await this.browserTools.observe();
      this.emitDecision(`📊 Page state captured (fingerprint: ${newObservation.fingerprint.substring(0, 8)}...)`);

      // Mark this transition as executed
      this.executedTransitions.add(transitionKey);
      
      // Also create a key with the final URL for future reference
      const finalTransitionKey = `${fromUrl}|||${batchDescription}|||${actionsToExecute[0]?.selector || ''}|||${finalUrl}`;
      this.executedTransitions.add(finalTransitionKey);

      // Check if this transition already exists in the database before persisting
      const transitionAlreadyExists = await this.neo4jTools.transitionExists(
        fromUrl,
        finalUrl,
        batchDescription,
        this.sessionId,
        actionsToExecute[0]?.selector
      );

      if (transitionAlreadyExists) {
        logger.info('EXECUTE', `Transition already exists in database: ${fromUrl} -> ${finalUrl} with action "${batchDescription}". MERGE will handle duplicate.`);
        this.emitDecision(`⚠️ This transition already exists in the graph database`);
      }

      // Merge the "from" state
      queries.push(Neo4jTools.generateMergeStateQuery(fromUrl, 'temp', this.sessionId));

      // Merge the "to" state
      queries.push(Neo4jTools.generateMergeStateQuery(finalUrl, newObservation.fingerprint, this.sessionId));

      // Create a single transition relationship representing the batch of actions
      // MERGE will handle duplicates gracefully
      queries.push(
        Neo4jTools.generateTransitionQuery(fromUrl, finalUrl, batchDescription, this.sessionId, actionsToExecute[0]?.selector)
      );

      if (!transitionAlreadyExists) {
        this.emitDecision(`💾 Prepared ${queries.length} Neo4j queries for state transition`);
      } else {
        this.emitDecision(`💾 Prepared ${queries.length} Neo4j queries (MERGE will skip duplicate)`);
      }
      const historyEntry = transitionAlreadyExists
        ? `[EXECUTE] Batch executed: ${executedActions.join(' → ')}. Transitioned from ${fromUrl} to ${finalUrl}. [DUPLICATE TRANSITION - SKIPPED]`
        : `[EXECUTE] Batch executed: ${executedActions.join(' → ')}. Transitioned from ${fromUrl} to ${finalUrl}.`;

      return {
        currentUrl: finalUrl,
        neo4jQueries: queries,
        actionHistory: [historyEntry],
        explorationStatus: 'CONTINUE',
        pendingActions: [], // Clear executed actions
        pendingAction: null, // Clear for backward compatibility
      };
    } catch (error) {
      logger.error('EXECUTE', 'Error in batch execution', { error: error instanceof Error ? error.message : String(error) });
      return {
        explorationStatus: 'FAILURE',
        actionHistory: [`[EXECUTE] Error: ${error instanceof Error ? error.message : String(error)}`],
        pendingActions: [], // Clear on error
        pendingAction: null,
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
      this.emitDecision(`💾 Persisting ${state.neo4jQueries.length} state transition(s) to graph database...`);
      await this.neo4jTools.executeQueries(state.neo4jQueries);
      this.emitDecision(`✅ Successfully persisted to graph database`);

      return {
        neo4jQueries: [], // Clear queries after persistence
        actionHistory: [`[PERSIST] Successfully persisted ${state.neo4jQueries.length} queries to Neo4j.`],
      };
    } catch (error) {
      logger.error('PERSIST', 'Error', { error: error instanceof Error ? error.message : String(error) });
      this.emitDecision(`❌ Error persisting to graph database: ${error instanceof Error ? error.message : String(error)}`);
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
   * Set callback for emitting decisions to frontend
   */
  setDecisionCallback(callback: (decision: string) => void): void {
    this.onDecisionCallback = callback;
  }

  /**
   * Set callback for tracking token usage
   */
  setTokenUsageCallback(callback: (inputTokens: number, outputTokens: number) => void): void {
    this.onTokenUsageCallback = callback;
  }

  /**
   * Emit a decision to the frontend (if callback is set)
   */
  private emitDecision(decision: string): void {
    if (this.onDecisionCallback) {
      this.onDecisionCallback(decision);
    }
  }

  /**
   * Run the agent starting from a given URL
   */
  async run(startingUrl: string, maxIterations: number = 20): Promise<DavAgentState> {
    logger.info('AGENT', `[run] Starting run method`, {
      startingUrl,
      maxIterations,
      note: maxIterations === 20 ? 'Using default value (20) - check if value was passed correctly' : 'Using provided value',
    });
    
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
                pendingActions: [],
                visitedFingerprints: [],
              };

      let currentState = initialState;
      let iterations = 0;

      logger.info('AGENT', `[run] Starting exploration from: ${startingUrl}`);
      this.emitDecision(`🚀 Starting exploration from: ${startingUrl}`);
      this.emitDecision(`📊 Maximum iterations: ${maxIterations}`);

      while (currentState.explorationStatus === 'CONTINUE' && iterations < maxIterations) {
        try {
          logger.info('AGENT', `[run] Invoking graph for iteration ${iterations + 1}...`);
          this.emitDecision(`\n━━━ Iteration ${iterations + 1}/${maxIterations} ━━━`);
          // Set recursion limit to allow for multiple graph steps per iteration
          // Each iteration can involve: observe -> decide -> execute -> persist (4 steps)
          // Use a high recursion limit to prevent premature termination
          const result = await compiledGraph.invoke(currentState, {
            recursionLimit: maxIterations * 10,
          } as any); // Type assertion needed due to LangGraph type definitions
          currentState = result as DavAgentState;
          iterations++;

          logger.info('AGENT', `[run] Iteration ${iterations}/${maxIterations} - Status: ${currentState.explorationStatus}`);
          this.emitDecision(`✓ Iteration ${iterations} complete - Status: ${currentState.explorationStatus}`);
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
        });
        this.emitDecision(`⏱️ Reached maximum iterations limit (${maxIterations})`);
        currentState.explorationStatus = 'FLOW_END';
      }

      logger.info('AGENT', `[run] Exploration finished. Final status: ${currentState.explorationStatus}, Iterations: ${iterations}`);
      this.emitDecision(`\n━━━ Exploration Complete ━━━`);
      this.emitDecision(`📊 Final status: ${currentState.explorationStatus}`);
      this.emitDecision(`📈 Total iterations: ${iterations}`);
      this.emitDecision(`🔗 Final URL: ${currentState.currentUrl}`);
      this.emitDecision(`📝 Total actions: ${currentState.actionHistory.length}`);
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


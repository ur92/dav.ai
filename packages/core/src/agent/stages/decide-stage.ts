import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DavAgentState, PendingAction } from '../../types/state.js';
import { StageContext } from './stage-context.js';
import { logger } from '../../utils/logger.js';
import { extractTokenUsage } from '../../utils/token-usage.js';
import { detectLoginScreen, findLoginField, findSubmitButton } from './login-helpers.js';

/**
 * Creates the decide_action node handler
 * Node 2: decide_action - LLM decides next action or flow end
 */
export function createDecideStage(context: StageContext) {
  return async (state: DavAgentState): Promise<Partial<DavAgentState>> => {
    try {
      // Check if this is a login screen and we haven't attempted login yet
      const isLoginScreen = detectLoginScreen(state.domState);
      const shouldAutoLogin = isLoginScreen && 
                              context.credentials.value?.username && 
                              context.credentials.value?.password && 
                              !context.loginAttempted.has(state.currentUrl) &&
                              !context.loginSuccessful.value; // Don't attempt login if already successfully logged in

      if (shouldAutoLogin) {
        logger.info('DECIDE', 'Login screen detected with credentials available - will guide LLM to login');
        // Mark this URL as login attempted to avoid infinite loops
        context.loginAttempted.add(state.currentUrl);
      }

      // For login forms, return batch actions directly without LLM call
      if (shouldAutoLogin) {
        logger.info('DECIDE', 'Auto-login detected - Preparing login sequence', undefined, context.sessionId);
        const usernameSelector = findLoginField(state.domState, 'username');
        const passwordSelector = findLoginField(state.domState, 'password');
        const submitSelector = findSubmitButton(state.domState);

        if (usernameSelector && passwordSelector && submitSelector) {
          logger.info('DECIDE', 'Auto-generating batch login actions', {
            usernameSelector,
            passwordSelector,
            submitSelector,
          }, context.sessionId);

          const batchActions: PendingAction[] = [
            {
              tool: 'typeText',
              selector: usernameSelector,
              text: context.credentials.value!.username!,
            },
            {
              tool: 'typeText',
              selector: passwordSelector,
              text: context.credentials.value!.password!,
            },
            {
              tool: 'clickElement',
              selector: submitSelector,
            },
          ];

          logger.info('DECIDE', 'Auto-login batch actions prepared', undefined, context.sessionId);
          return {
            pendingActions: batchActions,
            explorationStatus: 'CONTINUE',
            actionHistory: [`[DECIDE] Auto-login: Batch actions prepared (fill username, fill password, click login)`],
          };
        } else {
          logger.warn('DECIDE', 'Auto-login: Could not find all required login fields, falling back to LLM', undefined, context.sessionId);
        }
      } else {
        logger.info('DECIDE', 'Analyzing page with LLM to determine next action', undefined, context.sessionId);
      }

      const credentialsHint = context.credentials.value?.username && context.credentials.value?.password && !context.loginSuccessful.value
        ? `\n\n🔐 CREDENTIALS AVAILABLE FOR LOGIN:
If you see a login form (username and password input fields), you can return MULTIPLE actions in an array:
[
  {"tool": "typeText", "selector": "#username", "text": "${context.credentials.value.username}"},
  {"tool": "typeText", "selector": "#password", "text": "${context.credentials.value.password}"},
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

      const response = await context.llm.invoke(messages);
      const content = response.content as string;

      // Track token usage
      const tokenUsage = extractTokenUsage(response);
      if (tokenUsage && context.onTokenUsageCallback) {
        context.onTokenUsageCallback(tokenUsage.inputTokens, tokenUsage.outputTokens);
      } else if (context.onTokenUsageCallback) {
        // Log warning if we couldn't extract usage (for debugging)
        logger.warn('DECIDE', 'Could not extract token usage from LLM response', {
          responseKeys: Object.keys(response as any),
          responseMetadata: (response as any).response_metadata,
        });
      }

      logger.info('DECIDE', `LLM Response: ${content}`, undefined, context.sessionId);

      // Parse LLM response
      let decision: Partial<DavAgentState>;

      if (content.includes('FLOW_END') || content.includes('"status": "FLOW_END"')) {
        logger.info('DECIDE', 'Flow ended', undefined, context.sessionId);
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

              logger.info('DECIDE', `Selected ${batchActions.length} batch actions: ${batchActions.map(a => a.tool).join(', ')}`, undefined, context.sessionId);

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
      logger.error('DECIDE', 'Error', { error: error instanceof Error ? error.message : String(error) }, context.sessionId);
      return {
        explorationStatus: 'FAILURE',
        actionHistory: [`[DECIDE] Error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  };
}


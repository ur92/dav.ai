import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DavAgentState, PendingAction } from '../../types/state.js';
import { StageContext } from './stage-context.js';
import { logger } from '../../utils/logger.js';
import { extractTokenUsage } from '../../utils/token-usage.js';
import { detectLoginScreen, findLoginField, findSubmitButton } from '../helpers/login-helpers.js';
import { extractModalElements, findModalCloseButtons } from '../helpers/modal-helpers.js';
import { buildDecideStagePrompt, buildCredentialsHint } from './decide-stage.prompts.js';
import { filterDomStateToUnexplored, getSectionCoverageSummary, analyzeSectionCoverage } from '../helpers/backtrack-helpers.js';

/**
 * Creates the decide_action node handler
 * Node 2: decide_action - LLM decides next action or flow end
 * 
 * Now filters DOM to show only unexplored actions to the LLM,
 * preventing repeated exploration of already-tried actions.
 */
export function createDecideStage(context: StageContext) {
  return async (state: DavAgentState): Promise<Partial<DavAgentState>> => {
    // Early exit if exploration has already ended
    if (state.explorationStatus === 'FLOW_END' || state.explorationStatus === 'FAILURE') {
      logger.info('DECIDE', `Exploration already ended with status: ${state.explorationStatus}, skipping decision`, undefined, context.sessionId);
      return {}; // Return empty update to preserve state
    }

    // Handle BACKTRACK status - just pass through to observe stage
    if (state.explorationStatus === 'BACKTRACK') {
      logger.info('DECIDE', 'Backtrack requested - passing through to observe stage', undefined, context.sessionId);
      return {}; // Let observe stage handle the backtrack
    }

    try {
      // Check if there are unexplored actions available
      const unexploredActions = state.unexploredActions || [];
      
      if (unexploredActions.length === 0) {
        // No unexplored actions - this shouldn't happen if observe stage works correctly
        // but handle it gracefully by triggering backtrack
        logger.warn('DECIDE', 'No unexplored actions available - triggering backtrack', undefined, context.sessionId);
        return {
          explorationStatus: 'BACKTRACK',
          actionHistory: ['[DECIDE] No unexplored actions - triggering backtrack'],
        };
      }

      logger.info('DECIDE', `${unexploredActions.length} unexplored actions available`, undefined, context.sessionId);

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
        ? buildCredentialsHint(context.credentials.value.username, context.credentials.value.password)
        : '';

      // Track modal interactions and provide context
      const modalElements = extractModalElements(state.domState);
      const closeButtons = findModalCloseButtons(state.domState);
      const previouslyInteractedModals = Array.from(context.interactedModalSelectors);
      
      // Build modal interaction hint
      let modalHint = '';
      if (modalElements.length > 0) {
        modalHint = '\n\n🎯 MODAL INTERACTION STRATEGY:\n';
        if (previouslyInteractedModals.length > 0) {
          modalHint += `- You have previously interacted with these modal elements: ${previouslyInteractedModals.join(', ')}\n`;
          modalHint += '- CONTINUE interacting with modal elements you\'ve started working with (deep flow)\n';
          modalHint += '- Explore all interactive elements within the modal before closing it\n';
        } else {
          modalHint += '- Start interacting with modal elements (forms, buttons, inputs, etc.)\n';
        }
        if (closeButtons.length > 0) {
          modalHint += `- When you finish interacting with the modal, close it using: ${closeButtons.join(' or ')}\n`;
        } else {
          modalHint += '- When you finish interacting with the modal, look for close buttons (X, Close, Cancel, etc.)\n';
        }
      }

      // Filter DOM state to show only unexplored actions
      // This helps the LLM focus on new actions and prevents re-trying explored ones
      const filteredDomState = filterDomStateToUnexplored(state.domState, unexploredActions);
      
      // Derive section coverage from frontier for breadth-first exploration guidance
      const frontierMap = new Map(Object.entries(state.explorationFrontier || {}));
      const sectionCoverage = getSectionCoverageSummary(frontierMap);
      const coverage = analyzeSectionCoverage(frontierMap);
      const exploredPatterns = Array.from(coverage.keys());
      
      // Check if root page has been visited
      const rootVisited = coverage.has('/');
      
      // Build section coverage hint
      let sectionHint = '';
      if (exploredPatterns.length > 0) {
        sectionHint = `\n\n🗺️ SECTION COVERAGE:\n`;
        sectionHint += `${sectionCoverage}\n`;
        if (!rootVisited) {
          sectionHint += `- Root/home page (/) has not been visited yet - consider exploring it\n`;
        }
        sectionHint += `- Prioritize exploring different URL path patterns (breadth-first) before going deep into one section\n`;
        sectionHint += `- If you see navigation links to unexplored sections, prioritize those\n`;
      }
      
      // Add exploration context hint
      const explorationHint = `\n\n📊 EXPLORATION PROGRESS:\n` +
        `- ${unexploredActions.length} unexplored actions remaining on this page\n` +
        `- Only unexplored actions are shown below - these are actions that haven't been tried yet\n` +
        `- Choose one action to explore next\n`;

      const systemPrompt = buildDecideStagePrompt(
        filteredDomState,
        state.actionHistory,
        credentialsHint,
        modalHint + sectionHint + explorationHint
      );

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
        // LLM wants to end flow - but check if there are unexplored actions
        // If there are, trigger backtrack instead
        if (unexploredActions.length > 0) {
          logger.info('DECIDE', 'LLM requested FLOW_END but unexplored actions remain - triggering backtrack', undefined, context.sessionId);
          decision = {
            explorationStatus: 'BACKTRACK',
            pendingAction: null,
            pendingActions: [],
            actionHistory: ['[DECIDE] LLM requested end but actions remain - triggering backtrack'],
          };
        } else {
          logger.info('DECIDE', 'Flow ended', undefined, context.sessionId);
          decision = {
            explorationStatus: 'FLOW_END',
            pendingAction: null,
            pendingActions: [],
            actionHistory: ['[DECIDE] Agent decided to end flow.'],
          };
        }
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

              // Track modal interactions
              batchActions.forEach(action => {
                if (action.selector) {
                  const selector = action.selector;
                  if (modalElements.some(el => el.includes(selector))) {
                    context.interactedModalSelectors.add(selector);
                  }
                }
              });

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

              // Track modal interactions
              if (pendingAction.selector && modalElements.some(el => el.includes(pendingAction.selector!))) {
                context.interactedModalSelectors.add(pendingAction.selector);
              }

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
            // Fallback: trigger backtrack instead of ending
            logger.warn('DECIDE', `Could not parse LLM response, triggering backtrack: ${content}`, undefined, context.sessionId);
            decision = {
              explorationStatus: 'BACKTRACK',
              pendingAction: null,
              pendingActions: [],
              actionHistory: [`[DECIDE] Could not parse LLM response - triggering backtrack`],
            };
          }
        } else {
          // No valid action found - trigger backtrack instead of ending
          logger.warn('DECIDE', `No valid action found in response, triggering backtrack: ${content}`, undefined, context.sessionId);
          decision = {
            explorationStatus: 'BACKTRACK',
            pendingAction: null,
            pendingActions: [],
            actionHistory: [`[DECIDE] No valid action found - triggering backtrack`],
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

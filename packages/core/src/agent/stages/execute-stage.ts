import { DavAgentState, PendingAction, ExplorationState } from '../../types/state.js';
import { StageContext } from './stage-context.js';
import { logger } from '../../utils/logger.js';
import { Neo4jTools } from '../../utils/neo4j-tools.js';
import { markActionExploredByUrl, updateBacktrackStack, getTextFromDomLine } from '../helpers/backtrack-helpers.js';

/**
 * Creates the execute_tool node handler
 * Node 3: execute_tool - Execute pending actions in batch and generate Cypher queries
 * 
 * Now marks executed actions as explored in the exploration frontier,
 * enabling action-based exploration tracking.
 */
export function createExecuteStage(context: StageContext) {
  return async (state: DavAgentState): Promise<Partial<DavAgentState>> => {
    // Early exit if exploration has already ended
    if (state.explorationStatus === 'FLOW_END' || state.explorationStatus === 'FAILURE') {
      logger.info('EXECUTE', `Exploration already ended with status: ${state.explorationStatus}, skipping execution`, undefined, context.sessionId);
      return {}; // Return empty update to preserve state
    }

    // Handle BACKTRACK status - just pass through to observe stage
    if (state.explorationStatus === 'BACKTRACK') {
      logger.info('EXECUTE', 'Backtrack requested - passing through', undefined, context.sessionId);
      return {}; // Let observe stage handle the backtrack
    }

    // Support both old single action and new batch actions
    const actionsToExecute: PendingAction[] = state.pendingActions.length > 0 
      ? state.pendingActions 
      : (state.pendingAction ? [state.pendingAction] : []);

    if (actionsToExecute.length === 0) {
      // No actions - this might happen during backtracking, not necessarily a failure
      logger.warn('EXECUTE', 'No pending actions to execute', undefined, context.sessionId);
      return {
        explorationStatus: 'CONTINUE',  // Don't fail, let the cycle continue
        actionHistory: ['[EXECUTE] No pending actions to execute.'],
      };
    }

    try {
      const fromUrl = state.currentUrl;
      const currentFingerprint = state.currentFingerprint;

      // Build action description for checking duplicates (include text for unique ID)
      const actionDescriptions = actionsToExecute.map(a => {
        const actionText = a.text || getTextFromDomLine(state.domState, a.selector || '');
        if (a.tool === 'clickElement') return `${a.tool} on ${a.selector} [${actionText}]`;
        if (a.tool === 'typeText') return `${a.tool} on ${a.selector} with text "${a.text}"`;
        if (a.tool === 'selectOption') return `${a.tool} on ${a.selector} with value "${a.value}"`;
        if (a.tool === 'navigate') return `${a.tool} to ${a.url}`;
        return a.tool;
      });
      const batchDescription = actionsToExecute.length > 1
        ? `Batch: ${actionDescriptions.join(' → ')}`
        : actionDescriptions[0];

      // Create a unique key for this transition attempt (fromUrl + action description with text)
      // Include action text in the key to distinguish between different elements with same selector
      const firstAction = actionsToExecute[0];
      const firstActionText = firstAction?.text || getTextFromDomLine(state.domState, firstAction?.selector || '');
      const transitionKey = `${fromUrl}|||${firstAction?.selector || ''}|||${firstActionText}`;
      
      // Check if we've already executed this exact transition in this session
      if (context.executedTransitions.has(transitionKey)) {
        logger.info('EXECUTE', `Skipping duplicate transition: ${fromUrl} -> [${batchDescription}]`, undefined, context.sessionId);
        
        // Increment consecutive skip counter for loop detection
        context.consecutiveSkipCount.value++;
        
        // If we've skipped too many times in a row, we're stuck in a loop - end exploration
        const MAX_CONSECUTIVE_SKIPS = 5;
        if (context.consecutiveSkipCount.value >= MAX_CONSECUTIVE_SKIPS) {
          logger.warn('EXECUTE', `Detected loop: ${context.consecutiveSkipCount.value} consecutive duplicate skips. Ending exploration.`, undefined, context.sessionId);
          return {
            actionHistory: [`[EXECUTE] Exploration ended due to repeated duplicate attempts (loop detected)`],
            explorationStatus: 'FLOW_END',
            pendingActions: [],
            pendingAction: null,
          };
        }
        
        // Mark the action as explored even if we're skipping it (by URL, with text for uniqueness)
        for (const action of actionsToExecute) {
          if (action.selector) {
            const actionText = action.text || getTextFromDomLine(state.domState, action.selector);
            markActionExploredByUrl(context.explorationFrontier, fromUrl, action.selector, actionText);
          }
        }
        
        // Still need to observe the current state to continue exploration
        const currentObservation = await context.browserTools.observe();
        return {
          currentUrl: currentObservation.currentUrl,
          actionHistory: [`[EXECUTE] Skipped duplicate transition: ${batchDescription} from ${fromUrl}`],
          explorationStatus: 'CONTINUE',
          pendingActions: [],
          pendingAction: null,
        };
      }
      
      // Reset consecutive skip counter since we're executing a new action
      context.consecutiveSkipCount.value = 0;

      logger.info('EXECUTE', `Executing ${actionsToExecute.length} action(s) in batch...`, undefined, context.sessionId);

      const executedActions: string[] = [];
      const executedSelectors: string[] = [];
      let finalUrl = fromUrl;

      // Execute all actions in sequence
      for (let i = 0; i < actionsToExecute.length; i++) {
        const action = actionsToExecute[i];
        logger.info('EXECUTE', `[${i + 1}/${actionsToExecute.length}] Executing ${action.tool}...`, undefined, context.sessionId);

        try {
          // Execute the browser action
          switch (action.tool) {
            case 'clickElement':
              if (!action.selector) {
                throw new Error('Selector required for clickElement');
              }
              logger.info('EXECUTE', `[${i + 1}/${actionsToExecute.length}] Clicking: ${action.selector}`, undefined, context.sessionId);
              await context.browserTools.clickElement(action.selector);
              executedActions.push(`${action.tool} on ${action.selector}`);
              executedSelectors.push(action.selector);
              logger.info('EXECUTE', `[${i + 1}/${actionsToExecute.length}] Clicked successfully`, undefined, context.sessionId);
              break;

            case 'typeText':
              if (!action.selector || !action.text) {
                throw new Error('Selector and text required for typeText');
              }
              const textPreview = action.text.length > 30 ? action.text.substring(0, 30) + '...' : action.text;
              logger.info('EXECUTE', `[${i + 1}/${actionsToExecute.length}] Typing into ${action.selector}: "${textPreview}"`, undefined, context.sessionId);
              await context.browserTools.typeText(action.selector, action.text);
              executedActions.push(`${action.tool} on ${action.selector} with text "${action.text.substring(0, 20)}${action.text.length > 20 ? '...' : ''}"`);
              executedSelectors.push(action.selector);
              logger.info('EXECUTE', `[${i + 1}/${actionsToExecute.length}] Text entered successfully`, undefined, context.sessionId);
              break;

            case 'selectOption':
              if (!action.selector || !action.value) {
                throw new Error('Selector and value required for selectOption');
              }
              logger.info('EXECUTE', `[${i + 1}/${actionsToExecute.length}] Selecting "${action.value}" from ${action.selector}`, undefined, context.sessionId);
              await context.browserTools.selectOption(action.selector, action.value);
              executedActions.push(`${action.tool} on ${action.selector} with value "${action.value}"`);
              executedSelectors.push(action.selector);
              logger.info('EXECUTE', `[${i + 1}/${actionsToExecute.length}] Option selected successfully`, undefined, context.sessionId);
              break;

            case 'navigate':
              // Navigation by URL is disabled - agent must interact with UI elements only
              logger.error('EXECUTE', `[${i + 1}/${actionsToExecute.length}] Navigation by URL is disabled. Use clickElement to interact with links/buttons instead.`, undefined, context.sessionId);
              throw new Error('Navigation by URL is disabled. You must interact with the webapp through UI elements (buttons, links, etc.) instead of changing URLs directly.');
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
          }, context.sessionId);
          
          // Mark failed action as explored to avoid retrying (by URL, with text for uniqueness)
          if (action.selector) {
            const actionText = action.text || getTextFromDomLine(state.domState, action.selector);
            markActionExploredByUrl(context.explorationFrontier, fromUrl, action.selector, actionText);
            logger.info('EXECUTE', `Marked failed action as explored: ${action.selector}`, undefined, context.sessionId);
          }
          
          throw error;
        }
      }

      // Mark all executed actions as explored in the current state (by URL, with text for uniqueness)
      for (let i = 0; i < executedSelectors.length; i++) {
        const selector = executedSelectors[i];
        const action = actionsToExecute[i];
        const actionText = action?.text || getTextFromDomLine(state.domState, selector);
        markActionExploredByUrl(context.explorationFrontier, fromUrl, selector, actionText);
      }
      logger.info('EXECUTE', `Marked ${executedSelectors.length} action(s) as explored at ${fromUrl}`, undefined, context.sessionId);
      
      // Update backtrack stack - current state may still have unexplored actions
      const normalizedFromUrl = fromUrl.replace(/\/$/, '').split('?')[0];
      updateBacktrackStack(context.backtrackStack, context.explorationFrontier, normalizedFromUrl);

      // Wait for network to be idle after all actions (waits for 500ms of no requests)
      logger.info('EXECUTE', 'Waiting for network to be idle (500ms of no active requests)...', undefined, context.sessionId);
      try {
        await context.browserTools.waitForNetworkIdle(30000);
        logger.info('EXECUTE', 'Network is idle (500ms of no requests completed)', undefined, context.sessionId);
      } catch (error) {
        logger.warn('EXECUTE', 'Network idle timeout - proceeding anyway', { error: error instanceof Error ? error.message : String(error) }, context.sessionId);
      }

      // Get the final URL after all actions
      finalUrl = context.browserTools.getCurrentUrl();
      logger.info('EXECUTE', `Final URL after actions: ${finalUrl}`, undefined, context.sessionId);

      // Generate Cypher queries for State -> Actions -> State transition
      const queries: string[] = [];

      // Observe the current page state after batch execution
      logger.info('EXECUTE', 'Observing page state after actions...', undefined, context.sessionId);
      const newObservation = await context.browserTools.observe();
      logger.info('EXECUTE', `Page state captured (fingerprint: ${newObservation.fingerprint.substring(0, 8)}...)`, undefined, context.sessionId);

      // Mark this transition as executed
      context.executedTransitions.add(transitionKey);
      
      // Also create a key with the final URL for future reference
      const finalTransitionKey = `${fromUrl}|||${batchDescription}|||${actionsToExecute[0]?.selector || ''}|||${finalUrl}`;
      context.executedTransitions.add(finalTransitionKey);

      // Check if this transition already exists in the database before persisting
      const transitionAlreadyExists = await context.neo4jTools.transitionExists(
        fromUrl,
        finalUrl,
        batchDescription,
        context.sessionId,
        actionsToExecute[0]?.selector
      );

      if (transitionAlreadyExists) {
        logger.info('EXECUTE', `Transition already exists in database: ${fromUrl} -> ${finalUrl} with action "${batchDescription}". MERGE will handle duplicate.`, undefined, context.sessionId);
      }

      // Merge the "from" state
      queries.push(Neo4jTools.generateMergeStateQuery(fromUrl, currentFingerprint || 'temp', context.sessionId));

      // Merge the "to" state
      queries.push(Neo4jTools.generateMergeStateQuery(finalUrl, newObservation.fingerprint, context.sessionId));

      // Create a single transition relationship representing the batch of actions
      // MERGE will handle duplicates gracefully
      queries.push(
        Neo4jTools.generateTransitionQuery(fromUrl, finalUrl, batchDescription, context.sessionId, actionsToExecute[0]?.selector)
      );

      if (!transitionAlreadyExists) {
        logger.info('EXECUTE', `Prepared ${queries.length} Neo4j queries for state transition`, undefined, context.sessionId);
      } else {
        logger.info('EXECUTE', `Prepared ${queries.length} Neo4j queries (MERGE will skip duplicate)`, undefined, context.sessionId);
      }
      const historyEntry = transitionAlreadyExists
        ? `[EXECUTE] Batch executed: ${executedActions.join(' → ')}. Transitioned from ${fromUrl} to ${finalUrl}. [DUPLICATE TRANSITION - SKIPPED]`
        : `[EXECUTE] Batch executed: ${executedActions.join(' → ')}. Transitioned from ${fromUrl} to ${finalUrl}.`;

      // Convert frontier to serializable format for state
      const frontierRecord: Record<string, ExplorationState> = {};
      context.explorationFrontier.forEach((value, key) => {
        frontierRecord[key] = value;
      });

      return {
        currentUrl: finalUrl,
        neo4jQueries: queries,
        actionHistory: [historyEntry],
        explorationStatus: 'CONTINUE',
        pendingActions: [], // Clear executed actions
        pendingAction: null, // Clear for backward compatibility
        explorationFrontier: frontierRecord,
        backtrackStack: [...context.backtrackStack],
      };
    } catch (error) {
      logger.error('EXECUTE', 'Error in batch execution', { error: error instanceof Error ? error.message : String(error) }, context.sessionId);
      
      // On error, trigger backtrack instead of failing completely
      // This allows exploration to continue from a different state
      logger.info('EXECUTE', 'Action failed - triggering backtrack to continue exploration', undefined, context.sessionId);
      
      return {
        explorationStatus: 'BACKTRACK',
        actionHistory: [`[EXECUTE] Error: ${error instanceof Error ? error.message : String(error)} - triggering backtrack`],
        pendingActions: [], // Clear on error
        pendingAction: null,
      };
    }
  };
}

import { DavAgentState, PendingAction } from '../../types/state.js';
import { StageContext } from './stage-context.js';
import { logger } from '../../utils/logger.js';
import { Neo4jTools } from '../../tools/neo4j-tools.js';

/**
 * Creates the execute_tool node handler
 * Node 3: execute_tool - Execute pending actions in batch and generate Cypher queries
 */
export function createExecuteStage(context: StageContext) {
  return async (state: DavAgentState): Promise<Partial<DavAgentState>> => {
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
      if (context.executedTransitions.has(transitionKey)) {
        logger.info('EXECUTE', `Skipping duplicate transition: ${fromUrl} -> [${batchDescription}]`);
        context.emitDecision(`⏭️ Skipping duplicate action sequence`);
        
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

      logger.info('EXECUTE', `Executing ${actionsToExecute.length} action(s) in batch...`);
      context.emitDecision(`⚙️ Executing ${actionsToExecute.length} action(s) in batch...`);

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
              context.emitDecision(`🖱️ [${i + 1}/${actionsToExecute.length}] Clicking: ${action.selector}`);
              await context.browserTools.clickElement(action.selector);
              executedActions.push(`${action.tool} on ${action.selector}`);
              context.emitDecision(`✅ Clicked successfully`);
              break;

            case 'typeText':
              if (!action.selector || !action.text) {
                throw new Error('Selector and text required for typeText');
              }
              const textPreview = action.text.length > 30 ? action.text.substring(0, 30) + '...' : action.text;
              context.emitDecision(`⌨️ [${i + 1}/${actionsToExecute.length}] Typing into ${action.selector}: "${textPreview}"`);
              await context.browserTools.typeText(action.selector, action.text);
              executedActions.push(`${action.tool} on ${action.selector} with text "${action.text.substring(0, 20)}${action.text.length > 20 ? '...' : ''}"`);
              context.emitDecision(`✅ Text entered successfully`);
              break;

            case 'selectOption':
              if (!action.selector || !action.value) {
                throw new Error('Selector and value required for selectOption');
              }
              context.emitDecision(`📋 [${i + 1}/${actionsToExecute.length}] Selecting "${action.value}" from ${action.selector}`);
              await context.browserTools.selectOption(action.selector, action.value);
              executedActions.push(`${action.tool} on ${action.selector} with value "${action.value}"`);
              context.emitDecision(`✅ Option selected successfully`);
              break;

            case 'navigate':
              if (!action.url) {
                throw new Error('URL required for navigate');
              }
              context.emitDecision(`🧭 [${i + 1}/${actionsToExecute.length}] Navigating to: ${action.url}`);
              await context.browserTools.navigate(action.url);
              executedActions.push(`${action.tool} to ${action.url}`);
              context.emitDecision(`✅ Navigation successful`);
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
          context.emitDecision(`❌ Error executing action ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      }

      // Wait a bit for page to update after all actions
      context.emitDecision('⏳ Waiting for page to update...');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get the final URL after all actions
      finalUrl = context.browserTools.getCurrentUrl();
      context.emitDecision(`🔗 Final URL after actions: ${finalUrl}`);

      // Generate Cypher queries for State -> Actions -> State transition
      const queries: string[] = [];

      // Observe the current page state after batch execution
      context.emitDecision('🔍 Observing page state after actions...');
      const newObservation = await context.browserTools.observe();
      context.emitDecision(`📊 Page state captured (fingerprint: ${newObservation.fingerprint.substring(0, 8)}...)`);

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
        logger.info('EXECUTE', `Transition already exists in database: ${fromUrl} -> ${finalUrl} with action "${batchDescription}". MERGE will handle duplicate.`);
        context.emitDecision(`⚠️ This transition already exists in the graph database`);
      }

      // Merge the "from" state
      queries.push(Neo4jTools.generateMergeStateQuery(fromUrl, 'temp', context.sessionId));

      // Merge the "to" state
      queries.push(Neo4jTools.generateMergeStateQuery(finalUrl, newObservation.fingerprint, context.sessionId));

      // Create a single transition relationship representing the batch of actions
      // MERGE will handle duplicates gracefully
      queries.push(
        Neo4jTools.generateTransitionQuery(fromUrl, finalUrl, batchDescription, context.sessionId, actionsToExecute[0]?.selector)
      );

      if (!transitionAlreadyExists) {
        context.emitDecision(`💾 Prepared ${queries.length} Neo4j queries for state transition`);
      } else {
        context.emitDecision(`💾 Prepared ${queries.length} Neo4j queries (MERGE will skip duplicate)`);
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
  };
}


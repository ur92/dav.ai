import { DavAgentState } from '../../types/state.js';
import { StageContext } from './stage-context.js';
import { logger } from '../../utils/logger.js';
import { detectLoginScreen } from '../helpers/login-helpers.js';
import { detectModal } from '../helpers/modal-helpers.js';

/**
 * Creates the observe_state node handler
 * Node 1: observe_state - Navigate and extract Simplified DOM
 */
export function createObserveStage(context: StageContext) {
  return async (state: DavAgentState): Promise<Partial<DavAgentState>> => {
    try {
      // Only navigate on the first observation (initial page load)
      // After that, only observe the current page - navigation should happen through UI interactions
      const isInitialObservation = !state.actionHistory || state.actionHistory.length === 0;
      const url = isInitialObservation ? state.currentUrl : undefined;
      
      if (isInitialObservation) {
        logger.info('OBSERVE', `Initial navigation to: ${state.currentUrl}`, undefined, context.sessionId);
      } else {
        logger.info('OBSERVE', `Observing current page (no navigation - agent must interact via UI)`, undefined, context.sessionId);
      }

      const observation = await context.browserTools.observe(url, context.sessionId, state.actionHistory?.length);
      logger.info('OBSERVE', `Page loaded successfully`, undefined, context.sessionId);

      // Count actionable elements (subtract 1 for the header line)
      const elementCount = observation.domState.split('\n').length - 1;
      let historyEntry = `[OBSERVE] Visited ${observation.currentUrl}. Found ${elementCount} actionable elements.`;
      
      // Check for cycle: if we've seen this fingerprint before, we've completed a cycle
      const visitedFingerprints = state.visitedFingerprints || [];
      const isCycle = visitedFingerprints.includes(observation.fingerprint);
      
      if (isCycle) {
        logger.info('OBSERVE', `Cycle detected! Fingerprint ${observation.fingerprint} was visited before. Ending exploration gracefully.`, undefined, context.sessionId);
        historyEntry += ' [CYCLE DETECTED - Exploration complete]';
      return {
        currentUrl: observation.currentUrl,
        domState: observation.domState,
        actionHistory: [historyEntry],
        visitedFingerprints: [...visitedFingerprints, observation.fingerprint],
        explorationStatus: 'FLOW_END', // Gracefully end when cycle detected
      };
      }
      
      // Check if this is a login screen and we have credentials
      const isLoginScreen = detectLoginScreen(observation.domState);
      
      // If we previously attempted login and we're no longer on a login screen, login was successful
      if (context.loginAttempted.size > 0 && !isLoginScreen && !context.loginSuccessful.value) {
        context.loginSuccessful.value = true;
        // Clear credentials to prevent further login attempts
        context.credentials.value = undefined;
        logger.info('OBSERVE', 'Login successful - credentials disabled to prevent reuse', undefined, context.sessionId);
      }
      
      if (isLoginScreen && context.credentials.value?.username && context.credentials.value?.password && !context.loginAttempted.has(observation.currentUrl) && !context.loginSuccessful.value) {
        historyEntry += ' [LOGIN DETECTED - Will use credentials]';
        logger.info('OBSERVE', 'Login screen detected, credentials available', undefined, context.sessionId);
      }
      
      // Check if modals/dialogs are present
      const hasModal = detectModal(observation.domState);
      if (hasModal) {
        historyEntry += ' [MODAL DETECTED - Prioritizing modal interactions]';
        logger.info('OBSERVE', 'Modal/dialog detected on page - will prioritize modal elements', undefined, context.sessionId);
      }
      
      // Extract and log key page information
      const domLines = observation.domState.split('\n');
      const buttons = domLines.filter(line => line.toLowerCase().includes('button')).length;
      const inputs = domLines.filter(line => line.toLowerCase().includes('input')).length;
      const links = domLines.filter(line => line.toLowerCase().includes('a href')).length;
      
      if (buttons > 0 || inputs > 0 || links > 0) {
        logger.info('OBSERVE', `Page elements: ${buttons} buttons, ${inputs} inputs, ${links} links`, undefined, context.sessionId);
      }
      
      // Log the DOM state for debugging
      logger.info('OBSERVE', `DOM State (first 500 chars): ${observation.domState.substring(0, 500)}`, undefined, context.sessionId);
      logger.info('OBSERVE', `Current URL: ${observation.currentUrl}, Fingerprint: ${observation.fingerprint}`, undefined, context.sessionId);

      return {
        currentUrl: observation.currentUrl,
        domState: observation.domState,
        actionHistory: [historyEntry],
        visitedFingerprints: [...visitedFingerprints, observation.fingerprint],
      };
    } catch (error) {
      logger.error('OBSERVE', 'Error analyzing page', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, context.sessionId);
      return {
        explorationStatus: 'FAILURE',
        actionHistory: [`[OBSERVE] Error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  };
}


import { DavAgentState } from '../../types/state.js';
import { StageContext } from './stage-context.js';
import { logger } from '../../utils/logger.js';
import { detectLoginScreen } from './login-helpers.js';

/**
 * Creates the observe_state node handler
 * Node 1: observe_state - Navigate and extract Simplified DOM
 */
export function createObserveStage(context: StageContext) {
  return async (state: DavAgentState): Promise<Partial<DavAgentState>> => {
    try {
      const url = state.currentUrl;
      logger.info('OBSERVE', `Navigating to: ${url}`);
      context.emitDecision(`🔍 Analyzing page: ${url}`);

      const observation = await context.browserTools.observe(url);
      context.emitDecision(`✅ Page loaded successfully`);

      // Count actionable elements (subtract 1 for the header line)
      const elementCount = observation.domState.split('\n').length - 1;
      let historyEntry = `[OBSERVE] Visited ${observation.currentUrl}. Found ${elementCount} actionable elements.`;
      
      // Check for cycle: if we've seen this fingerprint before, we've completed a cycle
      const visitedFingerprints = state.visitedFingerprints || [];
      const isCycle = visitedFingerprints.includes(observation.fingerprint);
      
      if (isCycle) {
        logger.info('OBSERVE', `Cycle detected! Fingerprint ${observation.fingerprint} was visited before. Ending exploration gracefully.`);
        historyEntry += ' [CYCLE DETECTED - Exploration complete]';
        context.emitDecision('🔄 Cycle detected');
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
        logger.info('OBSERVE', 'Login successful - credentials disabled to prevent reuse');
        context.emitDecision('✅ Login successful - credentials disabled');
      }
      
      if (isLoginScreen && context.credentials.value?.username && context.credentials.value?.password && !context.loginAttempted.has(observation.currentUrl) && !context.loginSuccessful.value) {
        historyEntry += ' [LOGIN DETECTED - Will use credentials]';
        logger.info('OBSERVE', 'Login screen detected, credentials available');
        context.emitDecision('🔐 Login form detected - Credentials available for auto-login');
      } else if (isLoginScreen) {
        context.emitDecision('🔐 Login form detected');
      }
      
      // Extract and log key page information
      const domLines = observation.domState.split('\n');
      const buttons = domLines.filter(line => line.toLowerCase().includes('button')).length;
      const inputs = domLines.filter(line => line.toLowerCase().includes('input')).length;
      const links = domLines.filter(line => line.toLowerCase().includes('a href')).length;
      
      if (buttons > 0 || inputs > 0 || links > 0) {
        context.emitDecision(`📋 Page elements: ${buttons} buttons, ${inputs} inputs, ${links} links`);
      }
      
      // Log the DOM state for debugging
      logger.info('OBSERVE', `DOM State (first 500 chars): ${observation.domState.substring(0, 500)}`);
      logger.info('OBSERVE', `Current URL: ${observation.currentUrl}, Fingerprint: ${observation.fingerprint}`);
      context.emitDecision(`🔗 Current URL: ${observation.currentUrl}`);

      return {
        currentUrl: observation.currentUrl,
        domState: observation.domState,
        actionHistory: [historyEntry],
        visitedFingerprints: [...visitedFingerprints, observation.fingerprint],
      };
    } catch (error) {
      logger.error('OBSERVE', 'Error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      context.emitDecision(`❌ Error analyzing page: ${error instanceof Error ? error.message : String(error)}`);
      return {
        explorationStatus: 'FAILURE',
        actionHistory: [`[OBSERVE] Error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  };
}


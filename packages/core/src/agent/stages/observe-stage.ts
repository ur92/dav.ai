import { DavAgentState, ExplorationState, BacktrackTarget } from '../../types/state.js';
import { StageContext } from './stage-context.js';
import { logger } from '../../utils/logger.js';
import { detectLoginScreen } from '../helpers/login-helpers.js';
import { detectModal } from '../helpers/modal-helpers.js';
import {
  extractActionIdentifiers,
  computeUnexploredActions,
  getOrCreateExplorationState,
  findBacktrackTarget,
  updateBacktrackStack,
  isExplorationComplete,
  analyzeSectionCoverage,
} from '../helpers/backtrack-helpers.js';

/**
 * Creates the observe_state node handler
 * Node 1: observe_state - Navigate and extract Simplified DOM
 * 
 * Now uses action-based exploration instead of cycle detection:
 * - Tracks available and explored actions per page state
 * - Computes unexplored actions for LLM decision
 * - Triggers backtracking when current page is exhausted
 */
export function createObserveStage(context: StageContext) {
  return async (state: DavAgentState): Promise<Partial<DavAgentState>> => {
    try {
      // Handle BACKTRACK status - navigate to backtrack target
      if (state.explorationStatus === 'BACKTRACK') {
        const backtrackTarget = findBacktrackTarget(
          context.backtrackStack,
          context.explorationFrontier
        );
        
        if (!backtrackTarget) {
          // No valid backtrack target - exploration is complete
          logger.info('OBSERVE', 'No backtrack targets available - exploration complete', undefined, context.sessionId);
          return {
            explorationStatus: 'FLOW_END',
            actionHistory: ['[OBSERVE] Exploration complete - all actions explored'],
          };
        }
        
        // Navigate to backtrack URL
        logger.info('OBSERVE', `Backtracking to: ${backtrackTarget.url}`, undefined, context.sessionId);
        await context.browserTools.navigate(backtrackTarget.url);
        
        // Continue with normal observation flow below
      }
      
      // Only navigate on the first observation (initial page load)
      // After that, only observe the current page - navigation should happen through UI interactions
      const isInitialObservation = !state.actionHistory || state.actionHistory.length === 0;
      const url = isInitialObservation ? state.currentUrl : undefined;
      
      if (isInitialObservation) {
        logger.info('OBSERVE', `Initial navigation to: ${state.currentUrl}`, undefined, context.sessionId);
      } else if (state.explorationStatus !== 'BACKTRACK') {
        logger.info('OBSERVE', `Observing current page (no navigation - agent must interact via UI)`, undefined, context.sessionId);
      }

      const observation = await context.browserTools.observe(url, context.sessionId, state.actionHistory?.length);
      logger.info('OBSERVE', `Page loaded successfully`, undefined, context.sessionId);

      // Extract available action identifiers from DOM (selector|||text for uniqueness)
      const actionIdentifiers = extractActionIdentifiers(observation.domState);
      const availableActions = actionIdentifiers.map(a => a.uniqueId);
      logger.info('OBSERVE', `Extracted ${availableActions.length} unique actions from DOM`, undefined, context.sessionId);

      // Get or create exploration state for this page (keyed by URL, not fingerprint)
      const previousUrl = state.currentUrl;
      const explorationState = getOrCreateExplorationState(
        context.explorationFrontier,
        observation.fingerprint,
        observation.currentUrl,
        availableActions,
        previousUrl  // Use URL as parent reference
      );

      // Compute unexplored actions
      const unexploredActions = computeUnexploredActions(
        explorationState.availableActions,
        explorationState.exploredActions
      );

      // Count actionable elements
      const elementCount = observation.domState.split('\n').length - 1;
      let historyEntry = `[OBSERVE] Visited ${observation.currentUrl}. Found ${elementCount} elements, ${unexploredActions.length} unexplored.`;
      
      // Check if this page is exhausted (no unexplored actions)
      if (unexploredActions.length === 0) {
        logger.info('OBSERVE', `No unexplored actions on current page (${observation.fingerprint.substring(0, 8)}...)`, undefined, context.sessionId);
        
        // Check if we can backtrack
        const backtrackTarget = findBacktrackTarget(
          context.backtrackStack,
          context.explorationFrontier
        );
        
        if (backtrackTarget) {
          historyEntry += ` [PAGE EXHAUSTED - Will backtrack to ${backtrackTarget.url}]`;
          logger.info('OBSERVE', `Will backtrack to: ${backtrackTarget.url} with ${backtrackTarget.unexploredCount} unexplored actions`, undefined, context.sessionId);
          
          // Convert frontier and stack to serializable format for state
          const frontierRecord: Record<string, ExplorationState> = {};
          context.explorationFrontier.forEach((value, key) => {
            frontierRecord[key] = value;
          });
          
          return {
            currentUrl: observation.currentUrl,
            currentFingerprint: observation.fingerprint,
            domState: observation.domState,
            actionHistory: [historyEntry],
            visitedFingerprints: [...(state.visitedFingerprints || []), observation.fingerprint],
            explorationStatus: 'BACKTRACK',
            unexploredActions: [],
            explorationFrontier: frontierRecord,
            backtrackStack: [...context.backtrackStack],
          };
        }
        
        // No backtrack possible - check exploration completeness
        if (isExplorationComplete(context.explorationFrontier, context.backtrackStack)) {
          // Before ending, check section coverage to ensure breadth-first exploration
          const coverage = analyzeSectionCoverage(context.explorationFrontier);
          const exploredPatterns = Array.from(coverage.keys());
          const rootVisited = coverage.has('/');
          
          // Check if we should continue exploring (generic check - not app-specific)
          // If we've only explored a few patterns, there might be more sections to discover
          // This is a heuristic: if we have very few patterns explored, we might be missing sections
          const hasMinimalCoverage = exploredPatterns.length <= 2 && !rootVisited;
          
          if (hasMinimalCoverage) {
            // Very limited exploration - might be missing major sections
            // Try to find any backtrack target, even if stack seems empty
            logger.info('OBSERVE', `Limited section coverage detected (${exploredPatterns.length} patterns). Checking for additional exploration opportunities.`, undefined, context.sessionId);
            
            // Check if there are any states in frontier with unexplored actions we might have missed
            let foundUnexplored = false;
            for (const frontierState of context.explorationFrontier.values()) {
              const unexplored = computeUnexploredActions(
                frontierState.availableActions,
                frontierState.exploredActions
              );
              if (unexplored.length > 0) {
                foundUnexplored = true;
                logger.info('OBSERVE', `Found unexplored actions in ${frontierState.url}, continuing exploration`, undefined, context.sessionId);
                break;
              }
            }
            
            if (!foundUnexplored) {
              // Truly complete
              historyEntry += ' [EXPLORATION COMPLETE - All actions explored]';
              logger.info('OBSERVE', 'Exploration complete - all actions have been explored', undefined, context.sessionId);
              
              return {
                currentUrl: observation.currentUrl,
                currentFingerprint: observation.fingerprint,
                domState: observation.domState,
                actionHistory: [historyEntry],
                visitedFingerprints: [...(state.visitedFingerprints || []), observation.fingerprint],
                explorationStatus: 'FLOW_END',
                unexploredActions: [],
              };
            }
            // Continue - found unexplored actions
          } else {
            // Normal completion check
            historyEntry += ' [EXPLORATION COMPLETE - All actions explored]';
            logger.info('OBSERVE', 'Exploration complete - all actions have been explored', undefined, context.sessionId);
            
            return {
              currentUrl: observation.currentUrl,
              currentFingerprint: observation.fingerprint,
              domState: observation.domState,
              actionHistory: [historyEntry],
              visitedFingerprints: [...(state.visitedFingerprints || []), observation.fingerprint],
              explorationStatus: 'FLOW_END',
              unexploredActions: [],
            };
          }
        }
      }
      
      // Update backtrack stack with previous URL (if any) since we're moving to a new page
      if (previousUrl && previousUrl !== observation.currentUrl) {
        // Use normalized URL for backtrack stack
        const normalizedPrevUrl = previousUrl.replace(/\/$/, '').split('?')[0];
        updateBacktrackStack(
          context.backtrackStack,
          context.explorationFrontier,
          normalizedPrevUrl
        );
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
      
      // If we've already logged in successfully and we're back on the login screen (post-logout),
      // end exploration rather than trying to log in again
      if (isLoginScreen && context.loginSuccessful.value) {
        logger.info('OBSERVE', 'Back on login screen after successful login (post-logout) - ending exploration', undefined, context.sessionId);
        return {
          currentUrl: observation.currentUrl,
          currentFingerprint: observation.fingerprint,
          domState: observation.domState,
          actionHistory: [`${historyEntry} [EXPLORATION COMPLETE - Post-logout login screen reached]`],
          visitedFingerprints: [...(state.visitedFingerprints || []), observation.fingerprint],
          explorationStatus: 'FLOW_END',
          unexploredActions: [],
        };
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
      logger.info('OBSERVE', `Unexplored actions: ${unexploredActions.length}/${availableActions.length}`, undefined, context.sessionId);

      // Convert frontier and stack to serializable format for state
      const frontierRecord: Record<string, ExplorationState> = {};
      context.explorationFrontier.forEach((value, key) => {
        frontierRecord[key] = value;
      });

      return {
        currentUrl: observation.currentUrl,
        currentFingerprint: observation.fingerprint,
        domState: observation.domState,
        actionHistory: [historyEntry],
        visitedFingerprints: [...(state.visitedFingerprints || []), observation.fingerprint],
        explorationStatus: 'CONTINUE',
        unexploredActions,
        explorationFrontier: frontierRecord,
        backtrackStack: [...context.backtrackStack],
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

import { DavAgentState } from '../../types/state.js';
import { StageContext } from './stage-context.js';
import { logger } from '../../utils/logger.js';

/**
 * Creates the persist_data node handler
 * Node 4: persist_data - Execute accumulated Neo4j queries
 */
export function createPersistStage(context: StageContext) {
  return async (state: DavAgentState): Promise<Partial<DavAgentState>> => {
    // Early exit if exploration has already ended (but still persist any pending queries)
    if ((state.explorationStatus === 'FLOW_END' || state.explorationStatus === 'FAILURE') && state.neo4jQueries.length === 0) {
      logger.info('PERSIST', `Exploration already ended with status: ${state.explorationStatus}, no queries to persist`, undefined, context.sessionId);
      return {}; // Return empty update to preserve state
    }

    // Handle BACKTRACK status - just pass through without changes
    // The backtrack will be handled by the observe stage in the next cycle
    if (state.explorationStatus === 'BACKTRACK' && state.neo4jQueries.length === 0) {
      logger.info('PERSIST', 'Backtrack requested - passing through', undefined, context.sessionId);
      return {}; // Preserve BACKTRACK status
    }

    if (state.neo4jQueries.length === 0) {
      return {};
    }

    try {
      logger.info('PERSIST', `Executing ${state.neo4jQueries.length} Neo4j queries...`, undefined, context.sessionId);
      logger.info('PERSIST', `Persisting ${state.neo4jQueries.length} state transition(s) to graph database...`, undefined, context.sessionId);
      await context.neo4jTools.executeQueries(state.neo4jQueries);
      logger.info('PERSIST', `Successfully persisted to graph database`, undefined, context.sessionId);

      return {
        neo4jQueries: [], // Clear queries after persistence
        actionHistory: [`[PERSIST] Successfully persisted ${state.neo4jQueries.length} queries to Neo4j.`],
      };
    } catch (error) {
      logger.error('PERSIST', 'Error persisting to graph database', { error: error instanceof Error ? error.message : String(error) }, context.sessionId);
      return {
        actionHistory: [`[PERSIST] Error: ${error instanceof Error ? error.message : String(error)}`],
        // Don't fail the flow on persistence errors, just log them
      };
    }
  };
}


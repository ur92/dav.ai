import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BrowserTools } from '../../tools/browser-tools.js';
import { Neo4jTools } from '../../tools/neo4j-tools.js';

/**
 * StageContext - Shared context passed to all stage handlers
 * Uses object wrappers for mutable state to ensure changes reflect back to the class
 */
export interface StageContext {
  browserTools: BrowserTools;
  neo4jTools: Neo4jTools;
  llm: BaseChatModel;
  credentials: { value?: { username?: string; password?: string } };
  loginAttempted: Set<string>;
  loginSuccessful: { value: boolean };
  executedTransitions: Set<string>;
  sessionId: string;
  emitDecision: (decision: string) => void;
  onTokenUsageCallback?: (inputTokens: number, outputTokens: number) => void;
}


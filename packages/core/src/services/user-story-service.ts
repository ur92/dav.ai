import { GraphService } from './graph-service.js';
import { ConfigService } from './config-service.js';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';

export interface UserStory {
  title: string;
  description: string;
  steps: string[];
  flow: Array<{
    from: string;
    to: string;
    action: string;
  }>;
}

export interface UserStoriesResult {
  stories: UserStory[];
  summary: string;
}

/**
 * UserStoryService - Analyzes Neo4j graph and generates user stories using LLM
 */
export class UserStoryService {
  private llm: BaseChatModel;
  private onTokenUsageCallback?: (inputTokens: number, outputTokens: number) => void;

  constructor() {
    const config = ConfigService.getConfig();
    const apiKey = ConfigService.getLLMApiKey();

    if (config.llmProvider === 'anthropic') {
      this.llm = new ChatAnthropic({
        anthropicApiKey: apiKey,
        modelName: config.llmModel || 'claude-sonnet-4-5',
        temperature: 0.3, // Slightly higher for creative story generation
      });
    } else if (config.llmProvider === 'gemini') {
      this.llm = new ChatGoogleGenerativeAI({
        apiKey: apiKey,
        model: config.llmModel || 'gemini-2.5-pro',
        temperature: 0.3, // Slightly higher for creative story generation
      });
    } else {
      this.llm = new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: config.llmModel || 'gpt-4o',
        temperature: 0.3,
      });
    }
  }

  /**
   * Generate user stories from Neo4j graph data for a specific session
   */
  async generateUserStories(sessionId: string): Promise<UserStoriesResult> {
    try {
      logger.info('UserStoryService', `Generating user stories for session: ${sessionId}`);

      // Query the graph for this session
      const graphData = await GraphService.queryGraph(500, sessionId);

      if (graphData.nodes.length === 0 || graphData.edges.length === 0) {
        logger.warn('UserStoryService', 'No graph data found for session', { sessionId });
        return {
          stories: [],
          summary: 'No exploration data found for this session.',
        };
      }

      // Format graph data for LLM
      const graphDescription = this.formatGraphForLLM(graphData);

      // Generate user stories using LLM
      const systemPrompt = `You are an expert UX analyst and product manager. Your task is to analyze web application exploration data and generate clear, actionable user stories.

The exploration data shows:
- States (pages/screens) the agent visited
- Transitions (actions) between states
- The flow of user interactions

Generate user stories that:
1. Describe complete user workflows (e.g., "User Login Flow", "User Management Flow")
2. Include clear step-by-step descriptions
3. Identify the key actions and state transitions
4. Are written from the user's perspective
5. Group related actions into logical stories

Format your response as JSON:
{
  "stories": [
    {
      "title": "Story Title",
      "description": "Brief description of what the user accomplishes",
      "steps": ["Step 1", "Step 2", "Step 3"],
      "flow": [
        {"from": "state1", "to": "state2", "action": "action description"}
      ]
    }
  ],
  "summary": "Overall summary of the application's user flows"
}`;

      const userPrompt = `Analyze the following exploration data and generate user stories:

${graphDescription}

Generate comprehensive user stories based on this exploration data.`;

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      const response = await this.llm.invoke(messages);
      const content = response.content as string;

      // Track token usage
      const usage = (response as any).response_metadata?.usage;
      if (usage && this.onTokenUsageCallback) {
        const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
        const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
        this.onTokenUsageCallback(inputTokens, outputTokens);
      }

      // Parse LLM response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          logger.info('UserStoryService', `Generated ${parsed.stories?.length || 0} user stories`);
          return parsed as UserStoriesResult;
        } catch (e) {
          logger.error('UserStoryService', 'Failed to parse LLM response as JSON', {
            error: e instanceof Error ? e.message : String(e),
            content: content.substring(0, 500),
          });
          // Fallback: return a basic story structure
          return {
            stories: [
              {
                title: 'Exploration Flow',
                description: 'User flow discovered during exploration',
                steps: graphData.edges.map((e) => `${e.label}: ${e.source} → ${e.target}`),
                flow: graphData.edges.map((e) => ({
                  from: e.source,
                  to: e.target,
                  action: e.label,
                })),
              },
            ],
            summary: 'Exploration completed. See flow details above.',
          };
        }
      } else {
        logger.error('UserStoryService', 'No JSON found in LLM response', { content: content.substring(0, 500) });
        throw new Error('Failed to generate user stories: Invalid LLM response format');
      }
    } catch (error) {
      logger.error('UserStoryService', 'Error generating user stories', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Set callback for tracking token usage
   */
  setTokenUsageCallback(callback: (inputTokens: number, outputTokens: number) => void): void {
    this.onTokenUsageCallback = callback;
  }

  /**
   * Format graph data into a readable description for LLM
   */
  private formatGraphForLLM(graphData: { nodes: Array<{ id: string; label: string; url: string }>; edges: Array<{ source: string; target: string; label: string }> }): string {
    const nodes = graphData.nodes.map((n) => `- ${n.url}`).join('\n');
    const edges = graphData.edges.map((e) => `- ${e.source} → ${e.target} (via: ${e.label})`).join('\n');

    return `States (${graphData.nodes.length}):
${nodes}

Transitions (${graphData.edges.length}):
${edges}`;
  }
}


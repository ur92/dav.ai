import { BaseMessage } from '@langchain/core/messages';

/**
 * Extract token usage from LangChain response
 * Handles different provider response structures (OpenAI, Anthropic, Gemini)
 * 
 * @param response - The LangChain message response from LLM invocation
 * @returns Token usage object with inputTokens and outputTokens, or null if not found
 */
export function extractTokenUsage(response: BaseMessage): { inputTokens: number; outputTokens: number } | null {
  const responseAny = response as any;
  
  // Try getUsage() method if available (some LangChain versions)
  if (typeof responseAny.getUsage === 'function') {
    try {
      const usage = responseAny.getUsage();
      if (usage) {
        return {
          inputTokens: usage.prompt_tokens || usage.input_tokens || usage.promptTokens || 0,
          outputTokens: usage.completion_tokens || usage.output_tokens || usage.completionTokens || 0,
        };
      }
    } catch (e) {
      // Ignore errors from getUsage()
    }
  }
  
  // Try response_metadata.usage (OpenAI, Anthropic)
  if (responseAny.response_metadata?.usage) {
    const usage = responseAny.response_metadata.usage;
    return {
      inputTokens: usage.prompt_tokens || usage.input_tokens || usage.promptTokens || 0,
      outputTokens: usage.completion_tokens || usage.output_tokens || usage.completionTokens || 0,
    };
  }
  
  // Try usage_metadata (some providers)
  if (responseAny.usage_metadata) {
    const usage = responseAny.usage_metadata;
    return {
      inputTokens: usage.prompt_tokens || usage.input_tokens || usage.promptTokens || 0,
      outputTokens: usage.completion_tokens || usage.output_tokens || usage.completionTokens || 0,
    };
  }
  
  // Try direct usage property
  if (responseAny.usage) {
    const usage = responseAny.usage;
    return {
      inputTokens: usage.prompt_tokens || usage.input_tokens || usage.promptTokens || 0,
      outputTokens: usage.completion_tokens || usage.output_tokens || usage.completionTokens || 0,
    };
  }
  
  // Try response_metadata directly (some Gemini responses)
  if (responseAny.response_metadata) {
    const metadata = responseAny.response_metadata;
    if (metadata.prompt_tokens !== undefined || metadata.input_tokens !== undefined || metadata.promptTokens !== undefined) {
      return {
        inputTokens: metadata.prompt_tokens || metadata.input_tokens || metadata.promptTokens || 0,
        outputTokens: metadata.completion_tokens || metadata.output_tokens || metadata.completionTokens || 0,
      };
    }
  }
  
  return null;
}


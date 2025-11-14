/**
 * ConfigService - Provides application configuration
 * All configuration logic lives in core - single source of truth for all env vars
 */
export interface AppConfig {
  // LLM Configuration
  llmProvider: 'openai' | 'anthropic';
  llmModel: string;
  openAIApiKey: string;
  anthropicApiKey: string;
  
  // Neo4j Configuration
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  
  // Agent Configuration
  maxIterations: number;
  startingUrl: string;
}

export class ConfigService {
  private static config: AppConfig | null = null;

  /**
   * Initialize and load all configuration from environment variables
   * This should be called once at application startup
   */
  static initialize(): void {
    const llmProvider = ((process.env.LLM_PROVIDER || 'openai').toLowerCase()) as 'openai' | 'anthropic';
    
    this.config = {
      // LLM Configuration
      llmProvider,
      llmModel: process.env.LLM_MODEL || (llmProvider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o'),
      openAIApiKey: process.env.OPENAI_API_KEY || '',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      
      // Neo4j Configuration
      neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4jUser: process.env.NEO4J_USER || 'neo4j',
      neo4jPassword: process.env.NEO4J_PASSWORD || 'password',
      
      // Agent Configuration
      maxIterations: parseInt(process.env.MAX_ITERATIONS || '20', 10),
      startingUrl: process.env.STARTING_URL || 'https://example.com',
    };
  }

  /**
   * Get the complete application configuration
   * Automatically initializes if not already done
   */
  static getConfig(): AppConfig {
    if (!this.config) {
      this.initialize();
    }
    return this.config!;
  }

  /**
   * Get LLM API key based on the configured provider
   */
  static getLLMApiKey(): string {
    const config = this.getConfig();
    return config.llmProvider === 'anthropic' ? config.anthropicApiKey : config.openAIApiKey;
  }

  /**
   * Validate that required configuration is present
   * Throws an error if validation fails
   */
  static validate(): void {
    const config = this.getConfig();
    const apiKey = this.getLLMApiKey();
    
    if (!apiKey) {
      const keyName = config.llmProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      throw new Error(`${keyName} environment variable is required.`);
    }
  }
}


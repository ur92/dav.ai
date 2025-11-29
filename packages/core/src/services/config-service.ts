/**
 * ConfigService - Provides application configuration
 * All configuration logic lives in core - single source of truth for all env vars
 */
export interface AppConfig {
  // LLM Configuration
  llmProvider: 'openai' | 'anthropic' | 'gemini';
  llmModel: string;
  llmApiKey: string;
  
  // Neo4j Configuration
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  
  // Agent Configuration
  startingUrl: string;
  
  // Browser Configuration
  headless: boolean;
  
  // Logging Configuration
  logLevel: 'info' | 'warn' | 'error';
  logFile?: string; // Optional path to log file
  
  // Credentials Configuration (optional, for automatic login)
  credentials?: { username?: string; password?: string };
}

export class ConfigService {
  private static config: AppConfig | null = null;

  /**
   * Initialize and load all configuration from environment variables
   * This should be called once at application startup
   */
  static initialize(): void {
    const llmProvider = ((process.env.LLM_PROVIDER || 'openai').toLowerCase()) as 'openai' | 'anthropic' | 'gemini';
    
    // Get API key - only use LLM_API_KEY
    const llmApiKey = process.env.LLM_API_KEY || '';
    
    // Determine default model based on provider
    let defaultModel = 'gpt-4o';
    if (llmProvider === 'anthropic') {
      defaultModel = 'claude-sonnet-4-5';
    } else if (llmProvider === 'gemini') {
      defaultModel = 'gemini-2.5-pro';
    }
    
    this.config = {
      // LLM Configuration
      llmProvider,
      llmModel: process.env.LLM_MODEL || defaultModel,
      llmApiKey,
      
      // Neo4j Configuration
      neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4jUser: process.env.NEO4J_USER || 'neo4j',
      neo4jPassword: process.env.NEO4J_PASSWORD || 'password',
      
      // Agent Configuration
      startingUrl: process.env.STARTING_URL || 'https://example.com',
      
      // Browser Configuration
      headless: process.env.HEADLESS !== 'false', // Default to true (headless), set HEADLESS=false to show browser
      
      // Logging Configuration
      logLevel: (process.env.LOG_LEVEL?.toLowerCase() || 'error') as 'info' | 'warn' | 'error',
      logFile: process.env.LOG_FILE, // Optional log file path
      
      // Credentials Configuration (optional)
      credentials: (process.env.CRED_USERNAME || process.env.CRED_PASSWORD) ? {
        username: process.env.CRED_USERNAME,
        password: process.env.CRED_PASSWORD,
      } : undefined,
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
   * Get LLM API key
   */
  static getLLMApiKey(): string {
    const config = this.getConfig();
    return config.llmApiKey;
  }

  /**
   * Get credentials from config (if available)
   */
  static getCredentials(): { username?: string; password?: string } | undefined {
    const config = this.getConfig();
    return config.credentials;
  }

  /**
   * Validate that required configuration is present
   * Throws an error if validation fails
   */
  static validate(): void {
    const config = this.getConfig();
    const apiKey = this.getLLMApiKey();
    
    if (!apiKey) {
      throw new Error('LLM_API_KEY environment variable is required.');
    }
  }
}


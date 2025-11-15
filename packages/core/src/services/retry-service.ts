import { BrowserTools } from '../tools/browser-tools.js';
import { ConfigService } from './config-service.js';
import { UserStory } from './user-story-service.js';
import { logger } from '../utils/logger.js';

export interface RetryStep {
  index: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  timestamp?: number;
}

export interface RetrySession {
  retryId: string;
  sessionId: string;
  storyIndex: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: RetryStep[];
  startTime: number;
  endTime?: number;
}

/**
 * RetryService - Manages user story retry execution
 * Executes user stories step by step with delays for human readability
 */
export class RetryService {
  private static retrySessions: Map<string, RetrySession> = new Map();
  private static onStepUpdateCallback?: (retryId: string, step: RetryStep) => void;

  /**
   * Set callback for step updates (for WebSocket broadcasting)
   */
  static setStepUpdateCallback(callback: (retryId: string, step: RetryStep) => void) {
    this.onStepUpdateCallback = callback;
  }

  /**
   * Start a retry for a user story
   */
  static async startRetry(
    sessionId: string,
    story: UserStory,
    storyIndex: number,
    credentials?: { username?: string; password?: string }
  ): Promise<string> {
    const retryId = `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create retry steps from story
    const steps: RetryStep[] = [];
    
    // Step 1: Login (if credentials provided)
    if (credentials?.username && credentials?.password) {
      steps.push({
        index: 0,
        description: `Login with credentials (${credentials.username})`,
        status: 'pending',
      });
    }
    
    // Step 2: Navigate to first page in flow
    if (story.flow && story.flow.length > 0) {
      const firstState = story.flow[0].from;
      steps.push({
        index: steps.length,
        description: `Navigate to ${firstState}`,
        status: 'pending',
      });
    }
    
    // Steps 3+: Execute each action in the flow
    story.flow.forEach((flowItem, idx) => {
      steps.push({
        index: steps.length,
        description: `${flowItem.action}: ${flowItem.from} → ${flowItem.to}`,
        status: 'pending',
      });
    });

    // Create retry session
    const retrySession: RetrySession = {
      retryId,
      sessionId,
      storyIndex,
      status: 'pending',
      steps,
      startTime: Date.now(),
    };

    this.retrySessions.set(retryId, retrySession);

    // Execute retry in background
    this.executeRetry(retryId, story, credentials).catch((error) => {
      logger.error('RetryService', 'Error executing retry', {
        retryId,
        error: error instanceof Error ? error.message : String(error),
      });
      retrySession.status = 'failed';
      retrySession.endTime = Date.now();
    });

    return retryId;
  }

  /**
   * Execute a retry session
   */
  private static async executeRetry(
    retryId: string,
    story: UserStory,
    credentials?: { username?: string; password?: string }
  ): Promise<void> {
    const retrySession = this.retrySessions.get(retryId);
    if (!retrySession) {
      throw new Error('Retry session not found');
    }

    retrySession.status = 'running';
    logger.info('RetryService', `Starting retry execution: ${retryId}`);

    // Initialize browser tools
    const config = ConfigService.getConfig();
    const browserTools = new BrowserTools(config.headless);
    
    try {
      await browserTools.initialize();
      logger.info('RetryService', 'Browser initialized for retry');

      let currentStepIndex = 0;

      // Step 1: Login (if credentials provided)
      if (credentials?.username && credentials?.password && retrySession.steps[0]?.description.includes('Login')) {
        await this.executeStep(retryId, currentStepIndex, async () => {
          logger.info('RetryService', 'Executing login step');
          // Navigate to the first URL in the flow to find login form
          if (story.flow && story.flow.length > 0) {
            const firstUrl = story.flow[0].from;
            await browserTools.navigate(firstUrl);
            await this.delay(1500); // Delay for human readability
            
            // Attempt to find and fill login form
            const observation = await browserTools.observe();
            const isLoginScreen = this.detectLoginScreen(observation.domState);
            
            if (isLoginScreen) {
              const usernameSelector = this.findLoginField(observation.domState, 'username');
              const passwordSelector = this.findLoginField(observation.domState, 'password');
              const submitSelector = this.findSubmitButton(observation.domState);
              
              if (usernameSelector && passwordSelector && submitSelector) {
                await browserTools.typeText(usernameSelector, credentials.username!);
                await this.delay(500);
                await browserTools.typeText(passwordSelector, credentials.password!);
                await this.delay(500);
                await browserTools.clickElement(submitSelector);
                await this.delay(2000); // Wait for login to complete
                logger.info('RetryService', 'Login completed');
              } else {
                logger.warn('RetryService', 'Login fields not found, skipping login');
              }
            } else {
              logger.warn('RetryService', 'No login screen detected, skipping login');
            }
          }
        });
        currentStepIndex++;
      }

      // Step 2: Navigate to first page (if not already done during login)
      if (story.flow && story.flow.length > 0) {
        const firstUrl = story.flow[0].from;
        await this.executeStep(retryId, currentStepIndex, async () => {
          logger.info('RetryService', `Navigating to ${firstUrl}`);
          await browserTools.navigate(firstUrl);
          await this.delay(1500);
        });
        currentStepIndex++;
      }

      // Steps 3+: Execute each action in the flow
      for (const flowItem of story.flow) {
        await this.executeStep(retryId, currentStepIndex, async () => {
          logger.info('RetryService', `Executing action: ${flowItem.action}`);
          
          // Parse action and execute
          // Actions are stored as descriptive strings like "clickElement on #button"
          const actionLower = flowItem.action.toLowerCase();
          
          if (actionLower.includes('click')) {
            // Extract selector from action description
            const selectorMatch = flowItem.action.match(/on\s+(.+)$/i);
            if (selectorMatch) {
              await browserTools.clickElement(selectorMatch[1].trim());
            } else {
              logger.warn('RetryService', `Could not extract selector from action: ${flowItem.action}`);
            }
          } else if (actionLower.includes('type')) {
            // Extract selector and text from action description
            const match = flowItem.action.match(/on\s+(\S+)\s+with\s+text\s+"(.+)"$/i);
            if (match) {
              await browserTools.typeText(match[1].trim(), match[2]);
            } else {
              logger.warn('RetryService', `Could not extract selector/text from action: ${flowItem.action}`);
            }
          } else if (actionLower.includes('select')) {
            // Extract selector and value from action description
            const match = flowItem.action.match(/on\s+(\S+)\s+with\s+value\s+"(.+)"$/i);
            if (match) {
              await browserTools.selectOption(match[1].trim(), match[2]);
            } else {
              logger.warn('RetryService', `Could not extract selector/value from action: ${flowItem.action}`);
            }
          } else if (actionLower.includes('navigate')) {
            // Extract URL from action description
            const match = flowItem.action.match(/to\s+(.+)$/i);
            if (match) {
              await browserTools.navigate(match[1].trim());
            } else {
              logger.warn('RetryService', `Could not extract URL from action: ${flowItem.action}`);
            }
          }
          
          await this.delay(1500); // Delay for human readability
        });
        currentStepIndex++;
      }

      // Mark retry as completed
      retrySession.status = 'completed';
      retrySession.endTime = Date.now();
      logger.info('RetryService', `Retry completed successfully: ${retryId}`);
    } catch (error) {
      logger.error('RetryService', 'Error in retry execution', {
        retryId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      retrySession.status = 'failed';
      retrySession.endTime = Date.now();
      throw error;
    } finally {
      await browserTools.close();
      logger.info('RetryService', 'Browser closed for retry');
    }
  }

  /**
   * Execute a single step with error handling
   */
  private static async executeStep(
    retryId: string,
    stepIndex: number,
    stepFunction: () => Promise<void>
  ): Promise<void> {
    const retrySession = this.retrySessions.get(retryId);
    if (!retrySession) {
      throw new Error('Retry session not found');
    }

    const step = retrySession.steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${stepIndex} not found in retry session`);
    }

    step.status = 'running';
    step.timestamp = Date.now();
    this.notifyStepUpdate(retryId, step);

    try {
      await stepFunction();
      step.status = 'completed';
      this.notifyStepUpdate(retryId, step);
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      this.notifyStepUpdate(retryId, step);
      throw error;
    }
  }

  /**
   * Notify callback of step update
   */
  private static notifyStepUpdate(retryId: string, step: RetryStep) {
    if (this.onStepUpdateCallback) {
      this.onStepUpdateCallback(retryId, step);
    }
  }

  /**
   * Delay utility for human-readable execution
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get retry session status
   */
  static getRetrySession(retryId: string): RetrySession | undefined {
    return this.retrySessions.get(retryId);
  }

  /**
   * Get all retry sessions for a session
   */
  static getRetrySessionsBySessionId(sessionId: string): RetrySession[] {
    return Array.from(this.retrySessions.values()).filter((retry) => retry.sessionId === sessionId);
  }

  /**
   * Detect if the current page is a login screen
   */
  private static detectLoginScreen(domState: string): boolean {
    const lowerDom = domState.toLowerCase();
    const loginIndicators = [
      'type="password"',
      'password',
      'username',
      'login',
      'sign in',
      'autocomplete="username"',
      'autocomplete="current-password"',
    ];
    
    const foundIndicators = loginIndicators.filter(indicator => lowerDom.includes(indicator)).length;
    return foundIndicators >= 2;
  }

  /**
   * Find the selector for a login field (username or password)
   */
  private static findLoginField(domState: string, fieldType: 'username' | 'password'): string | null {
    const lines = domState.split('\n');
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (fieldType === 'password') {
        if (lowerLine.includes('type="password"') || lowerLine.includes('type=password')) {
          const idMatch = line.match(/id[=:](['"]?)([^'"\s]+)\1/i);
          if (idMatch) return `#${idMatch[2]}`;
          const nameMatch = line.match(/name[=:](['"]?)([^'"\s]+)\1/i);
          if (nameMatch) return `[name="${nameMatch[2]}"]`;
        }
      } else {
        if ((lowerLine.includes('username') || lowerLine.includes('autocomplete="username"')) && 
            !lowerLine.includes('password')) {
          const idMatch = line.match(/id[=:](['"]?)([^'"\s]+)\1/i);
          if (idMatch) return `#${idMatch[2]}`;
          const nameMatch = line.match(/name[=:](['"]?)([^'"\s]+)\1/i);
          if (nameMatch) return `[name="${nameMatch[2]}"]`;
        }
      }
    }
    
    // Fallback
    if (fieldType === 'password') {
      return '#password, [name="password"], [type="password"]';
    } else {
      return '#username, [name="username"], input[autocomplete="username"]';
    }
  }

  /**
   * Find the submit/login button selector
   */
  private static findSubmitButton(domState: string): string | null {
    const lines = domState.split('\n');
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if ((lowerLine.includes('type="submit"') || 
           lowerLine.includes('button') && (lowerLine.includes('login') || lowerLine.includes('sign in')))) {
        const idMatch = line.match(/id[=:](['"]?)([^'"\s]+)\1/i);
        if (idMatch) return `#${idMatch[2]}`;
      }
    }
    
    return 'button[type="submit"], .login-button, button:has-text("Login"), button:has-text("Sign in")';
  }
}


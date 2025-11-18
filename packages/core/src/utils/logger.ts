type LogLevel = 'INFO' | 'WARN' | 'ERROR';
type ConfigLogLevel = 'info' | 'warn' | 'error';

// Log level hierarchy: error < warn < info
const logLevelPriority: Record<ConfigLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
}

class Logger {
  private currentLevel: ConfigLogLevel = 'error';
  private sessionLogs = new Map<string, LogEntry[]>();
  private maxLogsPerSession = 1000;

  /**
   * Initialize logger with log level from config
   */
  initialize(logLevel: ConfigLogLevel = 'error'): void {
    this.currentLevel = logLevel;
  }

  /**
   * Set the current session ID for logging
   */
  setSessionId(sessionId: string | null): void {
    // This is a no-op now, but kept for potential future use
    // Session logs are captured automatically when sessionId is provided
  }

  /**
   * Get logs for a session
   */
  getSessionLogs(sessionId: string): LogEntry[] {
    return this.sessionLogs.get(sessionId) || [];
  }

  /**
   * Clear logs for a session
   */
  clearSessionLogs(sessionId: string): void {
    this.sessionLogs.delete(sessionId);
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levelMap: Record<LogLevel, ConfigLogLevel> = {
      'ERROR': 'error',
      'WARN': 'warn',
      'INFO': 'info',
    };
    const configLevel = levelMap[level];
    return logLevelPriority[configLevel] <= logLevelPriority[this.currentLevel];
  }

  private log(level: LogLevel, context: string, message: string, data?: any, sessionId?: string): void {
    if (!this.shouldLog(level)) {
      return; // Skip logging if level is below threshold
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] [${context}] ${message}`;
    
    // Store log entry for session if sessionId is provided
    if (sessionId) {
      if (!this.sessionLogs.has(sessionId)) {
        this.sessionLogs.set(sessionId, []);
      }
      const logs = this.sessionLogs.get(sessionId)!;
      logs.push({
        timestamp,
        level,
        context,
        message,
        data,
      });
      // Keep only last N logs to avoid memory issues
      if (logs.length > this.maxLogsPerSession) {
        logs.shift();
      }
    }
    
    if (data) {
      if (level === 'ERROR') {
        console.error(logMessage, data);
      } else if (level === 'WARN') {
        console.warn(logMessage, data);
      } else {
        console.log(logMessage, data);
      }
    } else {
      if (level === 'ERROR') {
        console.error(logMessage);
      } else if (level === 'WARN') {
        console.warn(logMessage);
      } else {
        console.log(logMessage);
      }
    }
  }

  info(context: string, message: string, data?: any, sessionId?: string): void {
    this.log('INFO', context, message, data, sessionId);
  }

  warn(context: string, message: string, data?: any, sessionId?: string): void {
    this.log('WARN', context, message, data, sessionId);
  }

  error(context: string, message: string, data?: any, sessionId?: string): void {
    this.log('ERROR', context, message, data, sessionId);
  }
}

export const logger = new Logger();
export type { LogLevel };

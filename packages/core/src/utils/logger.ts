import { createWriteStream, WriteStream } from 'fs';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';

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
  private logFileStream: WriteStream | null = null;
  private logFilePath: string | null = null;

  /**
   * Initialize logger with log level and optional log file path from config
   */
  async initialize(logLevel: ConfigLogLevel = 'error', logFile?: string): Promise<void> {
    this.currentLevel = logLevel;
    
    if (logFile) {
      await this.setLogFile(logFile);
      // Register cleanup handlers to close log file on process exit
      this.registerCleanupHandlers();
    }
  }

  /**
   * Register process exit handlers to close log file stream
   */
  private registerCleanupHandlers(): void {
    const cleanup = () => {
      this.close();
    };
    
    // Register handlers for various exit scenarios
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  }

  /**
   * Set the log file path and create write stream
   */
  private async setLogFile(filePath: string): Promise<void> {
    try {
      // Ensure directory exists
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true });
      
      // Close existing stream if any
      if (this.logFileStream) {
        this.logFileStream.end();
      }
      
      // Create write stream in append mode
      this.logFileStream = createWriteStream(filePath, { flags: 'a' });
      this.logFilePath = filePath;
      
      // Write initialization message
      const initMessage = `\n=== Logger initialized at ${new Date().toISOString()} ===\n`;
      this.logFileStream.write(initMessage);
    } catch (error) {
      console.error(`Failed to initialize log file at ${filePath}:`, error);
      // Continue without file logging if file initialization fails
      this.logFileStream = null;
      this.logFilePath = null;
    }
  }

  /**
   * Close the log file stream
   */
  close(): void {
    if (this.logFileStream) {
      this.logFileStream.end();
      this.logFileStream = null;
      this.logFilePath = null;
    }
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
    const logMessageWithData = data ? `${logMessage} ${JSON.stringify(data)}` : logMessage;
    
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
    
    // Write to console
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
    
    // Write to file if configured
    if (this.logFileStream) {
      try {
        this.logFileStream.write(logMessageWithData + '\n');
      } catch (error) {
        // If file write fails, log to console but don't throw
        console.error('Failed to write to log file:', error);
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

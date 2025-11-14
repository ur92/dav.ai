type LogLevel = 'INFO' | 'WARN' | 'ERROR';
type ConfigLogLevel = 'info' | 'warn' | 'error';

// Log level hierarchy: error < warn < info
const logLevelPriority: Record<ConfigLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

class Logger {
  private currentLevel: ConfigLogLevel = 'error';

  /**
   * Initialize logger with log level from config
   */
  initialize(logLevel: ConfigLogLevel = 'error'): void {
    this.currentLevel = logLevel;
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

  private log(level: LogLevel, context: string, message: string, data?: any): void {
    if (!this.shouldLog(level)) {
      return; // Skip logging if level is below threshold
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] [${context}] ${message}`;
    
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

  info(context: string, message: string, data?: any): void {
    this.log('INFO', context, message, data);
  }

  warn(context: string, message: string, data?: any): void {
    this.log('WARN', context, message, data);
  }

  error(context: string, message: string, data?: any): void {
    this.log('ERROR', context, message, data);
  }
}

export const logger = new Logger();
export type { LogLevel };

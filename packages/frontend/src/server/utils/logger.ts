/**
 * Log levels
 */
export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

type ConfigLogLevel = 'info' | 'warn' | 'error';

// Log level hierarchy: error < warn < info
const logLevelPriority: Record<ConfigLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

/**
 * Logger utility with configurable log levels
 */
class Logger {
  private currentLevel: ConfigLogLevel = 'error';

  /**
   * Initialize logger with log level
   */
  initialize(logLevel: ConfigLogLevel = 'error'): void {
    this.currentLevel = logLevel;
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levelMap: Record<LogLevel, ConfigLogLevel> = {
      [LogLevel.ERROR]: 'error',
      [LogLevel.WARN]: 'warn',
      [LogLevel.INFO]: 'info',
    };
    const configLevel = levelMap[level];
    return logLevelPriority[configLevel] <= logLevelPriority[this.currentLevel];
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, prefix: string, message: string, data?: any): string {
    const timestamp = this.getTimestamp();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${prefix}] ${message}${dataStr}`;
  }

  info(prefix: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.log(this.formatMessage(LogLevel.INFO, prefix, message, data));
  }

  warn(prefix: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(this.formatMessage(LogLevel.WARN, prefix, message, data));
  }

  error(prefix: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    console.error(this.formatMessage(LogLevel.ERROR, prefix, message, data));
  }
}

// Export singleton instance
export const logger = new Logger();


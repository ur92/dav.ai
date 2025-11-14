/**
 * Log levels
 */
export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Logger utility with log levels
 */
class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, prefix: string, message: string, data?: any): string {
    const timestamp = this.getTimestamp();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${prefix}] ${message}${dataStr}`;
  }

  info(prefix: string, message: string, data?: any): void {
    console.log(this.formatMessage(LogLevel.INFO, prefix, message, data));
  }

  warn(prefix: string, message: string, data?: any): void {
    console.warn(this.formatMessage(LogLevel.WARN, prefix, message, data));
  }

  error(prefix: string, message: string, data?: any): void {
    console.error(this.formatMessage(LogLevel.ERROR, prefix, message, data));
  }
}

// Export singleton instance
export const logger = new Logger();


type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function log(level: LogLevel, context: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] [${context}] ${message}`;
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

export const logger = {
  info: (context: string, message: string, data?: any) => log('INFO', context, message, data),
  warn: (context: string, message: string, data?: any) => log('WARN', context, message, data),
  error: (context: string, message: string, data?: any) => log('ERROR', context, message, data),
};

export type { LogLevel };

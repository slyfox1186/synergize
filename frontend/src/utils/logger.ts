/* eslint-disable no-console */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private prefix: string;
  private isDevelopment = process.env.NODE_ENV === 'development';

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    if (!this.isDevelopment && level === 'debug') {
      return; // Skip debug logs in production
    }

    const timestamp = new Date().toISOString();
    const formattedPrefix = `[${this.prefix}]`;

    switch (level) {
      case 'debug':
        console.log(timestamp, formattedPrefix, ...args);
        break;
      case 'info':
        console.info(timestamp, formattedPrefix, ...args);
        break;
      case 'warn':
        console.warn(timestamp, formattedPrefix, ...args);
        break;
      case 'error':
        console.error(timestamp, formattedPrefix, ...args);
        break;
    }
  }

  debug(...args: unknown[]): void {
    this.log('debug', ...args);
  }

  info(...args: unknown[]): void {
    this.log('info', ...args);
  }

  warn(...args: unknown[]): void {
    this.log('warn', ...args);
  }

  error(...args: unknown[]): void {
    this.log('error', ...args);
  }
}

export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}
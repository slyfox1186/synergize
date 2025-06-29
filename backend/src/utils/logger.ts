export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, ...args: unknown[]): void {
    // In production, this would use a proper logging library like winston or pino
    // For now, we'll use console but in a centralized way
    // eslint-disable-next-line no-console
    console.log(`[${this.context}] ${message}`, ...args);
  }

  error(message: string, error?: unknown): void {
    // eslint-disable-next-line no-console
    console.error(`[${this.context}] ERROR: ${message}`, error);
  }

  warn(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(`[${this.context}] WARN: ${message}`, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(`[${this.context}] DEBUG: ${message}`, ...args);
    }
  }
}

export const createLogger = (context: string): Logger => new Logger(context);
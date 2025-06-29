/* eslint-disable no-console */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

class Logger {
  private service: string;
  private isDevelopment = process.env.NODE_ENV === 'development';

  constructor(service: string) {
    this.service = service;
  }

  private formatEntry(entry: LogEntry): string {
    if (this.isDevelopment) {
      // Human-readable format for development
      let output = `[${entry.service}] ${entry.message}`;
      if (entry.error) {
        output += `\n  Error: ${entry.error.message}`;
        if (entry.error.stack) {
          output += `\n  Stack: ${entry.error.stack}`;
        }
      }
      if (entry.context && Object.keys(entry.context).length > 0) {
        output += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
      }
      return output;
    }
    // JSON format for production
    return JSON.stringify(entry);
  }

  private log(level: LogLevel, message: string, contextOrError?: unknown, context?: Record<string, unknown>): void {
    if (!this.isDevelopment && level === 'debug') {
      return; // Skip debug logs in production
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message
    };

    // Handle error objects
    if (level === 'error' && contextOrError instanceof Error) {
      entry.error = {
        message: contextOrError.message,
        stack: contextOrError.stack,
        code: (contextOrError as Error & { code?: string }).code
      };
      if (context) {
        entry.context = context;
      }
    } else if (contextOrError && typeof contextOrError === 'object') {
      entry.context = contextOrError as Record<string, unknown>;
    }

    const formatted = this.formatEntry(entry);

    switch (level) {
      case 'debug':
        console.log(entry.timestamp, formatted);
        break;
      case 'info':
        console.info(entry.timestamp, formatted);
        break;
      case 'warn':
        console.warn(entry.timestamp, formatted);
        break;
      case 'error':
        console.error(entry.timestamp, formatted);
        // Send critical errors to backend if configured
        if (!this.isDevelopment && entry.error) {
          this.sendErrorToBackend(entry).catch(() => {
            // Silently fail - don't cause cascading errors
          });
        }
        break;
    }
  }

  private async sendErrorToBackend(entry: LogEntry): Promise<void> {
    try {
      // Only send critical frontend errors to backend
      const errorData = {
        timestamp: entry.timestamp,
        service: entry.service,
        message: entry.message,
        error: entry.error,
        context: {
          ...entry.context,
          userAgent: navigator.userAgent,
          url: window.location.href,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        }
      };

      await fetch('/api/frontend-errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorData)
      });
    } catch {
      // Ignore failures - we don't want logging to break the app
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    this.log('error', message, error, context);
  }
}

export function createLogger(service: string): Logger {
  return new Logger(service);
}
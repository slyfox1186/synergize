import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as process from 'process';

const appendFile = promisify(fs.appendFile);

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
  };
}

export class Logger {
  private context: string;
  private isDevelopment = process.env.NODE_ENV !== 'production';

  constructor(context: string) {
    this.context = context;
  }

  private getLogFileName(isError = false): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(logDir, `synergize${isError ? '-error' : ''}-${date}.log`);
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    const isError = entry.level === 'error';
    const logFile = this.getLogFileName(isError);
    const logLine = JSON.stringify(entry) + '\n';
    
    try {
      await appendFile(logFile, logLine);
      // Also write errors to main log file
      if (isError) {
        await appendFile(this.getLogFileName(false), logLine);
      }
    } catch (err) {
      // Fallback to stderr if file write fails
      const errorMsg = {
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'Logger',
        message: 'Failed to write log to file',
        error: err instanceof Error ? { message: err.message, stack: err.stack } : { message: String(err) }
      };
      process.stderr.write(JSON.stringify(errorMsg) + '\n');
    }
  }

  private formatForDev(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const levelEmoji = {
      debug: '🔍',
      info: '📘',
      warn: '⚠️',
      error: '❌'
    };
    
    // Color the timestamp, brackets, and service name
    const coloredTimestamp = `\x1b[97m${timestamp}\x1b[0m`; // Bright white for timestamp
    const coloredBrackets = `\x1b[37m[\x1b[0m\x1b[36m${entry.service}\x1b[0m\x1b[37m]\x1b[0m`; // Light gray brackets, cyan service
    
    let output = `${levelEmoji[entry.level]} ${coloredTimestamp} ${coloredBrackets} ${entry.message}`;
    
    // Add error details if present
    if (entry.error) {
      output += `\n   └─ Error: ${entry.error.message}`;
      if (entry.error.stack && entry.level === 'error') {
        const stackLines = entry.error.stack.split('\n').slice(1, 4);
        stackLines.forEach(line => {
          output += `\n      ${line.trim()}`;
        });
      }
    }
    
    // Add context if present
    if (entry.context && Object.keys(entry.context).length > 0) {
      output += '\n   └─ Context:';
      Object.entries(entry.context).forEach(([key, value]) => {
        const coloredKey = this.colorContextKey(key);
        const valueStr = this.formatContextValue(value);
        if (valueStr.includes('\n')) {
          output += `\n      ${coloredKey}:`;
          valueStr.split('\n').forEach(line => {
            output += `\n        ${line}`;
          });
        } else {
          output += `\n      ${coloredKey}: ${valueStr}`;
        }
      });
    }
    
    return output;
  }

  info(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: this.context,
      message,
      context
    };
    
    // Stream output (formatted for dev, JSON for prod)
    if (this.isDevelopment) {
      process.stdout.write(this.formatForDev(entry) + '\n');
    } else {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
    
    // Async file write
    this.writeToFile(entry).catch(() => {/* Already logged in writeToFile */});
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      service: this.context,
      message,
      context
    };
    
    // Add error details if provided
    if (error) {
      if (error instanceof Error) {
        entry.error = {
          message: error.message,
          stack: error.stack
        };
      } else {
        entry.error = {
          message: String(error)
        };
      }
    }

    // Stream output to stderr for errors
    if (this.isDevelopment) {
      process.stderr.write(this.formatForDev(entry) + '\n');
    } else {
      process.stderr.write(JSON.stringify(entry) + '\n');
    }
    
    // Async file write
    this.writeToFile(entry).catch(() => {/* Already logged in writeToFile */});
  }

  warn(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: this.context,
      message,
      context
    };
    
    // Stream output - warnings go to stderr
    if (this.isDevelopment) {
      process.stderr.write(this.formatForDev(entry) + '\n');
    } else {
      process.stderr.write(JSON.stringify(entry) + '\n');
    }
    
    this.writeToFile(entry).catch(() => {/* Already logged in writeToFile */});
  }

  debug(message: string, context?: Record<string, unknown>): void {
    // Skip debug logs in production
    if (!this.isDevelopment) {
      return;
    }
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      service: this.context,
      message,
      context
    };
    
    process.stdout.write(this.formatForDev(entry) + '\n');
    
    // Debug logs only written to file in development
    this.writeToFile(entry).catch(() => {/* Already logged in writeToFile */});
  }

  // Helper method to color context keys - consistent color for all field names
  private colorContextKey(key: string): string {
    return `\x1b[96m${key}\x1b[0m`; // Bright cyan for all field names
  }

  // Helper method to format context values
  private formatContextValue(value: unknown, indent = 0): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      if (value.length <= 3 && value.every(v => typeof v !== 'object')) {
        return `[${value.join(', ')}]`;
      }
      const items = value.slice(0, 5).map(v => this.formatContextValue(v, indent + 2));
      if (value.length > 5) items.push('...');
      return `[\n${items.map(item => ' '.repeat(indent + 2) + item).join(',\n')}\n${' '.repeat(indent)}]`;
    }
    
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      if (keys.length <= 3 && Object.values(obj).every(v => typeof v !== 'object')) {
        const pairs = keys.map(k => `${k}: ${this.formatContextValue(obj[k])}`);
        return `{ ${pairs.join(', ')} }`;
      }
      const pairs = keys.slice(0, 10).map(k => `${k}: ${this.formatContextValue(obj[k], indent + 2)}`);
      if (keys.length > 10) pairs.push('...');
      return `{\n${pairs.map(pair => ' '.repeat(indent + 2) + pair).join(',\n')}\n${' '.repeat(indent)}}`;
    }
    
    if (typeof value === 'string') {
      // Consistent color for all string values
      const coloredValue = `\x1b[93m${value}\x1b[0m`; // Bright yellow for all string values
      return value.length > 100 ? `"${coloredValue.substring(0, 100)}..."` : `"${coloredValue}"`;
    }
    
    // Consistent color for all numeric values
    if (typeof value === 'number') {
      return `\x1b[93m${value}\x1b[0m`; // Bright yellow for all values (same as strings)
    }
    
    return String(value);
  }
}

export const createLogger = (context: string): Logger => new Logger(context);
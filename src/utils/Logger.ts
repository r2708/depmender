/**
 * Centralized logging utility for Depguardian
 * Provides structured logging with different levels and proper error handling
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: string;
  error?: Error;
  metadata?: Record<string, any>;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Sets the logging level
   */
  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Sets verbose mode (highest log level)
   */
  setVerbose(verbose: boolean): void {
    this.logLevel = verbose ? LogLevel.VERBOSE : LogLevel.INFO;
  }

  /**
   * Logs an error message
   */
  error(message: string, error?: Error, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error, metadata);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context, undefined, metadata);
  }

  /**
   * Logs an info message
   */
  info(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context, undefined, metadata);
  }

  /**
   * Logs a debug message
   */
  debug(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context, undefined, metadata);
  }

  /**
   * Logs a verbose message
   */
  verbose(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.VERBOSE, message, context, undefined, metadata);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: string, error?: Error, metadata?: Record<string, any>): void {
    if (level > this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      error,
      metadata
    };

    this.logs.push(entry);

    // Keep logs within limit
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Output to console based on level
    this.outputToConsole(entry);
  }

  /**
   * Outputs log entry to console with appropriate formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const levelStr = LogLevel[entry.level].padEnd(7);
    const contextStr = entry.context ? `[${entry.context}] ` : '';
    
    let message = `${timestamp} ${levelStr} ${contextStr}${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      message += ` ${JSON.stringify(entry.metadata)}`;
    }

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(message);
        if (entry.error && this.logLevel >= LogLevel.DEBUG) {
          console.error(entry.error.stack);
        }
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.INFO:
        console.log(message);
        break;
      case LogLevel.DEBUG:
      case LogLevel.VERBOSE:
        if (this.logLevel >= entry.level) {
          console.log(message);
        }
        break;
    }
  }

  /**
   * Gets recent log entries
   */
  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Gets logs filtered by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Clears all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Creates a child logger with a specific context
   */
  child(context: string): ChildLogger {
    return new ChildLogger(this, context);
  }
}

/**
 * Child logger that automatically includes context
 */
export class ChildLogger {
  constructor(private parent: Logger, private context: string) {}

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.parent.error(message, error, this.context, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.parent.warn(message, this.context, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.parent.info(message, this.context, metadata);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.parent.debug(message, this.context, metadata);
  }

  verbose(message: string, metadata?: Record<string, any>): void {
    this.parent.verbose(message, this.context, metadata);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export class Logger {
  private static level: LogLevel = LogLevel.INFO;
  private context: string;

  /**
   * Create a new logger instance
   * @param context The context for this logger (e.g. class name)
   */
  constructor(context: string) {
    this.context = context;
  }

  /**
   * Set the global log level
   * @param level Log level
   */
  static setLogLevel(level: LogLevel): void {
    Logger.level = level;
  }

  /**
   * Get current log level
   * @returns Current log level
   */
  static getLogLevel(): LogLevel {
    return Logger.level;
  }

  /**
   * Get formatted timestamp
   * @returns Formatted timestamp string
   */
  private getTimestamp(): string {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  /**
   * Log a debug message
   * @param message Log message
   * @param ...args Additional arguments
   */
  debug(message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.DEBUG) {
      console.log(`[${this.getTimestamp()}] [DEBUG] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log an info message
   * @param message Log message
   * @param ...args Additional arguments
   */
  info(message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.INFO) {
      console.log(`[${this.getTimestamp()}] [INFO] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log a warning message
   * @param message Log message
   * @param ...args Additional arguments
   */
  warn(message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.WARN) {
      console.warn(`[${this.getTimestamp()}] [WARN] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log an error message
   * @param message Log message
   * @param ...args Additional arguments
   */
  error(message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.ERROR) {
      console.error(`[${this.getTimestamp()}] [ERROR] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Create a child logger with a subcontext
   * @param subContext Subcontext name
   * @returns Child logger instance
   */
  createChild(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`);
  }
}

// Set log level from environment variable if available
if (typeof process !== "undefined" && process.env.LOG_LEVEL) {
  const envLevel = process.env.LOG_LEVEL.toUpperCase();
  switch (envLevel) {
    case "DEBUG":
      Logger.setLogLevel(LogLevel.DEBUG);
      break;
    case "INFO":
      Logger.setLogLevel(LogLevel.INFO);
      break;
    case "WARN":
      Logger.setLogLevel(LogLevel.WARN);
      break;
    case "ERROR":
      Logger.setLogLevel(LogLevel.ERROR);
      break;
    case "NONE":
      Logger.setLogLevel(LogLevel.NONE);
      break;
  }
}

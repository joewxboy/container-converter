/**
 * Logger Utility
 * Provides configurable logging with different log levels
 */

/**
 * Log levels in order of verbosity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Log level names for display
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.SILENT]: 'SILENT',
};

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

/**
 * Logger configuration
 */
interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Whether to include timestamps */
  timestamps: boolean;
  /** Whether to use colors in output */
  colors: boolean;
  /** Custom prefix for all log messages */
  prefix?: string;
}

/**
 * Default logger configuration
 */
const defaultConfig: LoggerConfig = {
  level: LogLevel.INFO,
  timestamps: false,
  colors: true,
  prefix: undefined,
};

/**
 * Parse log level from string
 */
function parseLogLevel(level: string): LogLevel {
  const normalized = level.toUpperCase().trim();
  switch (normalized) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'SILENT':
    case 'NONE':
    case 'OFF':
      return LogLevel.SILENT;
    default:
      return LogLevel.INFO;
  }
}

/**
 * Logger class with configurable levels and formatting
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };

    // Check environment variables for configuration
    if (process.env.LOG_LEVEL) {
      this.config.level = parseLogLevel(process.env.LOG_LEVEL);
    }

    if (process.env.DEBUG && this.config.level > LogLevel.DEBUG) {
      this.config.level = LogLevel.DEBUG;
    }

    if (process.env.NO_COLOR || process.env.FORCE_NO_COLOR) {
      this.config.colors = false;
    }
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Check if a log level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  /**
   * Format a log message
   */
  private format(level: LogLevel, message: string, ...args: unknown[]): string {
    const parts: string[] = [];

    // Timestamp
    if (this.config.timestamps) {
      const timestamp = new Date().toISOString();
      if (this.config.colors) {
        parts.push(`${COLORS.dim}${timestamp}${COLORS.reset}`);
      } else {
        parts.push(timestamp);
      }
    }

    // Level
    const levelName = LOG_LEVEL_NAMES[level];
    if (this.config.colors) {
      const color = this.getLevelColor(level);
      parts.push(`${color}[${levelName}]${COLORS.reset}`);
    } else {
      parts.push(`[${levelName}]`);
    }

    // Prefix
    if (this.config.prefix) {
      if (this.config.colors) {
        parts.push(`${COLORS.cyan}${this.config.prefix}${COLORS.reset}`);
      } else {
        parts.push(this.config.prefix);
      }
    }

    // Message
    parts.push(message);

    // Additional arguments
    if (args.length > 0) {
      const formatted = args
        .map((arg) => {
          if (typeof arg === 'object') {
            return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        })
        .join(' ');
      parts.push(formatted);
    }

    return parts.join(' ');
  }

  /**
   * Get color for log level
   */
  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return COLORS.dim;
      case LogLevel.INFO:
        return COLORS.green;
      case LogLevel.WARN:
        return COLORS.yellow;
      case LogLevel.ERROR:
        return COLORS.red;
      default:
        return COLORS.reset;
    }
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.isLevelEnabled(LogLevel.DEBUG)) {
      console.debug(this.format(LogLevel.DEBUG, message, ...args));
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    if (this.isLevelEnabled(LogLevel.INFO)) {
      console.info(this.format(LogLevel.INFO, message, ...args));
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.isLevelEnabled(LogLevel.WARN)) {
      console.warn(this.format(LogLevel.WARN, message, ...args));
    }
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: unknown[]): void {
    if (this.isLevelEnabled(LogLevel.ERROR)) {
      console.error(this.format(LogLevel.ERROR, message, ...args));
    }
  }

  /**
   * Log an error with stack trace
   */
  errorWithStack(message: string, error: Error): void {
    if (this.isLevelEnabled(LogLevel.ERROR)) {
      console.error(this.format(LogLevel.ERROR, message));
      if (error.stack && this.config.level === LogLevel.DEBUG) {
        console.error(error.stack);
      }
    }
  }

  /**
   * Create a child logger with a prefix
   */
  child(prefix: string): Logger {
    const childPrefix = this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix;
    return new Logger({
      ...this.config,
      prefix: childPrefix,
    });
  }

  /**
   * Log structured data for debugging
   */
  debugData(label: string, data: unknown): void {
    if (this.isLevelEnabled(LogLevel.DEBUG)) {
      this.debug(`${label}:`, data);
    }
  }

  /**
   * Log operation timing
   */
  time(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`${label} completed in ${duration}ms`);
    };
  }

  /**
   * Log a success message (always green)
   */
  success(message: string): void {
    if (this.isLevelEnabled(LogLevel.INFO)) {
      if (this.config.colors) {
        console.log(`${COLORS.green}✓ ${message}${COLORS.reset}`);
      } else {
        console.log(`✓ ${message}`);
      }
    }
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger();

/**
 * Create a logger for a specific module
 */
export function createLogger(moduleName: string): Logger {
  return new Logger({ prefix: moduleName });
}

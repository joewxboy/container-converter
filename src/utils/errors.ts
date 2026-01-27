/**
 * Custom Error Classes
 * Defines custom error types for the container converter
 */

/**
 * Base error class for container converter errors
 * Provides common functionality for all custom errors
 */
export class ContainerConverterError extends Error {
  /** Error code for programmatic handling */
  public readonly code: string;

  /** Additional context about the error */
  public readonly context?: Record<string, unknown>;

  /** Suggestions for resolving the error */
  public readonly suggestions?: string[];

  constructor(
    message: string,
    options: {
      code?: string;
      context?: Record<string, unknown>;
      suggestions?: string[];
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'ContainerConverterError';
    this.code = options.code || 'UNKNOWN_ERROR';
    this.context = options.context;
    this.suggestions = options.suggestions;

    // Capture cause if provided (ES2022+)
    if (options.cause) {
      this.cause = options.cause;
    }

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Format the error for display
   */
  format(): string {
    const lines = [`Error [${this.code}]: ${this.message}`];

    if (this.context && Object.keys(this.context).length > 0) {
      lines.push('Context:');
      for (const [key, value] of Object.entries(this.context)) {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    }

    if (this.suggestions && this.suggestions.length > 0) {
      lines.push('Suggestions:');
      for (const suggestion of this.suggestions) {
        lines.push(`  - ${suggestion}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Error during Dockerfile parsing
 */
export class DockerfileParseError extends ContainerConverterError {
  public readonly line?: number;

  constructor(
    message: string,
    options: {
      line?: number;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(`Dockerfile parsing failed: ${message}${options.line ? ` at line ${options.line}` : ''}`, {
      code: 'DOCKERFILE_PARSE_ERROR',
      context: options.context,
      suggestions: [
        'Verify the Dockerfile syntax is correct',
        'Ensure the Dockerfile has a valid FROM instruction',
        'Check for unclosed quotes or escape characters',
      ],
      cause: options.cause,
    });
    this.name = 'DockerfileParseError';
    this.line = options.line;
  }
}

/**
 * Error during SDF generation
 */
export class SDFGenerationError extends ContainerConverterError {
  constructor(
    message: string,
    options: {
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(`SDF generation failed: ${message}`, {
      code: 'SDF_GENERATION_ERROR',
      context: options.context,
      suggestions: [
        'Check that all required Dockerfile instructions are present',
        'Verify the base image is specified correctly',
        'Provide missing metadata via CLI options',
      ],
      cause: options.cause,
    });
    this.name = 'SDFGenerationError';
  }
}

/**
 * Error during SDF validation
 */
export class ValidationError extends ContainerConverterError {
  public readonly validationErrors: Array<{ field?: string; message: string }>;

  constructor(
    message: string,
    options: {
      validationErrors?: Array<{ field?: string; message: string }>;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(`Validation failed: ${message}`, {
      code: 'VALIDATION_ERROR',
      context: options.context,
      suggestions: [
        'Review the validation errors above',
        'Ensure all required SDF fields are present',
        'Check that field values match expected types',
      ],
      cause: options.cause,
    });
    this.name = 'ValidationError';
    this.validationErrors = options.validationErrors || [];
  }
}

/**
 * Error during Exchange authentication
 */
export class ExchangeAuthError extends ContainerConverterError {
  constructor(
    message: string,
    options: {
      code?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(`Exchange authentication failed: ${message}`, {
      code: options.code || 'EXCHANGE_AUTH_ERROR',
      context: options.context,
      suggestions: [
        'Verify HZN_ORG_ID is set correctly',
        'Check HZN_EXCHANGE_USER_AUTH format (user:password)',
        'Ensure HZN_EXCHANGE_URL is accessible',
        'Try using --config and --creds options with credential files',
      ],
      cause: options.cause,
    });
    this.name = 'ExchangeAuthError';
  }
}

/**
 * Error during service publishing
 */
export class PublishError extends ContainerConverterError {
  constructor(
    message: string,
    options: {
      code?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(`Publish failed: ${message}`, {
      code: options.code || 'PUBLISH_ERROR',
      context: options.context,
      suggestions: [
        'Verify your credentials have publish permissions',
        'Check if the service already exists (use --overwrite)',
        'Ensure the SDF passes validation (use --validate)',
        'Try with --dry-run first to validate without publishing',
      ],
      cause: options.cause,
    });
    this.name = 'PublishError';
  }
}

/**
 * Error when file operations fail
 */
export class FileError extends ContainerConverterError {
  public readonly path: string;

  constructor(
    message: string,
    options: {
      path: string;
      operation?: 'read' | 'write' | 'delete';
      code?: string;
      cause?: Error;
    }
  ) {
    const suggestions = [
      'Verify the file path is correct',
      'Check file permissions',
    ];

    if (options.operation === 'read') {
      suggestions.push('Ensure the file exists');
    }

    super(`File operation failed: ${message}`, {
      code: options.code || 'FILE_ERROR',
      context: { path: options.path, operation: options.operation },
      suggestions,
      cause: options.cause,
    });
    this.name = 'FileError';
    this.path = options.path;
  }
}

/**
 * Error when CLI tools are not available
 */
export class CliNotFoundError extends ContainerConverterError {
  public readonly command: string;

  constructor(command: string, message?: string) {
    super(message || `CLI tool not found: ${command}`, {
      code: 'CLI_NOT_FOUND',
      context: { command },
      suggestions: [
        `Install the ${command} CLI tool`,
        'Verify the tool is in your PATH',
        'Check installation documentation at https://github.com/open-horizon/anax',
      ],
    });
    this.name = 'CliNotFoundError';
    this.command = command;
  }
}

/**
 * Error when network operations fail
 */
export class NetworkError extends ContainerConverterError {
  public readonly url?: string;

  constructor(
    message: string,
    options: {
      url?: string;
      statusCode?: number;
      cause?: Error;
    } = {}
  ) {
    super(`Network error: ${message}`, {
      code: 'NETWORK_ERROR',
      context: { url: options.url, statusCode: options.statusCode },
      suggestions: [
        'Check your network connection',
        'Verify the URL is correct and accessible',
        'Check if a firewall is blocking the connection',
      ],
      cause: options.cause,
    });
    this.name = 'NetworkError';
    this.url = options.url;
  }
}

/**
 * Check if an error is a container converter error
 */
export function isContainerConverterError(error: unknown): error is ContainerConverterError {
  return error instanceof ContainerConverterError;
}

/**
 * Format any error for display
 */
export function formatError(error: unknown): string {
  if (error instanceof ContainerConverterError) {
    return error.format();
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Error: ${String(error)}`;
}

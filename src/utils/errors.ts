/**
 * Custom Error Classes
 * Defines custom error types for the container converter
 */

export class DockerfileParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number
  ) {
    super(`Dockerfile parsing failed: ${message}${line ? ` at line ${line}` : ''}`);
    this.name = 'DockerfileParseError';
  }
}

export class SDFGenerationError extends Error {
  constructor(message: string) {
    super(`SDF generation failed: ${message}`);
    this.name = 'SDFGenerationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(`Validation failed: ${message}`);
    this.name = 'ValidationError';
  }
}

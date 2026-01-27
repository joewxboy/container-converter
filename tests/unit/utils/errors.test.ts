/**
 * Error Classes Tests
 */

import {
  ContainerConverterError,
  DockerfileParseError,
  SDFGenerationError,
  ValidationError,
  ExchangeAuthError,
  PublishError,
  FileError,
  CliNotFoundError,
  NetworkError,
  isContainerConverterError,
  formatError,
} from '../../../src/utils/errors';

describe('ContainerConverterError', () => {
  it('should create error with message', () => {
    const error = new ContainerConverterError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('ContainerConverterError');
    expect(error.code).toBe('UNKNOWN_ERROR');
  });

  it('should accept custom code', () => {
    const error = new ContainerConverterError('Test', { code: 'CUSTOM_CODE' });
    expect(error.code).toBe('CUSTOM_CODE');
  });

  it('should accept context', () => {
    const error = new ContainerConverterError('Test', { context: { key: 'value' } });
    expect(error.context).toEqual({ key: 'value' });
  });

  it('should accept suggestions', () => {
    const error = new ContainerConverterError('Test', { suggestions: ['Try this'] });
    expect(error.suggestions).toEqual(['Try this']);
  });

  it('should accept cause', () => {
    const cause = new Error('Original error');
    const error = new ContainerConverterError('Test', { cause });
    expect(error.cause).toBe(cause);
  });

  describe('format', () => {
    it('should format error with message', () => {
      const error = new ContainerConverterError('Test error', { code: 'TEST_CODE' });
      const formatted = error.format();
      expect(formatted).toContain('Error [TEST_CODE]: Test error');
    });

    it('should include context in format', () => {
      const error = new ContainerConverterError('Test', {
        code: 'TEST',
        context: { file: 'test.txt' },
      });
      const formatted = error.format();
      expect(formatted).toContain('Context:');
      expect(formatted).toContain('file:');
      expect(formatted).toContain('test.txt');
    });

    it('should include suggestions in format', () => {
      const error = new ContainerConverterError('Test', {
        code: 'TEST',
        suggestions: ['Try option A', 'Try option B'],
      });
      const formatted = error.format();
      expect(formatted).toContain('Suggestions:');
      expect(formatted).toContain('- Try option A');
      expect(formatted).toContain('- Try option B');
    });
  });
});

describe('DockerfileParseError', () => {
  it('should create error with message', () => {
    const error = new DockerfileParseError('Invalid instruction');
    expect(error.message).toContain('Dockerfile parsing failed');
    expect(error.message).toContain('Invalid instruction');
    expect(error.name).toBe('DockerfileParseError');
    expect(error.code).toBe('DOCKERFILE_PARSE_ERROR');
  });

  it('should include line number', () => {
    const error = new DockerfileParseError('Syntax error', { line: 42 });
    expect(error.message).toContain('at line 42');
    expect(error.line).toBe(42);
  });

  it('should have suggestions', () => {
    const error = new DockerfileParseError('Error');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.length).toBeGreaterThan(0);
  });
});

describe('SDFGenerationError', () => {
  it('should create error with message', () => {
    const error = new SDFGenerationError('Missing base image');
    expect(error.message).toContain('SDF generation failed');
    expect(error.message).toContain('Missing base image');
    expect(error.name).toBe('SDFGenerationError');
    expect(error.code).toBe('SDF_GENERATION_ERROR');
  });

  it('should accept context', () => {
    const error = new SDFGenerationError('Error', { context: { field: 'image' } });
    expect(error.context).toEqual({ field: 'image' });
  });
});

describe('ValidationError', () => {
  it('should create error with message', () => {
    const error = new ValidationError('Schema invalid');
    expect(error.message).toContain('Validation failed');
    expect(error.message).toContain('Schema invalid');
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should accept validation errors array', () => {
    const errors = [
      { field: 'label', message: 'Required' },
      { field: 'version', message: 'Invalid format' },
    ];
    const error = new ValidationError('Schema invalid', { validationErrors: errors });
    expect(error.validationErrors).toEqual(errors);
  });

  it('should default to empty validation errors', () => {
    const error = new ValidationError('Error');
    expect(error.validationErrors).toEqual([]);
  });
});

describe('ExchangeAuthError', () => {
  it('should create error with message', () => {
    const error = new ExchangeAuthError('Invalid credentials');
    expect(error.message).toContain('Exchange authentication failed');
    expect(error.message).toContain('Invalid credentials');
    expect(error.name).toBe('ExchangeAuthError');
  });

  it('should use default code', () => {
    const error = new ExchangeAuthError('Error');
    expect(error.code).toBe('EXCHANGE_AUTH_ERROR');
  });

  it('should accept custom code', () => {
    const error = new ExchangeAuthError('Error', { code: 'AUTH_EXPIRED' });
    expect(error.code).toBe('AUTH_EXPIRED');
  });

  it('should have auth-related suggestions', () => {
    const error = new ExchangeAuthError('Error');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some(s => s.includes('HZN_ORG_ID'))).toBe(true);
  });
});

describe('PublishError', () => {
  it('should create error with message', () => {
    const error = new PublishError('Service exists');
    expect(error.message).toContain('Publish failed');
    expect(error.message).toContain('Service exists');
    expect(error.name).toBe('PublishError');
  });

  it('should have publish-related suggestions', () => {
    const error = new PublishError('Error');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some(s => s.includes('--overwrite'))).toBe(true);
  });
});

describe('FileError', () => {
  it('should create error with path', () => {
    const error = new FileError('File not found', { path: '/tmp/test.txt' });
    expect(error.message).toContain('File operation failed');
    expect(error.path).toBe('/tmp/test.txt');
    expect(error.name).toBe('FileError');
    expect(error.code).toBe('FILE_ERROR');
  });

  it('should include operation in context', () => {
    const error = new FileError('Permission denied', { path: '/etc/passwd', operation: 'read' });
    expect(error.context).toEqual({ path: '/etc/passwd', operation: 'read' });
  });

  it('should have file-related suggestions', () => {
    const error = new FileError('Error', { path: '/tmp/file' });
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some(s => s.includes('permissions'))).toBe(true);
  });
});

describe('CliNotFoundError', () => {
  it('should create error with command', () => {
    const error = new CliNotFoundError('hzn');
    expect(error.message).toContain('CLI tool not found');
    expect(error.message).toContain('hzn');
    expect(error.command).toBe('hzn');
    expect(error.name).toBe('CliNotFoundError');
    expect(error.code).toBe('CLI_NOT_FOUND');
  });

  it('should accept custom message', () => {
    const error = new CliNotFoundError('docker', 'Docker CLI is required');
    expect(error.message).toBe('Docker CLI is required');
    expect(error.command).toBe('docker');
  });

  it('should suggest installation', () => {
    const error = new CliNotFoundError('hzn');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some(s => s.includes('Install'))).toBe(true);
  });
});

describe('NetworkError', () => {
  it('should create error with message', () => {
    const error = new NetworkError('Connection refused');
    expect(error.message).toContain('Network error');
    expect(error.message).toContain('Connection refused');
    expect(error.name).toBe('NetworkError');
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('should include URL', () => {
    const error = new NetworkError('Timeout', { url: 'http://example.com' });
    expect(error.url).toBe('http://example.com');
    expect(error.context).toEqual({ url: 'http://example.com', statusCode: undefined });
  });

  it('should include status code', () => {
    const error = new NetworkError('Not found', { url: 'http://example.com', statusCode: 404 });
    expect(error.context!.statusCode).toBe(404);
  });
});

describe('isContainerConverterError', () => {
  it('should return true for ContainerConverterError', () => {
    const error = new ContainerConverterError('Test');
    expect(isContainerConverterError(error)).toBe(true);
  });

  it('should return true for derived errors', () => {
    expect(isContainerConverterError(new DockerfileParseError('Test'))).toBe(true);
    expect(isContainerConverterError(new ValidationError('Test'))).toBe(true);
    expect(isContainerConverterError(new FileError('Test', { path: '/tmp' }))).toBe(true);
  });

  it('should return false for standard Error', () => {
    const error = new Error('Test');
    expect(isContainerConverterError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isContainerConverterError('string')).toBe(false);
    expect(isContainerConverterError(null)).toBe(false);
    expect(isContainerConverterError(undefined)).toBe(false);
    expect(isContainerConverterError({})).toBe(false);
  });
});

describe('formatError', () => {
  it('should format ContainerConverterError using format method', () => {
    const error = new ContainerConverterError('Test error', { code: 'TEST' });
    const formatted = formatError(error);
    expect(formatted).toContain('Error [TEST]: Test error');
  });

  it('should format standard Error', () => {
    const error = new Error('Standard error');
    const formatted = formatError(error);
    expect(formatted).toBe('Error: Standard error');
  });

  it('should format string errors', () => {
    const formatted = formatError('String error');
    expect(formatted).toBe('Error: String error');
  });

  it('should handle null and undefined', () => {
    expect(formatError(null)).toBe('Error: null');
    expect(formatError(undefined)).toBe('Error: undefined');
  });
});

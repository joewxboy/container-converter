/**
 * Logger Utility Tests
 */

import { Logger, LogLevel, createLogger } from '../../../src/utils/logger';

describe('Logger', () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LOG_LEVEL;
    delete process.env.DEBUG;
    delete process.env.NO_COLOR;
  });

  describe('constructor', () => {
    it('should create a logger with default config', () => {
      const logger = new Logger();
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should accept custom log level', () => {
      const logger = new Logger({ level: LogLevel.DEBUG });
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should respect LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const logger = new Logger();
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should respect DEBUG environment variable', () => {
      process.env.DEBUG = '1';
      const logger = new Logger();
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });
  });

  describe('setLevel', () => {
    it('should change log level', () => {
      const logger = new Logger();
      logger.setLevel(LogLevel.WARN);
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });
  });

  describe('isLevelEnabled', () => {
    it('should return true for levels at or above current level', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      expect(logger.isLevelEnabled(LogLevel.WARN)).toBe(true);
      expect(logger.isLevelEnabled(LogLevel.ERROR)).toBe(true);
    });

    it('should return false for levels below current level', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      expect(logger.isLevelEnabled(LogLevel.DEBUG)).toBe(false);
      expect(logger.isLevelEnabled(LogLevel.INFO)).toBe(false);
    });
  });

  describe('debug', () => {
    it('should log debug messages when level is DEBUG', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, colors: false });
      logger.debug('Test message');
      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('Test message');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('[DEBUG]');
    });

    it('should not log debug messages when level is INFO', () => {
      const logger = new Logger({ level: LogLevel.INFO });
      logger.debug('Test message');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages when level is INFO or lower', () => {
      const logger = new Logger({ level: LogLevel.INFO, colors: false });
      logger.info('Test message');
      expect(consoleInfoSpy).toHaveBeenCalled();
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('Test message');
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('[INFO]');
    });

    it('should not log info messages when level is WARN', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      logger.info('Test message');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log warning messages when level is WARN or lower', () => {
      const logger = new Logger({ level: LogLevel.WARN, colors: false });
      logger.warn('Test warning');
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Test warning');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
    });

    it('should not log warning messages when level is ERROR', () => {
      const logger = new Logger({ level: LogLevel.ERROR });
      logger.warn('Test warning');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error messages at any level except SILENT', () => {
      const logger = new Logger({ level: LogLevel.ERROR, colors: false });
      logger.error('Test error');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Test error');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    });

    it('should not log error messages when level is SILENT', () => {
      const logger = new Logger({ level: LogLevel.SILENT });
      logger.error('Test error');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('with additional arguments', () => {
    it('should log additional string arguments', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, colors: false });
      logger.debug('Message', 'arg1', 'arg2');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('arg1');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('arg2');
    });

    it('should log objects as JSON', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, colors: false });
      logger.debug('Message', { key: 'value' });
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('"key"');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('"value"');
    });
  });

  describe('timestamps', () => {
    it('should include timestamps when enabled', () => {
      const logger = new Logger({ level: LogLevel.INFO, colors: false, timestamps: true });
      logger.info('Test message');
      // Should contain ISO format timestamp
      expect(consoleInfoSpy.mock.calls[0][0]).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('should not include timestamps when disabled', () => {
      const logger = new Logger({ level: LogLevel.INFO, colors: false, timestamps: false });
      logger.info('Test message');
      expect(consoleInfoSpy.mock.calls[0][0]).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('prefix', () => {
    it('should include prefix in log messages', () => {
      const logger = new Logger({ level: LogLevel.INFO, colors: false, prefix: 'TestModule' });
      logger.info('Test message');
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('TestModule');
    });
  });

  describe('child', () => {
    it('should create child logger with combined prefix', () => {
      const parent = new Logger({ level: LogLevel.INFO, colors: false, prefix: 'Parent' });
      const child = parent.child('Child');
      child.info('Test message');
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('Parent:Child');
    });

    it('should inherit parent log level', () => {
      const parent = new Logger({ level: LogLevel.WARN, colors: false });
      const child = parent.child('Child');
      child.info('Test message');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe('debugData', () => {
    it('should log structured data', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, colors: false });
      logger.debugData('MyData', { key: 'value' });
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('MyData:');
    });
  });

  describe('time', () => {
    it('should log timing information', async () => {
      const logger = new Logger({ level: LogLevel.DEBUG, colors: false });
      const end = logger.time('Operation');
      await new Promise((resolve) => setTimeout(resolve, 10));
      end();
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('Operation completed in');
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('ms');
    });
  });

  describe('success', () => {
    it('should log success messages with checkmark', () => {
      const logger = new Logger({ level: LogLevel.INFO, colors: false });
      logger.success('Operation complete');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('✓');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Operation complete');
    });
  });

  describe('errorWithStack', () => {
    it('should log error message', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, colors: false });
      const error = new Error('Test error');
      logger.errorWithStack('Something failed', error);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Something failed');
    });

    it('should include stack trace when DEBUG level', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, colors: false });
      const error = new Error('Test error');
      logger.errorWithStack('Something failed', error);
      expect(consoleErrorSpy.mock.calls[1][0]).toContain('Error: Test error');
    });
  });
});

describe('createLogger', () => {
  it('should create logger with module name as prefix', () => {
    const logger = createLogger('TestModule');
    expect(logger).toBeInstanceOf(Logger);
  });
});

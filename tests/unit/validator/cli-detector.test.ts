/**
 * Tests for CLI Detector
 */

import { exec } from 'child_process';
import {
  isHznCliAvailable,
  getHznCliVersion,
  isVersionCompatible,
} from '../../../src/validator/cli-detector';

// Mock child_process
jest.mock('child_process');
const mockExec = exec as jest.MockedFunction<typeof exec>;

describe('CLI Detector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isHznCliAvailable', () => {
    it('should return available true when hzn is found', async () => {
      // Mock 'which hzn' to return a path
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '/usr/local/bin/hzn\n', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      // Mock 'hzn version' to return version
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'Horizon CLI version: 2.30.0-1234\n', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      const result = await isHznCliAvailable();

      expect(result.available).toBe(true);
      expect(result.path).toBe('/usr/local/bin/hzn');
      expect(result.version).toBe('2.30.0-1234');
      expect(result.error).toBeUndefined();
    });

    it('should return available true even if version check fails', async () => {
      // Mock 'which hzn' to return a path
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '/usr/local/bin/hzn\n', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      // Mock 'hzn version' to fail
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(new Error('Permission denied') as any, { stdout: '', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      const result = await isHznCliAvailable();

      expect(result.available).toBe(true);
      expect(result.path).toBe('/usr/local/bin/hzn');
      expect(result.version).toBeUndefined();
    });

    it('should return available false when hzn is not found', async () => {
      // Mock 'which hzn' to fail (command not found)
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          const error: any = new Error('Command failed');
          error.code = 1;
          callback(error, { stdout: '', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      const result = await isHznCliAvailable();

      expect(result.available).toBe(false);
      expect(result.error).toBe('hzn command not found. Please install Open Horizon CLI.');
    });

    it('should return available false when which returns empty', async () => {
      // Mock 'which hzn' to return empty string
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      const result = await isHznCliAvailable();

      expect(result.available).toBe(false);
      expect(result.error).toBe('hzn command not found. Please install Open Horizon CLI.');
    });
  });

  describe('getHznCliVersion', () => {
    it('should return version info when hzn version succeeds', async () => {
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'Horizon CLI version: 2.30.0-1234\n', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      const result = await getHznCliVersion();

      expect(result.version).toBe('2.30.0-1234');
      expect(result.raw).toBe('Horizon CLI version: 2.30.0-1234');
    });

    it('should parse version from simple format', async () => {
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: '2.31.5\n', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      const result = await getHznCliVersion();

      expect(result.version).toBe('2.31.5');
    });

    it('should throw error when hzn command not found', async () => {
      const error: any = new Error('Command not found');
      error.code = 127;
      
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(error, { stdout: '', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      await expect(getHznCliVersion()).rejects.toThrow(
        'hzn command not found. Please install Open Horizon CLI.'
      );
    });

    it('should throw error when version cannot be parsed', async () => {
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(null, { stdout: 'Invalid output\n', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      await expect(getHznCliVersion()).rejects.toThrow(
        'Could not parse version from hzn output'
      );
    });

    it('should throw error on execution failure', async () => {
      mockExec.mockImplementationOnce(((_cmd: any, _opts: any, callback: any) => {
        if (callback) {
          callback(new Error('Execution failed') as any, { stdout: '', stderr: '' } as any);
        }
        return {} as any;
      }) as any);

      await expect(getHznCliVersion()).rejects.toThrow('Failed to get hzn version');
    });
  });

  describe('isVersionCompatible', () => {
    it('should return true when current version is higher', () => {
      expect(isVersionCompatible('2.31.0', '2.30.0')).toBe(true);
      expect(isVersionCompatible('3.0.0', '2.30.0')).toBe(true);
      expect(isVersionCompatible('2.30.1', '2.30.0')).toBe(true);
    });

    it('should return true when versions are equal', () => {
      expect(isVersionCompatible('2.30.0', '2.30.0')).toBe(true);
      expect(isVersionCompatible('1.0.0', '1.0.0')).toBe(true);
    });

    it('should return false when current version is lower', () => {
      expect(isVersionCompatible('2.29.0', '2.30.0')).toBe(false);
      expect(isVersionCompatible('1.0.0', '2.0.0')).toBe(false);
      expect(isVersionCompatible('2.30.0', '2.30.1')).toBe(false);
    });

    it('should handle versions with build numbers', () => {
      expect(isVersionCompatible('2.30.0-1234', '2.30.0')).toBe(true);
      expect(isVersionCompatible('2.31.0-5678', '2.30.0-1234')).toBe(true);
      expect(isVersionCompatible('2.29.0-9999', '2.30.0-1')).toBe(false);
    });

    it('should compare major version first', () => {
      expect(isVersionCompatible('3.0.0', '2.99.99')).toBe(true);
      expect(isVersionCompatible('1.99.99', '2.0.0')).toBe(false);
    });

    it('should compare minor version when major is equal', () => {
      expect(isVersionCompatible('2.31.0', '2.30.99')).toBe(true);
      expect(isVersionCompatible('2.29.99', '2.30.0')).toBe(false);
    });

    it('should compare patch version when major and minor are equal', () => {
      expect(isVersionCompatible('2.30.1', '2.30.0')).toBe(true);
      expect(isVersionCompatible('2.30.0', '2.30.1')).toBe(false);
    });
  });
});
/**
 * Unit tests for Exchange Publisher
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';

import {
  checkServiceExists,
  getPublishedVersions,
  publishService,
  unpublishService,
  PublishOptions,
} from '../../../src/publisher/exchange-publisher';
import type { ExchangeCredentials } from '../../../src/publisher/exchange-auth';
import type { ServiceDefinition } from '../../../src/types/sdf';
import { PublishError } from '../../../src/utils/errors';

// Mock child_process and fs
jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;

// Helper to create mock exec implementation
type ExecCallback = (error: Error | null, result: { stdout: string; stderr: string }) => void;

function createMockExec(
  error: Error | null,
  stdout: string = '',
  stderr: string = ''
): jest.Mock {
  return jest.fn().mockImplementation(
    (_command: string, _options: unknown, callback: ExecCallback) => {
      if (callback) {
        if (error) {
          const execError = error as Error & { stderr?: string };
          execError.stderr = stderr;
          callback(execError, { stdout: '', stderr });
        } else {
          callback(null, { stdout, stderr });
        }
      }
      return {} as ReturnType<typeof exec>;
    }
  );
}

// Test fixtures
const testCredentials: ExchangeCredentials = {
  orgId: 'test-org',
  userAuth: 'testuser:password',
  exchangeUrl: 'http://exchange.example.com/v1',
};

function createValidSDF(): ServiceDefinition {
  return {
    label: 'Test Service',
    description: 'A test service',
    url: 'com.example.test',
    version: '1.0.0',
    arch: 'amd64',
    sharable: 'singleton',
    deployment: {
      services: {
        test: {
          image: 'test/image:1.0.0',
        },
      },
    },
  };
}

describe('Exchange Publisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  describe('checkServiceExists', () => {
    it('should return true when service exists', async () => {
      const stdout = '{\n  "test-org/com.example.test_1.0.0_amd64": {...}\n}';
      mockExec.mockImplementationOnce(createMockExec(null, stdout, ''));

      const result = await checkServiceExists(
        testCredentials,
        'test-org',
        'com.example.test',
        '1.0.0',
        'amd64'
      );

      expect(result).toBe(true);
    });

    it('should return false when service not found', async () => {
      const error = new Error('Service not found');
      mockExec.mockImplementationOnce(createMockExec(error, '', 'not found'));

      const result = await checkServiceExists(
        testCredentials,
        'test-org',
        'com.example.test',
        '1.0.0',
        'amd64'
      );

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const error = new Error('Connection error');
      mockExec.mockImplementationOnce(createMockExec(error, '', ''));

      const result = await checkServiceExists(
        testCredentials,
        'test-org',
        'com.example.nonexistent',
        '1.0.0',
        'amd64'
      );

      expect(result).toBe(false);
    });
  });

  describe('getPublishedVersions', () => {
    it('should return list of versions', async () => {
      const stdout = `
test-org/com.example.test_1.0.0_amd64
test-org/com.example.test_1.1.0_amd64
test-org/com.example.test_2.0.0_amd64
      `;
      mockExec.mockImplementationOnce(createMockExec(null, stdout, ''));

      const result = await getPublishedVersions(
        testCredentials,
        'test-org',
        'com.example.test'
      );

      expect(result).toEqual(['1.0.0', '1.1.0', '2.0.0']);
    });

    it('should return empty array when no services found', async () => {
      const error = new Error('No services');
      mockExec.mockImplementationOnce(createMockExec(error, '', ''));

      const result = await getPublishedVersions(
        testCredentials,
        'test-org',
        'com.example.nonexistent'
      );

      expect(result).toEqual([]);
    });

    it('should deduplicate versions', async () => {
      const stdout = `
test-org/com.example.test_1.0.0_amd64
test-org/com.example.test_1.0.0_arm64
      `;
      mockExec.mockImplementationOnce(createMockExec(null, stdout, ''));

      const result = await getPublishedVersions(
        testCredentials,
        'test-org',
        'com.example.test'
      );

      expect(result).toEqual(['1.0.0']);
    });
  });

  describe('publishService', () => {
    it('should publish service successfully', async () => {
      // First call: checkServiceExists (not found)
      mockExec.mockImplementationOnce(createMockExec(new Error('not found'), '', ''));
      // Second call: publish
      mockExec.mockImplementationOnce(createMockExec(null, 'Service published successfully', ''));

      const options: PublishOptions = {
        credentials: testCredentials,
        sdf: createValidSDF(),
      };

      const result = await publishService(options);

      expect(result.success).toBe(true);
      expect(result.serviceId).toBe('test-org/com.example.test_1.0.0_amd64');
      expect(result.version).toBe('1.0.0');
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockUnlink).toHaveBeenCalled();
    });

    it('should fail when SDF missing required fields', async () => {
      const options: PublishOptions = {
        credentials: testCredentials,
        sdf: {
          label: 'Test',
          description: 'Test',
          sharable: 'none',
          deployment: { services: {} },
        } as ServiceDefinition,
      };

      const result = await publishService(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing required fields');
    });

    it('should fail when service exists and overwrite is false', async () => {
      // checkServiceExists returns true
      mockExec.mockImplementationOnce(createMockExec(null, '{ "service": {} }', ''));

      const options: PublishOptions = {
        credentials: testCredentials,
        sdf: createValidSDF(),
        overwrite: false,
      };

      const result = await publishService(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should succeed with overwrite when service exists', async () => {
      // checkServiceExists returns true
      mockExec.mockImplementationOnce(createMockExec(null, '{ "service": {} }', ''));
      // publish succeeds
      mockExec.mockImplementationOnce(createMockExec(null, 'Published', ''));

      const options: PublishOptions = {
        credentials: testCredentials,
        sdf: createValidSDF(),
        overwrite: true,
      };

      const result = await publishService(options);

      expect(result.success).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('Overwriting'));
    });

    it('should return success without publishing on dry run', async () => {
      // checkServiceExists
      mockExec.mockImplementationOnce(createMockExec(new Error('not found'), '', ''));

      const options: PublishOptions = {
        credentials: testCredentials,
        sdf: createValidSDF(),
        dryRun: true,
      };

      const result = await publishService(options);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should throw PublishError on authentication failure', async () => {
      // checkServiceExists
      mockExec.mockImplementationOnce(createMockExec(new Error('not found'), '', ''));
      // publish fails with 401
      const error = new Error('Auth failed');
      mockExec.mockImplementationOnce(createMockExec(error, '', '401 Unauthorized'));

      const options: PublishOptions = {
        credentials: testCredentials,
        sdf: createValidSDF(),
      };

      await expect(publishService(options)).rejects.toThrow(/Authentication failed/);
    });

    it('should throw PublishError on connection refused', async () => {
      // checkServiceExists
      mockExec.mockImplementationOnce(createMockExec(new Error('not found'), '', ''));
      // publish fails with connection refused
      const error = new Error('Connection failed');
      mockExec.mockImplementationOnce(createMockExec(error, '', 'ECONNREFUSED'));

      const options: PublishOptions = {
        credentials: testCredentials,
        sdf: createValidSDF(),
      };

      await expect(publishService(options)).rejects.toThrow(PublishError);
    });

    it('should use org from SDF if provided', async () => {
      // checkServiceExists
      mockExec.mockImplementationOnce(createMockExec(new Error('not found'), '', ''));
      // publish succeeds
      mockExec.mockImplementationOnce(createMockExec(null, 'Published', ''));

      const sdf = createValidSDF();
      sdf.org = 'custom-org';

      const options: PublishOptions = {
        credentials: testCredentials,
        sdf,
      };

      const result = await publishService(options);

      expect(result.success).toBe(true);
      expect(result.serviceId).toBe('custom-org/com.example.test_1.0.0_amd64');
    });

    it('should clean up temp file even on error', async () => {
      // checkServiceExists
      mockExec.mockImplementationOnce(createMockExec(new Error('not found'), '', ''));
      // publish fails with generic error
      mockExec.mockImplementationOnce(createMockExec(new Error('Some error'), '', ''));

      const options: PublishOptions = {
        credentials: testCredentials,
        sdf: createValidSDF(),
      };

      await publishService(options);

      expect(mockUnlink).toHaveBeenCalled();
    });
  });

  describe('unpublishService', () => {
    it('should return true on successful removal', async () => {
      mockExec.mockImplementationOnce(createMockExec(null, 'Removed', ''));

      const result = await unpublishService(
        testCredentials,
        'test-org/com.example.test_1.0.0_amd64'
      );

      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      mockExec.mockImplementationOnce(createMockExec(new Error('Not found'), '', ''));

      const result = await unpublishService(
        testCredentials,
        'test-org/com.example.nonexistent_1.0.0_amd64'
      );

      expect(result).toBe(false);
    });
  });
});

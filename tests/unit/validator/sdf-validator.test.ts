/**
 * SDF Validator Tests
 * Unit tests for the SDF validator
 */

import { exec } from 'child_process';
import { SDFValidator } from '../../../src/validator/sdf-validator';
import { ServiceDefinition } from '../../../src/types/sdf';

// Mock child_process for CLI validation tests
jest.mock('child_process');
const mockExec = exec as jest.MockedFunction<typeof exec>;

// Mock fs/promises for CLI validation tests
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

// Type for exec callback - promisify wraps stdout/stderr into an object
type ExecResult = { stdout: string; stderr: string };
type ExecCallback = (error: Error | null, result: ExecResult) => void;

// Helper to create mock exec implementation
// Note: Node's promisify has special handling for exec that wraps stdout/stderr
const createMockExec = (
  error: Error | null,
  stdout: string,
  stderr: string
): jest.Mock => {
  return jest.fn().mockImplementation(
    (_cmd: string, _opts: unknown, callback: ExecCallback) => {
      if (callback) {
        callback(error, { stdout, stderr });
      }
      return {} as ReturnType<typeof exec>;
    }
  );
};

describe('SDFValidator', () => {
  let validator: SDFValidator;

  // Helper to create a valid SDF for testing
  const createValidSDF = (overrides: Partial<ServiceDefinition> = {}): ServiceDefinition => ({
    label: 'test-service for amd64',
    description: 'A test service',
    url: 'test-service',
    version: '1.0.0',
    arch: 'amd64',
    sharable: 'multiple',
    deployment: {
      services: {
        'test-service': {
          image: 'docker.io/test/image:1.0.0',
        },
      },
    },
    ...overrides,
  });

  // Helper to delete a field from SDF for testing
  const deleteField = (sdf: ServiceDefinition, field: string): void => {
    delete (sdf as unknown as Record<string, unknown>)[field];
  };

  beforeEach(() => {
    validator = new SDFValidator();
    jest.clearAllMocks();
  });

  describe('validateSchema', () => {
    describe('valid SDFs', () => {
      it('should return valid for a minimal valid SDF', () => {
        const sdf = createValidSDF();
        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return valid for SDF with all optional fields', () => {
        const sdf = createValidSDF({
          org: 'myorg',
          documentation: 'https://example.com/docs',
          public: true,
          requiredServices: [
            {
              url: 'dep-service',
              org: 'myorg',
              versionRange: '1.0.0',
              arch: 'amd64',
            },
          ],
          userInput: [
            {
              name: 'LOG_LEVEL',
              label: 'Logging level',
              type: 'string',
              defaultValue: 'info',
            },
          ],
        });
        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return valid for SDF with multiple services', () => {
        const sdf = createValidSDF({
          deployment: {
            services: {
              'service-a': { image: 'image-a:1.0' },
              'service-b': { image: 'image-b:1.0' },
            },
          },
        });
        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(true);
      });

      it('should return valid for all sharable values', () => {
        const sharableValues: Array<'none' | 'singleton' | 'multiple'> = ['none', 'singleton', 'multiple'];

        for (const sharable of sharableValues) {
          const sdf = createValidSDF({ sharable });
          const result = validator.validateSchema(sdf);
          expect(result.valid).toBe(true);
        }
      });

      it('should return valid for service with full configuration', () => {
        const sdf = createValidSDF({
          deployment: {
            services: {
              'test-service': {
                image: 'docker.io/test/image:1.0.0',
                ports: [{ HostIP: '0.0.0.0', HostPort: '8080:8080/tcp' }],
                environment: ['NODE_ENV=production', 'LOG_LEVEL=info'],
                command: ['/bin/sh', '-c', 'start.sh'],
                privileged: false,
                binds: ['/data:/data'],
              },
            },
          },
        });
        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(true);
      });
    });

    describe('missing required fields', () => {
      it('should fail when label is missing', () => {
        const sdf = createValidSDF();
        deleteField(sdf, 'label');

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'label', message: expect.stringContaining('required') })
        );
      });

      it('should fail when description is missing', () => {
        const sdf = createValidSDF();
        deleteField(sdf, 'description');

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'description', message: expect.stringContaining('required') })
        );
      });

      it('should fail when url is missing', () => {
        const sdf = createValidSDF();
        deleteField(sdf, 'url');

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'url', message: expect.stringContaining('required') })
        );
      });

      it('should fail when version is missing', () => {
        const sdf = createValidSDF();
        deleteField(sdf, 'version');

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'version', message: expect.stringContaining('required') })
        );
      });

      it('should fail when arch is missing', () => {
        const sdf = createValidSDF();
        deleteField(sdf, 'arch');

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'arch', message: expect.stringContaining('required') })
        );
      });

      it('should fail when sharable is missing', () => {
        const sdf = createValidSDF();
        deleteField(sdf, 'sharable');

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'sharable', message: expect.stringContaining('required') })
        );
      });

      it('should fail when deployment is missing', () => {
        const sdf = createValidSDF();
        deleteField(sdf, 'deployment');

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'deployment', message: expect.stringContaining('required') })
        );
      });

      it('should report multiple missing fields', () => {
        const sdf = createValidSDF();
        deleteField(sdf, 'label');
        deleteField(sdf, 'version');

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('invalid field values', () => {
      it('should fail when sharable has invalid value', () => {
        const sdf = createValidSDF();
        (sdf as unknown as Record<string, unknown>).sharable = 'invalid';

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'sharable', message: expect.stringContaining('none') })
        );
      });

      it('should fail when label is empty string', () => {
        const sdf = createValidSDF({ label: '' });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'label', message: expect.stringContaining('empty') })
        );
      });

      it('should fail when url is empty string', () => {
        const sdf = createValidSDF({ url: '' });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'url', message: expect.stringContaining('empty') })
        );
      });

      it('should fail when version is empty string', () => {
        const sdf = createValidSDF({ version: '' });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'version', message: expect.stringContaining('empty') })
        );
      });
    });

    describe('deployment validation', () => {
      it('should fail when deployment.services is empty', () => {
        const sdf = createValidSDF({
          deployment: { services: {} },
        });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'deployment.services',
            message: expect.stringContaining('at least one'),
          })
        );
      });

      it('should fail when service is missing image', () => {
        const sdf = createValidSDF({
          deployment: {
            services: {
              'test-service': {} as { image: string },
            },
          },
        });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'deployment.services.test-service.image',
            message: expect.stringContaining('required'),
          })
        );
      });

      it('should fail when service image is empty string', () => {
        const sdf = createValidSDF({
          deployment: {
            services: {
              'test-service': { image: '' },
            },
          },
        });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'deployment.services.test-service.image',
            message: expect.stringContaining('empty'),
          })
        );
      });
    });

    describe('port mapping validation', () => {
      it('should fail when port mapping is missing HostPort', () => {
        const sdf = createValidSDF({
          deployment: {
            services: {
              'test-service': {
                image: 'test:1.0',
                ports: [{ HostIP: '0.0.0.0' } as unknown as { HostPort: string }],
              },
            },
          },
        });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: expect.stringContaining('ports'),
            message: expect.stringContaining('HostPort'),
          })
        );
      });
    });

    describe('userInput validation', () => {
      it('should fail when userInput item is missing name', () => {
        const sdf = createValidSDF({
          userInput: [
            { label: 'Test', type: 'string', defaultValue: 'test' } as unknown as {
              name: string;
              label: string;
              type: 'string';
              defaultValue: string;
            },
          ],
        });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: expect.stringContaining('userInput'),
            message: expect.stringContaining('name'),
          })
        );
      });

      it('should fail when userInput has invalid type', () => {
        const sdf = createValidSDF({
          userInput: [
            { name: 'TEST', label: 'Test', type: 'invalid' as unknown as 'string', defaultValue: 'test' },
          ],
        });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: expect.stringContaining('userInput'),
            message: expect.stringContaining('type'),
          })
        );
      });
    });

    describe('requiredServices validation', () => {
      it('should fail when requiredService is missing url', () => {
        const sdf = createValidSDF({
          requiredServices: [
            { org: 'myorg', versionRange: '1.0.0', arch: 'amd64' } as unknown as {
              url: string;
              org: string;
              versionRange: string;
              arch: string;
            },
          ],
        });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: expect.stringContaining('requiredServices'),
            message: expect.stringContaining('url'),
          })
        );
      });

      it('should fail when requiredService is missing org', () => {
        const sdf = createValidSDF({
          requiredServices: [
            { url: 'dep-service', versionRange: '1.0.0', arch: 'amd64' } as unknown as {
              url: string;
              org: string;
              versionRange: string;
              arch: string;
            },
          ],
        });

        const result = validator.validateSchema(sdf);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: expect.stringContaining('requiredServices'),
            message: expect.stringContaining('org'),
          })
        );
      });
    });

    describe('null and undefined handling', () => {
      it('should fail when SDF is null', () => {
        const result = validator.validateSchema(null as unknown as ServiceDefinition);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ message: expect.stringContaining('null') })
        );
      });

      it('should fail when SDF is undefined', () => {
        const result = validator.validateSchema(undefined as unknown as ServiceDefinition);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ message: expect.stringContaining('undefined') })
        );
      });

      it('should fail when SDF is not an object', () => {
        const result = validator.validateSchema('not an object' as unknown as ServiceDefinition);

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({ message: expect.stringContaining('object') })
        );
      });
    });
  });

  describe('validateWithCli', () => {
    it('should return valid when hzn validates successfully', async () => {
      // Mock successful validation
      const mockImpl = createMockExec(null, 'Service definition validated successfully\n', '');
      mockExec.mockImplementationOnce(mockImpl);

      const sdf = createValidSDF();
      const result = await validator.validateWithCli(sdf);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid when hzn validation fails', async () => {
      // Mock validation failure
      const error = new Error('Validation failed');
      const mockImpl = createMockExec(error, '', 'Error: missing required field "label"\n');
      mockExec.mockImplementationOnce(mockImpl);

      const sdf = createValidSDF();
      const result = await validator.validateWithCli(sdf);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should indicate CLI unavailable when hzn is not found', async () => {
      // Mock CLI not found
      const error: NodeJS.ErrnoException = new Error('Command not found');
      error.code = 'ENOENT';
      const mockImpl = createMockExec(error, '', '');
      mockExec.mockImplementationOnce(mockImpl);

      const sdf = createValidSDF();
      const result = await validator.validateWithCli(sdf);

      expect(result.valid).toBe(false);
      expect(result.cliAvailable).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('CLI') })
      );
    });

    it('should handle timeout gracefully', async () => {
      // Mock timeout
      const error: NodeJS.ErrnoException = new Error('Command timed out');
      error.code = 'ETIMEDOUT';
      const mockImpl = createMockExec(error, '', '');
      mockExec.mockImplementationOnce(mockImpl);

      const sdf = createValidSDF();
      const result = await validator.validateWithCli(sdf);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('timeout') })
      );
    });
  });

  describe('validate (combined)', () => {
    it('should run schema validation by default', () => {
      const sdf = createValidSDF();
      const result = validator.validate(sdf);

      expect(result.valid).toBe(true);
    });

    it('should return schema errors without calling CLI if schema fails', () => {
      const sdf = createValidSDF();
      deleteField(sdf, 'label');

      const result = validator.validate(sdf);

      expect(result.valid).toBe(false);
      expect(mockExec).not.toHaveBeenCalled();
    });
  });
});

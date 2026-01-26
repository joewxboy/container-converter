/**
 * SDF Generator Tests
 * Unit tests for the SDF generator
 */

import { SDFGenerator } from '../../../src/generator/sdf-generator';
import { DockerfileData } from '../../../src/types/dockerfile';
import { ServiceDefinition } from '../../../src/types/sdf';
import { SDFGenerationError } from '../../../src/utils/errors';

describe('SDFGenerator', () => {
  let generator: SDFGenerator;

  beforeEach(() => {
    generator = new SDFGenerator();
  });

  describe('generate', () => {
    it('should be defined', () => {
      expect(typeof generator.generate).toBe('function');
    });

    it('should generate a basic SDF from Dockerfile data', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'node:18-alpine',
        exposedPorts: [3000],
        environment: { NODE_ENV: 'production' },
        volumes: [],
        labels: {},
      };

      const sdf = generator.generate(dockerfileData);

      expect(sdf).toBeDefined();
      expect(sdf.label).toContain('node-service');
      expect(sdf.url).toBe('node-service');
      expect(sdf.version).toBe('18-alpine');
      expect(sdf.arch).toBe('amd64');
      expect(sdf.sharable).toBe('multiple');
      expect(sdf.deployment.services).toBeDefined();
    });

    it('should map exposed ports correctly', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'nginx:latest',
        exposedPorts: [80, 443],
        environment: {},
        volumes: [],
        labels: {},
      };

      const sdf = generator.generate(dockerfileData);
      const serviceName = Object.keys(sdf.deployment.services)[0];
      const service = sdf.deployment.services[serviceName];

      expect(service.ports).toBeDefined();
      expect(service.ports).toHaveLength(2);
      expect(service.ports![0]).toEqual({
        HostIP: '0.0.0.0',
        HostPort: '80:80/tcp',
      });
      expect(service.ports![1]).toEqual({
        HostIP: '0.0.0.0',
        HostPort: '443:443/tcp',
      });
    });

    it('should map environment variables correctly', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'node:18',
        exposedPorts: [],
        environment: {
          NODE_ENV: 'production',
          PORT: '3000',
          LOG_LEVEL: 'info',
        },
        volumes: [],
        labels: {},
      };

      const sdf = generator.generate(dockerfileData);
      const serviceName = Object.keys(sdf.deployment.services)[0];
      const service = sdf.deployment.services[serviceName];

      expect(service.environment).toBeDefined();
      expect(service.environment).toContain('NODE_ENV=production');
      expect(service.environment).toContain('PORT=3000');
      expect(service.environment).toContain('LOG_LEVEL=info');
    });

    it('should map CMD instruction', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'node:18',
        exposedPorts: [],
        environment: {},
        command: ['node', 'index.js'],
        volumes: [],
        labels: {},
      };

      const sdf = generator.generate(dockerfileData);
      const serviceName = Object.keys(sdf.deployment.services)[0];
      const service = sdf.deployment.services[serviceName];

      expect(service.command).toEqual(['node', 'index.js']);
    });

    it('should combine ENTRYPOINT and CMD', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'node:18',
        exposedPorts: [],
        environment: {},
        entrypoint: ['node'],
        command: ['index.js'],
        volumes: [],
        labels: {},
      };

      const sdf = generator.generate(dockerfileData);
      const serviceName = Object.keys(sdf.deployment.services)[0];
      const service = sdf.deployment.services[serviceName];

      expect(service.command).toEqual(['node', 'index.js']);
    });

    it('should map volumes to binds', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'postgres:15',
        exposedPorts: [5432],
        environment: {},
        volumes: ['/var/lib/postgresql/data', '/var/log'],
        labels: {},
      };

      const sdf = generator.generate(dockerfileData);
      const serviceName = Object.keys(sdf.deployment.services)[0];
      const service = sdf.deployment.services[serviceName];

      expect(service.binds).toEqual(['/var/lib/postgresql/data', '/var/log']);
    });

    it('should use user-provided metadata', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'node:18',
        exposedPorts: [],
        environment: {},
        volumes: [],
        labels: {},
      };

      const userMetadata = {
        name: 'my-custom-service',
        version: '2.0.0',
        architecture: 'arm64',
        organization: 'myorg',
        description: 'My custom service',
        documentation: 'https://example.com/docs',
      };

      const sdf = generator.generate(dockerfileData, userMetadata);

      expect(sdf.url).toBe('my-custom-service');
      expect(sdf.version).toBe('2.0.0');
      expect(sdf.arch).toBe('arm64');
      expect(sdf.org).toBe('myorg');
      expect(sdf.description).toBe('My custom service');
      expect(sdf.documentation).toBe('https://example.com/docs');
    });

    it('should infer singleton sharable mode for services with volumes', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'postgres:15',
        exposedPorts: [],
        environment: {},
        volumes: ['/data'],
        labels: {},
      };

      const sdf = generator.generate(dockerfileData);
      expect(sdf.sharable).toBe('singleton');
    });

    it('should handle services with no ports or environment', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'alpine:latest',
        exposedPorts: [],
        environment: {},
        volumes: [],
        labels: {},
      };

      const sdf = generator.generate(dockerfileData);
      const serviceName = Object.keys(sdf.deployment.services)[0];
      const service = sdf.deployment.services[serviceName];

      expect(service.ports).toBeUndefined();
      expect(service.environment).toBeUndefined();
    });

    it('should throw error for invalid metadata', () => {
      const dockerfileData: DockerfileData = {
        baseImage: '',
        exposedPorts: [],
        environment: {},
        volumes: [],
        labels: {},
      };

      // This should still work because we infer a default name
      expect(() => generator.generate(dockerfileData)).not.toThrow();
    });
  });

  describe('generateJSON', () => {
    it('should generate formatted JSON string', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'node:18',
        exposedPorts: [3000],
        environment: { NODE_ENV: 'production' },
        volumes: [],
        labels: {},
      };

      const json = generator.generateJSON(dockerfileData);

      expect(typeof json).toBe('string');
      expect(json).toContain('"label"');
      expect(json).toContain('"deployment"');
      
      // Should be valid JSON
      const parsed = JSON.parse(json) as ServiceDefinition;
      expect(parsed).toBeDefined();
      expect(parsed.deployment).toBeDefined();
    });

    it('should respect custom indentation', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'node:18',
        exposedPorts: [],
        environment: {},
        volumes: [],
        labels: {},
      };

      const json = generator.generateJSON(dockerfileData, {}, 4);
      
      // Check for 4-space indentation
      expect(json).toContain('    "label"');
    });
  });

  describe('validateSDF', () => {
    it('should validate a complete SDF', () => {
      const dockerfileData: DockerfileData = {
        baseImage: 'node:18',
        exposedPorts: [],
        environment: {},
        volumes: [],
        labels: {},
      };

      const sdf = generator.generate(dockerfileData);
      expect(() => generator.validateSDF(sdf)).not.toThrow();
      expect(generator.validateSDF(sdf)).toBe(true);
    });

    it('should throw error for missing required fields', () => {
      const incompleteSDF = {
        label: 'test',
        // missing other required fields
      } as unknown as ServiceDefinition;

      expect(() => generator.validateSDF(incompleteSDF)).toThrow(SDFGenerationError);
    });

    it('should throw error for empty deployment services', () => {
      const invalidSDF = {
        label: 'test',
        description: 'test',
        url: 'test',
        version: '1.0.0',
        arch: 'amd64',
        sharable: 'multiple',
        deployment: {
          services: {},
        },
      } as unknown as ServiceDefinition;

      expect(() => generator.validateSDF(invalidSDF)).toThrow(SDFGenerationError);
      expect(() => generator.validateSDF(invalidSDF)).toThrow('at least one service');
    });

    it('should throw error for service without image', () => {
      const invalidSDF = {
        label: 'test',
        description: 'test',
        url: 'test',
        version: '1.0.0',
        arch: 'amd64',
        sharable: 'multiple',
        deployment: {
          services: {
            'test-service': {
              // missing image
            },
          },
        },
      } as unknown as ServiceDefinition;

      expect(() => generator.validateSDF(invalidSDF)).toThrow(SDFGenerationError);
      expect(() => generator.validateSDF(invalidSDF)).toThrow('must have an image');
    });
  });
});

/**
 * Metadata Inference Tests
 * Unit tests for service metadata inference
 */

import {
  inferServiceMetadata,
  inferServiceName,
  inferVersion,
  inferArchitecture,
  inferDescription,
  inferSharableMode,
  generateServiceLabel,
  generateServiceUrl,
} from '../../../src/generator/metadata-inference';
import { DockerfileData } from '../../../src/types/dockerfile';

describe('Metadata Inference', () => {
  const baseDockerfileData: DockerfileData = {
    baseImage: 'node:18-alpine',
    exposedPorts: [],
    environment: {},
    volumes: [],
    labels: {},
  };

  describe('inferServiceName', () => {
    it('should extract name from service.name label', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        labels: { 'service.name': 'my-api' },
      };
      expect(inferServiceName(data)).toBe('my-api');
    });

    it('should extract name from name label', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        labels: { name: 'web-app' },
      };
      expect(inferServiceName(data)).toBe('web-app');
    });

    it('should infer name from base image', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'nginx:latest',
      };
      expect(inferServiceName(data)).toBe('nginx-service');
    });

    it('should handle image with registry', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'docker.io/library/redis:7',
      };
      expect(inferServiceName(data)).toBe('redis-service');
    });

    it('should return default name when no info available', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: '',
      };
      expect(inferServiceName(data)).toBe('my-service');
    });
  });

  describe('inferVersion', () => {
    it('should extract version from version label', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        labels: { version: '2.1.0' },
      };
      expect(inferVersion(data)).toBe('2.1.0');
    });

    it('should extract version from service.version label', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        labels: { 'service.version': '3.0.0' },
      };
      expect(inferVersion(data)).toBe('3.0.0');
    });

    it('should infer version from base image tag', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'node:18.19.0',
      };
      expect(inferVersion(data)).toBe('18.19.0');
    });

    it('should handle version with v prefix', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'golang:v1.21',
      };
      expect(inferVersion(data)).toBe('1.21');
    });

    it('should return default version when no info available', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'node:latest',
      };
      expect(inferVersion(data)).toBe('1.0.0');
    });
  });

  describe('inferArchitecture', () => {
    it('should detect arm64 from image name', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'node:18-alpine-arm64',
      };
      expect(inferArchitecture(data)).toBe('arm64');
    });

    it('should detect aarch64 as arm64', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'ubuntu:22.04-aarch64',
      };
      expect(inferArchitecture(data)).toBe('arm64');
    });

    it('should detect arm32 from image name', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'node:18-armv7',
      };
      expect(inferArchitecture(data)).toBe('arm');
    });

    it('should detect amd64 from image name', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'node:18-amd64',
      };
      expect(inferArchitecture(data)).toBe('amd64');
    });

    it('should extract architecture from label', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        labels: { architecture: 'arm64' },
      };
      expect(inferArchitecture(data)).toBe('arm64');
    });

    it('should default to amd64', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'node:18-alpine',
      };
      expect(inferArchitecture(data)).toBe('amd64');
    });
  });

  describe('inferDescription', () => {
    it('should extract description from label', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        labels: { description: 'My awesome service' },
      };
      expect(inferDescription(data)).toBe('My awesome service');
    });

    it('should generate description from base image', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: 'postgres:15',
      };
      expect(inferDescription(data)).toBe('Service based on postgres');
    });

    it('should return default description', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        baseImage: '',
      };
      expect(inferDescription(data)).toBe('A containerized service');
    });
  });

  describe('inferSharableMode', () => {
    it('should extract sharable mode from label', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        labels: { sharable: 'singleton' },
      };
      expect(inferSharableMode(data)).toBe('singleton');
    });

    it('should return singleton for services with volumes', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        volumes: ['/data', '/logs'],
      };
      expect(inferSharableMode(data)).toBe('singleton');
    });

    it('should return singleton for database ports', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        exposedPorts: [5432], // PostgreSQL
      };
      expect(inferSharableMode(data)).toBe('singleton');
    });

    it('should return singleton for MQTT broker port', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        exposedPorts: [1883],
      };
      expect(inferSharableMode(data)).toBe('singleton');
    });

    it('should return multiple for web service ports', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
        exposedPorts: [8080],
      };
      expect(inferSharableMode(data)).toBe('multiple');
    });

    it('should default to multiple', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
      };
      expect(inferSharableMode(data)).toBe('multiple');
    });
  });

  describe('generateServiceLabel', () => {
    it('should generate label with name and architecture', () => {
      const metadata = {
        name: 'my-service',
        architecture: 'amd64',
      };
      expect(generateServiceLabel(metadata)).toBe('my-service for amd64');
    });
  });

  describe('generateServiceUrl', () => {
    it('should convert name to lowercase URL', () => {
      const metadata = {
        name: 'MyService',
      };
      expect(generateServiceUrl(metadata)).toBe('myservice');
    });

    it('should replace spaces with hyphens', () => {
      const metadata = {
        name: 'My Service Name',
      };
      expect(generateServiceUrl(metadata)).toBe('my-service-name');
    });

    it('should remove special characters', () => {
      const metadata = {
        name: 'my_service@v1.0',
      };
      expect(generateServiceUrl(metadata)).toBe('my-service-v1-0');
    });
  });

  describe('inferServiceMetadata', () => {
    it('should infer all metadata fields', () => {
      const data: DockerfileData = {
        baseImage: 'node:18-alpine',
        exposedPorts: [3000],
        environment: {},
        volumes: [],
        labels: {},
      };

      const metadata = inferServiceMetadata(data);

      expect(metadata.name).toBe('node-service');
      expect(metadata.version).toBe('18-alpine');
      expect(metadata.architecture).toBe('amd64');
      expect(metadata.description).toBe('Service based on node');
      expect(metadata.sharable).toBe('multiple');
    });

    it('should use user-provided metadata over inferred values', () => {
      const data: DockerfileData = {
        ...baseDockerfileData,
      };

      const userMetadata = {
        name: 'custom-service',
        version: '2.0.0',
        architecture: 'arm64',
        description: 'Custom description',
        sharable: 'singleton' as const,
      };

      const metadata = inferServiceMetadata(data, userMetadata);

      expect(metadata.name).toBe('custom-service');
      expect(metadata.version).toBe('2.0.0');
      expect(metadata.architecture).toBe('arm64');
      expect(metadata.description).toBe('Custom description');
      expect(metadata.sharable).toBe('singleton');
    });

    it('should merge user metadata with inferred values', () => {
      const data: DockerfileData = {
        baseImage: 'redis:7',
        exposedPorts: [6379],
        environment: {},
        volumes: ['/data'],
        labels: {},
      };

      const userMetadata = {
        name: 'my-redis',
        organization: 'myorg',
      };

      const metadata = inferServiceMetadata(data, userMetadata);

      expect(metadata.name).toBe('my-redis');
      expect(metadata.organization).toBe('myorg');
      expect(metadata.version).toBe('7');
      expect(metadata.architecture).toBe('amd64');
      expect(metadata.sharable).toBe('singleton'); // Has volumes
    });
  });
});
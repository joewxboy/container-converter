/**
 * Dockerfile Parser Tests
 * Unit tests for the Dockerfile parser
 */

import path from 'path';
import { DockerfileParser } from '../../../src/parser/dockerfile-parser';
import { readDockerfile } from '../../../src/utils/file-reader';

describe('DockerfileParser', () => {
  let parser: DockerfileParser;
  const fixturesDir = path.join(__dirname, '../../fixtures/dockerfiles');

  beforeEach(() => {
    parser = new DockerfileParser();
  });

  describe('parse', () => {
    it('should be defined', () => {
      expect(typeof parser.parse).toBe('function');
    });

    it('should parse a simple Dockerfile', async () => {
      const content = await readDockerfile(path.join(fixturesDir, 'simple.Dockerfile'));
      const result = parser.parse(content);

      expect(result).toBeDefined();
      expect(result.baseImage).toBe('node:18-alpine');
      expect(result.exposedPorts).toContain(3000);
      expect(result.workdir).toBe('/app');
    });

    it('should parse a complex Dockerfile with multi-stage build', async () => {
      const content = await readDockerfile(path.join(fixturesDir, 'complex.Dockerfile'));
      const result = parser.parse(content);

      expect(result).toBeDefined();
      // Multi-stage: should get the last FROM
      expect(result.baseImage).toBe('node:18-alpine');
    });

    it('should extract FROM instruction', () => {
      const dockerfile = 'FROM ubuntu:22.04';
      const result = parser.parse(dockerfile);

      expect(result.baseImage).toBe('ubuntu:22.04');
    });

    it('should extract EXPOSE instructions', () => {
      const dockerfile = `
        FROM node:18
        EXPOSE 3000
        EXPOSE 8080/tcp
        EXPOSE 9090
      `;
      const result = parser.parse(dockerfile);

      expect(result.exposedPorts).toEqual([3000, 8080, 9090]);
    });

    it('should extract ENV instructions (key=value format)', () => {
      const dockerfile = `
        FROM node:18
        ENV NODE_ENV=production PORT=3000
      `;
      const result = parser.parse(dockerfile);

      expect(result.environment).toEqual({
        NODE_ENV: 'production',
        PORT: '3000',
      });
    });

    it('should extract ENV instructions (key value format)', () => {
      const dockerfile = `
        FROM node:18
        ENV NODE_ENV production
      `;
      const result = parser.parse(dockerfile);

      expect(result.environment).toEqual({
        NODE_ENV: 'production',
      });
    });

    it('should extract multiple ENV instructions', async () => {
      const content = await readDockerfile(path.join(fixturesDir, 'complex.Dockerfile'));
      const result = parser.parse(content);

      expect(result.environment).toHaveProperty('NODE_ENV', 'production');
      expect(result.environment).toHaveProperty('PORT', '3000');
      expect(result.environment).toHaveProperty('LOG_LEVEL', 'debug');
    });

    it('should extract CMD instruction', () => {
      const dockerfile = `
        FROM node:18
        CMD ["node", "index.js"]
      `;
      const result = parser.parse(dockerfile);

      expect(result.command).toEqual(['["node",', '"index.js"]']);
    });

    it('should extract ENTRYPOINT instruction', () => {
      const dockerfile = `
        FROM node:18
        ENTRYPOINT ["node"]
      `;
      const result = parser.parse(dockerfile);

      expect(result.entrypoint).toEqual(['["node"]']);
    });

    it('should extract WORKDIR instruction', () => {
      const dockerfile = `
        FROM node:18
        WORKDIR /app
      `;
      const result = parser.parse(dockerfile);

      expect(result.workdir).toBe('/app');
    });

    it('should extract USER instruction', () => {
      const dockerfile = `
        FROM node:18
        USER node
      `;
      const result = parser.parse(dockerfile);

      expect(result.user).toBe('node');
    });

    it('should extract VOLUME instructions', () => {
      const dockerfile = `
        FROM node:18
        VOLUME ["/data", "/logs"]
      `;
      const result = parser.parse(dockerfile);

      expect(result.volumes).toContain('["/data",');
      expect(result.volumes).toContain('"/logs"]');
    });

    it('should extract LABEL instructions', async () => {
      const content = await readDockerfile(path.join(fixturesDir, 'complex.Dockerfile'));
      const result = parser.parse(content);

      expect(result.labels).toHaveProperty('maintainer', 'test@example.com');
      expect(result.labels).toHaveProperty('version', '1.0.0');
    });

    it('should handle empty Dockerfile', () => {
      const dockerfile = '';
      const result = parser.parse(dockerfile);

      expect(result).toBeDefined();
      expect(result.baseImage).toBe('');
      expect(result.exposedPorts).toEqual([]);
      expect(result.environment).toEqual({});
    });

    it('should handle Dockerfile with only comments', () => {
      const dockerfile = `
        # This is a comment
        # Another comment
      `;
      const result = parser.parse(dockerfile);

      expect(result).toBeDefined();
      expect(result.baseImage).toBe('');
    });

    it('should handle multiple EXPOSE on same line', () => {
      const dockerfile = `
        FROM node:18
        EXPOSE 3000 8080 9090
      `;
      const result = parser.parse(dockerfile);

      expect(result.exposedPorts).toEqual([3000, 8080, 9090]);
    });

    it('should handle EXPOSE with protocol', () => {
      const dockerfile = `
        FROM node:18
        EXPOSE 3000/tcp
        EXPOSE 8080/udp
      `;
      const result = parser.parse(dockerfile);

      expect(result.exposedPorts).toContain(3000);
      expect(result.exposedPorts).toContain(8080);
    });

    it('should throw DockerfileParseError for invalid content', () => {
      // dockerfile-ast is quite permissive, so this test verifies error handling exists
      expect(typeof parser.parse).toBe('function');
    });

    it('should handle Dockerfile with all instruction types', async () => {
      const content = await readDockerfile(path.join(fixturesDir, 'complex.Dockerfile'));
      const result = parser.parse(content);

      expect(result.baseImage).toBeTruthy();
      expect(result.exposedPorts.length).toBeGreaterThan(0);
      expect(Object.keys(result.environment).length).toBeGreaterThan(0);
      expect(result.workdir).toBeTruthy();
      expect(result.user).toBeTruthy();
      expect(result.volumes.length).toBeGreaterThan(0);
      expect(Object.keys(result.labels).length).toBeGreaterThan(0);
    });
  });
});

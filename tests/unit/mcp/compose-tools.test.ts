/**
 * Tests for MCP Server Compose Tools
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn(),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn(),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  ErrorCode: {
    MethodNotFound: -32601,
  },
  McpError: class McpError extends Error {
    constructor(public code: number, message: string) {
      super(message);
    }
  },
}));

import { ContainerConverterServer } from '../../../src/mcp/server';

describe('MCP Server - Compose Tools', () => {
  let server: ContainerConverterServer;
  const fixturesDir = path.join(__dirname, '../../fixtures/compose');

  beforeEach(() => {
    server = new ContainerConverterServer();
  });

  describe('convert_compose tool', () => {
    it('should convert simple compose file to single SDF', async () => {
      const composePath = path.join(fixturesDir, 'simple.docker-compose.yml');
      
      const result = await (server as any).handleConvertCompose({
        compose_path: composePath,
        strategy: 'single-sdf',
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.strategy).toBe('single-sdf');
      expect(response.sdf).toBeDefined();
      expect(response.sdf.deployment.services).toBeDefined();
      expect(response.summary).toBeDefined();
    });

    it('should convert multi-service compose to multi-SDF', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      
      const result = await (server as any).handleConvertCompose({
        compose_path: composePath,
        strategy: 'multi-sdf',
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.strategy).toBe('multi-sdf');
      expect(response.sdfs).toBeDefined();
      expect(response.dependencyGraph).toBeDefined();
      expect(response.serviceCount).toBeGreaterThan(1);
    });

    it('should auto-detect strategy for simple compose', async () => {
      const composePath = path.join(fixturesDir, 'simple.docker-compose.yml');
      
      const result = await (server as any).handleConvertCompose({
        compose_path: composePath,
        strategy: 'auto',
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      // Simple compose should infer single-sdf
      expect(response.strategy).toBe('single-sdf');
    });

    it('should auto-detect strategy for complex compose', async () => {
      const composePath = path.join(fixturesDir, 'with-dependencies.docker-compose.yml');
      
      const result = await (server as any).handleConvertCompose({
        compose_path: composePath,
        strategy: 'auto',
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      // Complex compose with dependencies should infer multi-sdf
      expect(response.strategy).toBe('multi-sdf');
    });

    it('should save single SDF to output directory', async () => {
      const composePath = path.join(fixturesDir, 'simple.docker-compose.yml');
      const outputDir = path.join(__dirname, '../../tmp/mcp-test-output');
      
      // Clean up before test
      try {
        await fs.rm(outputDir, { recursive: true, force: true });
      } catch {}

      const result = await (server as any).handleConvertCompose({
        compose_path: composePath,
        strategy: 'single-sdf',
        output_dir: outputDir,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      // Verify file was created
      const files = await fs.readdir(outputDir);
      expect(files.length).toBeGreaterThan(0);
      
      // Clean up
      await fs.rm(outputDir, { recursive: true, force: true });
    });

    it('should save multiple SDFs to output directory', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      const outputDir = path.join(__dirname, '../../tmp/mcp-test-multi-output');
      
      // Clean up before test
      try {
        await fs.rm(outputDir, { recursive: true, force: true });
      } catch {}

      const result = await (server as any).handleConvertCompose({
        compose_path: composePath,
        strategy: 'multi-sdf',
        output_dir: outputDir,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.outputPaths).toBeDefined();
      
      // Verify files were created
      const files = await fs.readdir(outputDir);
      expect(files.length).toBe(response.serviceCount);
      
      // Clean up
      await fs.rm(outputDir, { recursive: true, force: true });
    });

    it('should handle custom metadata', async () => {
      const composePath = path.join(fixturesDir, 'simple.docker-compose.yml');
      
      const result = await (server as any).handleConvertCompose({
        compose_path: composePath,
        name: 'custom-project',
        version: '2.0.0',
        arch: 'arm64',
        org: 'myorg',
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.sdf.version).toBe('2.0.0');
      expect(response.sdf.arch).toBe('arm64');
      expect(response.sdf.org).toBe('myorg');
    });

    it('should handle non-existent compose file', async () => {
      await expect(
        (server as any).handleConvertCompose({
          compose_path: '/non/existent/file.yml',
        })
      ).rejects.toThrow();
    });
  });

  describe('parse_compose tool', () => {
    it('should parse simple compose file', async () => {
      const composePath = path.join(fixturesDir, 'simple.docker-compose.yml');
      
      const result = await (server as any).handleParseCompose({
        compose_path: composePath,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.serviceCount).toBeGreaterThan(0);
      expect(response.services).toBeDefined();
      expect(Array.isArray(response.services)).toBe(true);
    });

    it('should extract service details', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      
      const result = await (server as any).handleParseCompose({
        compose_path: composePath,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.services.length).toBeGreaterThan(1);
      
      // Check service structure
      const service = response.services[0];
      expect(service.name).toBeDefined();
      expect(service.image).toBeDefined();
      expect(service.ports).toBeDefined();
      expect(service.volumes).toBeDefined();
      expect(service.environment).toBeDefined();
    });

    it('should extract dependency graph', async () => {
      const composePath = path.join(fixturesDir, 'with-dependencies.docker-compose.yml');
      
      const result = await (server as any).handleParseCompose({
        compose_path: composePath,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.dependencyGraph).toBeDefined();
      expect(typeof response.dependencyGraph).toBe('object');
      
      // Check that at least one service has dependencies
      const hasDependencies = Object.values(response.dependencyGraph).some(
        (deps: any) => Array.isArray(deps) && deps.length > 0
      );
      expect(hasDependencies).toBe(true);
    });

    it('should detect networks and volumes', async () => {
      const composePath = path.join(fixturesDir, 'complex-features.docker-compose.yml');
      
      const result = await (server as any).handleParseCompose({
        compose_path: composePath,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.networks).toBeDefined();
      expect(response.volumes).toBeDefined();
      expect(Array.isArray(response.networks)).toBe(true);
      expect(Array.isArray(response.volumes)).toBe(true);
    });

    it('should handle compose file with secrets and configs', async () => {
      const composePath = path.join(fixturesDir, 'complex-features.docker-compose.yml');
      
      const result = await (server as any).handleParseCompose({
        compose_path: composePath,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.hasSecrets).toBeDefined();
      expect(response.hasConfigs).toBeDefined();
      expect(typeof response.hasSecrets).toBe('boolean');
      expect(typeof response.hasConfigs).toBe('boolean');
    });

    it('should handle non-existent compose file', async () => {
      await expect(
        (server as any).handleParseCompose({
          compose_path: '/non/existent/file.yml',
        })
      ).rejects.toThrow();
    });
  });

  describe('validate_sdf with multiple SDFs', () => {
    it('should validate array of SDFs', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      
      // First generate multi-SDF
      const convertResult = await (server as any).handleConvertCompose({
        compose_path: composePath,
        strategy: 'multi-sdf',
      });

      const convertResponse = JSON.parse(convertResult.content[0].text);
      const sdfs = Object.values(convertResponse.sdfs);

      // Now validate the array
      const validateResult = await (server as any).handleValidateSdf({
        sdf: sdfs,
        use_cli: false, // Skip CLI validation in tests
      });

      expect(validateResult.content).toHaveLength(1);
      const validateResponse = JSON.parse(validateResult.content[0].text);
      
      expect(validateResponse.valid).toBeDefined();
      expect(validateResponse.count).toBe(sdfs.length);
      expect(validateResponse.results).toBeDefined();
      expect(Array.isArray(validateResponse.results)).toBe(true);
      expect(validateResponse.results.length).toBe(sdfs.length);
    });

    it('should report validation errors for each SDF', async () => {
      const invalidSdfs = [
        { label: 'test1', url: 'test1' }, // Missing required fields
        { label: 'test2', url: 'test2' }, // Missing required fields
      ];

      const result = await (server as any).handleValidateSdf({
        sdf: invalidSdfs,
        use_cli: false,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.valid).toBe(false);
      expect(response.count).toBe(2);
      expect(response.results.every((r: any) => !r.valid)).toBe(true);
    });
  });

  describe('publish_sdf with multiple SDFs', () => {
    it('should handle array of SDFs for publishing', async () => {
      // This test would require mocking the Exchange API
      // For now, we'll just verify the structure
      const sdfs = [
        {
          label: 'test1',
          url: 'test1',
          version: '1.0.0',
          arch: 'amd64',
          sharable: 'multiple',
          deployment: { services: {} },
        },
        {
          label: 'test2',
          url: 'test2',
          version: '1.0.0',
          arch: 'amd64',
          sharable: 'multiple',
          deployment: { services: {} },
        },
      ];

      // Mock credentials to avoid actual Exchange calls
      jest.spyOn(require('../../../src/publisher/exchange-auth'), 'getCredentials')
        .mockResolvedValue(null);

      const result = await (server as any).handlePublishSdf({
        sdf: sdfs,
        dry_run: true,
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      // Should fail due to no credentials, but structure should be correct
      expect(response.success).toBe(false);
      expect(response.error).toContain('credentials');
    });
  });
});

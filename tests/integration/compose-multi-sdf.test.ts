/**
 * Integration Tests for Multi-SDF Compose Workflows
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { ComposeParser } from '../../src/parser/compose-parser';
import { ComposeSdfGenerator } from '../../src/generator/compose-sdf-generator';
import { SDFValidator } from '../../src/validator/sdf-validator';
import type { ServiceDefinition } from '../../src/types/sdf';

describe('Multi-SDF Compose Workflows', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/compose');
  const outputDir = path.join(__dirname, '../tmp/multi-sdf-output');

  beforeAll(async () => {
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up output directory
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {}
  });

  describe('End-to-End Multi-SDF Generation', () => {
    it('should convert multi-service compose to multiple SDFs', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      
      // Parse
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      expect(composeData.services).toBeDefined();
      expect(Object.keys(composeData.services).length).toBeGreaterThan(1);
      
      // Generate
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      expect('sdfs' in result).toBe(true);
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      
      expect(Object.keys(multiResult.sdfs).length).toBe(Object.keys(composeData.services).length);
      
      // Validate each SDF
      const validator = new SDFValidator();
      for (const [serviceName, sdf] of Object.entries(multiResult.sdfs)) {
        const validation = validator.validateSchema(sdf);
        expect(validation.valid).toBe(true);
        
        // Check SDF structure
        expect(sdf.label).toContain(serviceName);
        expect(sdf.url).toContain(serviceName);
        expect(sdf.deployment.services).toBeDefined();
        expect(Object.keys(sdf.deployment.services)).toContain(serviceName);
      }
    });

    it('should handle compose with dependencies correctly', async () => {
      const composePath = path.join(fixturesDir, 'with-dependencies.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      expect('sdfs' in result).toBe(true);
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      
      // Check dependency graph
      expect(multiResult.dependencyGraph).toBeDefined();
      
      // Find services with dependencies
      const servicesWithDeps = Object.entries(multiResult.dependencyGraph)
        .filter(([, deps]) => deps.length > 0);
      
      expect(servicesWithDeps.length).toBeGreaterThan(0);
      
      // Verify requiredServices in SDFs
      for (const [serviceName, deps] of servicesWithDeps) {
        const sdf = multiResult.sdfs[serviceName];
        expect(sdf.requiredServices).toBeDefined();
        expect(sdf.requiredServices!.length).toBe(deps.length);
        
        // Check that each dependency is referenced
        for (const dep of deps) {
          const requiredService = sdf.requiredServices!.find(rs => rs.url.includes(dep));
          expect(requiredService).toBeDefined();
        }
      }
    });

    it('should save multi-SDF to directory', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      const testOutputDir = path.join(outputDir, 'save-test');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      
      // Save each SDF
      await fs.mkdir(testOutputDir, { recursive: true });
      
      for (const [serviceName, sdf] of Object.entries(multiResult.sdfs)) {
        const filePath = path.join(testOutputDir, `${serviceName}.json`);
        await fs.writeFile(filePath, JSON.stringify(sdf, null, 2), 'utf-8');
      }
      
      // Verify files exist
      const files = await fs.readdir(testOutputDir);
      expect(files.length).toBe(Object.keys(multiResult.sdfs).length);
      
      // Verify each file is valid JSON and matches original SDF
      for (const [serviceName, originalSdf] of Object.entries(multiResult.sdfs)) {
        const filePath = path.join(testOutputDir, `${serviceName}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const loadedSdf = JSON.parse(content);
        
        expect(loadedSdf.url).toBe(originalSdf.url);
        expect(loadedSdf.version).toBe(originalSdf.version);
      }
    });
  });

  describe('Strategy Inference', () => {
    it('should infer single-SDF for simple compose', async () => {
      const composePath = path.join(fixturesDir, 'simple.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: undefined }); // Auto-infer
      
      // Simple compose should result in single SDF
      expect('label' in result).toBe(true);
      const sdf = result as ServiceDefinition;
      expect(sdf.deployment.services).toBeDefined();
    });

    it('should infer multi-SDF for complex compose', async () => {
      const composePath = path.join(fixturesDir, 'with-dependencies.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: undefined }); // Auto-infer
      
      // Complex compose with dependencies should result in multi-SDF
      expect('sdfs' in result).toBe(true);
    });

    it('should respect explicit strategy override', async () => {
      const composePath = path.join(fixturesDir, 'simple.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      
      // Force multi-SDF even for simple compose
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      expect('sdfs' in result).toBe(true);
    });
  });

  describe('Real-World Examples', () => {
    it('should handle WordPress compose file', async () => {
      const composePath = path.join(fixturesDir, 'wordpress.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      // WordPress typically has wordpress + mysql
      expect(Object.keys(composeData.services).length).toBeGreaterThanOrEqual(2);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      
      // Validate structure
      expect(Object.keys(multiResult.sdfs).length).toBeGreaterThanOrEqual(2);
      
      // WordPress should depend on database
      const wordpressService = Object.keys(multiResult.sdfs).find(name => 
        name.toLowerCase().includes('wordpress') || name.toLowerCase().includes('web')
      );
      
      if (wordpressService) {
        const deps = multiResult.dependencyGraph[wordpressService];
        expect(deps).toBeDefined();
        // Should have at least one dependency (database)
        expect(deps.length).toBeGreaterThan(0);
      }
    });

    it('should handle complex features compose', async () => {
      const composePath = path.join(fixturesDir, 'complex-features.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      
      // Validate all SDFs
      const validator = new SDFValidator();
      for (const sdf of Object.values(multiResult.sdfs)) {
        const validation = validator.validateSchema(sdf);
        expect(validation.valid).toBe(true);
      }
    });
  });

  describe('Validation Workflows', () => {
    it('should validate all SDFs in multi-SDF result', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      
      const validator = new SDFValidator();
      const validationResults = [];
      
      for (const [serviceName, sdf] of Object.entries(multiResult.sdfs)) {
        const validation = validator.validateSchema(sdf);
        validationResults.push({
          serviceName,
          valid: validation.valid,
          errors: validation.errors,
        });
      }
      
      // All should be valid
      expect(validationResults.every(r => r.valid)).toBe(true);
      
      // No errors
      expect(validationResults.every(r => r.errors.length === 0)).toBe(true);
    });

    it('should detect invalid SDFs in multi-SDF result', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      
      // Corrupt one SDF
      const firstService = Object.keys(multiResult.sdfs)[0];
      const corruptedSdf = { ...multiResult.sdfs[firstService] };
      delete (corruptedSdf as any).version; // Remove required field
      
      const validator = new SDFValidator();
      const validation = validator.validateSchema(corruptedSdf);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some(e => e.field?.includes('version'))).toBe(true);
    });
  });

  describe('Metadata Handling', () => {
    it('should apply custom metadata to all SDFs', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, {
        strategy: 'multi-sdf',
        organization: 'test-org',
        version: '2.0.0',
        architecture: 'arm64',
        projectName: 'custom-project',
      });
      
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      
      // Check that all SDFs have custom metadata
      for (const sdf of Object.values(multiResult.sdfs)) {
        expect(sdf.org).toBe('test-org');
        expect(sdf.version).toBe('2.0.0');
        expect(sdf.arch).toBe('arm64');
        expect(sdf.url).toContain('custom-project');
      }
    });

    it('should use project name from compose file', async () => {
      const composePath = path.join(fixturesDir, 'multi-service.docker-compose.yml');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      
      // All SDFs should reference the project name
      const projectName = composeData.name || 'compose-project';
      for (const sdf of Object.values(multiResult.sdfs)) {
        expect(sdf.url).toContain(projectName);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle compose file with missing images', async () => {
      // Create a temporary compose file with missing image
      const tempComposePath = path.join(outputDir, 'missing-image.yml');
      const invalidCompose = `
version: '3'
services:
  web:
    build: .
    ports:
      - "8080:80"
`;
      await fs.writeFile(tempComposePath, invalidCompose, 'utf-8');
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(tempComposePath);
      
      const generator = new ComposeSdfGenerator();
      
      // Should throw error for missing image
      expect(() => {
        generator.generate(composeData, { strategy: 'multi-sdf' });
      }).toThrow(/image/i);
    });

    it('should handle empty compose file', async () => {
      const tempComposePath = path.join(outputDir, 'empty.yml');
      const emptyCompose = `
version: '3'
services: {}
`;
      await fs.writeFile(tempComposePath, emptyCompose, 'utf-8');
      
      const parser = new ComposeParser();
      
      // Should throw error for no services
      await expect(parser.parseFile(tempComposePath)).rejects.toThrow(/at least one service/i);
    });
  });

  describe('Performance', () => {
    it('should handle large compose files efficiently', async () => {
      // Create a compose file with many services
      const largeComposePath = path.join(outputDir, 'large.yml');
      const services: string[] = [];
      
      for (let i = 0; i < 20; i++) {
        services.push(`
  service${i}:
    image: nginx:latest
    ports:
      - "${8000 + i}:80"
`);
      }
      
      const largeCompose = `
version: '3'
services:
${services.join('')}
`;
      await fs.writeFile(largeComposePath, largeCompose, 'utf-8');
      
      const startTime = Date.now();
      
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(largeComposePath);
      
      const generator = new ComposeSdfGenerator();
      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
      
      const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
      expect(Object.keys(multiResult.sdfs).length).toBe(20);
    });
  });
});

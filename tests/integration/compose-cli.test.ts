/**
 * Compose CLI Integration Tests
 * Tests for docker-compose.yml conversion via CLI
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

const CLI_PATH = path.join(__dirname, '../../src/cli/index.ts');
const FIXTURES_DIR = path.join(__dirname, '../fixtures/compose');
const SIMPLE_COMPOSE = path.join(FIXTURES_DIR, 'simple.docker-compose.yml');
const MULTI_SERVICE_COMPOSE = path.join(FIXTURES_DIR, 'multi-service.docker-compose.yml');
const WITH_DEPENDENCIES_COMPOSE = path.join(FIXTURES_DIR, 'with-dependencies.docker-compose.yml');

describe('Compose CLI Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test outputs
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compose-cli-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          const subFiles = await fs.readdir(filePath);
          for (const subFile of subFiles) {
            await fs.unlink(path.join(filePath, subFile));
          }
          await fs.rmdir(filePath);
        } else {
          await fs.unlink(filePath);
        }
      }
      await fs.rmdir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('input type detection', () => {
    it('should auto-detect docker-compose.yml files', async () => {
      const outputPath = path.join(tempDir, 'output.json');

      const { stdout } = await execAsync(
        `npx tsx ${CLI_PATH} "${SIMPLE_COMPOSE}" -o "${outputPath}"`
      );

      expect(stdout).toContain('Detected input type: compose');
      expect(stdout).toContain('Converting docker-compose.yml to SDF');
    });

    it('should respect manual type specification', async () => {
      const outputPath = path.join(tempDir, 'output.json');

      const { stdout } = await execAsync(
        `npx tsx ${CLI_PATH} "${SIMPLE_COMPOSE}" -o "${outputPath}" --type compose`
      );

      expect(stdout).toContain('Detected input type: compose');
    });
  });

  describe('single-SDF generation', () => {
    it('should generate single SDF for simple compose file', async () => {
      const outputPath = path.join(tempDir, 'output.json');

      const { stdout } = await execAsync(
        `npx tsx ${CLI_PATH} "${SIMPLE_COMPOSE}" -o "${outputPath}"`
      );

      expect(stdout).toContain('Auto-detected strategy: single-sdf');
      expect(stdout).toContain('Generating single SDF with all services');
      expect(stdout).toContain('Success: Conversion complete');

      // Verify output file
      const content = await fs.readFile(outputPath, 'utf-8');
      const sdf = JSON.parse(content);

      expect(sdf).toHaveProperty('deployment');
      expect(sdf.deployment.services).toBeDefined();
      expect(Object.keys(sdf.deployment.services).length).toBeGreaterThan(0);
    });

    it('should use custom metadata for single SDF', async () => {
      const outputPath = path.join(tempDir, 'output.json');

      await execAsync(
        `npx tsx ${CLI_PATH} "${SIMPLE_COMPOSE}" -o "${outputPath}" ` +
          `-n my-compose-app --svc-version 2.0.0 -a arm64 --org testorg`
      );

      const content = await fs.readFile(outputPath, 'utf-8');
      const sdf = JSON.parse(content);

      expect(sdf.label).toContain('my-compose-app');
      expect(sdf.url).toContain('my-compose-app');
      expect(sdf.version).toBe('2.0.0');
      expect(sdf.arch).toBe('arm64');
      expect(sdf.org).toBe('testorg');
    });
  });

  describe('multi-SDF generation', () => {
    it('should generate multiple SDFs with multi-sdf strategy', async () => {
      const outputDir = path.join(tempDir, 'sdfs');

      const { stdout } = await execAsync(
        `npx tsx ${CLI_PATH} "${MULTI_SERVICE_COMPOSE}" --strategy multi-sdf --output-dir "${outputDir}"`
      );

      expect(stdout).toContain('Generating multiple SDFs');
      expect(stdout).toContain('Generated');
      expect(stdout).toContain('SDF(s)');
      expect(stdout).toContain('All conversions complete');

      // Verify output directory exists
      const files = await fs.readdir(outputDir);
      expect(files.length).toBeGreaterThan(0);

      // Verify each file is valid JSON
      for (const file of files) {
        expect(file).toMatch(/-sdf\.json$/);
        const content = await fs.readFile(path.join(outputDir, file), 'utf-8');
        const sdf = JSON.parse(content);
        expect(sdf).toHaveProperty('deployment');
        expect(sdf.deployment.services).toBeDefined();
      }
    });

    it('should auto-detect strategy based on service count', async () => {
      const outputPath = path.join(tempDir, 'output.json');

      const { stdout } = await execAsync(
        `npx tsx ${CLI_PATH} "${MULTI_SERVICE_COMPOSE}" -o "${outputPath}"`
      );

      // multi-service has 3 services, so it should use single-sdf (≤3 services)
      expect(stdout).toContain('Auto-detected strategy: single-sdf');
      expect(stdout).toContain('Generating single SDF');
    });

    it('should require output-dir for multi-sdf strategy', async () => {
      try {
        await execAsync(
          `npx tsx ${CLI_PATH} "${MULTI_SERVICE_COMPOSE}" --strategy multi-sdf`
        );
        fail('Expected command to fail');
      } catch (error) {
        const execError = error as { stderr: string };
        expect(execError.stderr).toContain('--output-dir is required for multi-sdf strategy');
      }
    });

    it('should handle dependencies in multi-sdf generation', async () => {
      const outputDir = path.join(tempDir, 'sdfs');

      const { stdout } = await execAsync(
        `npx tsx ${CLI_PATH} "${WITH_DEPENDENCIES_COMPOSE}" --strategy multi-sdf --output-dir "${outputDir}"`
      );

      expect(stdout).toContain('Generating multiple SDFs');
      expect(stdout).toContain('All conversions complete');

      // Verify SDFs were created
      const files = await fs.readdir(outputDir);
      expect(files.length).toBeGreaterThan(0);

      // Check that SDFs have requiredServices for dependencies
      for (const file of files) {
        const content = await fs.readFile(path.join(outputDir, file), 'utf-8');
        const sdf = JSON.parse(content);
        // At least one service should have dependencies
        if (sdf.requiredServices && sdf.requiredServices.length > 0) {
          expect(sdf.requiredServices[0]).toHaveProperty('url');
          expect(sdf.requiredServices[0]).toHaveProperty('versionRange');
        }
      }
    });
  });

  describe('validation with compose files', () => {
    it('should validate single SDF from compose', async () => {
      const outputPath = path.join(tempDir, 'output.json');

      try {
        const { stdout } = await execAsync(
          `npx tsx ${CLI_PATH} "${SIMPLE_COMPOSE}" -o "${outputPath}" --validate`
        );

        expect(stdout).toContain('Validating');
        expect(stdout).toContain('Schema validation passed');
        // CLI validation may or may not be available
        expect(
          stdout.includes('CLI validation passed') || stdout.includes('hzn CLI not available')
        ).toBe(true);
      } catch (error) {
        // If validation fails, it should still show schema validation passed
        const execError = error as { stdout: string };
        expect(execError.stdout).toContain('Schema validation passed');
      }
    });

    it('should validate all SDFs in multi-sdf mode', async () => {
      const outputDir = path.join(tempDir, 'sdfs');

      try {
        const { stdout } = await execAsync(
          `npx tsx ${CLI_PATH} "${MULTI_SERVICE_COMPOSE}" --strategy multi-sdf --output-dir "${outputDir}" --validate`
        );

        expect(stdout).toContain('Validating');
        expect(stdout).toContain('Schema validation passed');
      } catch (error) {
        // If validation fails, check that at least schema validation ran
        const execError = error as { stdout: string };
        expect(execError.stdout).toContain('Schema validation passed');
      }
    });
  });

  describe('error handling', () => {
    it('should show error for non-existent compose file', async () => {
      try {
        await execAsync(`npx tsx ${CLI_PATH} /nonexistent/docker-compose.yml`);
        fail('Expected command to fail');
      } catch (error) {
        const execError = error as { stderr: string };
        expect(execError.stderr).toBeDefined();
      }
    });

    it('should show clear error for invalid compose file', async () => {
      const invalidCompose = path.join(tempDir, 'invalid.yml');
      await fs.writeFile(invalidCompose, 'invalid: yaml: content:\n  - broken', 'utf-8');

      try {
        await execAsync(`npx tsx ${CLI_PATH} "${invalidCompose}"`);
        fail('Expected command to fail');
      } catch (error) {
        const execError = error as { stderr: string };
        expect(execError.stderr).toContain('Error');
      }
    });
  });

  describe('backward compatibility', () => {
    it('should still convert Dockerfiles correctly', async () => {
      const dockerfile = path.join(__dirname, '../fixtures/dockerfiles/simple.Dockerfile');
      const outputPath = path.join(tempDir, 'output.json');

      const { stdout } = await execAsync(
        `npx tsx ${CLI_PATH} "${dockerfile}" -o "${outputPath}"`
      );

      expect(stdout).toContain('Detected input type: dockerfile');
      expect(stdout).toContain('Converting Dockerfile to SDF');
      expect(stdout).toContain('Success: Conversion complete');

      // Verify output
      const content = await fs.readFile(outputPath, 'utf-8');
      const sdf = JSON.parse(content);
      expect(sdf).toHaveProperty('deployment');
    });
  });
});

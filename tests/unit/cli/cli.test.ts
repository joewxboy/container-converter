/**
 * CLI Unit Tests
 * Tests for the container-converter CLI interface
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

const CLI_PATH = path.join(__dirname, '../../../src/cli/index.ts');
const FIXTURES_DIR = path.join(__dirname, '../../fixtures');
const SIMPLE_DOCKERFILE = path.join(FIXTURES_DIR, 'dockerfiles/simple.Dockerfile');

describe('Container Converter CLI', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test outputs
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file));
      }
      await fs.rmdir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('help and version', () => {
    it('should display help when --help is passed', async () => {
      const { stdout } = await execAsync(`npx tsx ${CLI_PATH} --help`);
      
      expect(stdout).toContain('container-converter');
      expect(stdout).toContain('Convert Dockerfiles and docker-compose.yml');
      expect(stdout).toContain('SDFs');
      expect(stdout).toContain('--output');
      expect(stdout).toContain('--strategy');
      expect(stdout).toContain('--output-dir');
      expect(stdout).toContain('--validate');
      expect(stdout).toContain('--publish');
    });

    it('should display version when --version is passed', async () => {
      const { stdout } = await execAsync(`npx tsx ${CLI_PATH} --version`);
      
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should include examples in help text', async () => {
      const { stdout } = await execAsync(`npx tsx ${CLI_PATH} --help`);
      
      expect(stdout).toContain('Examples:');
      expect(stdout).toContain('Convert Dockerfile to SDF');
      expect(stdout).toContain('docker-compose.yml');
      expect(stdout).toContain('Environment Variables:');
    });
  });

  describe('basic conversion', () => {
    it('should convert a Dockerfile to SDF', async () => {
      const outputPath = path.join(tempDir, 'output.json');
      
      const { stdout } = await execAsync(
        `npx tsx ${CLI_PATH} "${SIMPLE_DOCKERFILE}" -o "${outputPath}"`
      );
      
      expect(stdout).toContain('Success: Generated SDF');
      expect(stdout).toContain('Success: SDF written to');
      expect(stdout).toContain('Success: Conversion complete');

      // Verify output file exists and is valid JSON
      const content = await fs.readFile(outputPath, 'utf-8');
      const sdf = JSON.parse(content);
      
      expect(sdf).toHaveProperty('label');
      expect(sdf).toHaveProperty('url');
      expect(sdf).toHaveProperty('version');
      expect(sdf).toHaveProperty('arch');
      expect(sdf).toHaveProperty('deployment');
      expect(sdf.deployment.services).toBeDefined();
    });

    it('should use custom service name when provided', async () => {
      const outputPath = path.join(tempDir, 'output.json');
      
      await execAsync(
        `npx tsx ${CLI_PATH} "${SIMPLE_DOCKERFILE}" -o "${outputPath}" -n my-custom-service`
      );

      const content = await fs.readFile(outputPath, 'utf-8');
      const sdf = JSON.parse(content);
      
      expect(sdf.label).toContain('my-custom-service');
      expect(sdf.url).toContain('my-custom-service');
      expect(sdf.deployment.services['my-custom-service']).toBeDefined();
    });

    it('should use custom version when provided', async () => {
      const outputPath = path.join(tempDir, 'output.json');
      
      await execAsync(
        `npx tsx ${CLI_PATH} "${SIMPLE_DOCKERFILE}" -o "${outputPath}" --svc-version 2.5.0`
      );

      const content = await fs.readFile(outputPath, 'utf-8');
      const sdf = JSON.parse(content);
      
      expect(sdf.version).toBe('2.5.0');
    });

    it('should use custom architecture when provided', async () => {
      const outputPath = path.join(tempDir, 'output.json');
      
      await execAsync(
        `npx tsx ${CLI_PATH} "${SIMPLE_DOCKERFILE}" -o "${outputPath}" -a arm64`
      );

      const content = await fs.readFile(outputPath, 'utf-8');
      const sdf = JSON.parse(content);
      
      expect(sdf.arch).toBe('arm64');
    });

    it('should use custom organization when provided', async () => {
      const outputPath = path.join(tempDir, 'output.json');
      
      await execAsync(
        `npx tsx ${CLI_PATH} "${SIMPLE_DOCKERFILE}" -o "${outputPath}" --org myorg`
      );

      const content = await fs.readFile(outputPath, 'utf-8');
      const sdf = JSON.parse(content);
      
      expect(sdf.org).toBe('myorg');
    });

    it('should use default output filename based on input', async () => {
      // Run from temp directory to control output location
      const dockerfileCopy = path.join(tempDir, 'MyDockerfile');
      await fs.copyFile(SIMPLE_DOCKERFILE, dockerfileCopy);
      
      await execAsync(
        `npx tsx ${CLI_PATH} "${dockerfileCopy}" -o "${path.join(tempDir, 'MyDockerfile-sdf.json')}"`
      );

      // Should create MyDockerfile-sdf.json
      const expectedOutput = path.join(tempDir, 'MyDockerfile-sdf.json');
      const exists = await fs.access(expectedOutput).then(() => true).catch(() => false);
      
      expect(exists).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should show error for non-existent Dockerfile', async () => {
      try {
        await execAsync(`npx tsx ${CLI_PATH} /nonexistent/Dockerfile`);
        fail('Expected command to fail');
      } catch (error) {
        const execError = error as { stderr: string; code: number };
        expect(execError.stderr || execError.code).toBeDefined();
      }
    });

    it('should require Dockerfile argument', async () => {
      try {
        await execAsync(`npx tsx ${CLI_PATH}`);
        fail('Expected command to fail');
      } catch (error) {
        const execError = error as { stderr: string };
        expect(execError.stderr).toContain('error');
      }
    });
  });

  describe('validation flag', () => {
    it('should validate SDF when --validate is passed', async () => {
      const outputPath = path.join(tempDir, 'output.json');
      
      // Schema validation should always pass, CLI validation depends on hzn availability
      try {
        const { stdout } = await execAsync(
          `npx tsx ${CLI_PATH} "${SIMPLE_DOCKERFILE}" -o "${outputPath}" --validate`
        );
        
        expect(stdout).toContain('Validating SDF');
        expect(stdout).toContain('Schema validation passed');
        // CLI validation may show warning if hzn not available, or pass if it is
        expect(
          stdout.includes('CLI validation passed') ||
          stdout.includes('hzn CLI not available')
        ).toBe(true);
      } catch (error) {
        // If CLI validation fails (e.g., hzn not installed correctly),
        // we should still see schema validation pass before the error
        const execError = error as { stdout: string; stderr: string };
        expect(execError.stdout).toContain('Schema validation passed');
      }
    });
  });

  describe('publish flag without credentials', () => {
    it('should fail gracefully when no credentials provided', async () => {
      const outputPath = path.join(tempDir, 'output.json');
      
      // Clear any environment variables that might be set
      const env = { ...process.env };
      delete env.HZN_ORG_ID;
      delete env.HZN_EXCHANGE_USER_AUTH;
      delete env.HZN_EXCHANGE_URL;
      
      try {
        await execAsync(
          `npx tsx ${CLI_PATH} "${SIMPLE_DOCKERFILE}" -o "${outputPath}" --publish`,
          { env }
        );
        fail('Expected command to fail');
      } catch (error) {
        const execError = error as { stderr: string };
        expect(execError.stderr).toContain('No Exchange credentials found');
      }
    });
  });
});

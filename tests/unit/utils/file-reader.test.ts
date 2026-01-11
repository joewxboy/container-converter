/**
 * File Reader Tests
 * Unit tests for file reading utilities
 */

import { promises as fs } from 'fs';
import path from 'path';
import { readDockerfile, fileExists } from '../../../src/utils/file-reader';
import { DockerfileParseError } from '../../../src/utils/errors';

describe('File Reader Utilities', () => {
  const fixturesDir = path.join(__dirname, '../../fixtures/dockerfiles');
  const simpleDockerfile = path.join(fixturesDir, 'simple.Dockerfile');

  describe('readDockerfile', () => {
    it('should read a valid Dockerfile', async () => {
      const content = await readDockerfile(simpleDockerfile);
      
      expect(content).toBeDefined();
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('FROM');
    });

    it('should throw DockerfileParseError for non-existent file', async () => {
      const nonExistentPath = path.join(fixturesDir, 'does-not-exist.Dockerfile');
      
      await expect(readDockerfile(nonExistentPath)).rejects.toThrow(DockerfileParseError);
      await expect(readDockerfile(nonExistentPath)).rejects.toThrow('File not found');
    });

    it('should throw DockerfileParseError for directory path', async () => {
      await expect(readDockerfile(fixturesDir)).rejects.toThrow(DockerfileParseError);
      await expect(readDockerfile(fixturesDir)).rejects.toThrow('directory');
    });

    it('should handle empty Dockerfile', async () => {
      const emptyFile = path.join(fixturesDir, 'empty.Dockerfile');
      
      // Create empty file for testing
      await fs.writeFile(emptyFile, '');
      
      try {
        const content = await readDockerfile(emptyFile);
        expect(content).toBe('');
      } finally {
        // Clean up
        await fs.unlink(emptyFile);
      }
    });

    it('should preserve line endings and whitespace', async () => {
      const testContent = 'FROM node:18\n\nRUN echo "test"\n';
      const testFile = path.join(fixturesDir, 'test-whitespace.Dockerfile');
      
      await fs.writeFile(testFile, testContent);
      
      try {
        const content = await readDockerfile(testFile);
        expect(content).toBe(testContent);
      } finally {
        await fs.unlink(testFile);
      }
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const exists = await fileExists(simpleDockerfile);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const nonExistentPath = path.join(fixturesDir, 'does-not-exist.Dockerfile');
      const exists = await fileExists(nonExistentPath);
      expect(exists).toBe(false);
    });

    it('should return true for existing directory', async () => {
      const exists = await fileExists(fixturesDir);
      expect(exists).toBe(true);
    });
  });
});
/**
 * Tests for TUI Compose Commands
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render } from 'ink-testing-library';
import React from 'react';
import path from 'path';

// Mock the file reader
jest.mock('../../../src/utils/file-reader', () => ({
  readDockerfile: jest.fn(),
}));

// Mock the parsers
jest.mock('../../../src/parser/dockerfile-parser');
jest.mock('../../../src/parser/compose-parser');

// Mock the generators
jest.mock('../../../src/generator/sdf-generator');
jest.mock('../../../src/generator/compose-sdf-generator');

// Mock the validator
jest.mock('../../../src/validator/sdf-validator');

// Mock the publisher modules
jest.mock('../../../src/publisher/exchange-auth');
jest.mock('../../../src/publisher/exchange-publisher');

import { App } from '../../../src/tui/App';
import { ComposeParser } from '../../../src/parser/compose-parser';
import { ComposeSdfGenerator } from '../../../src/generator/compose-sdf-generator';

describe('TUI - Compose Commands', () => {
  const fixturesDir = path.join(__dirname, '../../fixtures/compose');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('convert compose command', () => {
    it('should handle convert compose command', async () => {
      const mockComposeData = {
        name: 'test-project',
        services: {
          web: {
            image: 'nginx:latest',
            ports: [{ target: 80, published: 8080 }],
          },
        },
      };

      const mockSdf = {
        label: 'test-project',
        url: 'test-project',
        version: '1.0.0',
        arch: 'amd64',
        sharable: 'multiple',
        deployment: {
          services: {
            web: {
              image: 'nginx:latest',
            },
          },
        },
      };

      (ComposeParser.prototype.parseFile as jest.Mock).mockResolvedValue(mockComposeData);
      (ComposeSdfGenerator.prototype.generate as jest.Mock).mockReturnValue(mockSdf);

      const { lastFrame, stdin } = render(<App />);

      // Wait for initial render
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send convert compose command
      stdin.write('convert compose test.yml\n');

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Converting');
      expect(output).toContain('test.yml');
    });

    it('should handle multi-SDF result', async () => {
      const mockComposeData = {
        name: 'multi-project',
        services: {
          web: { image: 'nginx:latest' },
          db: { image: 'postgres:latest' },
        },
      };

      const mockMultiSdf = {
        sdfs: {
          web: {
            label: 'multi-project - web',
            url: 'multi-project.web',
            version: '1.0.0',
            arch: 'amd64',
            sharable: 'multiple',
            deployment: { services: { web: { image: 'nginx:latest' } } },
          },
          db: {
            label: 'multi-project - db',
            url: 'multi-project.db',
            version: '1.0.0',
            arch: 'amd64',
            sharable: 'multiple',
            deployment: { services: { db: { image: 'postgres:latest' } } },
          },
        },
        dependencyGraph: {
          web: [],
          db: [],
        },
      };

      (ComposeParser.prototype.parseFile as jest.Mock).mockResolvedValue(mockComposeData);
      (ComposeSdfGenerator.prototype.generate as jest.Mock).mockReturnValue(mockMultiSdf);

      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('convert compose multi.yml\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Generated');
      expect(output).toContain('SDFs');
    });
  });

  describe('parse compose command', () => {
    it('should handle parse compose command', async () => {
      const mockComposeData = {
        name: 'test-project',
        services: {
          web: {
            image: 'nginx:latest',
            ports: [{ target: 80, published: 8080 }],
            volumes: [],
          },
        },
      };

      (ComposeParser.prototype.parseFile as jest.Mock).mockResolvedValue(mockComposeData);

      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('parse compose test.yml\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Parsing');
      expect(output).toContain('test.yml');
    });

    it('should display service details', async () => {
      const mockComposeData = {
        name: 'detailed-project',
        services: {
          web: {
            image: 'nginx:latest',
            ports: [{ target: 80 }],
            volumes: ['/data:/data'],
            depends_on: ['db'],
          },
          db: {
            image: 'postgres:latest',
            ports: [],
            volumes: [],
          },
        },
      };

      (ComposeParser.prototype.parseFile as jest.Mock).mockResolvedValue(mockComposeData);

      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('parse compose detailed.yml\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Services');
      expect(output).toContain('web');
      expect(output).toContain('db');
    });
  });

  describe('strategy command', () => {
    it('should set strategy to single-sdf', async () => {
      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('strategy single-sdf\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Strategy set to: single-sdf');
    });

    it('should set strategy to multi-sdf', async () => {
      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('strategy multi-sdf\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Strategy set to: multi-sdf');
    });

    it('should set strategy to auto', async () => {
      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('strategy auto\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Strategy set to: auto');
    });

    it('should reject invalid strategy', async () => {
      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('strategy invalid\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Invalid strategy');
    });
  });

  describe('list services command with compose', () => {
    it('should list services from multi-SDF', async () => {
      const mockComposeData = {
        name: 'multi-project',
        services: {
          web: { image: 'nginx:latest' },
          db: { image: 'postgres:latest' },
        },
      };

      const mockMultiSdf = {
        sdfs: {
          web: {
            label: 'multi-project - web',
            url: 'multi-project.web',
            version: '1.0.0',
            arch: 'amd64',
            sharable: 'multiple',
            deployment: { services: { web: { image: 'nginx:latest' } } },
          },
          db: {
            label: 'multi-project - db',
            url: 'multi-project.db',
            version: '1.0.0',
            arch: 'amd64',
            sharable: 'multiple',
            deployment: { services: { db: { image: 'postgres:latest' } } },
          },
        },
        dependencyGraph: {
          web: ['db'],
          db: [],
        },
      };

      (ComposeParser.prototype.parseFile as jest.Mock).mockResolvedValue(mockComposeData);
      (ComposeSdfGenerator.prototype.generate as jest.Mock).mockReturnValue(mockMultiSdf);

      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      // First convert to load multi-SDF
      stdin.write('convert compose multi.yml\n');
      await new Promise(resolve => setTimeout(resolve, 200));

      // Then list services
      stdin.write('list services\n');
      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Services in current multi-SDF');
      expect(output).toContain('web');
      expect(output).toContain('db');
    });
  });

  describe('preview command with compose', () => {
    it('should preview single SDF from compose', async () => {
      const mockComposeData = {
        name: 'test-project',
        services: {
          web: { image: 'nginx:latest' },
        },
      };

      const mockSdf = {
        label: 'test-project',
        url: 'test-project',
        version: '1.0.0',
        arch: 'amd64',
        sharable: 'multiple',
        deployment: {
          services: {
            web: { image: 'nginx:latest' },
          },
        },
      };

      (ComposeParser.prototype.parseFile as jest.Mock).mockResolvedValue(mockComposeData);
      (ComposeSdfGenerator.prototype.generate as jest.Mock).mockReturnValue(mockSdf);

      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('convert compose test.yml\n');
      await new Promise(resolve => setTimeout(resolve, 200));

      stdin.write('preview\n');
      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Current SDF');
      expect(output).toContain('test-project');
    });

    it('should preview multi-SDF from compose', async () => {
      const mockComposeData = {
        name: 'multi-project',
        services: {
          web: { image: 'nginx:latest' },
          db: { image: 'postgres:latest' },
        },
      };

      const mockMultiSdf = {
        sdfs: {
          web: {
            label: 'multi-project - web',
            url: 'multi-project.web',
            version: '1.0.0',
            arch: 'amd64',
            sharable: 'multiple',
            deployment: { services: { web: { image: 'nginx:latest' } } },
          },
          db: {
            label: 'multi-project - db',
            url: 'multi-project.db',
            version: '1.0.0',
            arch: 'amd64',
            sharable: 'multiple',
            deployment: { services: { db: { image: 'postgres:latest' } } },
          },
        },
        dependencyGraph: {
          web: [],
          db: [],
        },
      };

      (ComposeParser.prototype.parseFile as jest.Mock).mockResolvedValue(mockComposeData);
      (ComposeSdfGenerator.prototype.generate as jest.Mock).mockReturnValue(mockMultiSdf);

      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('convert compose multi.yml\n');
      await new Promise(resolve => setTimeout(resolve, 200));

      stdin.write('preview\n');
      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('Current multi-SDF');
      expect(output).toContain('web');
      expect(output).toContain('db');
    });
  });

  describe('help command with compose', () => {
    it('should show compose commands in help', async () => {
      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('help\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('convert compose');
      expect(output).toContain('parse compose');
      expect(output).toContain('strategy');
    });
  });

  describe('natural language with compose', () => {
    it('should suggest convert compose command', async () => {
      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('how do I convert a docker-compose file?\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('convert compose');
    });

    it('should suggest parse compose command', async () => {
      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('parse my compose file\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('parse compose');
    });

    it('should suggest strategy command', async () => {
      const { lastFrame, stdin } = render(<App />);

      await new Promise(resolve => setTimeout(resolve, 100));

      stdin.write('set strategy to multi\n');

      await new Promise(resolve => setTimeout(resolve, 200));

      const output = lastFrame();
      expect(output).toContain('strategy');
    });
  });
});

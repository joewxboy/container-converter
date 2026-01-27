/**
 * MCP Client Tests
 * Tests for the Container Converter MCP Client
 */

import { ContainerConverterClient, ToolResult } from '../../../src/tui/mcp-client';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    listTools: jest.fn().mockResolvedValue({
      tools: [
        { name: 'convert_dockerfile', description: 'Convert Dockerfile' },
        { name: 'validate_sdf', description: 'Validate SDF' },
        { name: 'publish_sdf', description: 'Publish SDF' },
        { name: 'check_hzn_cli', description: 'Check CLI' },
        { name: 'list_exchange_services', description: 'List services' },
      ],
    }),
    callTool: jest.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, data: 'test' }),
        },
      ],
    }),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => ({
    close: jest.fn(),
  })),
}));

describe('ContainerConverterClient', () => {
  let client: ContainerConverterClient;

  beforeEach(() => {
    client = new ContainerConverterClient();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a new client instance', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(ContainerConverterClient);
    });
  });

  describe('connect', () => {
    it('should connect to the MCP server', async () => {
      await expect(client.connect()).resolves.not.toThrow();
    });

    it('should not reconnect if already connected', async () => {
      await client.connect();
      await client.connect(); // Second call should be a no-op
    });
  });

  describe('disconnect', () => {
    it('should disconnect from the server', async () => {
      await client.connect();
      await expect(client.disconnect()).resolves.not.toThrow();
    });
  });

  describe('listTools', () => {
    it('should return list of available tools', async () => {
      await client.connect();
      const tools = await client.listTools();
      
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some(t => t.name === 'convert_dockerfile')).toBe(true);
    });

    it('should throw if not connected', async () => {
      await expect(client.listTools()).rejects.toThrow('Not connected');
    });
  });

  describe('callTool', () => {
    it('should call a tool and return result', async () => {
      await client.connect();
      const result = await client.callTool('check_hzn_cli', {});
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should throw if not connected', async () => {
      await expect(client.callTool('check_hzn_cli', {})).rejects.toThrow('Not connected');
    });
  });

  describe('convertDockerfile', () => {
    it('should call convert_dockerfile tool', async () => {
      await client.connect();
      const result = await client.convertDockerfile('/path/to/Dockerfile');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should pass options to the tool', async () => {
      await client.connect();
      const result = await client.convertDockerfile('/path/to/Dockerfile', {
        name: 'my-service',
        version: '1.0.0',
        arch: 'arm64',
      });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('validateSdf', () => {
    it('should validate SDF from path', async () => {
      await client.connect();
      const result = await client.validateSdf('/path/to/sdf.json');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should validate SDF object', async () => {
      await client.connect();
      const sdf = { label: 'Test', url: 'test', version: '1.0.0' };
      const result = await client.validateSdf(sdf);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('publishSdf', () => {
    it('should publish SDF', async () => {
      await client.connect();
      const result = await client.publishSdf('/path/to/sdf.json');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should support dry run', async () => {
      await client.connect();
      const result = await client.publishSdf('/path/to/sdf.json', { dryRun: true });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('checkHznCli', () => {
    it('should check hzn CLI status', async () => {
      await client.connect();
      const result = await client.checkHznCli();
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('listExchangeServices', () => {
    it('should list Exchange services', async () => {
      await client.connect();
      const result = await client.listExchangeServices();
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should filter by service URL', async () => {
      await client.connect();
      const result = await client.listExchangeServices({ serviceUrl: 'my-service' });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });
});

describe('ToolResult interface', () => {
  it('should have correct structure for success', () => {
    const result: ToolResult = {
      success: true,
      data: { test: 'value' },
    };
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ test: 'value' });
  });

  it('should have correct structure for error', () => {
    const result: ToolResult = {
      success: false,
      error: 'Test error',
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe('Test error');
  });
});

/**
 * MCP Client for Container Converter
 * Connects to the container-converter MCP server and provides tool access
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

/**
 * Tool result from MCP server
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Available tools in the MCP server
 */
export type ToolName =
  | 'convert_dockerfile'
  | 'validate_sdf'
  | 'publish_sdf'
  | 'check_hzn_cli'
  | 'list_exchange_services';

/**
 * MCP Client for container-converter
 */
export class ContainerConverterClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private connected = false;

  constructor() {
    this.client = new Client(
      {
        name: 'container-converter-tui',
        version: '0.1.0',
      },
      {
        capabilities: {},
      }
    );
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    // Find the server script path
    const serverPath = path.join(__dirname, '../mcp/server.ts');

    // StdioClientTransport spawns the server process internally
    this.transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', serverPath],
    });

    await this.client.connect(this.transport);
    this.connected = true;
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.connected = false;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
    }));
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: ToolName, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const result = await this.client.callTool({
        name,
        arguments: args,
      });

      // Parse the response
      const content = result.content as Array<{ type: string; text?: string }> | undefined;
      if (content && content.length > 0) {
        const firstContent = content[0];
        if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
          try {
            const parsed = JSON.parse(firstContent.text) as Record<string, unknown>;
            if ('error' in parsed) {
              return {
                success: false,
                error: String(parsed.error),
                data: parsed,
              };
            }
            return {
              success: true,
              data: parsed,
            };
          } catch {
            return {
              success: true,
              data: firstContent.text,
            };
          }
        }
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Convert a Dockerfile to SDF
   */
  async convertDockerfile(
    dockerfilePath: string,
    options: {
      name?: string;
      version?: string;
      arch?: string;
      org?: string;
      description?: string;
      outputPath?: string;
    } = {}
  ): Promise<ToolResult> {
    return this.callTool('convert_dockerfile', {
      dockerfile_path: dockerfilePath,
      name: options.name,
      version: options.version,
      arch: options.arch,
      org: options.org,
      description: options.description,
      output_path: options.outputPath,
    });
  }

  /**
   * Validate an SDF
   */
  async validateSdf(
    sdf: string | Record<string, unknown>,
    useCli = true
  ): Promise<ToolResult> {
    return this.callTool('validate_sdf', {
      sdf,
      use_cli: useCli,
    });
  }

  /**
   * Publish an SDF to the Exchange
   */
  async publishSdf(
    sdf: string | Record<string, unknown>,
    options: {
      configPath?: string;
      credsPath?: string;
      overwrite?: boolean;
      dryRun?: boolean;
    } = {}
  ): Promise<ToolResult> {
    return this.callTool('publish_sdf', {
      sdf,
      config_path: options.configPath,
      creds_path: options.credsPath,
      overwrite: options.overwrite,
      dry_run: options.dryRun,
    });
  }

  /**
   * Check if hzn CLI is available
   */
  async checkHznCli(): Promise<ToolResult> {
    return this.callTool('check_hzn_cli', {});
  }

  /**
   * List services in the Exchange
   */
  async listExchangeServices(
    options: {
      org?: string;
      serviceUrl?: string;
      configPath?: string;
      credsPath?: string;
    } = {}
  ): Promise<ToolResult> {
    return this.callTool('list_exchange_services', {
      org: options.org,
      service_url: options.serviceUrl,
      config_path: options.configPath,
      creds_path: options.credsPath,
    });
  }
}

/**
 * Create and connect a new MCP client
 */
export async function createClient(): Promise<ContainerConverterClient> {
  const client = new ContainerConverterClient();
  await client.connect();
  return client;
}

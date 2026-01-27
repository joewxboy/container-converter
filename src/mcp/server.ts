#!/usr/bin/env node
/**
 * Container Converter MCP Server
 * Exposes container-converter functionality as MCP tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { DockerfileParser } from '../parser/dockerfile-parser';
import { SDFGenerator } from '../generator/sdf-generator';
import { SDFValidator } from '../validator/sdf-validator';
import { isHznCliAvailable, getHznCliVersion } from '../validator/cli-detector';
import { readDockerfile } from '../utils/file-reader';
import {
  getCredentials,
  validateCredentials,
  verifyExchangeConnection,
  verifyUserAuth,
} from '../publisher/exchange-auth';
import {
  publishService,
  getPublishedVersions,
  checkServiceExists,
} from '../publisher/exchange-publisher';
import type { ServiceDefinition, ServiceMetadata } from '../types/sdf';

// Tool parameter schemas
const ConvertDockerfileSchema = z.object({
  dockerfile_path: z.string().describe('Path to the Dockerfile to convert'),
  name: z.string().optional().describe('Service name (inferred if not provided)'),
  version: z.string().optional().describe('Service version (default: 1.0.0)'),
  arch: z.string().optional().describe('Target architecture (default: amd64)'),
  org: z.string().optional().describe('Organization ID'),
  description: z.string().optional().describe('Service description'),
  output_path: z.string().optional().describe('Output path for generated SDF'),
});

const ValidateSdfSchema = z.object({
  sdf: z.string().or(z.record(z.string(), z.unknown())).describe('SDF to validate (file path or object)'),
  use_cli: z.boolean().optional().describe('Also validate with hzn CLI (default: true)'),
});

const PublishSdfSchema = z.object({
  sdf: z.string().or(z.record(z.string(), z.unknown())).describe('SDF to publish (file path or object)'),
  config_path: z.string().optional().describe('Path to Exchange config file (.cfg)'),
  creds_path: z.string().optional().describe('Path to credentials file (.env)'),
  overwrite: z.boolean().optional().describe('Overwrite if service exists (default: false)'),
  dry_run: z.boolean().optional().describe('Validate without publishing (default: false)'),
});

const ListExchangeServicesSchema = z.object({
  org: z.string().optional().describe('Organization ID (uses HZN_ORG_ID if not provided)'),
  service_url: z.string().optional().describe('Filter by service URL'),
  config_path: z.string().optional().describe('Path to Exchange config file (.cfg)'),
  creds_path: z.string().optional().describe('Path to credentials file (.env)'),
});

/**
 * Container Converter MCP Server class
 */
export class ContainerConverterServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'container-converter',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      return {
        tools: [
          {
            name: 'convert_dockerfile',
            description: 'Convert a Dockerfile to an Open Horizon Service Definition File (SDF)',
            inputSchema: {
              type: 'object',
              properties: {
                dockerfile_path: {
                  type: 'string',
                  description: 'Path to the Dockerfile to convert',
                },
                name: {
                  type: 'string',
                  description: 'Service name (inferred from Dockerfile if not provided)',
                },
                version: {
                  type: 'string',
                  description: 'Service version (default: 1.0.0)',
                },
                arch: {
                  type: 'string',
                  description: 'Target architecture (default: amd64)',
                  enum: ['amd64', 'arm64', 'arm'],
                },
                org: {
                  type: 'string',
                  description: 'Organization ID',
                },
                description: {
                  type: 'string',
                  description: 'Service description',
                },
                output_path: {
                  type: 'string',
                  description: 'Output path for generated SDF (optional)',
                },
              },
              required: ['dockerfile_path'],
            },
          },
          {
            name: 'validate_sdf',
            description: 'Validate an Open Horizon Service Definition File (SDF) against schema and optionally with the hzn CLI',
            inputSchema: {
              type: 'object',
              properties: {
                sdf: {
                  oneOf: [
                    { type: 'string', description: 'Path to SDF JSON file' },
                    { type: 'object', description: 'SDF object' },
                  ],
                  description: 'SDF to validate (file path or object)',
                },
                use_cli: {
                  type: 'boolean',
                  description: 'Also validate with hzn CLI (default: true)',
                },
              },
              required: ['sdf'],
            },
          },
          {
            name: 'publish_sdf',
            description: 'Publish an SDF to the Open Horizon Exchange',
            inputSchema: {
              type: 'object',
              properties: {
                sdf: {
                  oneOf: [
                    { type: 'string', description: 'Path to SDF JSON file' },
                    { type: 'object', description: 'SDF object' },
                  ],
                  description: 'SDF to publish (file path or object)',
                },
                config_path: {
                  type: 'string',
                  description: 'Path to Exchange config file (.cfg)',
                },
                creds_path: {
                  type: 'string',
                  description: 'Path to credentials file (.env)',
                },
                overwrite: {
                  type: 'boolean',
                  description: 'Overwrite if service already exists (default: false)',
                },
                dry_run: {
                  type: 'boolean',
                  description: 'Validate without actually publishing (default: false)',
                },
              },
              required: ['sdf'],
            },
          },
          {
            name: 'check_hzn_cli',
            description: 'Check if the Open Horizon CLI (hzn) is available and get version information',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'list_exchange_services',
            description: 'List services published in the Open Horizon Exchange',
            inputSchema: {
              type: 'object',
              properties: {
                org: {
                  type: 'string',
                  description: 'Organization ID (uses HZN_ORG_ID env var if not provided)',
                },
                service_url: {
                  type: 'string',
                  description: 'Filter by service URL',
                },
                config_path: {
                  type: 'string',
                  description: 'Path to Exchange config file (.cfg)',
                },
                creds_path: {
                  type: 'string',
                  description: 'Path to credentials file (.env)',
                },
              },
              required: [],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'convert_dockerfile':
            return await this.handleConvertDockerfile(args);
          case 'validate_sdf':
            return await this.handleValidateSdf(args);
          case 'publish_sdf':
            return await this.handlePublishSdf(args);
          case 'check_hzn_cli':
            return await this.handleCheckHznCli();
          case 'list_exchange_services':
            return await this.handleListExchangeServices(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: message }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Handle convert_dockerfile tool
   */
  private async handleConvertDockerfile(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = ConvertDockerfileSchema.parse(args);

    // Read and parse Dockerfile
    const content = await readDockerfile(parsed.dockerfile_path);
    const parser = new DockerfileParser();
    const dockerfileData = parser.parse(content);

    // Build metadata
    const userMetadata: Partial<ServiceMetadata> = {};
    if (parsed.name) userMetadata.name = parsed.name;
    if (parsed.version) userMetadata.version = parsed.version;
    if (parsed.arch) userMetadata.architecture = parsed.arch;
    if (parsed.org) userMetadata.organization = parsed.org;
    if (parsed.description) userMetadata.description = parsed.description;

    // Generate SDF
    const generator = new SDFGenerator();
    const sdf = generator.generate(dockerfileData, userMetadata);

    // Write to file if output path provided
    if (parsed.output_path) {
      const fs = await import('fs/promises');
      await fs.writeFile(parsed.output_path, JSON.stringify(sdf, null, 2), 'utf-8');
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              sdf,
              output_path: parsed.output_path || null,
              summary: {
                label: sdf.label,
                url: sdf.url,
                version: sdf.version,
                arch: sdf.arch,
                baseImage: dockerfileData.baseImage,
                ports: dockerfileData.exposedPorts,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle validate_sdf tool
   */
  private async handleValidateSdf(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = ValidateSdfSchema.parse(args);
    const useCli = parsed.use_cli !== false;

    // Load SDF from file or use object
    let sdf: ServiceDefinition;
    if (typeof parsed.sdf === 'string') {
      const fs = await import('fs/promises');
      const content = await fs.readFile(parsed.sdf, 'utf-8');
      sdf = JSON.parse(content) as ServiceDefinition;
    } else {
      sdf = parsed.sdf as unknown as ServiceDefinition;
    }

    const validator = new SDFValidator();
    const schemaValidation = validator.validateSchema(sdf);
    let cliValidation: { valid: boolean; cliAvailable?: boolean; errors: Array<{ field?: string; message: string }> } | undefined;

    // CLI validation if requested
    if (useCli) {
      cliValidation = await validator.validateWithCli(sdf);
    }

    const overallValid = schemaValidation.valid && 
      (!cliValidation || cliValidation.valid || cliValidation.cliAvailable === false);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              valid: overallValid,
              schemaValidation,
              cliValidation,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle publish_sdf tool
   */
  private async handlePublishSdf(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = PublishSdfSchema.parse(args);

    // Load SDF from file or use object
    let sdf: ServiceDefinition;
    if (typeof parsed.sdf === 'string') {
      const fs = await import('fs/promises');
      const content = await fs.readFile(parsed.sdf, 'utf-8');
      sdf = JSON.parse(content) as ServiceDefinition;
    } else {
      sdf = parsed.sdf as unknown as ServiceDefinition;
    }

    // Get credentials
    const credentials = await getCredentials(parsed.config_path, parsed.creds_path);
    if (!credentials) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: 'No Exchange credentials found. Set HZN_ORG_ID, HZN_EXCHANGE_USER_AUTH, HZN_EXCHANGE_URL environment variables or provide config/creds paths.',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Validate credentials
    const authResult = validateCredentials(credentials);
    if (!authResult.authenticated) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: `Invalid credentials: ${authResult.error}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Verify Exchange connection
    const connectionResult = await verifyExchangeConnection(credentials);
    if (!connectionResult.connected) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: `Exchange connection failed: ${connectionResult.error}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Verify user auth
    const userResult = await verifyUserAuth(credentials);
    if (!userResult.valid) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: `User authentication failed: ${userResult.error}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Publish
    const publishResult = await publishService({
      credentials,
      sdf,
      overwrite: parsed.overwrite,
      dryRun: parsed.dry_run,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(publishResult, null, 2),
        },
      ],
    };
  }

  /**
   * Handle check_hzn_cli tool
   */
  private async handleCheckHznCli(): Promise<{ content: Array<{ type: string; text: string }> }> {
    const detection = await isHznCliAvailable();

    const result: {
      available: boolean;
      path?: string;
      version?: string;
      versionDetails?: { version: string; raw: string };
      error?: string;
    } = {
      available: detection.available,
    };

    if (detection.available) {
      result.path = detection.path;
      result.version = detection.version;

      // Try to get detailed version info
      try {
        const versionInfo = await getHznCliVersion();
        result.versionDetails = versionInfo;
      } catch {
        // Version details not available
      }
    } else {
      result.error = detection.error;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Handle list_exchange_services tool
   */
  private async handleListExchangeServices(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = ListExchangeServicesSchema.parse(args);

    // Get credentials
    const credentials = await getCredentials(parsed.config_path, parsed.creds_path);
    if (!credentials) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: 'No Exchange credentials found. Set HZN_ORG_ID, HZN_EXCHANGE_USER_AUTH, HZN_EXCHANGE_URL environment variables or provide config/creds paths.',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const org = parsed.org || credentials.orgId;

    // If service_url is provided, get versions for that service
    if (parsed.service_url) {
      const versions = await getPublishedVersions(credentials, org, parsed.service_url);
      
      // Check existence of each version
      const services = await Promise.all(
        versions.map(async (version) => {
          const exists = await checkServiceExists(
            credentials,
            org,
            parsed.service_url!,
            version,
            'amd64' // Default arch for checking
          );
          return {
            url: parsed.service_url,
            version,
            exists,
            serviceId: `${org}/${parsed.service_url}_${version}_amd64`,
          };
        })
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                org,
                service_url: parsed.service_url,
                versions,
                services,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // List all services for org (requires hzn command)
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const env = {
        ...process.env,
        HZN_ORG_ID: credentials.orgId,
        HZN_EXCHANGE_USER_AUTH: credentials.userAuth,
        HZN_EXCHANGE_URL: credentials.exchangeUrl,
      };

      const { stdout } = await execAsync(`hzn exchange service list -o ${org}`, {
        timeout: 30000,
        env,
      });

      // Parse the output - it's usually JSON or a list
      let services: unknown;
      try {
        services = JSON.parse(stdout);
      } catch {
        // If not JSON, return as raw lines
        services = stdout.trim().split('\n').filter(Boolean);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                org,
                services,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: `Failed to list services: ${message}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Container Converter MCP Server started');
  }
}


// Run the server if executed directly (not when imported as a module)
// Check if this is the main module using ES module compatible check
const isMainModule = process.argv[1]?.includes('server') && !process.argv[1]?.includes('test');

if (isMainModule) {
  const server = new ContainerConverterServer();
  server.start().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}

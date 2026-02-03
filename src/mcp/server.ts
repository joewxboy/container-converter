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
import { ComposeParser } from '../parser/compose-parser';
import { SDFGenerator } from '../generator/sdf-generator';
import { ComposeSdfGenerator } from '../generator/compose-sdf-generator';
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
import type { ComposeData } from '../types/compose';

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

const ConvertComposeSchema = z.object({
  compose_path: z.string().describe('Path to the docker-compose.yml file to convert'),
  strategy: z.enum(['single-sdf', 'multi-sdf', 'auto']).optional().describe('SDF generation strategy (default: auto)'),
  name: z.string().optional().describe('Project name (inferred if not provided)'),
  version: z.string().optional().describe('Service version (default: 1.0.0)'),
  arch: z.string().optional().describe('Target architecture (default: amd64)'),
  org: z.string().optional().describe('Organization ID'),
  output_dir: z.string().optional().describe('Output directory for multi-SDF generation'),
});

const ParseComposeSchema = z.object({
  compose_path: z.string().describe('Path to the docker-compose.yml file to parse'),
});

const ValidateSdfSchema = z.object({
  sdf: z.union([
    z.string(),
    z.record(z.string(), z.unknown()),
    z.array(z.record(z.string(), z.unknown()))
  ]).describe('SDF(s) to validate (file path, object, or array of objects)'),
  use_cli: z.boolean().optional().describe('Also validate with hzn CLI (default: true)'),
});

const PublishSdfSchema = z.object({
  sdf: z.union([
    z.string(),
    z.record(z.string(), z.unknown()),
    z.array(z.record(z.string(), z.unknown()))
  ]).describe('SDF(s) to publish (file path, object, or array of objects)'),
  config_path: z.string().optional().describe('Path to Exchange config file (.cfg)'),
  creds_path: z.string().optional().describe('Path to credentials file (.env)'),
  overwrite: z.boolean().optional().describe('Overwrite if service exists (default: false)'),
  dry_run: z.boolean().optional().describe('Validate without publishing (default: false)'),
  continue_on_error: z.boolean().optional().describe('Continue publishing remaining SDFs if one fails (default: true)'),
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
            name: 'convert_compose',
            description: 'Convert a docker-compose.yml file to Open Horizon Service Definition File(s). Can generate a single SDF with all services or multiple SDFs (one per service) based on strategy.',
            inputSchema: {
              type: 'object',
              properties: {
                compose_path: {
                  type: 'string',
                  description: 'Path to the docker-compose.yml file to convert',
                },
                strategy: {
                  type: 'string',
                  description: 'SDF generation strategy: single-sdf (all services in one SDF), multi-sdf (one SDF per service), or auto (infer based on complexity)',
                  enum: ['single-sdf', 'multi-sdf', 'auto'],
                },
                name: {
                  type: 'string',
                  description: 'Project name (inferred from compose file if not provided)',
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
                output_dir: {
                  type: 'string',
                  description: 'Output directory for multi-SDF generation (required if strategy is multi-sdf)',
                },
              },
              required: ['compose_path'],
            },
          },
          {
            name: 'parse_compose',
            description: 'Parse a docker-compose.yml file and return structured information about services, networks, volumes, and dependencies without generating SDFs',
            inputSchema: {
              type: 'object',
              properties: {
                compose_path: {
                  type: 'string',
                  description: 'Path to the docker-compose.yml file to parse',
                },
              },
              required: ['compose_path'],
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
          case 'convert_compose':
            return await this.handleConvertCompose(args);
          case 'parse_compose':
            return await this.handleParseCompose(args);
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
   * Handle convert_compose tool
   */
  private async handleConvertCompose(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = ConvertComposeSchema.parse(args);

    // Parse compose file
    const parser = new ComposeParser();
    const composeData = await parser.parseFile(parsed.compose_path);

    // Build options
    const options = {
      strategy: parsed.strategy as 'single-sdf' | 'multi-sdf' | undefined,
      organization: parsed.org,
      version: parsed.version || '1.0.0',
      architecture: parsed.arch || 'amd64',
      projectName: parsed.name || composeData.name,
    };

    // Generate SDF(s)
    const generator = new ComposeSdfGenerator();
    const result = generator.generate(composeData, options);

    // Handle single-SDF result
    if ('label' in result) {
      const sdf = result as ServiceDefinition;
      
      // Write to file if output_dir provided
      if (parsed.output_dir) {
        const fs = await import('fs/promises');
        const path = await import('path');
        await fs.mkdir(parsed.output_dir, { recursive: true });
        const outputPath = path.join(parsed.output_dir, `${sdf.url}.json`);
        await fs.writeFile(outputPath, JSON.stringify(sdf, null, 2), 'utf-8');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                strategy: 'single-sdf',
                sdf,
                summary: {
                  label: sdf.label,
                  url: sdf.url,
                  version: sdf.version,
                  arch: sdf.arch,
                  serviceCount: Object.keys(sdf.deployment.services).length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Handle multi-SDF result
    const multiResult = result as { sdfs: Record<string, ServiceDefinition>; dependencyGraph: Record<string, string[]> };
    const sdfs = multiResult.sdfs;
    const dependencyGraph = multiResult.dependencyGraph;

    // Write to files if output_dir provided
    const outputPaths: Record<string, string> = {};
    if (parsed.output_dir) {
      const fs = await import('fs/promises');
      const path = await import('path');
      await fs.mkdir(parsed.output_dir, { recursive: true });

      for (const [serviceName, sdf] of Object.entries(sdfs)) {
        const outputPath = path.join(parsed.output_dir, `${serviceName}.json`);
        await fs.writeFile(outputPath, JSON.stringify(sdf, null, 2), 'utf-8');
        outputPaths[serviceName] = outputPath;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              strategy: 'multi-sdf',
              serviceCount: Object.keys(sdfs).length,
              services: Object.keys(sdfs),
              dependencyGraph,
              sdfs,
              outputPaths: Object.keys(outputPaths).length > 0 ? outputPaths : undefined,
              summary: Object.entries(sdfs).map(([name, sdf]) => ({
                name,
                label: sdf.label,
                url: sdf.url,
                version: sdf.version,
                dependencies: dependencyGraph[name] || [],
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle parse_compose tool
   */
  private async handleParseCompose(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = ParseComposeSchema.parse(args);

    // Parse compose file
    const parser = new ComposeParser();
    const composeData = await parser.parseFile(parsed.compose_path);

    // Extract dependency information
    const dependencyGraph: Record<string, string[]> = {};
    for (const [serviceName, service] of Object.entries(composeData.services)) {
      const deps: string[] = [];
      if (service.depends_on) {
        if (Array.isArray(service.depends_on)) {
          deps.push(...service.depends_on);
        } else {
          deps.push(...Object.keys(service.depends_on));
        }
      }
      dependencyGraph[serviceName] = deps;
    }

    // Build service summary
    const serviceSummary = Object.entries(composeData.services).map(([name, service]) => ({
      name,
      image: service.image,
      build: service.build ? (typeof service.build === 'string' ? service.build : service.build.context) : undefined,
      ports: service.ports?.length || 0,
      volumes: service.volumes?.length || 0,
      environment: service.environment ? Object.keys(service.environment).length : 0,
      dependencies: dependencyGraph[name],
      privileged: service.privileged || false,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              projectName: composeData.name,
              version: composeData.version,
              serviceCount: Object.keys(composeData.services).length,
              services: serviceSummary,
              dependencyGraph,
              networks: composeData.networks ? Object.keys(composeData.networks) : [],
              volumes: composeData.volumes ? Object.keys(composeData.volumes) : [],
              hasSecrets: composeData.secrets ? Object.keys(composeData.secrets).length > 0 : false,
              hasConfigs: composeData.configs ? Object.keys(composeData.configs).length > 0 : false,
            },
            null,
            2
          ),
        },
      ],
    };
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

    // Load SDF(s) from file or use object(s)
    let sdfs: ServiceDefinition[];
    if (typeof parsed.sdf === 'string') {
      const fs = await import('fs/promises');
      const content = await fs.readFile(parsed.sdf, 'utf-8');
      const loaded = JSON.parse(content);
      sdfs = Array.isArray(loaded) ? loaded : [loaded];
    } else if (Array.isArray(parsed.sdf)) {
      sdfs = parsed.sdf as unknown as ServiceDefinition[];
    } else {
      sdfs = [parsed.sdf as unknown as ServiceDefinition];
    }

    const validator = new SDFValidator();
    const results = [];

    // Validate each SDF
    for (let i = 0; i < sdfs.length; i++) {
      const sdf = sdfs[i];
      const sdfLabel = sdf.label || `SDF ${i + 1}`;

      const schemaValidation = validator.validateSchema(sdf);
      let cliValidation: { valid: boolean; cliAvailable?: boolean; errors: Array<{ field?: string; message: string }> } | undefined;

      // CLI validation if requested
      if (useCli) {
        cliValidation = await validator.validateWithCli(sdf);
      }

      const overallValid = schemaValidation.valid && 
        (!cliValidation || cliValidation.valid || cliValidation.cliAvailable === false);

      results.push({
        label: sdfLabel,
        url: sdf.url,
        valid: overallValid,
        schemaValidation,
        cliValidation,
      });
    }

    const allValid = results.every(r => r.valid);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              valid: allValid,
              count: sdfs.length,
              results,
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
    const continueOnError = parsed.continue_on_error !== false;

    // Load SDF(s) from file or use object(s)
    let sdfs: ServiceDefinition[];
    if (typeof parsed.sdf === 'string') {
      const fs = await import('fs/promises');
      const content = await fs.readFile(parsed.sdf, 'utf-8');
      const loaded = JSON.parse(content);
      sdfs = Array.isArray(loaded) ? loaded : [loaded];
    } else if (Array.isArray(parsed.sdf)) {
      sdfs = parsed.sdf as unknown as ServiceDefinition[];
    } else {
      sdfs = [parsed.sdf as unknown as ServiceDefinition];
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

    // Publish each SDF
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < sdfs.length; i++) {
      const sdf = sdfs[i];
      const sdfLabel = sdf.label || `SDF ${i + 1}`;

      try {
        const publishResult = await publishService({
          credentials,
          sdf,
          overwrite: parsed.overwrite,
          dryRun: parsed.dry_run,
        });

        results.push({
          label: sdfLabel,
          url: sdf.url,
          version: sdf.version,
          ...publishResult,
        });

        if (publishResult.success) {
          successCount++;
        } else {
          failureCount++;
          if (!continueOnError) {
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          label: sdfLabel,
          url: sdf.url,
          version: sdf.version,
          success: false,
          error: message,
        });
        failureCount++;
        
        if (!continueOnError) {
          break;
        }
      }
    }

    const allSuccess = failureCount === 0;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: allSuccess,
              count: sdfs.length,
              successCount,
              failureCount,
              results,
            },
            null,
            2
          ),
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

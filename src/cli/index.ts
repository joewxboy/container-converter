#!/usr/bin/env node
/**
 * Container Converter CLI
 * Command-line interface for converting Dockerfiles and docker-compose.yml to Open Horizon SDFs
 */

import { Command } from 'commander';
import { promises as fs } from 'fs';
import * as path from 'path';

import { DockerfileParser } from '../parser/dockerfile-parser';
import { ComposeParser } from '../parser/compose-parser';
import { SDFGenerator } from '../generator/sdf-generator';
import { ComposeSdfGenerator } from '../generator/compose-sdf-generator';
import { SDFValidator } from '../validator/sdf-validator';
import { readDockerfile } from '../utils/file-reader';
import {
  getCredentials,
  validateCredentials,
  verifyExchangeConnection,
  verifyUserAuth,
} from '../publisher/exchange-auth';
import { publishService } from '../publisher/exchange-publisher';
import type { ServiceMetadata, ServiceDefinition } from '../types/sdf';

const program = new Command();

// Version from package.json
const VERSION = '0.1.0';

/**
 * Format error message for display
 */
function formatError(message: string): string {
  return `Error: ${message}`;
}

/**
 * Format success message for display
 */
function formatSuccess(message: string): string {
  return `Success: ${message}`;
}

/**
 * Format info message for display
 */
function formatInfo(message: string): string {
  return `Info: ${message}`;
}

/**
 * Format warning message for display
 */
function formatWarning(message: string): string {
  return `Warning: ${message}`;
}

/**
 * Detect input file type (dockerfile or compose)
 */
function detectInputType(filePath: string): 'dockerfile' | 'compose' {
  const basename = path.basename(filePath).toLowerCase();

  // Check for common compose file names
  if (
    basename === 'docker-compose.yml' ||
    basename === 'docker-compose.yaml' ||
    basename === 'compose.yml' ||
    basename === 'compose.yaml'
  ) {
    return 'compose';
  }

  // Check for Dockerfile names
  if (basename === 'dockerfile' || basename.startsWith('dockerfile.')) {
    return 'dockerfile';
  }

  // Fallback: check file extension
  if (basename.endsWith('.yml') || basename.endsWith('.yaml')) {
    return 'compose';
  }

  // Default to dockerfile
  return 'dockerfile';
}

/**
 * Validate and publish a single SDF
 */
async function validateAndPublishSdf(
  sdf: ServiceDefinition,
  outputPath: string,
  options: {
    validate?: boolean;
    publish?: boolean;
    config?: string;
    creds?: string;
    overwrite?: boolean;
    dryRun?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const validator = new SDFValidator();

  // Validate if requested
  if (options.validate) {
    console.log(formatInfo(`Validating ${path.basename(outputPath)}...`));

    // Schema validation
    const schemaResult = validator.validateSchema(sdf);
    if (!schemaResult.valid) {
      console.error(formatError('Schema validation failed:'));
      for (const error of schemaResult.errors) {
        console.error(`  - ${error.field ? `${error.field}: ` : ''}${error.message}`);
      }
      return { success: false, error: 'Schema validation failed' };
    }
    console.log(formatSuccess('Schema validation passed'));

    // CLI validation (if available)
    const cliResult = await validator.validateWithCli(sdf);
    if (cliResult.cliAvailable === false) {
      console.log(formatWarning('hzn CLI not available - skipping CLI validation'));
    } else if (!cliResult.valid) {
      console.error(formatError('CLI validation failed:'));
      for (const error of cliResult.errors) {
        console.error(`  - ${error.message}`);
      }
      return { success: false, error: 'CLI validation failed' };
    } else {
      console.log(formatSuccess('CLI validation passed'));
    }
  }

  // Publish if requested
  if (options.publish) {
    console.log(formatInfo(`Publishing ${sdf.url}...`));

    // Get credentials
    const credentials = await getCredentials(options.config, options.creds);
    if (!credentials) {
      const error = 'No Exchange credentials found';
      console.error(formatError(error));
      return { success: false, error };
    }

    // Validate credentials format
    const authResult = validateCredentials(credentials);
    if (!authResult.authenticated) {
      const error = `Invalid credentials: ${authResult.error}`;
      console.error(formatError(error));
      return { success: false, error };
    }

    // Verify Exchange connection (only once per run, but we'll do it per service for simplicity)
    const connectionResult = await verifyExchangeConnection(credentials);
    if (!connectionResult.connected) {
      const error = `Exchange connection failed: ${connectionResult.error}`;
      console.error(formatError(error));
      return { success: false, error };
    }

    // Verify user authentication
    const userResult = await verifyUserAuth(credentials);
    if (!userResult.valid) {
      const error = `User authentication failed: ${userResult.error}`;
      console.error(formatError(error));
      return { success: false, error };
    }

    // Publish
    const publishResult = await publishService({
      credentials,
      sdf,
      overwrite: options.overwrite,
      dryRun: options.dryRun,
    });

    if (publishResult.dryRun) {
      console.log(formatInfo(`Dry run - would publish: ${publishResult.serviceId}`));
    } else if (publishResult.success) {
      console.log(formatSuccess(`Published: ${publishResult.serviceId}`));
      if (publishResult.warnings) {
        for (const warning of publishResult.warnings) {
          console.log(formatWarning(warning));
        }
      }
    } else {
      const error = `Publish failed: ${publishResult.error}`;
      console.error(formatError(error));
      return { success: false, error };
    }
  }

  return { success: true };
}

/**
 * Main conversion action
 */
async function convertAction(
  input: string,
  options: {
    output?: string;
    type?: string;
    strategy?: string;
    outputDir?: string;
    name?: string;
    svcVersion?: string;
    arch?: string;
    org?: string;
    description?: string;
    validate?: boolean;
    publish?: boolean;
    config?: string;
    creds?: string;
    overwrite?: boolean;
    dryRun?: boolean;
  }
): Promise<void> {
  try {
    // Resolve input path
    const inputPath = path.resolve(input);
    console.log(formatInfo(`Reading input: ${inputPath}`));

    // Detect input type
    const inputType = options.type || detectInputType(inputPath);
    console.log(formatInfo(`Detected input type: ${inputType}`));

    // Build metadata from options (for both Dockerfile and Compose)
    const userMetadata: Partial<ServiceMetadata> = {};
    if (options.name) userMetadata.name = options.name;
    if (options.svcVersion) userMetadata.version = options.svcVersion;
    if (options.arch) userMetadata.architecture = options.arch;
    if (options.org) userMetadata.organization = options.org;
    if (options.description) userMetadata.description = options.description;

    // Build compose-specific options
    const composeOptions = {
      projectName: options.name,
      version: options.svcVersion,
      architecture: options.arch,
      organization: options.org,
    };

    if (inputType === 'dockerfile') {
      // ===== DOCKERFILE CONVERSION =====
      console.log(formatInfo('Converting Dockerfile to SDF...'));

      // Read and parse Dockerfile
      const content = await readDockerfile(inputPath);
      const parser = new DockerfileParser();
      const dockerfileData = parser.parse(content);

      console.log(formatInfo(`Parsed Dockerfile with base image: ${dockerfileData.baseImage}`));

      // Generate SDF
      const generator = new SDFGenerator();
      const sdf = generator.generate(dockerfileData, userMetadata);

      console.log(formatSuccess(`Generated SDF for service: ${sdf.label}`));
      console.log(formatInfo(`  URL: ${sdf.url}`));
      console.log(formatInfo(`  Version: ${sdf.version}`));
      console.log(formatInfo(`  Architecture: ${sdf.arch}`));

      // Write output file
      const outputPath = options.output || `${path.basename(inputPath, path.extname(inputPath))}-sdf.json`;
      const resolvedOutput = path.resolve(outputPath);
      const jsonOutput = JSON.stringify(sdf, null, 2);

      await fs.writeFile(resolvedOutput, jsonOutput, 'utf-8');
      console.log(formatSuccess(`SDF written to: ${resolvedOutput}`));

      // Validate and publish
      const result = await validateAndPublishSdf(sdf, resolvedOutput, options);
      if (!result.success) {
        process.exit(1);
      }

      console.log(formatSuccess('Conversion complete!'));
    } else {
      // ===== COMPOSE CONVERSION =====
      console.log(formatInfo('Converting docker-compose.yml to SDF(s)...'));

      // Read and parse Compose file
      const content = await fs.readFile(inputPath, 'utf-8');
      const composeParser = new ComposeParser();
      const composeData = composeParser.parse(content);

      const serviceCount = Object.keys(composeData.services).length;
      console.log(formatInfo(`Parsed Compose file with ${serviceCount} service(s)`));

      // Determine strategy
      const composeSdfGenerator = new ComposeSdfGenerator();
      let strategy = options.strategy || 'auto';

      if (strategy === 'auto') {
        strategy = composeSdfGenerator.inferStrategy(composeData);
        console.log(formatInfo(`Auto-detected strategy: ${strategy}`));
      }

      // Validate strategy and options
      if (strategy === 'multi-sdf' && !options.outputDir) {
        console.error(formatError('--output-dir is required for multi-sdf strategy'));
        process.exit(1);
      }

      if (strategy === 'single-sdf') {
        // ===== SINGLE-SDF GENERATION =====
        console.log(formatInfo('Generating single SDF with all services...'));

        const sdf = composeSdfGenerator.generateSingleSdf(composeData, composeOptions);

        console.log(formatSuccess(`Generated SDF with ${Object.keys(sdf.deployment.services).length} service(s)`));
        console.log(formatInfo(`  URL: ${sdf.url}`));
        console.log(formatInfo(`  Version: ${sdf.version}`));
        console.log(formatInfo(`  Architecture: ${sdf.arch}`));

        // Write output file
        const outputPath = options.output || `${path.basename(inputPath, path.extname(inputPath))}-sdf.json`;
        const resolvedOutput = path.resolve(outputPath);
        const jsonOutput = JSON.stringify(sdf, null, 2);

        await fs.writeFile(resolvedOutput, jsonOutput, 'utf-8');
        console.log(formatSuccess(`SDF written to: ${resolvedOutput}`));

        // Validate and publish
        const result = await validateAndPublishSdf(sdf, resolvedOutput, options);
        if (!result.success) {
          process.exit(1);
        }

        console.log(formatSuccess('Conversion complete!'));
      } else {
        // ===== MULTI-SDF GENERATION =====
        console.log(formatInfo('Generating multiple SDFs (one per service)...'));

        const result = composeSdfGenerator.generateMultiSdf(composeData, composeOptions);
        const sdfs = Object.entries(result.sdfs);

        console.log(formatSuccess(`Generated ${sdfs.length} SDF(s)`));

        // Create output directory
        const outputDir = path.resolve(options.outputDir!);
        await fs.mkdir(outputDir, { recursive: true });
        console.log(formatInfo(`Output directory: ${outputDir}`));

        // Write, validate, and publish each SDF
        const results: Array<{ serviceName: string; success: boolean; error?: string }> = [];

        for (const [serviceName, sdf] of sdfs) {
          const outputPath = path.join(outputDir, `${serviceName}-sdf.json`);
          const jsonOutput = JSON.stringify(sdf, null, 2);

          console.log(formatInfo(`Processing service: ${serviceName}`));

          // Write file
          await fs.writeFile(outputPath, jsonOutput, 'utf-8');
          console.log(formatSuccess(`  Written to: ${outputPath}`));

          // Validate and publish
          const result = await validateAndPublishSdf(sdf, outputPath, options);
          results.push({ serviceName, success: result.success, error: result.error });

          if (!result.success) {
            console.error(formatError(`  Failed: ${result.error}`));
          }
        }

        // Summary
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        console.log('');
        console.log(formatInfo('=== Conversion Summary ==='));
        console.log(formatInfo(`Total services: ${results.length}`));
        console.log(formatSuccess(`Successful: ${successCount}`));
        if (failureCount > 0) {
          console.log(formatError(`Failed: ${failureCount}`));
          for (const result of results.filter(r => !r.success)) {
            console.log(formatError(`  - ${result.serviceName}: ${result.error}`));
          }
          process.exit(1);
        }

        console.log(formatSuccess('All conversions complete!'));
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(formatError(error.message));
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    } else {
      console.error(formatError('An unknown error occurred'));
    }
    process.exit(1);
  }
}

// Configure the CLI program
program
  .name('container-converter')
  .description('Convert Dockerfiles and docker-compose.yml to Open Horizon Service Definition Files (SDFs)')
  .version(VERSION)
  .addHelpText('after', `
Examples:
  # Convert Dockerfile to SDF
  $ container-converter Dockerfile

  # Convert docker-compose.yml to single SDF (all services in one file)
  $ container-converter docker-compose.yml -o output.json

  # Convert docker-compose.yml to multiple SDFs (one per service)
  $ container-converter docker-compose.yml --strategy multi-sdf --output-dir ./sdfs/

  # Auto-detect strategy (recommended for compose files)
  $ container-converter docker-compose.yml --strategy auto --output-dir ./sdfs/

  # Specify output file and service metadata
  $ container-converter Dockerfile -o my-service.json -n my-service --svc-version 1.0.0

  # Convert and validate with Open Horizon CLI
  $ container-converter docker-compose.yml --validate

  # Convert and publish to Exchange (multi-SDF publishes all services)
  $ container-converter docker-compose.yml --strategy multi-sdf --output-dir ./sdfs/ --publish

  # Dry run publish (validate without actually publishing)
  $ container-converter Dockerfile --publish --dry-run

Environment Variables:
  HZN_ORG_ID              Organization ID for Exchange
  HZN_EXCHANGE_USER_AUTH  User credentials (user:password)
  HZN_EXCHANGE_URL        Exchange URL

For more information, visit: https://github.com/open-horizon/examples
`);

// Main convert command
program
  .argument('<input>', 'Path to Dockerfile or docker-compose.yml to convert')
  .option('-o, --output <path>', 'Output path for generated SDF (default: <input>-sdf.json)')
  .option('-t, --type <type>', 'Input type: dockerfile or compose (auto-detected if not specified)')
  .option('--strategy <strategy>', 'SDF generation strategy for compose: single-sdf, multi-sdf, auto (default: auto)')
  .option('--output-dir <dir>', 'Output directory for multi-SDF generation (required for multi-sdf strategy)')
  .option('-n, --name <name>', 'Service name (inferred from input if not provided)')
  .option('--svc-version <version>', 'Service version (default: 1.0.0)')
  .option('-a, --arch <arch>', 'Target architecture (default: amd64)', 'amd64')
  .option('--org <org>', 'Organization ID')
  .option('--description <desc>', 'Service description')
  .option('--validate', 'Validate generated SDF(s) with Open Horizon CLI')
  .option('--publish', 'Publish to Open Horizon Exchange after conversion')
  .option('--config <path>', 'Path to Exchange configuration file (.cfg format)')
  .option('--creds <path>', 'Path to credentials file (.env format)')
  .option('--overwrite', 'Overwrite if service already exists in Exchange')
  .option('--dry-run', 'Validate publish without actually publishing')
  .action(convertAction);

// Parse command line arguments
program.parse();
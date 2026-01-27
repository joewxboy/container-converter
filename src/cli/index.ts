#!/usr/bin/env node
/**
 * Container Converter CLI
 * Command-line interface for converting Dockerfiles to Open Horizon SDFs
 */

import { Command } from 'commander';
import { promises as fs } from 'fs';
import * as path from 'path';

import { DockerfileParser } from '../parser/dockerfile-parser';
import { SDFGenerator } from '../generator/sdf-generator';
import { SDFValidator } from '../validator/sdf-validator';
import { readDockerfile } from '../utils/file-reader';
import {
  getCredentials,
  validateCredentials,
  verifyExchangeConnection,
  verifyUserAuth,
} from '../publisher/exchange-auth';
import { publishService } from '../publisher/exchange-publisher';
import type { ServiceMetadata } from '../types/sdf';

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
 * Main conversion action
 */
async function convertAction(
  dockerfile: string,
  options: {
    output?: string;
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
    // Resolve dockerfile path
    const dockerfilePath = path.resolve(dockerfile);
    console.log(formatInfo(`Reading Dockerfile: ${dockerfilePath}`));

    // Read and parse Dockerfile
    const content = await readDockerfile(dockerfilePath);
    const parser = new DockerfileParser();
    const dockerfileData = parser.parse(content);

    console.log(formatInfo(`Parsed Dockerfile with base image: ${dockerfileData.baseImage}`));

    // Build metadata from options
    const userMetadata: Partial<ServiceMetadata> = {};
    if (options.name) userMetadata.name = options.name;
    if (options.svcVersion) userMetadata.version = options.svcVersion;
    if (options.arch) userMetadata.architecture = options.arch;
    if (options.org) userMetadata.organization = options.org;
    if (options.description) userMetadata.description = options.description;

    // Generate SDF
    const generator = new SDFGenerator();
    const sdf = generator.generate(dockerfileData, userMetadata);

    console.log(formatSuccess(`Generated SDF for service: ${sdf.label}`));
    console.log(formatInfo(`  URL: ${sdf.url}`));
    console.log(formatInfo(`  Version: ${sdf.version}`));
    console.log(formatInfo(`  Architecture: ${sdf.arch}`));

    // Validate if requested
    if (options.validate) {
      console.log(formatInfo('Validating SDF...'));
      const validator = new SDFValidator();

      // Schema validation
      const schemaResult = validator.validateSchema(sdf);
      if (!schemaResult.valid) {
        console.error(formatError('Schema validation failed:'));
        for (const error of schemaResult.errors) {
          console.error(`  - ${error.field ? `${error.field}: ` : ''}${error.message}`);
        }
        process.exit(1);
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
        process.exit(1);
      } else {
        console.log(formatSuccess('CLI validation passed'));
      }
    }

    // Write output file
    const outputPath = options.output || `${path.basename(dockerfilePath, path.extname(dockerfilePath))}-sdf.json`;
    const resolvedOutput = path.resolve(outputPath);
    const jsonOutput = JSON.stringify(sdf, null, 2);

    await fs.writeFile(resolvedOutput, jsonOutput, 'utf-8');
    console.log(formatSuccess(`SDF written to: ${resolvedOutput}`));

    // Publish if requested
    if (options.publish) {
      console.log(formatInfo('Publishing to Open Horizon Exchange...'));

      // Get credentials
      const credentials = await getCredentials(options.config, options.creds);
      if (!credentials) {
        console.error(formatError('No Exchange credentials found.'));
        console.error('  Provide credentials via:');
        console.error('    - Environment variables: HZN_ORG_ID, HZN_EXCHANGE_USER_AUTH, HZN_EXCHANGE_URL');
        console.error('    - Config files: --config <path> --creds <path>');
        process.exit(1);
      }

      // Validate credentials format
      const authResult = validateCredentials(credentials);
      if (!authResult.authenticated) {
        console.error(formatError(`Invalid credentials: ${authResult.error}`));
        process.exit(1);
      }

      // Verify Exchange connection
      console.log(formatInfo('Verifying Exchange connection...'));
      const connectionResult = await verifyExchangeConnection(credentials);
      if (!connectionResult.connected) {
        console.error(formatError(`Exchange connection failed: ${connectionResult.error}`));
        process.exit(1);
      }
      console.log(formatSuccess(`Connected to Exchange${connectionResult.exchangeVersion ? ` (version ${connectionResult.exchangeVersion})` : ''}`));

      // Verify user authentication
      console.log(formatInfo('Verifying user authentication...'));
      const userResult = await verifyUserAuth(credentials);
      if (!userResult.valid) {
        console.error(formatError(`User authentication failed: ${userResult.error}`));
        process.exit(1);
      }
      console.log(formatSuccess(`Authenticated as: ${userResult.username}`));

      // Publish
      const publishResult = await publishService({
        credentials,
        sdf,
        overwrite: options.overwrite,
        dryRun: options.dryRun,
      });

      if (publishResult.dryRun) {
        console.log(formatInfo('Dry run - service was not actually published'));
        console.log(formatInfo(`  Would publish: ${publishResult.serviceId}`));
      } else if (publishResult.success) {
        console.log(formatSuccess(`Published service: ${publishResult.serviceId}`));
        if (publishResult.warnings) {
          for (const warning of publishResult.warnings) {
            console.log(formatWarning(warning));
          }
        }
      } else {
        console.error(formatError(`Publish failed: ${publishResult.error}`));
        process.exit(1);
      }
    }

    console.log(formatSuccess('Conversion complete!'));
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
  .description('Convert Dockerfiles to Open Horizon Service Definition Files (SDFs)')
  .version(VERSION)
  .addHelpText('after', `
Examples:
  # Basic conversion
  $ container-converter Dockerfile

  # Specify output file and service metadata
  $ container-converter Dockerfile -o my-service.json -n my-service --svc-version 1.0.0

  # Convert and validate with Open Horizon CLI
  $ container-converter Dockerfile --validate

  # Convert and publish to Exchange
  $ container-converter Dockerfile --publish --config agent-install.cfg --creds mycreds.env

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
  .argument('<dockerfile>', 'Path to Dockerfile to convert')
  .option('-o, --output <path>', 'Output path for generated SDF (default: <dockerfile>-sdf.json)')
  .option('-n, --name <name>', 'Service name (inferred from Dockerfile if not provided)')
  .option('--svc-version <version>', 'Service version (default: 1.0.0)')
  .option('-a, --arch <arch>', 'Target architecture (default: amd64)', 'amd64')
  .option('--org <org>', 'Organization ID')
  .option('--description <desc>', 'Service description')
  .option('--validate', 'Validate generated SDF with Open Horizon CLI')
  .option('--publish', 'Publish to Open Horizon Exchange after conversion')
  .option('--config <path>', 'Path to Exchange configuration file (.cfg format)')
  .option('--creds <path>', 'Path to credentials file (.env format)')
  .option('--overwrite', 'Overwrite if service already exists in Exchange')
  .option('--dry-run', 'Validate publish without actually publishing')
  .action(convertAction);

// Parse command line arguments
program.parse();

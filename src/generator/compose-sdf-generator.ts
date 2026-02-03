/**
 * Compose to SDF Generator
 * Generates Open Horizon SDFs from Docker Compose files
 */

import type { ComposeData, ComposeService, ComposePort, ComposeVolumeMount } from '../types/compose';
import type {
  ServiceDefinition,
  ServiceConfig,
  PortMapping,
  RequiredService,
} from '../types/sdf';
import { SDFGenerationError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('compose-sdf-generator');

export type GenerationStrategy = 'single-sdf' | 'multi-sdf';

export interface ComposeSdfOptions {
  strategy?: GenerationStrategy;
  organization?: string;
  version?: string;
  architecture?: string;
  projectName?: string;
}

export interface MultiSdfResult {
  sdfs: Record<string, ServiceDefinition>; // serviceName -> SDF
  dependencyGraph: Record<string, string[]>; // serviceName -> dependencies
}

export class ComposeSdfGenerator {
  /**
   * Generate SDFs from Compose data
   * @param composeData - Parsed Compose file
   * @param options - Generation options
   * @returns Single SDF or multiple SDFs based on strategy
   */
  generate(
    composeData: ComposeData,
    options: ComposeSdfOptions = {}
  ): ServiceDefinition | MultiSdfResult {
    const strategy = options.strategy || this.inferStrategy(composeData);

    logger.info(`Using generation strategy: ${strategy}`);

    if (strategy === 'single-sdf') {
      return this.generateSingleSdf(composeData, options);
    } else {
      return this.generateMultiSdf(composeData, options);
    }
  }

  /**
   * Infer the best strategy based on Compose data
   * @param composeData - Parsed Compose file
   * @returns Recommended generation strategy
   */
  inferStrategy(composeData: ComposeData): GenerationStrategy {
    const serviceCount = Object.keys(composeData.services).length;
    const hasDependencies = Object.values(composeData.services).some(
      (service) => service.depends_on
    );
    const hasComplexNetworking =
      composeData.networks && Object.keys(composeData.networks).length > 1;

    // Use multi-SDF strategy for complex deployments
    if (serviceCount > 3 || hasDependencies || hasComplexNetworking) {
      logger.info(
        `Inferred multi-SDF strategy (services: ${serviceCount}, ` +
          `dependencies: ${hasDependencies}, complex networks: ${hasComplexNetworking})`
      );
      return 'multi-sdf';
    }

    logger.info(`Inferred single-SDF strategy (services: ${serviceCount})`);
    return 'single-sdf';
  }

  /**
   * Generate a single SDF with all services
   * @param composeData - Parsed Compose file
   * @param options - Generation options
   * @returns Single ServiceDefinition with all services
   */
  generateSingleSdf(
    composeData: ComposeData,
    options: ComposeSdfOptions
  ): ServiceDefinition {
    const projectName = options.projectName || composeData.name || 'compose-project';
    const version = options.version || '1.0.0';
    const arch = options.architecture || 'amd64';

    const services: Record<string, ServiceConfig> = {};

    // Convert each Compose service to SDF ServiceConfig
    for (const [serviceName, composeService] of Object.entries(composeData.services)) {
      services[serviceName] = this.mapComposeServiceToSdfService(composeService, serviceName);
    }

    const sdf: ServiceDefinition = {
      label: projectName,
      description: `Multi-container service generated from docker-compose.yml`,
      url: projectName,
      version,
      arch,
      sharable: 'multiple',
      deployment: { services },
    };

    if (options.organization) {
      sdf.org = options.organization;
    }

    return sdf;
  }

  /**
   * Generate multiple SDFs (one per service)
   * @param composeData - Parsed Compose file
   * @param options - Generation options
   * @returns MultiSdfResult with individual SDFs and dependency graph
   */
  generateMultiSdf(
    composeData: ComposeData,
    options: ComposeSdfOptions
  ): MultiSdfResult {
    const projectName = options.projectName || composeData.name || 'compose-project';
    const version = options.version || '1.0.0';
    const arch = options.architecture || 'amd64';
    const org = options.organization;

    const sdfs: Record<string, ServiceDefinition> = {};
    const dependencyGraph: Record<string, string[]> = {};

    // Build dependency graph
    for (const [serviceName, composeService] of Object.entries(composeData.services)) {
      const deps = this.extractDependencies(composeService);
      dependencyGraph[serviceName] = deps;
    }

    // Generate an SDF for each service
    for (const [serviceName, composeService] of Object.entries(composeData.services)) {
      const serviceUrl = `${projectName}.${serviceName}`;
      const sdfServiceConfig = this.mapComposeServiceToSdfService(composeService, serviceName);

      // Build requiredServices from depends_on
      const requiredServices: RequiredService[] = dependencyGraph[serviceName].map((depName) => ({
        url: `${projectName}.${depName}`,
        org: org || '',
        versionRange: version,
        arch,
      }));

      const sdf: ServiceDefinition = {
        label: `${projectName} - ${serviceName}`,
        description: `Service ${serviceName} from ${projectName} compose project`,
        url: serviceUrl,
        version,
        arch,
        sharable: composeService.privileged ? 'singleton' : 'multiple',
        deployment: {
          services: {
            [serviceName]: sdfServiceConfig,
          },
        },
      };

      if (requiredServices.length > 0) {
        sdf.requiredServices = requiredServices;
      }

      if (org) {
        sdf.org = org;
      }

      sdfs[serviceName] = sdf;
    }

    return { sdfs, dependencyGraph };
  }

  /**
   * Map Compose service to SDF ServiceConfig
   * @param composeService - Compose service definition
   * @param serviceName - Name of the service
   * @returns SDF ServiceConfig
   * @throws {SDFGenerationError} If service is missing required image field
   */
  private mapComposeServiceToSdfService(
    composeService: ComposeService,
    serviceName: string
  ): ServiceConfig {
    // Validate image
    if (!composeService.image) {
      throw new SDFGenerationError(
        `Service '${serviceName}' must specify an 'image' field. ` +
          `The 'build' field is not supported - pre-build images and push to a registry. ` +
          `Build your image and push to a registry, then update the compose file to use the image.`,
        {
          context: { serviceName, service: composeService },
        }
      );
    }

    const config: ServiceConfig = {
      image: composeService.image,
    };

    // Map ports
    if (composeService.ports && composeService.ports.length > 0) {
      config.ports = composeService.ports.map((port) => this.mapPort(port));
    }

    // Map environment variables
    if (composeService.environment) {
      const env = composeService.environment;
      if (Array.isArray(env)) {
        config.environment = env as string[];
      } else {
        config.environment = Object.entries(env).map(([k, v]) => `${k}=${v}`);
      }
    }

    // Map command
    const command = this.mapCommand(composeService);
    if (command.length > 0) {
      config.command = command;
    }

    // Map volumes (binds)
    if (composeService.volumes && composeService.volumes.length > 0) {
      config.binds = composeService.volumes.map((vol) => this.mapVolume(vol));
    }

    // Map privileged
    if (composeService.privileged) {
      config.privileged = true;
    }

    // Map tmpfs
    if (composeService.tmpfs) {
      const tmpfsPaths = Array.isArray(composeService.tmpfs)
        ? composeService.tmpfs
        : [composeService.tmpfs];

      config.tmpfs = {};
      for (const path of tmpfsPaths) {
        config.tmpfs[path] = '';
      }
    }

    return config;
  }

  /**
   * Map Compose port to SDF PortMapping
   * @param port - Compose port definition
   * @returns SDF PortMapping
   */
  private mapPort(port: ComposePort): PortMapping {
    if (typeof port === 'string' || typeof port === 'number') {
      const portNum = typeof port === 'number' ? port : parseInt(port, 10);
      return {
        HostIP: '0.0.0.0',
        HostPort: `${portNum}:${portNum}/tcp`,
      };
    }

    const protocol = port.protocol || 'tcp';
    const target = port.target;
    const published = port.published || target;

    return {
      HostIP: '0.0.0.0',
      HostPort: `${published}:${target}/${protocol}`,
    };
  }

  /**
   * Map Compose volume to SDF bind mount
   * @param volume - Compose volume mount definition
   * @returns Bind mount string
   */
  private mapVolume(volume: ComposeVolumeMount): string {
    if (typeof volume === 'string') {
      return volume; // Already in "source:target:mode" format
    }

    const { type, source, target, read_only } = volume;

    if (type === 'tmpfs') {
      logger.warn('tmpfs volumes should be specified in tmpfs field, not volumes');
      return target;
    }

    const mode = read_only ? 'ro' : 'rw';
    return source ? `${source}:${target}:${mode}` : target;
  }

  /**
   * Map command/entrypoint to SDF command
   * @param composeService - Compose service definition
   * @returns Command array
   */
  private mapCommand(composeService: ComposeService): string[] {
    const command: string[] = [];

    // Entrypoint takes precedence
    if (composeService.entrypoint) {
      const ep = composeService.entrypoint;
      command.push(...(Array.isArray(ep) ? ep : [ep]));
    }

    // Then add command
    if (composeService.command) {
      const cmd = composeService.command;
      command.push(...(Array.isArray(cmd) ? cmd : [cmd]));
    }

    return command;
  }

  /**
   * Extract service dependencies from depends_on
   * @param composeService - Compose service definition
   * @returns Array of dependency service names
   */
  private extractDependencies(composeService: ComposeService): string[] {
    if (!composeService.depends_on) {
      return [];
    }

    if (Array.isArray(composeService.depends_on)) {
      return composeService.depends_on;
    }

    return Object.keys(composeService.depends_on);
  }
}

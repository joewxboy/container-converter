/**
 * SDF Generator
 * Generates Open Horizon Service Definition Files from parsed Dockerfile data
 */

import { DockerfileData } from '../types/dockerfile';
import { ServiceDefinition, ServiceMetadata, PortMapping, ServiceConfig } from '../types/sdf';
import {
  inferServiceMetadata,
  generateServiceLabel,
  generateServiceUrl,
} from './metadata-inference';
import { SDFGenerationError } from '../utils/errors';

export class SDFGenerator {
  /**
   * Generate an SDF from parsed Dockerfile data
   * @param dockerfileData - Parsed Dockerfile information
   * @param userMetadata - User-provided metadata (optional)
   * @returns Generated SDF object
   */
  generate(
    dockerfileData: DockerfileData,
    userMetadata: Partial<ServiceMetadata> = {}
  ): ServiceDefinition {
    try {
      // Infer metadata
      const metadata = inferServiceMetadata(dockerfileData, userMetadata);

      // Validate required fields
      this.validateMetadata(metadata);

      // Generate service configuration
      const serviceConfig = this.mapDockerfileToServiceConfig(dockerfileData);

      // Build the SDF
      const sdf: ServiceDefinition = {
        label: generateServiceLabel(metadata),
        description: metadata.description || 'A containerized service',
        url: generateServiceUrl(metadata),
        version: metadata.version || '1.0.0',
        arch: metadata.architecture || 'amd64',
        sharable: metadata.sharable || 'multiple',
        deployment: {
          services: {
            [metadata.name]: serviceConfig,
          },
        },
      };

      // Add optional fields if provided
      if (metadata.organization) {
        sdf.org = metadata.organization;
      }
      if (metadata.documentation) {
        sdf.documentation = metadata.documentation;
      }

      return sdf;
    } catch (error) {
      if (error instanceof SDFGenerationError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new SDFGenerationError(`Failed to generate SDF: ${message}`);
    }
  }

  /**
   * Validate that required metadata fields are present
   */
  private validateMetadata(metadata: ServiceMetadata): void {
    if (!metadata.name) {
      throw new SDFGenerationError('Service name is required');
    }
    if (!metadata.version) {
      throw new SDFGenerationError('Service version is required');
    }
    if (!metadata.architecture) {
      throw new SDFGenerationError('Service architecture is required');
    }
  }

  /**
   * Map Dockerfile data to SDF ServiceConfig
   */
  private mapDockerfileToServiceConfig(dockerfileData: DockerfileData): ServiceConfig {
    const config: ServiceConfig = {
      image: dockerfileData.baseImage,
    };

    // Map exposed ports
    if (dockerfileData.exposedPorts.length > 0) {
      config.ports = this.mapPorts(dockerfileData.exposedPorts);
    }

    // Map environment variables
    if (Object.keys(dockerfileData.environment).length > 0) {
      config.environment = this.mapEnvironment(dockerfileData.environment);
    }

    // Map command (CMD or ENTRYPOINT)
    const command = this.mapCommand(dockerfileData);
    if (command.length > 0) {
      config.command = command;
    }

    // Map volumes (binds)
    if (dockerfileData.volumes.length > 0) {
      config.binds = dockerfileData.volumes;
    }

    return config;
  }

  /**
   * Map exposed ports to SDF port mappings
   */
  private mapPorts(ports: number[]): PortMapping[] {
    return ports.map((port) => ({
      HostIP: '0.0.0.0',
      HostPort: `${port}:${port}/tcp`,
    }));
  }

  /**
   * Map environment variables to SDF format
   */
  private mapEnvironment(env: Record<string, string>): string[] {
    return Object.entries(env).map(([key, value]) => `${key}=${value}`);
  }

  /**
   * Map CMD/ENTRYPOINT to command array
   * Combines ENTRYPOINT and CMD if both are present
   */
  private mapCommand(dockerfileData: DockerfileData): string[] {
    const command: string[] = [];

    // If both ENTRYPOINT and CMD are present, combine them
    if (dockerfileData.entrypoint && dockerfileData.entrypoint.length > 0) {
      command.push(...dockerfileData.entrypoint);
    }

    if (dockerfileData.command && dockerfileData.command.length > 0) {
      command.push(...dockerfileData.command);
    }

    return command;
  }

  /**
   * Generate SDF as formatted JSON string
   * @param dockerfileData - Parsed Dockerfile information
   * @param userMetadata - User-provided metadata (optional)
   * @param indent - Number of spaces for indentation (default: 2)
   * @returns Formatted JSON string
   */
  generateJSON(
    dockerfileData: DockerfileData,
    userMetadata: Partial<ServiceMetadata> = {},
    indent = 2
  ): string {
    const sdf = this.generate(dockerfileData, userMetadata);
    return JSON.stringify(sdf, null, indent);
  }

  /**
   * Validate that a generated SDF has all required fields
   * @param sdf - The SDF to validate
   * @returns true if valid
   * @throws {SDFGenerationError} if validation fails
   */
  validateSDF(sdf: ServiceDefinition): boolean {
    const requiredFields = ['label', 'description', 'url', 'version', 'arch', 'sharable', 'deployment'];

    for (const field of requiredFields) {
      if (!(field in sdf)) {
        throw new SDFGenerationError(`Missing required field: ${field}`);
      }
    }

    // Validate deployment structure
    if (!sdf.deployment.services || Object.keys(sdf.deployment.services).length === 0) {
      throw new SDFGenerationError('Deployment must contain at least one service');
    }

    // Validate each service has an image
    for (const [serviceName, serviceConfig] of Object.entries(sdf.deployment.services)) {
      if (!serviceConfig.image) {
        throw new SDFGenerationError(`Service ${serviceName} must have an image`);
      }
    }

    return true;
  }
}

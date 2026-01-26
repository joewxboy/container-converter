/**
 * Service Metadata Inference
 * Infers service metadata from Dockerfile data and user input
 */

import { DockerfileData } from '../types/dockerfile';
import { ServiceMetadata } from '../types/sdf';

/**
 * Infer service metadata from Dockerfile data
 * @param dockerfileData - Parsed Dockerfile data
 * @param userMetadata - User-provided metadata (overrides inferred values)
 * @returns Inferred service metadata
 */
export function inferServiceMetadata(
  dockerfileData: DockerfileData,
  userMetadata: Partial<ServiceMetadata> = {}
): ServiceMetadata {
  return {
    name: userMetadata.name || inferServiceName(dockerfileData),
    version: userMetadata.version || inferVersion(dockerfileData),
    architecture: userMetadata.architecture || inferArchitecture(dockerfileData),
    organization: userMetadata.organization,
    description: userMetadata.description || inferDescription(dockerfileData),
    documentation: userMetadata.documentation,
    sharable: userMetadata.sharable || inferSharableMode(dockerfileData),
  };
}

/**
 * Infer service name from Dockerfile data
 * Attempts to extract from labels, falls back to generic name
 */
export function inferServiceName(dockerfileData: DockerfileData): string {
  // Try to get name from labels
  if (dockerfileData.labels['service.name']) {
    return dockerfileData.labels['service.name'];
  }
  if (dockerfileData.labels['name']) {
    return dockerfileData.labels['name'];
  }

  // Try to extract from base image
  const baseImage = dockerfileData.baseImage;
  if (baseImage) {
    // Extract image name without tag/digest
    const imageName = baseImage.split(':')[0].split('@')[0];
    const parts = imageName.split('/');
    const name = parts[parts.length - 1];
    if (name && name !== 'scratch') {
      return `${name}-service`;
    }
  }

  return 'my-service';
}

/**
 * Infer service version from Dockerfile data
 * Attempts to extract from labels or base image tag
 */
export function inferVersion(dockerfileData: DockerfileData): string {
  // Try to get version from labels
  if (dockerfileData.labels['version']) {
    return dockerfileData.labels['version'];
  }
  if (dockerfileData.labels['service.version']) {
    return dockerfileData.labels['service.version'];
  }

  // Try to extract from base image tag
  const baseImage = dockerfileData.baseImage;
  if (baseImage && baseImage.includes(':')) {
    const tag = baseImage.split(':')[1].split('@')[0];
    // Check if tag looks like a version (starts with number or 'v')
    if (tag && /^v?\d/.test(tag)) {
      return tag.replace(/^v/, '');
    }
  }

  return '1.0.0';
}

/**
 * Infer architecture from base image
 * Detects common architecture indicators in image names
 */
export function inferArchitecture(dockerfileData: DockerfileData): string {
  const baseImage = dockerfileData.baseImage.toLowerCase();

  // Check for explicit architecture in image name
  if (baseImage.includes('arm64') || baseImage.includes('aarch64')) {
    return 'arm64';
  }
  if (baseImage.includes('arm32') || baseImage.includes('armv7') || baseImage.includes('armhf')) {
    return 'arm';
  }
  if (baseImage.includes('amd64') || baseImage.includes('x86_64')) {
    return 'amd64';
  }

  // Check labels
  if (dockerfileData.labels['architecture']) {
    return dockerfileData.labels['architecture'];
  }
  if (dockerfileData.labels['arch']) {
    return dockerfileData.labels['arch'];
  }

  // Default to amd64 (most common)
  return 'amd64';
}

/**
 * Infer service description from Dockerfile data
 * Uses labels or generates a basic description
 */
export function inferDescription(dockerfileData: DockerfileData): string {
  // Try to get description from labels
  if (dockerfileData.labels['description']) {
    return dockerfileData.labels['description'];
  }
  if (dockerfileData.labels['service.description']) {
    return dockerfileData.labels['service.description'];
  }

  // Generate basic description from base image
  const baseImage = dockerfileData.baseImage;
  if (baseImage) {
    const imageName = baseImage.split(':')[0].split('/').pop() || 'unknown';
    return `Service based on ${imageName}`;
  }

  return 'A containerized service';
}

/**
 * Infer sharable mode based on service characteristics
 * Determines if service can be shared across multiple agreements
 */
export function inferSharableMode(
  dockerfileData: DockerfileData
): 'none' | 'singleton' | 'multiple' {
  // Check labels for explicit sharable mode
  const sharableLabel = dockerfileData.labels['sharable'] || dockerfileData.labels['service.sharable'];
  if (sharableLabel) {
    const mode = sharableLabel.toLowerCase();
    if (mode === 'none' || mode === 'singleton' || mode === 'multiple') {
      return mode as 'none' | 'singleton' | 'multiple';
    }
  }

  // Heuristics based on service characteristics
  
  // Services with volumes are often stateful -> singleton
  if (dockerfileData.volumes.length > 0) {
    return 'singleton';
  }

  // Services with privileged mode often need exclusive access -> singleton
  // (Note: privileged flag would need to be added to DockerfileData if needed)

  // Services exposing ports might be singleton (e.g., databases, brokers)
  // But many web services can be multiple
  if (dockerfileData.exposedPorts.length > 0) {
    // Check for common database/broker ports
    const dbPorts = [3306, 5432, 27017, 6379, 1883, 5672];
    const hasDbPort = dockerfileData.exposedPorts.some(port => dbPorts.includes(port));
    if (hasDbPort) {
      return 'singleton';
    }
  }

  // Default to multiple (most flexible)
  return 'multiple';
}

/**
 * Generate a service label from metadata
 * Creates a human-readable label for the service
 */
export function generateServiceLabel(metadata: ServiceMetadata): string {
  const { name, architecture } = metadata;
  return `${name} for ${architecture}`;
}

/**
 * Generate a service URL from metadata
 * Creates a unique identifier for the service
 */
export function generateServiceUrl(metadata: ServiceMetadata): string {
  // URL should be lowercase and use hyphens
  return metadata.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}
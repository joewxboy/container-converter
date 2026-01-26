/**
 * Open Horizon Service Definition File Types
 * Type definitions for SDF structure
 */

export interface ServiceDefinition {
  org?: string;
  label: string;
  description: string;
  documentation?: string;
  public?: boolean;
  url: string;
  version: string;
  arch: string;
  sharable: 'none' | 'singleton' | 'multiple';
  requiredServices?: RequiredService[];
  userInput?: UserInput[];
  deployment: Deployment;
}

/**
 * Metadata for service generation
 * Used to provide additional context when generating SDFs
 */
export interface ServiceMetadata {
  name: string;
  version?: string;
  architecture?: string;
  organization?: string;
  description?: string;
  documentation?: string;
  sharable?: 'none' | 'singleton' | 'multiple';
}

export interface RequiredService {
  url: string;
  org: string;
  versionRange: string;
  arch: string;
}

export interface UserInput {
  name: string;
  label: string;
  type: 'string' | 'int' | 'boolean';
  defaultValue: string | number | boolean;
}

export interface Deployment {
  services: {
    [serviceName: string]: ServiceConfig;
  };
}

export interface ServiceConfig {
  image: string;
  ports?: PortMapping[];
  environment?: string[];
  command?: string[];
  privileged?: boolean;
  binds?: string[];
  tmpfs?: { [path: string]: string };
}

export interface PortMapping {
  HostIP?: string;
  HostPort: string;
}

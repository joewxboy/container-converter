/**
 * Compose File Types
 * Type definitions for parsed Docker Compose data
 */

import type { Compose as ComposeSpec } from '@json-types/compose';

export type { ComposeSpec };

/**
 * Simplified representation of a Compose file
 * Extracted from the full Compose spec for easier processing
 */
export interface ComposeData {
  version?: string; // Legacy v2.x/3.x format
  name?: string; // Project name
  services: Record<string, ComposeService>;
  networks?: Record<string, ComposeNetwork>;
  volumes?: Record<string, ComposeVolume>;
  secrets?: Record<string, ComposeSecret>;
  configs?: Record<string, ComposeConfig>;
}

export interface ComposeService {
  image?: string;
  build?: ComposeBuild | string;
  container_name?: string;
  command?: string | string[];
  entrypoint?: string | string[];
  environment?: Record<string, string | number | boolean> | string[];
  ports?: ComposePort[];
  volumes?: ComposeVolumeMount[];
  networks?: ComposeServiceNetworks;
  depends_on?: ComposeServiceDependsOn;
  restart?: string;
  privileged?: boolean;
  user?: string;
  working_dir?: string;
  labels?: Record<string, string>;
  expose?: (string | number)[];
  tmpfs?: string | string[];
  [key: string]: unknown; // Allow extension fields
}

export interface ComposeBuild {
  context: string;
  dockerfile?: string;
  args?: Record<string, string>;
  target?: string;
}

export type ComposePort =
  | string
  | number
  | {
      target: number;
      published?: number | string;
      protocol?: 'tcp' | 'udp';
      mode?: 'host' | 'ingress';
      host_ip?: string;
    };

export type ComposeVolumeMount =
  | string
  | {
      type: 'volume' | 'bind' | 'tmpfs';
      source?: string;
      target: string;
      read_only?: boolean;
    };

export type ComposeServiceNetworks = string[] | Record<string, ComposeServiceNetworkConfig | null>;

export interface ComposeServiceNetworkConfig {
  aliases?: string[];
  ipv4_address?: string;
  ipv6_address?: string;
}

export type ComposeServiceDependsOn = string[] | Record<string, ComposeServiceDependency>;

export interface ComposeServiceDependency {
  condition?: 'service_started' | 'service_healthy' | 'service_completed_successfully';
  restart?: boolean;
  required?: boolean;
}

export interface ComposeNetwork {
  driver?: string;
  driver_opts?: Record<string, string>;
  external?: boolean | { name: string };
  name?: string;
  internal?: boolean;
  attachable?: boolean;
}

export interface ComposeVolume {
  driver?: string;
  driver_opts?: Record<string, string>;
  external?: boolean | { name: string };
  name?: string;
}

export interface ComposeSecret {
  file?: string;
  external?: boolean | { name: string };
  name?: string;
  environment?: string;
}

export interface ComposeConfig {
  file?: string;
  external?: boolean | { name: string };
  name?: string;
  content?: string;
}

/**
 * Dockerfile Types
 * Type definitions for parsed Dockerfile data
 */

export interface DockerfileData {
  baseImage: string;
  exposedPorts: number[];
  environment: Record<string, string>;
  command?: string[];
  entrypoint?: string[];
  workdir?: string;
  user?: string;
  volumes: string[];
  labels: Record<string, string>;
}

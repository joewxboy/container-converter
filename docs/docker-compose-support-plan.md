# Docker Compose Support Plan

## Executive Summary

This document outlines the plan to extend `container-converter` to support docker-compose.yml files (v2.x and Docker Compose Specification) in addition to Dockerfiles. The tool will be able to parse Compose files and generate appropriate Open Horizon Service Definition Files (SDFs) for multi-container edge deployments.

## Background Research

### Current State Analysis

**What container-converter supports today:**

- ✅ Single Dockerfile → Single-service SDF conversion
- ✅ SDF type system supports multi-service structure (`deployment.services` is a dictionary)
- ✅ SDF validator handles multiple services correctly
- ✅ SDF generator creates only one service per Dockerfile

**Open Horizon Multi-Container Architecture:**

Based on research and the [EdgeX Kamakura example](https://github.com/edgexfoundry-holding/orra/tree/main/demos/OH-EXF-Kamakura), Open Horizon supports two approaches:

1. **Single SDF with Multiple Containers** - The `deployment.services` field can contain multiple service definitions in one SDF
2. **Multiple SDFs + Pattern** - Separate SDFs published individually, then grouped via a Pattern for orchestration (recommended for complex deployments)

**Real-world example from EdgeX Kamakura:**

Each service (consul, redis, mqtt-broker, etc.) has its own `service.definition.json`:

```json
{
  "deployment": {
    "services": {
      "consul": {
        "image": "hashicorp/consul:1.15",
        "command": ["agent", "-ui", "-bootstrap"],
        "ports": [{ "HostPort": "8500:8500/tcp" }],
        "binds": ["/data/consul:/consul/data:rw"]
      }
    }
  },
  "requiredServices": [{ "url": "deploy-data", "version": "1.0.0" }]
}
```

Then, services are orchestrated using patterns that reference multiple services:

```json
{
  "services": [
    { "serviceUrl": "asc-mqtt", "serviceVersions": [{ "version": "1.0.0" }] },
    { "serviceUrl": "edgex-ui", "serviceVersions": [{ "version": "1.0.0" }] }
  ]
}
```

## Goals and Non-Goals

### Goals

1. Parse docker-compose.yml files (v2.x and Compose Spec)
2. Generate valid Open Horizon SDFs from Compose files
3. Support both single-SDF (simple cases) and multi-SDF (complex cases) generation strategies
4. Map Compose concepts (networks, volumes, depends_on) to Open Horizon concepts
5. Provide clear CLI options for different generation strategies
6. Maintain backward compatibility with Dockerfile-only conversion

### Non-Goals

- Full Docker Compose feature parity (only features mappable to Open Horizon)
- Runtime Compose execution (only SDF generation)
- Automated Docker registry management
- Pattern generation (will be future enhancement)

## Technical Design

### Phase 1: Compose Parsing Infrastructure

#### 1.1 Dependencies

Add the following npm packages:

```json
{
  "dependencies": {
    "yaml": "^2.3.4", // Official YAML parser
    "@json-types/compose": "^1.0.0" // TypeScript types for Compose spec
  },
  "devDependencies": {
    "ajv": "^8.12.0", // JSON schema validator
    "@types/yaml": "^1.9.7"
  }
}
```

**Rationale:**

- `yaml` - Most popular YAML parser for Node.js (10,000+ dependents), supports YAML 1.2 and merge keys
- `@json-types/compose` - Auto-generated types from official Compose spec schema
- `ajv` - Industry-standard JSON schema validation

#### 1.2 Type Definitions

Create `src/types/compose.ts`:

```typescript
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
      published?: number;
      protocol?: 'tcp' | 'udp';
      mode?: 'host' | 'ingress';
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
}

export interface ComposeNetwork {
  driver?: string;
  driver_opts?: Record<string, string>;
  external?: boolean;
  name?: string;
}

export interface ComposeVolume {
  driver?: string;
  driver_opts?: Record<string, string>;
  external?: boolean;
  name?: string;
}

export interface ComposeSecret {
  file?: string;
  external?: boolean;
  name?: string;
}

export interface ComposeConfig {
  file?: string;
  external?: boolean;
  name?: string;
}
```

#### 1.3 Compose Parser

Create `src/parser/compose-parser.ts`:

```typescript
/**
 * Docker Compose Parser
 * Parses docker-compose.yml files and extracts structured information
 */

import { promises as fs } from 'fs';
import { parse as parseYaml } from 'yaml';
import Ajv from 'ajv';
import type { ComposeSpec, ComposeData } from '../types/compose';
import { DockerfileParseError } from '../utils/errors';
import { logger } from '../utils/logger';

export class ComposeParser {
  private ajv = new Ajv();

  /**
   * Parse a docker-compose.yml file
   * @param filePath - Path to the compose file
   * @returns Parsed Compose data
   */
  async parseFile(filePath: string): Promise<ComposeData> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parse(content);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new DockerfileParseError(`Compose file not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Parse Compose file content
   * @param content - Raw YAML content
   * @returns Parsed Compose data
   */
  parse(content: string): ComposeData {
    try {
      // Parse YAML with support for merge keys and anchors
      const raw = parseYaml(content, {
        merge: true, // Enable YAML 1.1 merge keys (<<: *anchor)
        strict: true, // Strict YAML parsing
      }) as ComposeSpec;

      // Validate basic structure
      this.validateComposeStructure(raw);

      // Substitute environment variables
      const processed = this.substituteEnvVars(raw);

      // Convert to our simplified format
      return this.normalizeComposeData(processed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new DockerfileParseError(`Failed to parse Compose file: ${message}`);
    }
  }

  /**
   * Validate that the compose file has required fields
   */
  private validateComposeStructure(compose: ComposeSpec): void {
    if (!compose.services || Object.keys(compose.services).length === 0) {
      throw new DockerfileParseError('Compose file must contain at least one service');
    }

    // Check for deprecated version field
    if ('version' in compose && compose.version) {
      logger.warn(
        `Compose file uses deprecated 'version' field (${compose.version}). ` +
          'Consider removing it - the Compose Specification no longer requires it.'
      );
    }
  }

  /**
   * Substitute environment variables in Compose file
   * Handles ${VAR}, ${VAR:-default}, ${VAR-default} syntax
   */
  private substituteEnvVars(compose: ComposeSpec): ComposeSpec {
    const str = JSON.stringify(compose);

    const substituted = str.replace(/\$\{([^}]+)\}/g, (match, expr) => {
      // Handle ${VAR:-default} (use default if unset or empty)
      const colonDefaultMatch = expr.match(/^([^:]+):-(.*)$/);
      if (colonDefaultMatch) {
        const [, varName, defaultValue] = colonDefaultMatch;
        const value = process.env[varName];
        return value !== undefined && value !== '' ? value : defaultValue;
      }

      // Handle ${VAR-default} (use default only if unset)
      const defaultMatch = expr.match(/^([^-]+)-(.*)$/);
      if (defaultMatch) {
        const [, varName, defaultValue] = defaultMatch;
        const value = process.env[varName];
        return value !== undefined ? value : defaultValue;
      }

      // Simple ${VAR}
      return process.env[expr] || '';
    });

    return JSON.parse(substituted) as ComposeSpec;
  }

  /**
   * Normalize Compose data to our simplified structure
   */
  private normalizeComposeData(compose: ComposeSpec): ComposeData {
    const normalized: ComposeData = {
      version: 'version' in compose ? String(compose.version) : undefined,
      name: compose.name,
      services: {},
      networks: compose.networks,
      volumes: compose.volumes,
      secrets: compose.secrets,
      configs: compose.configs,
    };

    // Normalize each service
    for (const [serviceName, service] of Object.entries(compose.services)) {
      normalized.services[serviceName] = this.normalizeService(service);
    }

    return normalized;
  }

  /**
   * Normalize a single service definition
   */
  private normalizeService(service: any): any {
    // Convert short-form ports to normalized format
    if (service.ports) {
      service.ports = service.ports.map((port: any) => {
        if (typeof port === 'string' || typeof port === 'number') {
          return this.parsePortMapping(String(port));
        }
        return port;
      });
    }

    // Convert environment array to object
    if (Array.isArray(service.environment)) {
      const envObj: Record<string, string> = {};
      for (const envStr of service.environment) {
        const [key, ...valueParts] = String(envStr).split('=');
        if (key) {
          envObj[key] = valueParts.join('=') || '';
        }
      }
      service.environment = envObj;
    }

    // Ensure command and entrypoint are arrays
    if (service.command && typeof service.command === 'string') {
      service.command = ['/bin/sh', '-c', service.command];
    }
    if (service.entrypoint && typeof service.entrypoint === 'string') {
      service.entrypoint = ['/bin/sh', '-c', service.entrypoint];
    }

    return service;
  }

  /**
   * Parse port mapping string (e.g., "8080:80/tcp", "127.0.0.1:8080:80")
   */
  private parsePortMapping(portStr: string): {
    target: number;
    published?: number;
    protocol?: string;
  } {
    // Format: [[HOST:]HOST_PORT:]CONTAINER_PORT[/PROTOCOL]
    const match = portStr.match(/^(?:(\d+\.\d+\.\d+\.\d+):)?(?:(\d+):)?(\d+)(?:\/(tcp|udp))?$/);

    if (!match) {
      logger.warn(`Invalid port format: ${portStr}, using as-is`);
      return { target: parseInt(portStr, 10) };
    }

    const [, , hostPort, containerPort, protocol] = match;

    return {
      target: parseInt(containerPort, 10),
      published: hostPort ? parseInt(hostPort, 10) : undefined,
      protocol: protocol as 'tcp' | 'udp' | undefined,
    };
  }
}
```

### Phase 2: SDF Generation Strategies

#### 2.1 Strategy Pattern

Create `src/generator/compose-sdf-generator.ts`:

```typescript
/**
 * Compose to SDF Generator
 * Generates Open Horizon SDFs from Docker Compose files
 */

import { ComposeData, ComposeService } from '../types/compose';
import {
  ServiceDefinition,
  ServiceMetadata,
  ServiceConfig,
  PortMapping,
  RequiredService,
} from '../types/sdf';
import { SDFGenerationError } from '../utils/errors';
import { logger } from '../utils/logger';

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
   */
  private inferStrategy(composeData: ComposeData): GenerationStrategy {
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
   */
  private generateSingleSdf(
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
   */
  private generateMultiSdf(composeData: ComposeData, options: ComposeSdfOptions): MultiSdfResult {
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
   */
  private mapComposeServiceToSdfService(
    composeService: ComposeService,
    serviceName: string
  ): ServiceConfig {
    // Validate image
    if (!composeService.image) {
      throw new SDFGenerationError(
        `Service ${serviceName} must specify an 'image'. ` +
          `'build' is not supported - pre-build images and push to a registry.`
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
   */
  private mapPort(port: any): PortMapping {
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
   */
  private mapVolume(volume: any): string {
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
```

### Phase 3: CLI Integration

#### 3.1 Update CLI

Update `src/cli/index.ts` to support Compose files:

```typescript
// Add new options
program
  .argument('[input]', 'Path to Dockerfile or docker-compose.yml')
  .option('-t, --type <type>', 'Input type: dockerfile, compose (auto-detected if not specified)')
  .option(
    '--strategy <strategy>',
    'SDF generation strategy: single-sdf, multi-sdf (auto if not specified)'
  )
  .option('--output-dir <dir>', 'Output directory for multi-SDF generation');
// ... existing options

// Add detection logic
function detectInputType(filePath: string): 'dockerfile' | 'compose' {
  const basename = path.basename(filePath).toLowerCase();

  if (
    basename === 'docker-compose.yml' ||
    basename === 'docker-compose.yaml' ||
    basename === 'compose.yml' ||
    basename === 'compose.yaml'
  ) {
    return 'compose';
  }

  if (basename === 'dockerfile' || basename.includes('dockerfile')) {
    return 'dockerfile';
  }

  // Check file content as fallback
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.trim().startsWith('services:') || content.includes('\nservices:')) {
    return 'compose';
  }

  return 'dockerfile';
}
```

#### 3.2 CLI Examples

```bash
# Convert docker-compose.yml to single SDF
container-converter docker-compose.yml -o output.json

# Convert to multiple SDFs (one per service)
container-converter docker-compose.yml --strategy multi-sdf --output-dir ./sdfs/

# With metadata
container-converter docker-compose.yml \
  --strategy multi-sdf \
  --output-dir ./sdfs/ \
  --org myorg \
  --svc-version 1.0.0 \
  -a arm64

# Validate generated SDFs
container-converter docker-compose.yml --validate

# Convert and publish (multi-SDF will publish all)
container-converter docker-compose.yml --strategy multi-sdf --publish
```

### Phase 4: MCP and TUI Integration

#### 4.1 MCP Tools

Add new MCP tool `convert_compose`:

```typescript
{
  name: 'convert_compose',
  description: 'Convert a docker-compose.yml file to Open Horizon SDF(s)',
  inputSchema: {
    type: 'object',
    properties: {
      compose_path: { type: 'string', description: 'Path to docker-compose.yml' },
      strategy: {
        type: 'string',
        enum: ['single-sdf', 'multi-sdf', 'auto'],
        description: 'SDF generation strategy'
      },
      output_dir: { type: 'string', description: 'Output directory for multi-SDF' },
      // ... other options
    },
    required: ['compose_path']
  }
}
```

#### 4.2 TUI Commands

Add TUI commands:

- `convert compose <file>` - Convert Compose file
- `strategy <single|multi>` - Set generation strategy
- `list services` - List services in current Compose file

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

- [ ] Install dependencies (yaml, @json-types/compose, ajv)
- [ ] Create Compose type definitions
- [ ] Implement ComposeParser with basic YAML parsing
- [ ] Add unit tests for parser (fixtures with v2.x and Compose Spec)
- [ ] Document Compose support in README

### Phase 2: SDF Generation (Week 3-4)

- [ ] Implement ComposeSdfGenerator base class
- [ ] Implement single-SDF generation strategy
- [ ] Implement multi-SDF generation strategy
- [ ] Add strategy inference logic
- [ ] Add unit tests for generator
- [ ] Add integration tests with real Compose files

### Phase 3: CLI Integration (Week 5)

- [ ] Update CLI to accept Compose files
- [ ] Add input type detection
- [ ] Add --strategy option
- [ ] Add --output-dir option
- [ ] Update help text and examples
- [ ] Add CLI integration tests

### Phase 4: MCP/TUI Integration (Week 6)

- [ ] Add convert_compose MCP tool
- [ ] Update TUI with Compose commands
- [ ] Add TUI tests
- [ ] Update MCP documentation

### Phase 5: Documentation & Examples (Week 7)

- [ ] Create Compose example files in tests/fixtures/
- [ ] Add Compose conversion examples to README
- [ ] Document strategy selection guidelines
- [ ] Create migration guide (Compose → SDF best practices)
- [ ] Update AGENTS.md with Compose guidelines

### Phase 6: Polish & Release (Week 8)

- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Error message improvements
- [ ] Release notes
- [ ] Blog post / announcement

## Feature Mapping: Compose → Open Horizon

### Supported Features

| Compose Feature  | Open Horizon Mapping        | Notes                                   |
| ---------------- | --------------------------- | --------------------------------------- |
| `services`       | `deployment.services`       | Direct mapping                          |
| `image`          | `ServiceConfig.image`       | Required - no build support             |
| `ports`          | `ServiceConfig.ports`       | Mapped to HostPort format               |
| `environment`    | `ServiceConfig.environment` | Converted to KEY=VALUE array            |
| `command`        | `ServiceConfig.command`     | Combined with entrypoint                |
| `entrypoint`     | `ServiceConfig.command`     | Prepended to command                    |
| `volumes` (bind) | `ServiceConfig.binds`       | Mapped to bind mounts                   |
| `tmpfs`          | `ServiceConfig.tmpfs`       | Mapped to tmpfs dictionary              |
| `privileged`     | `ServiceConfig.privileged`  | Direct mapping                          |
| `depends_on`     | `requiredServices`          | Mapped to service dependencies          |
| `restart`        | ⚠️ Policy-based             | Open Horizon handles restart via policy |
| `labels`         | ℹ️ Metadata                 | Can map to userInput or ignore          |

### Unsupported Features (with alternatives)

| Compose Feature           | Status           | Alternative                              |
| ------------------------- | ---------------- | ---------------------------------------- |
| `build`                   | ❌ Not supported | Pre-build and push to registry           |
| `networks` (custom)       | ⚠️ Limited       | Open Horizon manages networking          |
| `volumes` (named)         | ⚠️ Limited       | Use bind mounts instead                  |
| `secrets`                 | ❌ Not supported | Use Open Horizon secrets management      |
| `configs`                 | ❌ Not supported | Use environment variables or bind mounts |
| `healthcheck`             | ⚠️ Different     | Open Horizon uses agreements for health  |
| `deploy` (replicas, etc.) | ❌ Not supported | Open Horizon handles orchestration       |
| `extends`                 | ❌ Not supported | Expand before conversion                 |
| `profiles`                | ❌ Not supported | Use separate Compose files               |

### Warnings and Conversions

The tool will:

- **Error** on `build` without an image (must pre-build)
- **Warn** on custom networks (Open Horizon manages networks)
- **Warn** on named volumes (recommend bind mounts)
- **Warn** on unsupported features (with suggestions)
- **Info** on automatic conversions (e.g., string command → array)

## Testing Strategy

### Unit Tests

```typescript
describe('ComposeParser', () => {
  it('should parse Compose Spec file');
  it('should parse legacy v2.x file');
  it('should substitute environment variables');
  it('should handle YAML merge keys');
  it('should normalize port formats');
  it('should normalize environment formats');
});

describe('ComposeSdfGenerator', () => {
  it('should generate single SDF for simple compose');
  it('should generate multi-SDF for complex compose');
  it('should infer strategy correctly');
  it('should map depends_on to requiredServices');
  it('should handle volumes and bind mounts');
  it('should error on missing image');
});
```

### Integration Tests

```typescript
describe('Compose Conversion E2E', () => {
  it('should convert simple wordpress compose to SDF');
  it('should convert EdgeX-style multi-service compose to multi-SDF');
  it('should validate generated SDFs with hzn CLI');
  it('should publish multi-SDF to Exchange');
});
```

### Fixture Files

Create in `tests/fixtures/compose/`:

- `simple.docker-compose.yml` - Single service
- `multi-service.docker-compose.yml` - Multiple services without dependencies
- `with-dependencies.docker-compose.yml` - Services with depends_on
- `wordpress.docker-compose.yml` - Real-world example (WordPress + MySQL)
- `edgex-minimal.docker-compose.yml` - Simplified EdgeX example
- `v2.docker-compose.yml` - Legacy v2.x format

## Error Handling

### Validation Errors

```typescript
class ComposeValidationError extends DockerfileParseError {
  constructor(
    message: string,
    public readonly service?: string
  ) {
    super(`Compose validation failed: ${message}`);
  }
}

// Examples:
throw new ComposeValidationError('Service must specify an image or build', 'web');

throw new ComposeValidationError('Unsupported Compose feature: build.secrets', 'api');
```

### User-Friendly Messages

```
❌ Error: Service 'web' must specify an 'image' field.

The 'build' field is not supported in Open Horizon deployments.

Suggestion: Build your image and push to a registry:
  docker build -t myregistry.io/web:1.0 ./web
  docker push myregistry.io/web:1.0

Then update docker-compose.yml:
  services:
    web:
      image: myregistry.io/web:1.0
```

## Documentation Updates

### README.md

Add new sections:

- "Converting Docker Compose Files"
- "Generation Strategies: Single vs Multi-SDF"
- "Compose Feature Support Matrix"
- "Docker Compose Examples"

### AGENTS.md

Add guidelines:

- When to use single-SDF vs multi-SDF
- How to handle unsupported Compose features
- Testing multi-container conversions
- Pattern generation (future)

## Future Enhancements

### Pattern Generation (Phase 2)

After multi-SDF generation is stable, add:

- Pattern generator that creates Open Horizon patterns from dependency graph
- CLI option: `--generate-pattern`
- Pattern deployment policies

### Build Support (Phase 3)

Add optional build orchestration:

- Detect `build` field in Compose
- Automatically build and push images
- Update Compose file with pushed image references
- Then convert to SDF

### Network Mapping (Phase 4)

Investigate Open Horizon networking capabilities:

- Map Compose networks to Open Horizon networks
- Document network isolation behavior
- Provide network configuration guidance

## Migration Guide

Document for users migrating from docker-compose:

1. **Pre-flight Checks**
   - Ensure all images are pushed to accessible registries
   - Remove `build` sections (or document for future support)
   - Replace named volumes with bind mounts or document data persistence strategy

2. **Strategy Selection**
   - Simple apps (1-3 services, no dependencies) → single-SDF
   - Complex apps (4+ services, dependencies) → multi-SDF

3. **Post-Conversion**
   - Validate all SDFs: `container-converter compose.yml --validate`
   - Test on edge device before production
   - Set up monitoring via Open Horizon dashboard

## Success Criteria

✅ Phase 1 Complete:

- Parse Compose Spec and v2.x files
- Handle environment variables and YAML features
- 90%+ test coverage on parser

✅ Phase 2 Complete:

- Generate both single and multi-SDF
- Correct dependency mapping
- 90%+ test coverage on generator

✅ Phase 3 Complete:

- CLI accepts Compose files
- Auto-detection works
- Comprehensive CLI help

✅ Phase 4 Complete:

- MCP tool functional
- TUI supports Compose
- Integration tests pass

✅ Ready for Release:

- All tests passing
- Documentation complete
- Real-world example validated (EdgeX or similar)
- Performance acceptable (<5s for 10-service Compose)

## Open Questions

1. **Pattern Generation**: Should pattern generation be included in initial release or saved for Phase 2?
   - **Recommendation**: Phase 2 - focus on core SDF generation first

2. **Build Support**: Should we auto-build images if `build` is present?
   - **Recommendation**: Error initially, document workaround, add in Phase 3

3. **Network Isolation**: How does Open Horizon handle network isolation between services?
   - **Action Required**: Research Open Horizon networking documentation

4. **Named Volumes**: How should we handle persistent data?
   - **Recommendation**: Warn and suggest bind mounts, document data persistence patterns

5. **Validation**: Should we validate against both Compose schema AND Open Horizon constraints?
   - **Recommendation**: Yes - validate Compose structure first, then check SDF constraints

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-02  
**Author**: Container Converter Team  
**Status**: Ready for Implementation

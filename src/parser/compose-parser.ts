import { promises as fs } from 'fs';
import { parse as parseYaml } from 'yaml';
import type {
  ComposeSpec,
  ComposeData,
  ComposeService,
  ComposeNetwork,
  ComposeVolume,
  ComposeSecret,
  ComposeConfig,
} from '../types/compose';
import { DockerfileParseError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('compose-parser');

export class ComposeParser {
  async parseFile(filePath: string): Promise<ComposeData> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parse(content);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new DockerfileParseError(`Compose file not found: ${filePath}`);
      }
      throw error;
    }
  }

  parse(content: string): ComposeData {
    try {
      const raw = parseYaml(content, {
        merge: true,
        strict: true,
      }) as ComposeSpec;

      this.validateComposeStructure(raw);

      const processed = this.substituteEnvVars(raw);

      return this.normalizeComposeData(processed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new DockerfileParseError(`Failed to parse Compose file: ${message}`);
    }
  }

  private validateComposeStructure(compose: ComposeSpec): void {
    if (!compose.services || Object.keys(compose.services).length === 0) {
      throw new DockerfileParseError('Compose file must contain at least one service');
    }

    if ('version' in compose && compose.version) {
      logger.warn(
        `Compose file uses deprecated 'version' field (${compose.version}). ` +
          'Consider removing it - the Compose Specification no longer requires it.'
      );
    }
  }

  private substituteEnvVars(compose: ComposeSpec): ComposeSpec {
    const str = JSON.stringify(compose);

    const substituted = str.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
      const colonDefaultMatch = expr.match(/^([^:]+):-(.*)$/);
      if (colonDefaultMatch) {
        const [, varName, defaultValue] = colonDefaultMatch;
        const value = process.env[varName];
        return value !== undefined && value !== '' ? value : defaultValue;
      }

      const defaultMatch = expr.match(/^([^-]+)-(.*)$/);
      if (defaultMatch) {
        const [, varName, defaultValue] = defaultMatch;
        const value = process.env[varName];
        return value !== undefined ? value : defaultValue;
      }

      return process.env[expr] || '';
    });

    return JSON.parse(substituted) as ComposeSpec;
  }

  private normalizeComposeData(compose: ComposeSpec): ComposeData {
    const normalized: ComposeData = {
      version: 'version' in compose ? String(compose.version) : undefined,
      name: compose.name,
      services: {},
    };

    if (compose.networks) {
      normalized.networks = compose.networks as unknown as Record<string, ComposeNetwork>;
    }
    if (compose.volumes) {
      normalized.volumes = compose.volumes as unknown as Record<string, ComposeVolume>;
    }
    if (compose.secrets) {
      normalized.secrets = compose.secrets as unknown as Record<string, ComposeSecret>;
    }
    if (compose.configs) {
      normalized.configs = compose.configs as unknown as Record<string, ComposeConfig>;
    }

    if (compose.services) {
      for (const [serviceName, service] of Object.entries(compose.services)) {
        normalized.services[serviceName] = this.normalizeService(
          service as Record<string, unknown>
        );
      }
    }

    return normalized;
  }

  private normalizeService(service: Record<string, unknown>): ComposeService {
    const normalized = { ...service };

    if (Array.isArray(normalized.ports)) {
      normalized.ports = normalized.ports.map((port: unknown) => {
        if (typeof port === 'string' || typeof port === 'number') {
          return this.parsePortMapping(String(port));
        }
        return port;
      });
    }

    if (Array.isArray(normalized.environment)) {
      const envObj: Record<string, string> = {};
      for (const envStr of normalized.environment) {
        const [key, ...valueParts] = String(envStr).split('=');
        if (key) {
          envObj[key] = valueParts.join('=') || '';
        }
      }
      normalized.environment = envObj;
    }

    if (normalized.command && typeof normalized.command === 'string') {
      normalized.command = ['/bin/sh', '-c', normalized.command];
    }
    if (normalized.entrypoint && typeof normalized.entrypoint === 'string') {
      normalized.entrypoint = ['/bin/sh', '-c', normalized.entrypoint];
    }

    return normalized as ComposeService;
  }

  private parsePortMapping(portStr: string): {
    target: number;
    published?: number;
    protocol?: string;
    host_ip?: string;
  } {
    const match = portStr.match(/^(?:(\d+\.\d+\.\d+\.\d+):)?(?:(\d+):)?(\d+)(?:\/(tcp|udp))?$/);

    if (!match) {
      logger.warn(`Invalid port format: ${portStr}, using as-is`);
      return { target: parseInt(portStr, 10) };
    }

    const [, hostIp, hostPort, containerPort, protocol] = match;

    const result: {
      target: number;
      published?: number;
      protocol?: string;
      host_ip?: string;
    } = {
      target: parseInt(containerPort, 10),
    };

    if (hostPort) {
      result.published = parseInt(hostPort, 10);
    }
    if (protocol) {
      result.protocol = protocol as 'tcp' | 'udp';
    }
    if (hostIp) {
      result.host_ip = hostIp;
    }

    return result;
  }
}

/**
 * Dockerfile Parser
 * Parses Dockerfiles and extracts structured information
 */

import { DockerfileParser as ASTParser, Dockerfile, Instruction } from 'dockerfile-ast';
import { DockerfileData } from '../types/dockerfile';
import { DockerfileParseError } from '../utils/errors';

export class DockerfileParser {
  /**
   * Parse a Dockerfile string into a structured representation
   * @param content - The Dockerfile content as a string
   * @returns Parsed Dockerfile data
   */
  parse(content: string): DockerfileData {
    try {
      const dockerfile = ASTParser.parse(content);
      return this.extractDockerfileData(dockerfile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new DockerfileParseError(`Failed to parse Dockerfile: ${message}`);
    }
  }

  /**
   * Extract structured data from parsed Dockerfile AST
   * @param dockerfile - Parsed Dockerfile AST
   * @returns Structured Dockerfile data
   */
  private extractDockerfileData(dockerfile: Dockerfile): DockerfileData {
    const data: DockerfileData = {
      baseImage: '',
      exposedPorts: [],
      environment: {},
      volumes: [],
      labels: {},
    };

    const instructions = dockerfile.getInstructions();

    for (const instruction of instructions) {
      const keyword = instruction.getKeyword().toUpperCase();

      switch (keyword) {
        case 'FROM':
          data.baseImage = this.extractFromInstruction(instruction);
          break;
        case 'EXPOSE':
          data.exposedPorts.push(...this.extractExposeInstruction(instruction));
          break;
        case 'ENV':
          Object.assign(data.environment, this.extractEnvInstruction(instruction));
          break;
        case 'CMD':
          data.command = this.extractCmdInstruction(instruction);
          break;
        case 'ENTRYPOINT':
          data.entrypoint = this.extractEntrypointInstruction(instruction);
          break;
        case 'WORKDIR':
          data.workdir = this.extractWorkdirInstruction(instruction);
          break;
        case 'USER':
          data.user = this.extractUserInstruction(instruction);
          break;
        case 'VOLUME':
          data.volumes.push(...this.extractVolumeInstruction(instruction));
          break;
        case 'LABEL':
          Object.assign(data.labels, this.extractLabelInstruction(instruction));
          break;
      }
    }

    return data;
  }

  /**
   * Extract base image from FROM instruction
   * For multi-stage builds, returns the last FROM instruction
   */
  private extractFromInstruction(instruction: Instruction): string {
    const args = instruction.getArguments();
    if (args.length === 0) {
      return '';
    }

    // Get the image name (first argument)
    const imageArg = args[0];
    return imageArg.getValue();
  }

  /**
   * Extract exposed ports from EXPOSE instruction
   */
  private extractExposeInstruction(instruction: Instruction): number[] {
    const ports: number[] = [];
    const args = instruction.getArguments();

    for (const arg of args) {
      const value = arg.getValue();
      // Handle port/protocol format (e.g., "8080/tcp")
      const portMatch = value.match(/^(\d+)/);
      if (portMatch) {
        ports.push(parseInt(portMatch[1], 10));
      }
    }

    return ports;
  }

  /**
   * Extract environment variables from ENV instruction
   */
  private extractEnvInstruction(instruction: Instruction): Record<string, string> {
    const env: Record<string, string> = {};
    const args = instruction.getArguments();

    if (args.length === 0) {
      return env;
    }

    // ENV can be in two formats:
    // 1. ENV key value
    // 2. ENV key=value key2=value2
    const firstArg = args[0].getValue();

    if (firstArg.includes('=')) {
      // Format 2: key=value pairs
      for (const arg of args) {
        const value = arg.getValue();
        const [key, ...valueParts] = value.split('=');
        if (key) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    } else if (args.length >= 2) {
      // Format 1: key value
      const key = args[0].getValue();
      const value = args.slice(1).map(a => a.getValue()).join(' ');
      env[key] = value;
    }

    return env;
  }

  /**
   * Extract command from CMD instruction
   */
  private extractCmdInstruction(instruction: Instruction): string[] {
    const args = instruction.getArguments();
    return args.map(arg => arg.getValue());
  }

  /**
   * Extract entrypoint from ENTRYPOINT instruction
   */
  private extractEntrypointInstruction(instruction: Instruction): string[] {
    const args = instruction.getArguments();
    return args.map(arg => arg.getValue());
  }

  /**
   * Extract working directory from WORKDIR instruction
   */
  private extractWorkdirInstruction(instruction: Instruction): string {
    const args = instruction.getArguments();
    return args.length > 0 ? args[0].getValue() : '';
  }

  /**
   * Extract user from USER instruction
   */
  private extractUserInstruction(instruction: Instruction): string {
    const args = instruction.getArguments();
    return args.length > 0 ? args[0].getValue() : '';
  }

  /**
   * Extract volumes from VOLUME instruction
   */
  private extractVolumeInstruction(instruction: Instruction): string[] {
    const args = instruction.getArguments();
    return args.map(arg => arg.getValue());
  }

  /**
   * Extract labels from LABEL instruction
   */
  private extractLabelInstruction(instruction: Instruction): Record<string, string> {
    const labels: Record<string, string> = {};
    const args = instruction.getArguments();

    for (const arg of args) {
      const value = arg.getValue();
      const [key, ...valueParts] = value.split('=');
      if (key) {
        labels[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }

    return labels;
  }
}

/**
 * Dockerfile Parser
 * Parses Dockerfiles and extracts structured information
 */

import { DockerfileParser as ASTParser } from 'dockerfile-ast';

export class DockerfileParser {
  /**
   * Parse a Dockerfile string into a structured representation
   * @param content - The Dockerfile content as a string
   * @returns Parsed Dockerfile AST
   */
  parse(content: string): unknown {
    const dockerfile = ASTParser.parse(content);
    // Implementation will be added in Phase 2
    return dockerfile;
  }
}

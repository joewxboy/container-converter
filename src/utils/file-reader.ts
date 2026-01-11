/**
 * File Reader Utilities
 * Functions for reading files from the filesystem
 */

import { promises as fs } from 'fs';
import { DockerfileParseError } from './errors';

/**
 * Read a Dockerfile from the filesystem
 * @param filePath - Path to the Dockerfile
 * @returns Promise resolving to the Dockerfile content as a string
 * @throws {DockerfileParseError} If the file cannot be read
 */
export async function readDockerfile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    // Type guard for NodeJS.ErrnoException
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      
      if (code === 'ENOENT') {
        throw new DockerfileParseError(`File not found: ${filePath}`);
      }
      if (code === 'EACCES') {
        throw new DockerfileParseError(`Permission denied: ${filePath}`);
      }
      if (code === 'EISDIR') {
        throw new DockerfileParseError(`Path is a directory: ${filePath}`);
      }
    }
    
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new DockerfileParseError(`Failed to read file: ${message}`);
  }
}

/**
 * Check if a file exists
 * @param filePath - Path to check
 * @returns Promise resolving to true if file exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
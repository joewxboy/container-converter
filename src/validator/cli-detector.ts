/**
 * Open Horizon CLI Detector
 * Detects and validates the presence of the hzn CLI tool
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Result of CLI detection
 */
export interface CliDetectionResult {
  available: boolean;
  path?: string;
  version?: string;
  error?: string;
}

/**
 * Result of CLI version check
 */
export interface CliVersionInfo {
  version: string;
  raw: string;
}

/**
 * Check if the Open Horizon CLI (hzn) is available
 * @returns Promise resolving to detection result
 */
export async function isHznCliAvailable(): Promise<CliDetectionResult> {
  try {
    // Use 'which hzn' to check if CLI is available
    const { stdout } = await execAsync('which hzn', {
      timeout: 5000, // 5 second timeout
    });

    const path = stdout.trim();
    
    if (!path) {
      return {
        available: false,
        error: 'hzn command not found. Please install Open Horizon CLI.',
      };
    }

    // CLI is available, try to get version
    try {
      const versionInfo = await getHznCliVersion();
      return {
        available: true,
        path,
        version: versionInfo.version,
      };
    } catch {
      // Version check failed, but CLI exists
      return {
        available: true,
        path,
      };
    }
  } catch (error) {
    // Command failed - CLI not available
    if (error instanceof Error) {
      // which command returns non-zero exit code when command not found
      return {
        available: false,
        error: 'hzn command not found. Please install Open Horizon CLI.',
      };
    }

    return {
      available: false,
      error: 'Unknown error checking for hzn CLI',
    };
  }
}

/**
 * Get the version of the Open Horizon CLI
 * @returns Promise resolving to version information
 * @throws {Error} If CLI is not available or version cannot be determined
 */
export async function getHznCliVersion(): Promise<CliVersionInfo> {
  try {
    const { stdout } = await execAsync('hzn version', {
      timeout: 5000,
    });

    const version = parseVersionFromOutput(stdout);
    if (!version) {
      throw new Error('Could not parse version from hzn output');
    }

    return {
      version,
      raw: stdout.trim(),
    };
  } catch (error) {
    if (error instanceof Error) {
      if ('code' in error && (error.code === 127 || error.code === 'ENOENT')) {
        throw new Error('hzn command not found. Please install Open Horizon CLI.');
      }
      throw new Error(`Failed to get hzn version: ${error.message}`);
    }
    throw new Error('Unknown error getting hzn version');
  }
}

/**
 * Parse version string from hzn version output
 * @param output - Raw output from hzn version command
 * @returns Parsed version string or undefined
 */
function parseVersionFromOutput(output: string): string | undefined {
  // hzn version output format is typically:
  // "Horizon CLI version: 2.30.0-1234"
  // or just "2.30.0-1234"
  
  const lines = output.trim().split('\n');
  
  for (const line of lines) {
    // Look for version pattern: X.Y.Z or X.Y.Z-build
    const versionMatch = line.match(/(\d+\.\d+\.\d+(?:-\d+)?)/);
    if (versionMatch) {
      return versionMatch[1];
    }
  }

  return undefined;
}

/**
 * Check if the CLI version meets minimum requirements
 * @param version - Version string to check
 * @param minVersion - Minimum required version
 * @returns True if version meets requirements
 */
export function isVersionCompatible(version: string, minVersion: string): boolean {
  const parseVersion = (v: string): number[] => {
    // Remove build number if present (e.g., "2.30.0-1234" -> "2.30.0")
    const cleanVersion = v.split('-')[0];
    return cleanVersion.split('.').map((n) => parseInt(n, 10));
  };

  const current = parseVersion(version);
  const minimum = parseVersion(minVersion);

  // Compare major.minor.patch
  for (let i = 0; i < 3; i++) {
    if (current[i] > minimum[i]) return true;
    if (current[i] < minimum[i]) return false;
  }

  return true; // Versions are equal
}

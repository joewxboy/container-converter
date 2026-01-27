/**
 * Open Horizon Exchange Publisher
 * Handles publishing SDFs to the Open Horizon Exchange
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import type { ServiceDefinition } from '../types/sdf';
import { PublishError } from '../utils/errors';
import type { ExchangeCredentials } from './exchange-auth';

const execAsync = promisify(exec);

/**
 * Options for publishing a service
 */
export interface PublishOptions {
  /** Exchange credentials */
  credentials: ExchangeCredentials;
  /** Service definition to publish */
  sdf: ServiceDefinition;
  /** Overwrite if service already exists */
  overwrite?: boolean;
  /** Validate only, don't actually publish */
  dryRun?: boolean;
}

/**
 * Result of a publish operation
 */
export interface PublishResult {
  /** Whether the publish was successful */
  success: boolean;
  /** Full service URL in the Exchange (org/url_version_arch) */
  serviceId?: string;
  /** Service version that was published */
  version?: string;
  /** Error message if publish failed */
  error?: string;
  /** Warning messages */
  warnings?: string[];
  /** Whether this was a dry run */
  dryRun?: boolean;
}

/**
 * Information about a published service
 */
export interface ServiceInfo {
  /** Service ID in the Exchange */
  serviceId: string;
  /** Organization */
  org: string;
  /** Service URL */
  url: string;
  /** Version */
  version: string;
  /** Architecture */
  arch: string;
}

/**
 * Check if a service already exists in the Exchange
 * @param credentials - Exchange credentials
 * @param org - Organization ID
 * @param serviceUrl - Service URL
 * @param version - Service version
 * @param arch - Architecture
 * @returns True if service exists
 */
export async function checkServiceExists(
  credentials: ExchangeCredentials,
  org: string,
  serviceUrl: string,
  version: string,
  arch: string
): Promise<boolean> {
  try {
    const env = {
      ...process.env,
      HZN_ORG_ID: credentials.orgId,
      HZN_EXCHANGE_USER_AUTH: credentials.userAuth,
      HZN_EXCHANGE_URL: credentials.exchangeUrl,
    };

    // Construct the service ID: org/url_version_arch
    const serviceId = `${org}/${serviceUrl}_${version}_${arch}`;

    const { stdout } = await execAsync(`hzn exchange service list ${serviceId}`, {
      timeout: 30000,
      env,
    });

    // If we get output with the service info, it exists
    return stdout.trim().length > 0 && !stdout.includes('not found');
  } catch {
    // Service doesn't exist or error occurred
    return false;
  }
}

/**
 * Get list of published versions for a service
 * @param credentials - Exchange credentials
 * @param org - Organization ID
 * @param serviceUrl - Service URL
 * @returns Array of published versions
 */
export async function getPublishedVersions(
  credentials: ExchangeCredentials,
  org: string,
  serviceUrl: string
): Promise<string[]> {
  try {
    const env = {
      ...process.env,
      HZN_ORG_ID: credentials.orgId,
      HZN_EXCHANGE_USER_AUTH: credentials.userAuth,
      HZN_EXCHANGE_URL: credentials.exchangeUrl,
    };

    // List all services matching the URL pattern
    const { stdout } = await execAsync(`hzn exchange service list -o ${org} | grep "${serviceUrl}"`, {
      timeout: 30000,
      env,
    });

    const versions: string[] = [];
    const lines = stdout.trim().split('\n');

    for (const line of lines) {
      // Parse version from service ID format: org/url_version_arch
      const match = line.match(new RegExp(`${serviceUrl}_(\\d+\\.\\d+\\.\\d+)_`));
      if (match) {
        versions.push(match[1]);
      }
    }

    return [...new Set(versions)].sort(); // Unique and sorted
  } catch {
    // No services found or error
    return [];
  }
}

/**
 * Publish a service definition to the Exchange
 * @param options - Publish options
 * @returns PublishResult indicating success or failure
 */
export async function publishService(options: PublishOptions): Promise<PublishResult> {
  const { credentials, sdf, overwrite = false, dryRun = false } = options;
  const warnings: string[] = [];

  // Validate SDF has required fields
  if (!sdf.url || !sdf.version || !sdf.arch) {
    return {
      success: false,
      error: 'SDF missing required fields: url, version, or arch',
    };
  }

  const org = sdf.org || credentials.orgId;
  const serviceId = `${org}/${sdf.url}_${sdf.version}_${sdf.arch}`;

  // Check if service already exists
  const exists = await checkServiceExists(
    credentials,
    org,
    sdf.url,
    sdf.version,
    sdf.arch
  );

  if (exists && !overwrite) {
    return {
      success: false,
      serviceId,
      version: sdf.version,
      error: `Service ${serviceId} already exists. Use overwrite option to update.`,
    };
  }

  if (exists && overwrite) {
    warnings.push(`Overwriting existing service ${serviceId}`);
  }

  // If dry run, don't actually publish
  if (dryRun) {
    return {
      success: true,
      serviceId,
      version: sdf.version,
      dryRun: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // Write SDF to temporary file
  let tempFile: string | null = null;
  try {
    tempFile = path.join(os.tmpdir(), `sdf-${Date.now()}.json`);
    await fs.writeFile(tempFile, JSON.stringify(sdf, null, 2), 'utf-8');

    // Set up environment for hzn command
    const env = {
      ...process.env,
      HZN_ORG_ID: credentials.orgId,
      HZN_EXCHANGE_USER_AUTH: credentials.userAuth,
      HZN_EXCHANGE_URL: credentials.exchangeUrl,
    };

    // Build the publish command
    let command = `hzn exchange service publish -f "${tempFile}"`;
    if (overwrite) {
      command += ' -O'; // Overwrite flag
    }

    await execAsync(command, {
      timeout: 60000, // 60 second timeout for publish
      env,
    });

    return {
      success: true,
      serviceId,
      version: sdf.version,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    if (error instanceof Error) {
      const stderr = 'stderr' in error ? String(error.stderr) : '';
      const message = error.message || '';

      // Check for specific error types
      if (stderr.includes('401') || stderr.includes('Unauthorized')) {
        throw new PublishError('Authentication failed. Please check your credentials.', { code: 'AUTH_FAILED' });
      }

      if (stderr.includes('already exists') && !overwrite) {
        return {
          success: false,
          serviceId,
          version: sdf.version,
          error: `Service ${serviceId} already exists. Use overwrite option to update.`,
        };
      }

      if (stderr.includes('ECONNREFUSED') || stderr.includes('connection refused')) {
        throw new PublishError(
          `Cannot connect to Exchange at ${credentials.exchangeUrl}`,
          { code: 'ECONNREFUSED' }
        );
      }

      // Check for validation errors
      if (stderr.includes('invalid') || stderr.includes('Error')) {
        return {
          success: false,
          serviceId,
          version: sdf.version,
          error: `Publish failed: ${stderr || message}`,
        };
      }

      return {
        success: false,
        serviceId,
        version: sdf.version,
        error: `Publish failed: ${message}`,
      };
    }

    return {
      success: false,
      error: 'Unknown error during publish',
    };
  } finally {
    // Clean up temp file
    if (tempFile) {
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Unpublish (remove) a service from the Exchange
 * @param credentials - Exchange credentials
 * @param serviceId - Full service ID (org/url_version_arch)
 * @returns True if successfully removed
 */
export async function unpublishService(
  credentials: ExchangeCredentials,
  serviceId: string
): Promise<boolean> {
  try {
    const env = {
      ...process.env,
      HZN_ORG_ID: credentials.orgId,
      HZN_EXCHANGE_USER_AUTH: credentials.userAuth,
      HZN_EXCHANGE_URL: credentials.exchangeUrl,
    };

    await execAsync(`hzn exchange service remove -f ${serviceId}`, {
      timeout: 30000,
      env,
    });

    return true;
  } catch {
    return false;
  }
}

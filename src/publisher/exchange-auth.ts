/**
 * Open Horizon Exchange Authentication
 * Handles credential management and Exchange connectivity verification
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';

import { ExchangeAuthError } from '../utils/errors';

const execAsync = promisify(exec);

/**
 * Exchange credentials required for authentication
 */
export interface ExchangeCredentials {
  /** Organization ID (HZN_ORG_ID) */
  orgId: string;
  /** User authentication in "user:password" format (HZN_EXCHANGE_USER_AUTH) */
  userAuth: string;
  /** Exchange URL (HZN_EXCHANGE_URL) */
  exchangeUrl: string;
}

/**
 * Result of authentication attempt
 */
export interface AuthResult {
  authenticated: boolean;
  credentials?: ExchangeCredentials;
  error?: string;
}

/**
 * Result of Exchange connectivity check
 */
export interface ConnectionResult {
  connected: boolean;
  exchangeVersion?: string;
  error?: string;
}

/**
 * Result of user authentication verification
 */
export interface UserAuthResult {
  valid: boolean;
  username?: string;
  error?: string;
}

/**
 * Get credentials from environment variables
 * @returns Credentials if all required variables are set, null otherwise
 */
export function getCredentialsFromEnv(): ExchangeCredentials | null {
  const orgId = process.env.HZN_ORG_ID;
  const userAuth = process.env.HZN_EXCHANGE_USER_AUTH;
  const exchangeUrl = process.env.HZN_EXCHANGE_URL;

  if (!orgId || !userAuth || !exchangeUrl) {
    return null;
  }

  return { orgId, userAuth, exchangeUrl };
}

/**
 * Load credentials from a configuration file
 * Supports .cfg and .env file formats (KEY=value per line)
 * @param configPath - Path to the configuration file
 * @param credsPath - Optional path to credentials file (for split config)
 * @returns Credentials if found, null otherwise
 */
export async function loadCredentialsFromFile(
  configPath: string,
  credsPath?: string
): Promise<ExchangeCredentials | null> {
  const vars: Record<string, string> = {};

  // Parse config file
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    parseEnvFile(configContent, vars);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new ExchangeAuthError(`Configuration file not found: ${configPath}`, 'ENOENT');
    }
    throw new ExchangeAuthError(
      `Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Parse credentials file if provided
  if (credsPath) {
    try {
      const credsContent = await fs.readFile(credsPath, 'utf-8');
      parseEnvFile(credsContent, vars);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new ExchangeAuthError(`Credentials file not found: ${credsPath}`, 'ENOENT');
      }
      throw new ExchangeAuthError(
        `Failed to read credentials file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const orgId = vars['HZN_ORG_ID'];
  const userAuth = vars['HZN_EXCHANGE_USER_AUTH'];
  const exchangeUrl = vars['HZN_EXCHANGE_URL'];

  if (!orgId || !userAuth || !exchangeUrl) {
    return null;
  }

  return { orgId, userAuth, exchangeUrl };
}

/**
 * Parse environment file content into variables object
 * Supports both "KEY=value" and "export KEY=value" formats
 * @param content - File content to parse
 * @param vars - Object to populate with parsed variables
 */
function parseEnvFile(content: string, vars: Record<string, string>): void {
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Remove 'export ' prefix if present
    const cleanLine = trimmed.startsWith('export ')
      ? trimmed.substring(7).trim()
      : trimmed;

    // Parse KEY=value
    const equalsIndex = cleanLine.indexOf('=');
    if (equalsIndex > 0) {
      const key = cleanLine.substring(0, equalsIndex).trim();
      let value = cleanLine.substring(equalsIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      vars[key] = value;
    }
  }
}

/**
 * Validate credential format
 * @param credentials - Credentials to validate
 * @returns AuthResult indicating if credentials are valid
 */
export function validateCredentials(credentials: ExchangeCredentials): AuthResult {
  const errors: string[] = [];

  // Check orgId
  if (!credentials.orgId || credentials.orgId.trim() === '') {
    errors.push('Organization ID (HZN_ORG_ID) is required');
  }

  // Check userAuth format (should be "user:password")
  if (!credentials.userAuth || credentials.userAuth.trim() === '') {
    errors.push('User authentication (HZN_EXCHANGE_USER_AUTH) is required');
  } else if (!credentials.userAuth.includes(':')) {
    errors.push('User authentication must be in "user:password" format');
  }

  // Check exchangeUrl
  if (!credentials.exchangeUrl || credentials.exchangeUrl.trim() === '') {
    errors.push('Exchange URL (HZN_EXCHANGE_URL) is required');
  } else {
    try {
      new URL(credentials.exchangeUrl);
    } catch {
      errors.push('Exchange URL must be a valid URL');
    }
  }

  if (errors.length > 0) {
    return {
      authenticated: false,
      error: errors.join('; '),
    };
  }

  return {
    authenticated: true,
    credentials,
  };
}

/**
 * Verify Exchange connectivity using hzn CLI
 * @param credentials - Credentials to use for connection
 * @returns ConnectionResult indicating if Exchange is reachable
 */
export async function verifyExchangeConnection(
  credentials: ExchangeCredentials
): Promise<ConnectionResult> {
  try {
    // Set environment variables for the command
    const env = {
      ...process.env,
      HZN_ORG_ID: credentials.orgId,
      HZN_EXCHANGE_USER_AUTH: credentials.userAuth,
      HZN_EXCHANGE_URL: credentials.exchangeUrl,
    };

    const { stdout } = await execAsync('hzn exchange status', {
      timeout: 30000, // 30 second timeout
      env,
    });

    // Parse version from output if available
    const versionMatch = stdout.match(/version[:\s]+(\S+)/i);
    const exchangeVersion = versionMatch ? versionMatch[1] : undefined;

    return {
      connected: true,
      exchangeVersion,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Check for specific error types
      if ('code' in error && (error.code === 127 || error.code === 'ENOENT')) {
        return {
          connected: false,
          error: 'hzn CLI not found. Please install Open Horizon CLI.',
        };
      }

      // Check for authentication errors in stderr
      const stderr = 'stderr' in error ? String(error.stderr) : '';
      if (stderr.includes('401') || stderr.includes('unauthorized') || stderr.includes('Unauthorized')) {
        return {
          connected: false,
          error: 'Authentication failed. Please check your credentials.',
        };
      }

      // Connection errors
      if (stderr.includes('ECONNREFUSED') || stderr.includes('connection refused')) {
        return {
          connected: false,
          error: `Cannot connect to Exchange at ${credentials.exchangeUrl}. Please check the URL and network connectivity.`,
        };
      }

      return {
        connected: false,
        error: `Exchange connection failed: ${error.message}`,
      };
    }

    return {
      connected: false,
      error: 'Unknown error verifying Exchange connection',
    };
  }
}

/**
 * Verify user authentication against Exchange using hzn exchange user list
 * @param credentials - Credentials to verify
 * @returns UserAuthResult indicating if credentials are valid
 */
export async function verifyUserAuth(
  credentials: ExchangeCredentials
): Promise<UserAuthResult> {
  try {
    // Set environment variables for the command
    const env = {
      ...process.env,
      HZN_ORG_ID: credentials.orgId,
      HZN_EXCHANGE_USER_AUTH: credentials.userAuth,
      HZN_EXCHANGE_URL: credentials.exchangeUrl,
    };

    // Use hzn exchange user list to verify credentials
    // This command requires valid auth and will fail if credentials are invalid
    const { stdout } = await execAsync('hzn exchange user list', {
      timeout: 30000, // 30 second timeout
      env,
    });

    // Extract username from credentials for response
    const username = credentials.userAuth.split(':')[0];

    // Check if output contains user information (indicates success)
    if (stdout && stdout.trim().length > 0) {
      return {
        valid: true,
        username,
      };
    }

    return {
      valid: true,
      username,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Check for CLI not found
      if ('code' in error && (error.code === 127 || error.code === 'ENOENT')) {
        return {
          valid: false,
          error: 'hzn CLI not found. Please install Open Horizon CLI.',
        };
      }

      // Check for authentication errors in stderr
      const stderr = 'stderr' in error ? String(error.stderr) : '';
      const message = error.message || '';

      if (
        stderr.includes('401') ||
        stderr.includes('unauthorized') ||
        stderr.includes('Unauthorized') ||
        stderr.includes('invalid credentials') ||
        message.includes('401')
      ) {
        return {
          valid: false,
          error: 'Invalid credentials. Please check your username and password.',
        };
      }

      // Check for user not found
      if (stderr.includes('not found') || stderr.includes('does not exist')) {
        return {
          valid: false,
          error: 'User not found in the specified organization.',
        };
      }

      // Connection errors
      if (stderr.includes('ECONNREFUSED') || stderr.includes('connection refused')) {
        return {
          valid: false,
          error: `Cannot connect to Exchange at ${credentials.exchangeUrl}. Please check the URL and network connectivity.`,
        };
      }

      return {
        valid: false,
        error: `User authentication failed: ${error.message}`,
      };
    }

    return {
      valid: false,
      error: 'Unknown error verifying user authentication',
    };
  }
}

/**
 * Get credentials from multiple sources with fallback
 * Priority: 1. Environment variables, 2. Config files
 * @param configPath - Optional path to config file
 * @param credsPath - Optional path to credentials file
 * @returns Credentials if found from any source
 */
export async function getCredentials(
  configPath?: string,
  credsPath?: string
): Promise<ExchangeCredentials | null> {
  // Try environment variables first
  const envCreds = getCredentialsFromEnv();
  if (envCreds) {
    return envCreds;
  }

  // Try config files if paths provided
  if (configPath) {
    const fileCreds = await loadCredentialsFromFile(configPath, credsPath);
    if (fileCreds) {
      return fileCreds;
    }
  }

  return null;
}

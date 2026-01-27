/**
 * Unit tests for Exchange Authentication
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';

import {
  getCredentialsFromEnv,
  loadCredentialsFromFile,
  validateCredentials,
  verifyExchangeConnection,
  verifyUserAuth,
  getCredentials,
  ExchangeCredentials,
} from '../../../src/publisher/exchange-auth';

// Mock child_process and fs
jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

// Helper to create mock exec implementation
// Note: promisify(exec) expects callback with (error, { stdout, stderr })
type ExecCallback = (error: Error | null, result: { stdout: string; stderr: string }) => void;

function createMockExec(
  error: Error | null,
  stdout: string = '',
  stderr: string = ''
): jest.Mock {
  return jest.fn().mockImplementation(
    (_command: string, _options: unknown, callback: ExecCallback) => {
      if (callback) {
        if (error) {
          const execError = error as Error & { stderr?: string };
          execError.stderr = stderr;
          callback(execError, { stdout: '', stderr });
        } else {
          callback(null, { stdout, stderr });
        }
      }
      return {} as ReturnType<typeof exec>;
    }
  );
}

describe('Exchange Authentication', () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env for each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getCredentialsFromEnv', () => {
    it('should return credentials when all env vars are set', () => {
      process.env.HZN_ORG_ID = 'test-org';
      process.env.HZN_EXCHANGE_USER_AUTH = 'user:password';
      process.env.HZN_EXCHANGE_URL = 'http://exchange.example.com/v1';

      const result = getCredentialsFromEnv();

      expect(result).toEqual({
        orgId: 'test-org',
        userAuth: 'user:password',
        exchangeUrl: 'http://exchange.example.com/v1',
      });
    });

    it('should return null when HZN_ORG_ID is missing', () => {
      process.env.HZN_EXCHANGE_USER_AUTH = 'user:password';
      process.env.HZN_EXCHANGE_URL = 'http://exchange.example.com/v1';
      delete process.env.HZN_ORG_ID;

      const result = getCredentialsFromEnv();

      expect(result).toBeNull();
    });

    it('should return null when HZN_EXCHANGE_USER_AUTH is missing', () => {
      process.env.HZN_ORG_ID = 'test-org';
      process.env.HZN_EXCHANGE_URL = 'http://exchange.example.com/v1';
      delete process.env.HZN_EXCHANGE_USER_AUTH;

      const result = getCredentialsFromEnv();

      expect(result).toBeNull();
    });

    it('should return null when HZN_EXCHANGE_URL is missing', () => {
      process.env.HZN_ORG_ID = 'test-org';
      process.env.HZN_EXCHANGE_USER_AUTH = 'user:password';
      delete process.env.HZN_EXCHANGE_URL;

      const result = getCredentialsFromEnv();

      expect(result).toBeNull();
    });

    it('should return null when all env vars are missing', () => {
      delete process.env.HZN_ORG_ID;
      delete process.env.HZN_EXCHANGE_USER_AUTH;
      delete process.env.HZN_EXCHANGE_URL;

      const result = getCredentialsFromEnv();

      expect(result).toBeNull();
    });
  });

  describe('loadCredentialsFromFile', () => {
    it('should load credentials from a single config file', async () => {
      const configContent = `
HZN_EXCHANGE_URL=http://exchange.example.com/v1
HZN_ORG_ID=test-org
HZN_EXCHANGE_USER_AUTH=user:password
      `;
      mockReadFile.mockResolvedValueOnce(configContent);

      const result = await loadCredentialsFromFile('/path/to/config.cfg');

      expect(result).toEqual({
        orgId: 'test-org',
        userAuth: 'user:password',
        exchangeUrl: 'http://exchange.example.com/v1',
      });
    });

    it('should load credentials from separate config and creds files', async () => {
      const configContent = `
HZN_EXCHANGE_URL=http://exchange.example.com/v1
HZN_FSS_CSSURL=http://css.example.com/
      `;
      const credsContent = `
export HZN_ORG_ID=examples
export HZN_EXCHANGE_USER_AUTH=joewxboy:secret123
      `;
      mockReadFile
        .mockResolvedValueOnce(configContent)
        .mockResolvedValueOnce(credsContent);

      const result = await loadCredentialsFromFile('/path/to/config.cfg', '/path/to/creds.env');

      expect(result).toEqual({
        orgId: 'examples',
        userAuth: 'joewxboy:secret123',
        exchangeUrl: 'http://exchange.example.com/v1',
      });
    });

    it('should handle export prefix in env files', async () => {
      const configContent = `
export HZN_EXCHANGE_URL=http://exchange.example.com/v1
export HZN_ORG_ID=test-org
export HZN_EXCHANGE_USER_AUTH=user:password
      `;
      mockReadFile.mockResolvedValueOnce(configContent);

      const result = await loadCredentialsFromFile('/path/to/config.env');

      expect(result).toEqual({
        orgId: 'test-org',
        userAuth: 'user:password',
        exchangeUrl: 'http://exchange.example.com/v1',
      });
    });

    it('should handle quoted values', async () => {
      const configContent = `
HZN_EXCHANGE_URL="http://exchange.example.com/v1"
HZN_ORG_ID='test-org'
HZN_EXCHANGE_USER_AUTH="user:pass:with:colons"
      `;
      mockReadFile.mockResolvedValueOnce(configContent);

      const result = await loadCredentialsFromFile('/path/to/config.cfg');

      expect(result).toEqual({
        orgId: 'test-org',
        userAuth: 'user:pass:with:colons',
        exchangeUrl: 'http://exchange.example.com/v1',
      });
    });

    it('should skip comments and empty lines', async () => {
      const configContent = `
# This is a comment
HZN_EXCHANGE_URL=http://exchange.example.com/v1

# Another comment
HZN_ORG_ID=test-org
HZN_EXCHANGE_USER_AUTH=user:password
      `;
      mockReadFile.mockResolvedValueOnce(configContent);

      const result = await loadCredentialsFromFile('/path/to/config.cfg');

      expect(result).toEqual({
        orgId: 'test-org',
        userAuth: 'user:password',
        exchangeUrl: 'http://exchange.example.com/v1',
      });
    });

    it('should return null when required vars are missing from file', async () => {
      const configContent = `
HZN_EXCHANGE_URL=http://exchange.example.com/v1
      `;
      mockReadFile.mockResolvedValueOnce(configContent);

      const result = await loadCredentialsFromFile('/path/to/config.cfg');

      expect(result).toBeNull();
    });

    it('should throw ExchangeAuthError when config file not found', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockReadFile.mockRejectedValueOnce(error);

      await expect(loadCredentialsFromFile('/nonexistent/config.cfg'))
        .rejects.toThrow(/Configuration file not found/);
    });

    it('should throw ExchangeAuthError when creds file not found', async () => {
      const configContent = 'HZN_EXCHANGE_URL=http://example.com/v1';
      mockReadFile.mockResolvedValueOnce(configContent);

      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockReadFile.mockRejectedValueOnce(error);

      await expect(loadCredentialsFromFile('/path/to/config.cfg', '/nonexistent/creds.env'))
        .rejects.toThrow(/Credentials file not found/);
    });
  });

  describe('validateCredentials', () => {
    const validCredentials: ExchangeCredentials = {
      orgId: 'test-org',
      userAuth: 'user:password',
      exchangeUrl: 'http://exchange.example.com/v1',
    };

    it('should return authenticated for valid credentials', () => {
      const result = validateCredentials(validCredentials);

      expect(result.authenticated).toBe(true);
      expect(result.credentials).toEqual(validCredentials);
      expect(result.error).toBeUndefined();
    });

    it('should fail when orgId is empty', () => {
      const result = validateCredentials({
        ...validCredentials,
        orgId: '',
      });

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('Organization ID');
    });

    it('should fail when orgId is whitespace', () => {
      const result = validateCredentials({
        ...validCredentials,
        orgId: '   ',
      });

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('Organization ID');
    });

    it('should fail when userAuth is empty', () => {
      const result = validateCredentials({
        ...validCredentials,
        userAuth: '',
      });

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('User authentication');
    });

    it('should fail when userAuth missing colon separator', () => {
      const result = validateCredentials({
        ...validCredentials,
        userAuth: 'userpassword',
      });

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('user:password');
    });

    it('should accept userAuth with multiple colons', () => {
      const result = validateCredentials({
        ...validCredentials,
        userAuth: 'user:pass:word:extra',
      });

      expect(result.authenticated).toBe(true);
    });

    it('should fail when exchangeUrl is empty', () => {
      const result = validateCredentials({
        ...validCredentials,
        exchangeUrl: '',
      });

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('Exchange URL');
    });

    it('should fail when exchangeUrl is invalid', () => {
      const result = validateCredentials({
        ...validCredentials,
        exchangeUrl: 'not-a-valid-url',
      });

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('valid URL');
    });

    it('should report multiple errors', () => {
      const result = validateCredentials({
        orgId: '',
        userAuth: 'invalid',
        exchangeUrl: 'invalid',
      });

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('Organization ID');
      expect(result.error).toContain('user:password');
      expect(result.error).toContain('valid URL');
    });
  });

  describe('verifyExchangeConnection', () => {
    const credentials: ExchangeCredentials = {
      orgId: 'test-org',
      userAuth: 'user:password',
      exchangeUrl: 'http://exchange.example.com/v1',
    };

    it('should return connected when hzn exchange status succeeds', async () => {
      const stdout = 'Exchange version: 2.30.0\nStatus: OK';
      mockExec.mockImplementationOnce(createMockExec(null, stdout, ''));

      const result = await verifyExchangeConnection(credentials);

      expect(result.connected).toBe(true);
      expect(result.exchangeVersion).toBe('2.30.0');
      expect(result.error).toBeUndefined();
    });

    it('should return connected without version if not parseable', async () => {
      const stdout = 'Status: OK';
      mockExec.mockImplementationOnce(createMockExec(null, stdout, ''));

      const result = await verifyExchangeConnection(credentials);

      expect(result.connected).toBe(true);
      expect(result.exchangeVersion).toBeUndefined();
    });

    it('should return not connected when CLI not found', async () => {
      const error = new Error('Command not found') as Error & { code: number };
      error.code = 127;
      mockExec.mockImplementationOnce(createMockExec(error, '', ''));

      const result = await verifyExchangeConnection(credentials);

      expect(result.connected).toBe(false);
      expect(result.error).toContain('hzn CLI not found');
    });

    it('should return not connected on authentication failure', async () => {
      const error = new Error('Authentication failed');
      mockExec.mockImplementationOnce(createMockExec(error, '', '401 Unauthorized'));

      const result = await verifyExchangeConnection(credentials);

      expect(result.connected).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    it('should return not connected on connection refused', async () => {
      const error = new Error('Connection failed');
      mockExec.mockImplementationOnce(createMockExec(error, '', 'ECONNREFUSED'));

      const result = await verifyExchangeConnection(credentials);

      expect(result.connected).toBe(false);
      expect(result.error).toContain('Cannot connect to Exchange');
    });

    it('should return generic error message for unknown errors', async () => {
      const error = new Error('Something went wrong');
      mockExec.mockImplementationOnce(createMockExec(error, '', ''));

      const result = await verifyExchangeConnection(credentials);

      expect(result.connected).toBe(false);
      expect(result.error).toContain('Something went wrong');
    });
  });

  describe('verifyUserAuth', () => {
    const credentials: ExchangeCredentials = {
      orgId: 'test-org',
      userAuth: 'testuser:password',
      exchangeUrl: 'http://exchange.example.com/v1',
    };

    it('should return valid when hzn exchange user list succeeds', async () => {
      const stdout = '{\n  "testuser": {\n    "admin": false,\n    "email": "test@example.com"\n  }\n}';
      mockExec.mockImplementationOnce(createMockExec(null, stdout, ''));

      const result = await verifyUserAuth(credentials);

      expect(result.valid).toBe(true);
      expect(result.username).toBe('testuser');
      expect(result.error).toBeUndefined();
    });

    it('should extract username from credentials', async () => {
      const credsWithComplexPassword: ExchangeCredentials = {
        ...credentials,
        userAuth: 'admin:pass:with:colons',
      };
      mockExec.mockImplementationOnce(createMockExec(null, '{}', ''));

      const result = await verifyUserAuth(credsWithComplexPassword);

      expect(result.valid).toBe(true);
      expect(result.username).toBe('admin');
    });

    it('should return invalid when CLI not found', async () => {
      const error = new Error('Command not found') as Error & { code: number };
      error.code = 127;
      mockExec.mockImplementationOnce(createMockExec(error, '', ''));

      const result = await verifyUserAuth(credentials);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('hzn CLI not found');
    });

    it('should return invalid on 401 authentication failure', async () => {
      const error = new Error('Authentication failed');
      mockExec.mockImplementationOnce(createMockExec(error, '', '401 Unauthorized'));

      const result = await verifyUserAuth(credentials);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid credentials');
    });

    it('should return invalid when user not found', async () => {
      const error = new Error('User not found');
      mockExec.mockImplementationOnce(createMockExec(error, '', 'user does not exist'));

      const result = await verifyUserAuth(credentials);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('User not found');
    });

    it('should return invalid on connection refused', async () => {
      const error = new Error('Connection failed');
      mockExec.mockImplementationOnce(createMockExec(error, '', 'ECONNREFUSED'));

      const result = await verifyUserAuth(credentials);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot connect to Exchange');
    });

    it('should return generic error for unknown failures', async () => {
      const error = new Error('Unknown error occurred');
      mockExec.mockImplementationOnce(createMockExec(error, '', ''));

      const result = await verifyUserAuth(credentials);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown error occurred');
    });
  });

  describe('getCredentials', () => {
    it('should return env credentials when available', async () => {
      process.env.HZN_ORG_ID = 'env-org';
      process.env.HZN_EXCHANGE_USER_AUTH = 'env-user:pass';
      process.env.HZN_EXCHANGE_URL = 'http://env.example.com/v1';

      const result = await getCredentials();

      expect(result).toEqual({
        orgId: 'env-org',
        userAuth: 'env-user:pass',
        exchangeUrl: 'http://env.example.com/v1',
      });
    });

    it('should prefer env credentials over file credentials', async () => {
      process.env.HZN_ORG_ID = 'env-org';
      process.env.HZN_EXCHANGE_USER_AUTH = 'env-user:pass';
      process.env.HZN_EXCHANGE_URL = 'http://env.example.com/v1';

      const configContent = `
HZN_ORG_ID=file-org
HZN_EXCHANGE_USER_AUTH=file-user:pass
HZN_EXCHANGE_URL=http://file.example.com/v1
      `;
      mockReadFile.mockResolvedValueOnce(configContent);

      const result = await getCredentials('/path/to/config.cfg');

      expect(result?.orgId).toBe('env-org');
    });

    it('should fall back to file credentials when env not set', async () => {
      delete process.env.HZN_ORG_ID;
      delete process.env.HZN_EXCHANGE_USER_AUTH;
      delete process.env.HZN_EXCHANGE_URL;

      const configContent = `
HZN_ORG_ID=file-org
HZN_EXCHANGE_USER_AUTH=file-user:pass
HZN_EXCHANGE_URL=http://file.example.com/v1
      `;
      mockReadFile.mockResolvedValueOnce(configContent);

      const result = await getCredentials('/path/to/config.cfg');

      expect(result).toEqual({
        orgId: 'file-org',
        userAuth: 'file-user:pass',
        exchangeUrl: 'http://file.example.com/v1',
      });
    });

    it('should return null when no credentials available', async () => {
      delete process.env.HZN_ORG_ID;
      delete process.env.HZN_EXCHANGE_USER_AUTH;
      delete process.env.HZN_EXCHANGE_URL;

      const result = await getCredentials();

      expect(result).toBeNull();
    });
  });
});

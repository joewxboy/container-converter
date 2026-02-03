import { ComposeParser } from '../../../src/parser/compose-parser';
import { DockerfileParseError } from '../../../src/utils/errors';
import path from 'path';

describe('ComposeParser', () => {
  let parser: ComposeParser;

  beforeEach(() => {
    parser = new ComposeParser();
  });

  describe('parseFile', () => {
    it('should parse simple compose file', async () => {
      const filePath = path.join(__dirname, '../../fixtures/compose/simple.docker-compose.yml');
      const result = await parser.parseFile(filePath);

      expect(result.services).toBeDefined();
      expect(result.services.web).toBeDefined();
      expect(result.services.web.image).toBe('nginx:alpine');
      expect(result.services.web.ports).toHaveLength(1);
      expect(result.services.web.environment).toBeDefined();
    });

    it('should parse multi-service compose file', async () => {
      const filePath = path.join(
        __dirname,
        '../../fixtures/compose/multi-service.docker-compose.yml'
      );
      const result = await parser.parseFile(filePath);

      expect(Object.keys(result.services)).toHaveLength(3);
      expect(result.services.web).toBeDefined();
      expect(result.services.api).toBeDefined();
      expect(result.services.cache).toBeDefined();
    });

    it('should parse compose file with dependencies', async () => {
      const filePath = path.join(
        __dirname,
        '../../fixtures/compose/with-dependencies.docker-compose.yml'
      );
      const result = await parser.parseFile(filePath);

      expect(result.services.api.depends_on).toBeDefined();
      expect(result.services.api.depends_on).toEqual(['db', 'cache']);
      expect(result.services.web.depends_on).toEqual(['api']);
      expect(result.volumes).toBeDefined();
      expect(result.volumes?.['db-data']).toBeDefined();
    });

    it('should parse legacy v2.x compose file', async () => {
      const filePath = path.join(__dirname, '../../fixtures/compose/v2-legacy.docker-compose.yml');
      const result = await parser.parseFile(filePath);

      expect(result.version).toBe('2.4');
      expect(result.services.web).toBeDefined();
      expect(result.services.db).toBeDefined();
      expect(result.volumes).toBeDefined();
    });

    it('should throw error for non-existent file', async () => {
      await expect(parser.parseFile('/nonexistent/file.yml')).rejects.toThrow(DockerfileParseError);
      await expect(parser.parseFile('/nonexistent/file.yml')).rejects.toThrow(
        'Compose file not found'
      );
    });
  });

  describe('parse', () => {
    it('should parse basic YAML structure', () => {
      const yaml = `
services:
  app:
    image: node:18
    ports:
      - "3000:3000"
`;
      const result = parser.parse(yaml);

      expect(result.services.app).toBeDefined();
      expect(result.services.app.image).toBe('node:18');
    });

    it('should throw error for invalid YAML', () => {
      const invalidYaml = `
services:
  app:
    image: node:18
    invalid: [
`;
      expect(() => parser.parse(invalidYaml)).toThrow(DockerfileParseError);
    });

    it('should throw error for compose file without services', () => {
      const yaml = `
version: '3'
networks:
  default:
`;
      expect(() => parser.parse(yaml)).toThrow('must contain at least one service');
    });
  });

  describe('environment variable substitution', () => {
    beforeEach(() => {
      process.env.TEST_VAR = 'test-value';
      process.env.TEST_PORT = '8080';
    });

    afterEach(() => {
      delete process.env.TEST_VAR;
      delete process.env.TEST_PORT;
    });

    it('should substitute simple environment variables', () => {
      const yaml = `
services:
  app:
    image: \${TEST_VAR}:latest
    ports:
      - "\${TEST_PORT}:80"
`;
      const result = parser.parse(yaml);

      expect(result.services.app.image).toBe('test-value:latest');
      expect(result.services.app.ports?.[0]).toEqual({
        target: 80,
        published: 8080,
      });
    });

    it('should use default values for unset variables', () => {
      const yaml = `
services:
  app:
    image: \${UNSET_VAR:-default-image}:latest
    environment:
      KEY: \${UNSET_VAR-fallback}
`;
      const result = parser.parse(yaml);

      expect(result.services.app.image).toBe('default-image:latest');
      expect(result.services.app.environment).toEqual({ KEY: 'fallback' });
    });

    it('should handle empty variable with :- syntax', () => {
      process.env.EMPTY_VAR = '';
      const yaml = `
services:
  app:
    image: \${EMPTY_VAR:-default}:latest
`;
      const result = parser.parse(yaml);

      expect(result.services.app.image).toBe('default:latest');
      delete process.env.EMPTY_VAR;
    });
  });

  describe('port normalization', () => {
    it('should normalize simple port strings', () => {
      const yaml = `
services:
  app:
    image: nginx
    ports:
      - "80"
      - "443"
`;
      const result = parser.parse(yaml);

      expect(result.services.app.ports).toEqual([{ target: 80 }, { target: 443 }]);
    });

    it('should normalize port mappings', () => {
      const yaml = `
services:
  app:
    image: nginx
    ports:
      - "8080:80"
      - "8443:443/tcp"
      - "127.0.0.1:9090:9000"
`;
      const result = parser.parse(yaml);

      expect(result.services.app.ports).toEqual([
        { target: 80, published: 8080 },
        { target: 443, published: 8443, protocol: 'tcp' },
        { host_ip: '127.0.0.1', target: 9000, published: 9090 },
      ]);
    });

    it('should handle numeric ports', () => {
      const yaml = `
services:
  app:
    image: nginx
    ports:
      - 3000
`;
      const result = parser.parse(yaml);

      expect(result.services.app.ports).toEqual([{ target: 3000 }]);
    });

    it('should preserve long-form port syntax', () => {
      const yaml = `
services:
  app:
    image: nginx
    ports:
      - target: 80
        published: 8080
        protocol: tcp
        mode: host
`;
      const result = parser.parse(yaml);

      expect(result.services.app.ports).toEqual([
        {
          target: 80,
          published: 8080,
          protocol: 'tcp',
          mode: 'host',
        },
      ]);
    });
  });

  describe('environment normalization', () => {
    it('should convert environment array to object', () => {
      const yaml = `
services:
  app:
    image: node
    environment:
      - NODE_ENV=production
      - PORT=3000
      - API_KEY=secret123
`;
      const result = parser.parse(yaml);

      expect(result.services.app.environment).toEqual({
        NODE_ENV: 'production',
        PORT: '3000',
        API_KEY: 'secret123',
      });
    });

    it('should handle environment with equals in value', () => {
      const yaml = `
services:
  app:
    image: node
    environment:
      - CONNECTION_STRING=postgresql://user:pass=word@host/db
`;
      const result = parser.parse(yaml);

      expect(result.services.app.environment).toEqual({
        CONNECTION_STRING: 'postgresql://user:pass=word@host/db',
      });
    });

    it('should preserve environment object format', () => {
      const yaml = `
services:
  app:
    image: node
    environment:
      NODE_ENV: production
      PORT: 3000
`;
      const result = parser.parse(yaml);

      expect(result.services.app.environment).toEqual({
        NODE_ENV: 'production',
        PORT: 3000,
      });
    });
  });

  describe('command normalization', () => {
    it('should convert string command to array with shell', () => {
      const yaml = `
services:
  app:
    image: node
    command: npm start
`;
      const result = parser.parse(yaml);

      expect(result.services.app.command).toEqual(['/bin/sh', '-c', 'npm start']);
    });

    it('should preserve array commands', () => {
      const yaml = `
services:
  app:
    image: node
    command: ["node", "server.js"]
`;
      const result = parser.parse(yaml);

      expect(result.services.app.command).toEqual(['node', 'server.js']);
    });

    it('should convert string entrypoint to array with shell', () => {
      const yaml = `
services:
  app:
    image: node
    entrypoint: /app/entrypoint.sh
`;
      const result = parser.parse(yaml);

      expect(result.services.app.entrypoint).toEqual(['/bin/sh', '-c', '/app/entrypoint.sh']);
    });
  });

  describe('complex features', () => {
    it('should parse compose file with all features', async () => {
      const filePath = path.join(
        __dirname,
        '../../fixtures/compose/complex-features.docker-compose.yml'
      );
      const result = await parser.parseFile(filePath);

      const app = result.services.app;
      expect(app.image).toBe('myapp:latest');
      expect(app.privileged).toBe(true);
      expect(app.working_dir).toBe('/app');
      expect(app.user).toBe('1000:1000');
      expect(app.tmpfs).toEqual(['/tmp', '/run']);
      expect(app.labels).toEqual({
        'com.example.version': '1.0',
        'com.example.team': 'backend',
      });
    });
  });

  describe('real-world examples', () => {
    it('should parse WordPress compose file', async () => {
      const filePath = path.join(__dirname, '../../fixtures/compose/wordpress.docker-compose.yml');
      const result = await parser.parseFile(filePath);

      expect(result.services.wordpress).toBeDefined();
      expect(result.services.db).toBeDefined();
      expect(result.services.wordpress.depends_on).toEqual(['db']);
      expect(result.volumes).toBeDefined();
      expect(Object.keys(result.volumes || {})).toHaveLength(2);
    });
  });
});

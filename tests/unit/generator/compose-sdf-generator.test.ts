import { ComposeSdfGenerator } from '../../../src/generator/compose-sdf-generator';
import type { ComposeData, ComposeService } from '../../../src/types/compose';
import { SDFGenerationError } from '../../../src/utils/errors';

describe('ComposeSdfGenerator', () => {
  let generator: ComposeSdfGenerator;

  beforeEach(() => {
    generator = new ComposeSdfGenerator();
  });

  describe('inferStrategy', () => {
    it('should infer single-sdf for simple compose (1-3 services, no deps)', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
          api: { image: 'node:18' },
        },
      };

      const result = generator.generate(composeData);
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('deployment');
    });

    it('should infer multi-sdf for compose with 4+ services', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
          api: { image: 'node:18' },
          db: { image: 'postgres:15' },
          cache: { image: 'redis:7' },
        },
      };

      const result = generator.generate(composeData);
      expect(result).toHaveProperty('sdfs');
      expect(result).toHaveProperty('dependencyGraph');
    });

    it('should infer multi-sdf for compose with dependencies', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', depends_on: ['api'] },
          api: { image: 'node:18' },
        },
      };

      const result = generator.generate(composeData);
      expect(result).toHaveProperty('sdfs');
      expect(result).toHaveProperty('dependencyGraph');
    });

    it('should infer multi-sdf for compose with multiple networks', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
          api: { image: 'node:18' },
        },
        networks: {
          frontend: {},
          backend: {},
        },
      };

      const result = generator.generate(composeData);
      expect(result).toHaveProperty('sdfs');
      expect(result).toHaveProperty('dependencyGraph');
    });

    it('should respect explicit strategy option', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      expect(result).toHaveProperty('sdfs');
      expect(result).toHaveProperty('dependencyGraph');
    });
  });

  describe('mapPort', () => {
    it('should map numeric port', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', ports: [3000] },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.ports).toEqual([
          { HostIP: '0.0.0.0', HostPort: '3000:3000/tcp' },
        ]);
      }
    });

    it('should map string port', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', ports: ['8080'] },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.ports).toEqual([
          { HostIP: '0.0.0.0', HostPort: '8080:8080/tcp' },
        ]);
      }
    });

    it('should map port object with published and target', () => {
      const composeData: ComposeData = {
        services: {
          web: {
            image: 'nginx:alpine',
            ports: [{ target: 80, published: 8080, protocol: 'tcp' }],
          },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.ports).toEqual([
          { HostIP: '0.0.0.0', HostPort: '8080:80/tcp' },
        ]);
      }
    });

    it('should default to tcp protocol', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', ports: [{ target: 80, published: 8080 }] },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.ports).toEqual([
          { HostIP: '0.0.0.0', HostPort: '8080:80/tcp' },
        ]);
      }
    });

    it('should use target as published if not specified', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', ports: [{ target: 3000 }] },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.ports).toEqual([
          { HostIP: '0.0.0.0', HostPort: '3000:3000/tcp' },
        ]);
      }
    });
  });

  describe('mapVolume', () => {
    it('should preserve string volume format', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', volumes: ['/host/path:/container/path:rw'] },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.binds).toEqual(['/host/path:/container/path:rw']);
      }
    });

    it('should map volume object with source and target', () => {
      const composeData: ComposeData = {
        services: {
          web: {
            image: 'nginx:alpine',
            volumes: [{ type: 'bind', source: '/host', target: '/container', read_only: false }],
          },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.binds).toEqual(['/host:/container:rw']);
      }
    });

    it('should map read-only volumes', () => {
      const composeData: ComposeData = {
        services: {
          web: {
            image: 'nginx:alpine',
            volumes: [{ type: 'bind', source: '/host', target: '/container', read_only: true }],
          },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.binds).toEqual(['/host:/container:ro']);
      }
    });

    it('should handle volume without source', () => {
      const composeData: ComposeData = {
        services: {
          web: {
            image: 'nginx:alpine',
            volumes: [{ type: 'bind', target: '/container' }],
          },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.binds).toEqual(['/container']);
      }
    });
  });

  describe('mapCommand', () => {
    it('should map entrypoint only', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', entrypoint: ['nginx', '-g', 'daemon off;'] },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.command).toEqual(['nginx', '-g', 'daemon off;']);
      }
    });

    it('should map command only', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'node:18', command: ['npm', 'start'] },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.command).toEqual(['npm', 'start']);
      }
    });

    it('should combine entrypoint and command', () => {
      const composeData: ComposeData = {
        services: {
          web: {
            image: 'node:18',
            entrypoint: ['node'],
            command: ['server.js'],
          },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.command).toEqual(['node', 'server.js']);
      }
    });

    it('should handle no command or entrypoint', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.command).toBeUndefined();
      }
    });
  });

  describe('extractDependencies', () => {
    it('should extract array dependencies', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', depends_on: ['api', 'db'] },
          api: { image: 'node:18' },
          db: { image: 'postgres:15' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      if ('dependencyGraph' in result) {
        expect(result.dependencyGraph.web).toEqual(['api', 'db']);
      }
    });

    it('should extract object dependencies', () => {
      const composeData: ComposeData = {
        services: {
          web: {
            image: 'nginx:alpine',
            depends_on: {
              api: { condition: 'service_started' },
              db: { condition: 'service_healthy' },
            },
          },
          api: { image: 'node:18' },
          db: { image: 'postgres:15' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      if ('dependencyGraph' in result) {
        expect(result.dependencyGraph.web).toEqual(['api', 'db']);
      }
    });

    it('should return empty array for no dependencies', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'multi-sdf' });
      if ('dependencyGraph' in result) {
        expect(result.dependencyGraph.web).toEqual([]);
      }
    });
  });

  describe('mapComposeServiceToSdfService', () => {
    it('should throw error if image is missing', () => {
      const composeData: ComposeData = {
        services: {
          web: {} as ComposeService,
        },
      };

      expect(() => generator.generate(composeData)).toThrow(SDFGenerationError);
      expect(() => generator.generate(composeData)).toThrow(
        "Service 'web' must specify an 'image' field"
      );
    });

    it('should map service with all fields', () => {
      const composeData: ComposeData = {
        services: {
          web: {
            image: 'nginx:alpine',
            ports: [{ target: 80, published: 8080 }],
            environment: { NODE_ENV: 'production', PORT: '3000' },
            command: ['nginx', '-g', 'daemon off;'],
            volumes: ['/host:/container:rw'],
            privileged: true,
            tmpfs: ['/tmp', '/run'],
          },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        const service = result.deployment.services.web;
        expect(service.image).toBe('nginx:alpine');
        expect(service.ports).toHaveLength(1);
        expect(service.environment).toEqual(['NODE_ENV=production', 'PORT=3000']);
        expect(service.command).toEqual(['nginx', '-g', 'daemon off;']);
        expect(service.binds).toEqual(['/host:/container:rw']);
        expect(service.privileged).toBe(true);
        expect(service.tmpfs).toEqual({ '/tmp': '', '/run': '' });
      }
    });

    it('should map service with minimal fields', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        const service = result.deployment.services.web;
        expect(service.image).toBe('nginx:alpine');
        expect(service.ports).toBeUndefined();
        expect(service.environment).toBeUndefined();
        expect(service.command).toBeUndefined();
        expect(service.binds).toBeUndefined();
        expect(service.privileged).toBeUndefined();
      }
    });

    it('should convert environment array to KEY=VALUE format', () => {
      const composeData: ComposeData = {
        services: {
          web: {
            image: 'nginx:alpine',
            environment: ['NODE_ENV=production', 'PORT=3000'],
          },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.environment).toEqual([
          'NODE_ENV=production',
          'PORT=3000',
        ]);
      }
    });

    it('should handle tmpfs as string', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', tmpfs: '/tmp' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });
      if ('deployment' in result) {
        expect(result.deployment.services.web.tmpfs).toEqual({ '/tmp': '' });
      }
    });
  });

  describe('generateSingleSdf', () => {
    it('should generate single SDF with all services', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
          api: { image: 'node:18' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });

      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('deployment');
      if ('deployment' in result) {
        expect(Object.keys(result.deployment.services)).toHaveLength(2);
        expect(result.deployment.services.web).toBeDefined();
        expect(result.deployment.services.api).toBeDefined();
      }
    });

    it('should use custom project name', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, {
        strategy: 'single-sdf',
        projectName: 'my-project',
      });

      if ('label' in result) {
        expect(result.label).toBe('my-project');
        expect(result.url).toBe('my-project');
      }
    });

    it('should use compose name if no project name provided', () => {
      const composeData: ComposeData = {
        name: 'compose-app',
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });

      if ('label' in result) {
        expect(result.label).toBe('compose-app');
      }
    });

    it('should default to compose-project if no name', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });

      if ('label' in result) {
        expect(result.label).toBe('compose-project');
      }
    });

    it('should set sharable to multiple', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'single-sdf' });

      if ('sharable' in result) {
        expect(result.sharable).toBe('multiple');
      }
    });

    it('should include organization if provided', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, {
        strategy: 'single-sdf',
        organization: 'myorg',
      });

      if ('org' in result) {
        expect(result.org).toBe('myorg');
      }
    });

    it('should use custom version and architecture', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, {
        strategy: 'single-sdf',
        version: '2.0.0',
        architecture: 'arm64',
      });

      if ('version' in result && 'arch' in result) {
        expect(result.version).toBe('2.0.0');
        expect(result.arch).toBe('arm64');
      }
    });
  });

  describe('generateMultiSdf', () => {
    it('should generate one SDF per service', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
          api: { image: 'node:18' },
          db: { image: 'postgres:15' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'multi-sdf' });

      if ('sdfs' in result) {
        expect(Object.keys(result.sdfs)).toHaveLength(3);
        expect(result.sdfs.web).toBeDefined();
        expect(result.sdfs.api).toBeDefined();
        expect(result.sdfs.db).toBeDefined();
      }
    });

    it('should set correct service URLs', () => {
      const composeData: ComposeData = {
        name: 'myapp',
        services: {
          web: { image: 'nginx:alpine' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'multi-sdf' });

      if ('sdfs' in result) {
        expect(result.sdfs.web.url).toBe('myapp.web');
      }
    });

    it('should map dependencies to requiredServices', () => {
      const composeData: ComposeData = {
        name: 'myapp',
        services: {
          web: { image: 'nginx:alpine', depends_on: ['api'] },
          api: { image: 'node:18', depends_on: ['db'] },
          db: { image: 'postgres:15' },
        },
      };

      const result = generator.generate(composeData, {
        strategy: 'multi-sdf',
        organization: 'myorg',
        version: '1.0.0',
        architecture: 'amd64',
      });

      if ('sdfs' in result) {
        expect(result.sdfs.web.requiredServices).toEqual([
          {
            url: 'myapp.api',
            org: 'myorg',
            versionRange: '1.0.0',
            arch: 'amd64',
          },
        ]);
        expect(result.sdfs.api.requiredServices).toEqual([
          {
            url: 'myapp.db',
            org: 'myorg',
            versionRange: '1.0.0',
            arch: 'amd64',
          },
        ]);
        expect(result.sdfs.db.requiredServices).toBeUndefined();
      }
    });

    it('should set sharable to singleton for privileged services', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', privileged: true },
          api: { image: 'node:18' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'multi-sdf' });

      if ('sdfs' in result) {
        expect(result.sdfs.web.sharable).toBe('singleton');
        expect(result.sdfs.api.sharable).toBe('multiple');
      }
    });

    it('should build correct dependency graph', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine', depends_on: ['api'] },
          api: { image: 'node:18', depends_on: ['db', 'cache'] },
          db: { image: 'postgres:15' },
          cache: { image: 'redis:7' },
        },
      };

      const result = generator.generate(composeData, { strategy: 'multi-sdf' });

      if ('dependencyGraph' in result) {
        expect(result.dependencyGraph.web).toEqual(['api']);
        expect(result.dependencyGraph.api).toEqual(['db', 'cache']);
        expect(result.dependencyGraph.db).toEqual([]);
        expect(result.dependencyGraph.cache).toEqual([]);
      }
    });

    it('should include organization in all SDFs', () => {
      const composeData: ComposeData = {
        services: {
          web: { image: 'nginx:alpine' },
          api: { image: 'node:18' },
        },
      };

      const result = generator.generate(composeData, {
        strategy: 'multi-sdf',
        organization: 'myorg',
      });

      if ('sdfs' in result) {
        expect(result.sdfs.web.org).toBe('myorg');
        expect(result.sdfs.api.org).toBe('myorg');
      }
    });
  });
});

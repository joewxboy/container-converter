# Agent Guidelines for Container Converter

## Project Overview
This is a TypeScript/Node.js tool that converts Dockerfiles into Open Horizon Service Definition Files (SDFs). The tool parses Dockerfiles, extracts service information, and generates valid SDF JSON files for deployment on Open Horizon edge computing platforms.

## Build and Development Commands

### Installation
```bash
npm install
```

### Development
```bash
npm run dev          # Start development server with hot reload
npm run build        # Build production bundle
npm run build:dev    # Build development bundle
```

### Testing
```bash
npm test                    # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage report
npm run test -- --testNamePattern="specific test name"  # Run single test
npm run test -- --testPathPattern="test-file-name"      # Run tests in specific file
```

### Code Quality
```bash
npm run lint               # Run ESLint
npm run lint:fix          # Auto-fix ESLint issues
npm run format            # Format code with Prettier
npm run typecheck         # Run TypeScript type checking
npm run typecheck:watch   # Watch mode for type checking
```

### Validation
```bash
npm run validate          # Run full validation (lint + typecheck + test)
hzn service verify -f <sdf-file>        # Validate SDF locally with Open Horizon CLI
hzn exchange service verify <sdf-file>  # Validate SDF against Exchange
```

## Code Style Guidelines

### TypeScript/JavaScript Conventions

#### Imports and Exports
- Use ES6 imports/exports exclusively
- Group imports by type: external libraries, internal modules, types
- Sort imports alphabetically within groups
- Use absolute imports for internal modules when possible

```typescript
// Good
import { promises as fs } from 'fs';
import path from 'path';

import { DockerfileParser } from '../parser/dockerfile-parser';
import { SDFGenerator } from '../generator/sdf-generator';
import type { ServiceDefinition } from '../types/sdf';

// Bad - mixed styles, no grouping
import type { ServiceDefinition } from '../types/sdf';
import { DockerfileParser } from '../parser/dockerfile-parser';
import path from 'path';
import { promises as fs } from 'fs';
```

#### Naming Conventions
- **Variables/Functions**: camelCase (`parseDockerfile`, `serviceName`)
- **Classes/Types**: PascalCase (`DockerfileParser`, `ServiceDefinition`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_VERSION`, `SUPPORTED_ARCHITECTURES`)
- **Files**: kebab-case (`dockerfile-parser.ts`, `service-definition.ts`)
- **Directories**: kebab-case (`src/parser/`, `src/generator/`)

#### Types and Interfaces
- Use explicit types for all function parameters and return values
- Prefer interfaces over types for object definitions
- Use union types for discriminated unions
- Avoid `any` type; use `unknown` when type is truly unknown

```typescript
// Good
interface ServiceMetadata {
  name: string;
  version: string;
  architecture: 'amd64' | 'arm64' | 'arm';
}

function parseDockerfile(path: string): Promise<DockerfileAST> {
  // implementation
}

// Bad - missing types, using any
function parseDockerfile(path) {
  return something as any;
}
```

#### Error Handling
- Use custom error classes that extend `Error`
- Include context and recovery suggestions in error messages
- Prefer async/await with try/catch over Promise chains
- Validate inputs at function boundaries

```typescript
// Good
class DockerfileParseError extends Error {
  constructor(message: string, public readonly line?: number) {
    super(`Dockerfile parsing failed: ${message}${line ? ` at line ${line}` : ''}`);
    this.name = 'DockerfileParseError';
  }
}

async function readDockerfile(path: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf-8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new DockerfileParseError(`File not found: ${path}`);
    }
    throw new DockerfileParseError(`Failed to read file: ${error.message}`);
  }
}
```

### Code Structure

#### File Organization
```
src/
├── cli/           # Command-line interface
├── mcp/           # MCP Server implementation
├── tui/           # Interactive terminal UI (MCP Client)
├── parser/        # Dockerfile parsing logic
├── generator/     # SDF generation logic
├── validator/     # SDF validation logic
├── publisher/     # Exchange authentication and publishing
├── types/         # TypeScript type definitions
├── utils/         # Shared utilities
└── index.ts       # Main entry point

tests/
├── unit/          # Unit tests
├── integration/   # Integration tests
└── fixtures/      # Test data and examples
```

#### Class Design
- Single Responsibility Principle: each class should have one reason to change
- Dependency Injection for testability
- Interface segregation for flexibility

```typescript
// Good
interface DockerfileParser {
  parse(content: string): Promise<DockerfileAST>;
}

interface SDFGenerator {
  generate(ast: DockerfileAST, metadata: ServiceMetadata): ServiceDefinition;
}

class ContainerConverter {
  constructor(
    private parser: DockerfileParser,
    private generator: SDFGenerator
  ) {}

  async convert(dockerfilePath: string): Promise<ServiceDefinition> {
    const content = await fs.readFile(dockerfilePath, 'utf-8');
    const ast = await this.parser.parse(content);
    return this.generator.generate(ast, this.inferMetadata(ast));
  }
}
```

### Testing Guidelines

#### Test Structure
- Use descriptive test names that explain the behavior being tested
- Arrange-Act-Assert (AAA) pattern
- One assertion per test when possible
- Use meaningful test data and fixtures

```typescript
describe('DockerfileParser', () => {
  describe('parse', () => {
    it('should parse FROM instruction correctly', async () => {
      // Arrange
      const parser = new DockerfileParser();
      const dockerfile = 'FROM node:18-alpine\nEXPOSE 3000';

      // Act
      const result = await parser.parse(dockerfile);

      // Assert
      expect(result.baseImage).toBe('node:18-alpine');
      expect(result.exposedPorts).toEqual([3000]);
    });

    it('should throw DockerfileParseError for invalid syntax', async () => {
      const parser = new DockerfileParser();
      const invalidDockerfile = 'INVALID instruction';

      await expect(parser.parse(invalidDockerfile))
        .rejects.toThrow(DockerfileParseError);
    });
  });
});
```

#### Test Coverage
- Aim for >90% code coverage
- Cover both happy path and error scenarios
- Test edge cases and boundary conditions
- Use integration tests for end-to-end workflows

#### Mocking External Dependencies
- Mock `child_process.exec` for CLI-dependent tests
- Use `jest.mock('child_process')` and mock the callback pattern
- Note: Node's `promisify(exec)` expects callback with `(error, { stdout, stderr })`
- Mock `fs/promises` for file system operations in unit tests

### Documentation

#### Code Comments
- Use JSDoc for public APIs
- Explain complex business logic
- Document assumptions and limitations

```typescript
/**
 * Converts a Dockerfile to an Open Horizon Service Definition File
 * @param dockerfilePath - Path to the Dockerfile to convert
 * @param options - Conversion options
 * @returns Promise resolving to the generated SDF
 * @throws {DockerfileParseError} If the Dockerfile cannot be parsed
 * @throws {ValidationError} If the generated SDF is invalid
 */
export async function convertDockerfile(
  dockerfilePath: string,
  options: ConversionOptions = {}
): Promise<ServiceDefinition> {
  // Complex logic here...
}
```

#### Commit Messages
- Use conventional commits format
- Include scope when relevant
- Be descriptive but concise

```
feat(parser): add support for multi-stage Dockerfiles
fix(generator): handle empty ENV instructions correctly
test: add integration test for complex service conversion
docs: update CLI usage examples
```

### Security Considerations

#### Input Validation
- Validate all file paths before reading
- Sanitize user inputs that become part of SDFs
- Check file sizes to prevent resource exhaustion

#### Secrets Handling
- Never log sensitive information
- Use environment variables for credentials
- Validate Open Horizon Exchange credentials before use

```typescript
// Good - secure credential handling
async function authenticateExchange(credentials: ExchangeCredentials): Promise<void> {
  // Validate credentials format
  if (!credentials.apiKey || !credentials.url) {
    throw new Error('Invalid exchange credentials');
  }

  // Use credentials without logging
  try {
    await hzn.authenticate(credentials);
  } catch (error) {
    throw new Error('Exchange authentication failed');
  }
}
```

### Performance Guidelines

#### Async Operations
- Use async/await consistently
- Handle concurrent operations with Promise.all when independent
- Implement proper cancellation for long-running operations

#### Memory Management
- Stream large files instead of loading entirely into memory
- Clean up resources in finally blocks
- Avoid memory leaks in long-running processes

### Open Horizon SDF Compliance

#### Required Fields
- Always include: `label`, `description`, `url`, `version`, `arch`, `sharable`, `deployment`
- Validate SDF structure before output using `SDFValidator.validateSchema()`
- Use sensible defaults for optional fields

#### Schema Validation
- Use `SDFValidator` class for validation (`src/validator/sdf-validator.ts`)
- `validateSchema()` - Local structure validation without CLI
- `validateWithCli()` - Validation using `hzn service verify` command
- `validateFull()` - Combined schema + CLI validation
- Provide clear error messages with field paths for validation failures
- Return structured `ValidationResult` with errors array

#### Exchange Authentication (`src/publisher/exchange-auth.ts`)
- `getCredentialsFromEnv()` - Read from `HZN_ORG_ID`, `HZN_EXCHANGE_USER_AUTH`, `HZN_EXCHANGE_URL`
- `loadCredentialsFromFile()` - Parse `.cfg` and `.env` file formats
- `validateCredentials()` - Local format validation
- `verifyExchangeConnection()` - Test connectivity via `hzn exchange status`
- `verifyUserAuth()` - Validate credentials via `hzn exchange user list`

#### Exchange Publishing (`src/publisher/exchange-publisher.ts`)
- `publishService(options)` - Publish SDF via `hzn exchange service publish`
- `checkServiceExists()` - Check if service already exists in Exchange
- `getPublishedVersions()` - List published versions for a service
- `unpublishService()` - Remove service from Exchange
- Supports `overwrite` and `dryRun` options
- Credentials passed via environment variables (safer than CLI args)

### CLI Interface (`src/cli/index.ts`)

The `container-converter` CLI provides a complete interface for converting Dockerfiles to SDFs.

#### Basic Usage
```bash
# Convert Dockerfile to SDF
container-converter Dockerfile

# With output path
container-converter Dockerfile -o my-service.json

# With full metadata
container-converter Dockerfile -o my-service.json -n my-service --svc-version 1.0.0 -a arm64 --org myorg
```

#### CLI Options
| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output path for generated SDF |
| `-n, --name <name>` | Service name (inferred if not provided) |
| `--svc-version <version>` | Service version (default: 1.0.0) |
| `-a, --arch <arch>` | Target architecture (default: amd64) |
| `--org <org>` | Organization ID |
| `--description <desc>` | Service description |
| `--validate` | Validate SDF with Open Horizon CLI |
| `--publish` | Publish to Open Horizon Exchange |
| `--config <path>` | Path to Exchange config file (.cfg) |
| `--creds <path>` | Path to credentials file (.env) |
| `--overwrite` | Overwrite existing service in Exchange |
| `--dry-run` | Validate publish without publishing |

#### Validation and Publishing
```bash
# Validate generated SDF
container-converter Dockerfile --validate

# Publish to Exchange (with env vars set)
container-converter Dockerfile --publish

# Publish with config files
container-converter Dockerfile --publish --config agent-install.cfg --creds mycreds.env

# Dry run (validate publish without actually publishing)
container-converter Dockerfile --publish --dry-run
```

#### Exit Codes
- `0` - Success
- `1` - Error (parsing, validation, or publish failure)

### MCP Server (`src/mcp/server.ts`)

The `container-converter-mcp` binary runs an MCP (Model Context Protocol) server that exposes container-converter functionality as tools for AI assistants.

#### Running the MCP Server
```bash
# Run directly with tsx
npx tsx src/mcp/server.ts

# Or after building
container-converter-mcp
```

#### Available MCP Tools

| Tool | Description |
|------|-------------|
| `convert_dockerfile` | Convert a Dockerfile to an SDF |
| `validate_sdf` | Validate an SDF (schema and/or CLI) |
| `publish_sdf` | Publish SDF to Open Horizon Exchange |
| `check_hzn_cli` | Check if hzn CLI is available and get version |
| `list_exchange_services` | List services in the Exchange |

#### Tool Parameters

**convert_dockerfile**
- `dockerfile_path` (required): Path to Dockerfile
- `name`, `version`, `arch`, `org`, `description`: Optional metadata
- `output_path`: Optional path to save generated SDF

**validate_sdf**
- `sdf` (required): File path or SDF object
- `use_cli`: Also validate with hzn CLI (default: true)

**publish_sdf**
- `sdf` (required): File path or SDF object
- `config_path`, `creds_path`: Optional credential file paths
- `overwrite`, `dry_run`: Optional flags

#### MCP Configuration (for AI assistants)
```json
{
  "mcpServers": {
    "container-converter": {
      "command": "npx",
      "args": ["tsx", "/path/to/src/mcp/server.ts"]
    }
  }
}
```

### Interactive TUI (`src/tui/`)

The `container-converter-tui` binary provides an interactive terminal UI for conversational container conversion workflows.

#### Running the TUI
```bash
# Run directly with tsx
npx tsx src/tui/index.tsx

# Or after building
container-converter-tui
```

#### TUI Commands

| Command | Description |
|---------|-------------|
| `convert <dockerfile>` | Convert a Dockerfile to SDF |
| `validate <sdf-file>` | Validate an SDF file |
| `publish <sdf-file>` | Publish SDF to Exchange |
| `check cli` | Check hzn CLI availability |
| `list services` | List Exchange services |
| `preview` | Preview current SDF |
| `save <path>` | Save current SDF to file |
| `help` | Show available commands |
| `quit` | Exit the application |

#### TUI Features
- Conversational interface with command history
- Visual progress indicators (spinners)
- SDF preview and editing workflow
- Color-coded output (info, success, warning, error)
- Keyboard shortcuts (Ctrl+C to exit)

### Logger Utility (`src/utils/logger.ts`)

Configurable logging system with multiple log levels.

#### Usage
```typescript
import { logger, createLogger, LogLevel } from './utils/logger';

// Use default logger
logger.info('Processing file');
logger.debug('Detailed debug info', { key: 'value' });
logger.warn('Something might be wrong');
logger.error('An error occurred');

// Create module-specific logger
const parserLogger = createLogger('parser');
parserLogger.info('Parsing started');

// Timing operations
const done = logger.time('Operation');
// ... do work ...
done(); // Logs: "Operation completed in Xms"
```

#### Log Levels
| Level | Description |
|-------|-------------|
| `DEBUG` | Detailed debugging information |
| `INFO` | General informational messages |
| `WARN` | Warning messages |
| `ERROR` | Error messages |
| `SILENT` | No output |

#### Environment Variables
| Variable | Description |
|----------|-------------|
| `LOG_LEVEL` | Set log level (DEBUG, INFO, WARN, ERROR, SILENT) |
| `DEBUG` | Enable debug logging (any value) |
| `NO_COLOR` | Disable colored output |

### Error Classes (`src/utils/errors.ts`)

Custom error classes with structured context and suggestions.

#### Base Class
```typescript
class ContainerConverterError extends Error {
  code: string;                    // Error code for programmatic handling
  context?: Record<string, unknown>; // Additional context
  suggestions?: string[];          // Resolution suggestions
  
  format(): string;                // Format error for display
}
```

#### Available Error Classes
| Error Class | Code | Description |
|-------------|------|-------------|
| `DockerfileParseError` | `DOCKERFILE_PARSE_ERROR` | Dockerfile parsing failures |
| `SDFGenerationError` | `SDF_GENERATION_ERROR` | SDF generation failures |
| `ValidationError` | `VALIDATION_ERROR` | SDF validation failures |
| `ExchangeAuthError` | `EXCHANGE_AUTH_ERROR` | Exchange authentication issues |
| `PublishError` | `PUBLISH_ERROR` | Service publishing failures |
| `FileError` | `FILE_ERROR` | File operation failures |
| `CliNotFoundError` | `CLI_NOT_FOUND` | CLI tool not available |
| `NetworkError` | `NETWORK_ERROR` | Network connection issues |

#### Usage
```typescript
import { 
  DockerfileParseError, 
  isContainerConverterError, 
  formatError 
} from './utils/errors';

// Throw with context
throw new DockerfileParseError('Invalid instruction', { 
  line: 42,
  context: { instruction: 'INVALID' }
});

// Check error type
if (isContainerConverterError(error)) {
  console.log(error.format()); // Formatted with suggestions
}

// Format any error
console.log(formatError(error));
```

### Test Fixtures (`tests/fixtures/`)

Test data for unit and integration tests.

#### Dockerfile Fixtures (`tests/fixtures/dockerfiles/`)
| File | Description |
|------|-------------|
| `simple.Dockerfile` | Basic Node.js application |
| `complex.Dockerfile` | Multi-stage build with multiple ports/volumes |
| `python-app.Dockerfile` | Python Flask application with labels |
| `golang-service.Dockerfile` | Go microservice multi-stage build |
| `minimal.Dockerfile` | Minimal Dockerfile (only FROM) |

#### SDF Fixtures (`tests/fixtures/sdfs/`)
| File | Description |
|------|-------------|
| `simple.json` | Valid SDF for testing validation |

### Development Workflow

#### Branching Strategy
- `main`: Production-ready code
- `develop`: Integration branch
- `feature/*`: New features
- `bugfix/*`: Bug fixes
- `hotfix/*`: Critical fixes

#### Pull Request Process
- All changes require PR review
- Run full test suite before merging
- Update documentation for API changes
- Ensure CI/CD passes

### Tooling Preferences

#### IDE Configuration
- Use VS Code with recommended extensions
- Configure format on save
- Enable strict TypeScript checking

#### Package Management
- Use npm for package management
- Keep dependencies minimal and up-to-date
- Use `npm audit` regularly for security

## Docker Compose Support

**Status**: Phase 5 In Progress - Documentation & Examples ✅

The project has been successfully extended to support docker-compose.yml files in addition to Dockerfiles. See [docs/docker-compose-support-plan.md](docs/docker-compose-support-plan.md) for the complete implementation plan.

### Current Status

**✅ Phase 1: Foundation (COMPLETE)**
- ComposeParser implemented (`src/parser/compose-parser.ts` - 180 lines)
- Compose type definitions created (`src/types/compose.ts`)
- 35 passing unit tests
- Test fixtures in `tests/fixtures/compose/`

**✅ Phase 2: SDF Generation (COMPLETE)**
- ComposeSdfGenerator implemented (`src/generator/compose-sdf-generator.ts` - 330 lines)
- Single-SDF and multi-SDF generation strategies
- Strategy inference logic (≤3 services + no deps → single-SDF)
- 39 passing unit tests
- Complete service mapping (ports, env, volumes, commands, tmpfs, privileged)

**✅ Phase 3: CLI Integration (COMPLETE)**
- Input type detection (dockerfile vs compose)
- --type, --strategy, --output-dir CLI options
- Single-SDF and multi-SDF conversion paths
- Validation for all SDFs in multi-SDF mode
- Publishing for all SDFs (one-by-one, continue on failure)
- 13 passing integration tests
- Full backward compatibility with Dockerfiles

**✅ Phase 4: MCP/TUI Integration (COMPLETE)**
- MCP Server: `convert_compose` and `parse_compose` tools
- MCP Server: Enhanced `validate_sdf` and `publish_sdf` for arrays
- TUI: `convert compose`, `parse compose`, `strategy` commands
- TUI: Enhanced preview/save/publish for multi-SDF
- 60+ new tests (MCP, TUI, integration)
- Complete documentation (`docs/mcp-compose-tools.md`)
- **Total tests: 446+ (up from 386)**

**🔄 Phase 5: In Progress**
- ✅ README updated with comprehensive Compose examples
- ✅ Strategy selection guidelines documented
- ✅ Enhanced migration guide with step-by-step instructions
- ✅ AGENTS.md updated with Docker Compose guidelines
- ⏳ Additional real-world examples (if needed)

### Docker Compose Development Guidelines

#### When to Use Single-SDF vs Multi-SDF

**Use Single-SDF when:**
- Application has 1-3 services
- No service dependencies (`depends_on`)
- Services are tightly coupled (always deploy together)
- Simple development/testing scenarios
- All services target same architecture

**Use Multi-SDF when:**
- Application has 4+ services
- Services have dependencies
- Services need independent versioning
- Building reusable service components
- Production deployments
- Following Open Horizon best practices

**Example Decision Tree:**

```typescript
function inferStrategy(composeData: ComposeData): GenerationStrategy {
  const serviceCount = Object.keys(composeData.services).length;
  const hasDependencies = Object.values(composeData.services).some(
    (service) => service.depends_on
  );
  const hasComplexNetworking =
    composeData.networks && Object.keys(composeData.networks).length > 1;

  // Use multi-SDF for complex deployments
  if (serviceCount > 3 || hasDependencies || hasComplexNetworking) {
    return 'multi-sdf';
  }

  return 'single-sdf';
}
```

#### Feature Mapping Reference

**Fully Supported Features:**

| Compose Field | SDF Mapping | Notes |
|---------------|-------------|-------|
| `image` | `ServiceConfig.image` | Required - must be pre-built |
| `ports` | `ServiceConfig.ports` | All formats supported (short, long) |
| `environment` | `ServiceConfig.environment` | Array and object formats |
| `command` | `ServiceConfig.command` | Combined with entrypoint |
| `entrypoint` | `ServiceConfig.command` | Prepended to command |
| `volumes` (bind) | `ServiceConfig.binds` | Bind mounts only |
| `tmpfs` | `ServiceConfig.tmpfs` | Direct mapping |
| `privileged` | `ServiceConfig.privileged` | Direct mapping |
| `depends_on` | `requiredServices` | Multi-SDF only |

**Partially Supported Features:**

| Compose Field | Status | Handling |
|---------------|--------|----------|
| `networks` | ⚠️ Warn | Open Horizon manages networking |
| `volumes` (named) | ⚠️ Warn | Recommend bind mounts instead |
| `restart` | ℹ️ Info | Open Horizon handles via policy |
| `labels` | ℹ️ Info | Can map to metadata if needed |

**Unsupported Features:**

| Compose Field | Status | Alternative |
|---------------|--------|-------------|
| `build` | ❌ Error | Pre-build and push to registry |
| `secrets` | ❌ Warn | Use environment variables |
| `configs` | ❌ Warn | Use environment variables or bind mounts |
| `healthcheck` | ❌ Warn | Open Horizon uses agreements |
| `deploy` | ❌ Warn | Open Horizon handles orchestration |

#### Testing Multi-Container Conversions

**Test Fixtures Available:**

```
tests/fixtures/compose/
├── simple.docker-compose.yml              # Single service
├── multi-service.docker-compose.yml       # Multiple services, no deps
├── with-dependencies.docker-compose.yml   # Services with depends_on
├── wordpress.docker-compose.yml           # Real-world example
├── complex-features.docker-compose.yml    # Advanced features
└── v2-legacy.docker-compose.yml          # Legacy v2.x format
```

**Test Strategy:**

1. **Unit Tests** - Test parser and generator separately
2. **Integration Tests** - Test full conversion workflow
3. **Real-World Tests** - Use actual Compose files (WordPress, EdgeX)

**Example Test Pattern:**

```typescript
describe('Multi-SDF Generation', () => {
  it('should generate separate SDFs for each service', async () => {
    const composeData = await parser.parseFile('with-dependencies.docker-compose.yml');
    const result = generator.generate(composeData, { strategy: 'multi-sdf' });
    
    expect(result.sdfs).toHaveProperty('web');
    expect(result.sdfs).toHaveProperty('api');
    expect(result.sdfs).toHaveProperty('db');
  });

  it('should map depends_on to requiredServices', async () => {
    const composeData = await parser.parseFile('with-dependencies.docker-compose.yml');
    const result = generator.generate(composeData, { strategy: 'multi-sdf' });
    
    const apiSdf = result.sdfs.api;
    expect(apiSdf.requiredServices).toContainEqual(
      expect.objectContaining({ url: expect.stringContaining('db') })
    );
  });

  it('should build correct dependency graph', async () => {
    const composeData = await parser.parseFile('with-dependencies.docker-compose.yml');
    const result = generator.generate(composeData, { strategy: 'multi-sdf' });
    
    expect(result.dependencyGraph.db).toEqual([]);
    expect(result.dependencyGraph.api).toContain('db');
    expect(result.dependencyGraph.web).toContain('api');
  });
});
```

#### Error Handling Best Practices

**Required Image Validation:**

```typescript
if (!composeService.image) {
  throw new SDFGenerationError(
    `Service ${serviceName} must specify an 'image'. ` +
    `'build' is not supported - pre-build images and push to a registry.`,
    {
      context: { serviceName, hasImage: false, hasBuild: !!composeService.build },
      suggestions: [
        'Build your image: docker build -t myregistry.io/service:1.0 .',
        'Push to registry: docker push myregistry.io/service:1.0',
        'Update compose file to use image: myregistry.io/service:1.0'
      ]
    }
  );
}
```

**Network Warnings:**

```typescript
if (composeData.networks && Object.keys(composeData.networks).length > 0) {
  logger.warn(
    'Custom networks detected. Open Horizon manages networking automatically. ' +
    'Services can communicate using service names as hostnames.'
  );
}
```

**Named Volume Warnings:**

```typescript
if (composeData.volumes && Object.keys(composeData.volumes).length > 0) {
  logger.warn(
    'Named volumes detected. Consider using bind mounts for edge deployments: ' +
    'volumes: ["/host/path:/container/path:rw"]'
  );
}
```

#### CLI Integration Patterns

**Input Type Detection:**

```typescript
function detectInputType(filePath: string): 'dockerfile' | 'compose' {
  const basename = path.basename(filePath).toLowerCase();

  // Check filename patterns
  if (
    basename === 'docker-compose.yml' ||
    basename === 'docker-compose.yaml' ||
    basename === 'compose.yml' ||
    basename === 'compose.yaml'
  ) {
    return 'compose';
  }

  if (basename === 'dockerfile' || basename.includes('dockerfile')) {
    return 'dockerfile';
  }

  // Fallback: check file content
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.trim().startsWith('services:') || content.includes('\nservices:')) {
    return 'compose';
  }

  return 'dockerfile';
}
```

**Multi-SDF Output Handling:**

```typescript
// For multi-SDF, create output directory
if (strategy === 'multi-sdf') {
  const outputDir = options.outputDir || './sdfs';
  await fs.mkdir(outputDir, { recursive: true });

  for (const [serviceName, sdf] of Object.entries(result.sdfs)) {
    const outputPath = path.join(outputDir, `${serviceName}.json`);
    await fs.writeFile(outputPath, JSON.stringify(sdf, null, 2));
    logger.info(`Generated: ${outputPath}`);
  }
}
```

**Validation for Multi-SDF:**

```typescript
// Validate all SDFs
if (options.validate) {
  for (const [serviceName, sdf] of Object.entries(result.sdfs)) {
    const validationResult = await validator.validateFull(sdf);
    if (!validationResult.valid) {
      logger.error(`Validation failed for ${serviceName}:`, validationResult.errors);
      process.exit(1);
    }
    logger.info(`✓ Validated: ${serviceName}`);
  }
}
```

**Publishing for Multi-SDF:**

```typescript
// Publish in dependency order (topological sort)
if (options.publish) {
  const publishOrder = topologicalSort(result.dependencyGraph);
  
  for (const serviceName of publishOrder) {
    const sdf = result.sdfs[serviceName];
    try {
      await publishService({ credentials, sdf, overwrite: options.overwrite });
      logger.info(`✓ Published: ${serviceName}`);
    } catch (error) {
      logger.error(`Failed to publish ${serviceName}:`, error);
      if (!options.continueOnError) {
        process.exit(1);
      }
    }
  }
}
```

#### MCP Tool Integration

**convert_compose Tool:**

```typescript
{
  name: 'convert_compose',
  description: 'Convert docker-compose.yml to Open Horizon SDF(s)',
  inputSchema: {
    type: 'object',
    properties: {
      compose_path: { type: 'string', description: 'Path to docker-compose.yml' },
      strategy: {
        type: 'string',
        enum: ['single-sdf', 'multi-sdf', 'auto'],
        description: 'Generation strategy (auto-inferred if omitted)'
      },
      output_dir: { type: 'string', description: 'Output directory for multi-SDF' },
      name: { type: 'string', description: 'Project name' },
      version: { type: 'string', description: 'Service version' },
      arch: { type: 'string', description: 'Target architecture' },
      org: { type: 'string', description: 'Organization ID' }
    },
    required: ['compose_path']
  }
}
```

**parse_compose Tool:**

```typescript
{
  name: 'parse_compose',
  description: 'Parse docker-compose.yml and return structured data',
  inputSchema: {
    type: 'object',
    properties: {
      compose_path: { type: 'string', description: 'Path to docker-compose.yml' }
    },
    required: ['compose_path']
  }
}
```

#### Common Pitfalls and Solutions

**Pitfall 1: Forgetting to Pre-build Images**

```yaml
# ❌ This will fail
services:
  web:
    build: ./web
```

**Solution:**

```bash
# Build and push first
docker build -t myregistry.io/web:1.0 ./web
docker push myregistry.io/web:1.0

# Then update compose file
services:
  web:
    image: myregistry.io/web:1.0
```

**Pitfall 2: Using Named Volumes on Edge**

```yaml
# ⚠️ May not work on all edge devices
volumes:
  - db-data:/var/lib/mysql
```

**Solution:**

```yaml
# Use bind mounts instead
volumes:
  - /data/mysql:/var/lib/mysql:rw
```

**Pitfall 3: Complex Network Configurations**

```yaml
# ⚠️ Open Horizon manages networking
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
```

**Solution:** Remove custom networks. Services communicate via service names automatically.

**Pitfall 4: Assuming Docker Compose Behavior**

```yaml
# ⚠️ restart policies work differently
restart: always
```

**Solution:** Configure restart behavior via Open Horizon node policies, not in SDF.

#### Performance Considerations

**Large Compose Files:**

- Parser handles files up to 10MB efficiently
- Multi-SDF generation scales linearly with service count
- Validation time depends on `hzn` CLI performance

**Optimization Tips:**

1. Use `--strategy single-sdf` for simple apps (faster)
2. Skip CLI validation during development (`--validate` only for production)
3. Batch publish operations when possible
4. Cache parsed Compose data for repeated conversions

#### Future Enhancements

**Pattern Generation (Phase 6):**

```typescript
// Generate Open Horizon pattern from multi-SDF
function generatePattern(sdfs: Record<string, ServiceDefinition>): Pattern {
  return {
    label: 'Generated Pattern',
    services: Object.entries(sdfs).map(([name, sdf]) => ({
      serviceUrl: sdf.url,
      serviceVersions: [{ version: sdf.version }]
    }))
  };
}
```

**Build Support (Phase 7):**

```typescript
// Auto-build and push images before conversion
async function buildAndPush(composeData: ComposeData): Promise<ComposeData> {
  for (const [name, service] of Object.entries(composeData.services)) {
    if (service.build) {
      await buildImage(service.build, name);
      await pushImage(name);
      service.image = `${registry}/${name}:${version}`;
      delete service.build;
    }
  }
  return composeData;
}
```

This document will be updated as the project evolves and new patterns emerge.

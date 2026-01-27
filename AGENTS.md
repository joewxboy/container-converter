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

This document will be updated as the project evolves and new patterns emerge.</content>
<parameter name="filePath">/Users/josephpearson/dev/container-converter/AGENTS.md
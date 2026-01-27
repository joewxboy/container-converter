# Container Converter

Convert Dockerfiles to Open Horizon Service Definition Files (SDFs) for edge computing deployments.

## Overview

Container Converter is a TypeScript/Node.js tool that automates the conversion of Dockerfiles into Open Horizon Service Definition Files (SDFs). It parses Dockerfile instructions, extracts service metadata, and generates valid SDF JSON files ready for deployment on Open Horizon edge computing platforms.

### Features

- **Dockerfile Parsing**: Extracts base images, exposed ports, environment variables, commands, volumes, and more
- **Intelligent Inference**: Automatically infers service name, version, and architecture from Dockerfile contents
- **SDF Validation**: Validates generated SDFs against schema and optionally with the Open Horizon CLI
- **Exchange Publishing**: Publish validated SDFs directly to an Open Horizon Exchange
- **Multiple Interfaces**:
  - Command-line interface (CLI) for scripting and automation
  - MCP Server for AI assistant integration
  - Interactive TUI for conversational workflows

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- (Optional) Open Horizon CLI (`hzn`) for validation and publishing

### Install from npm

```bash
npm install -g container-converter
```

### Install from source

```bash
git clone https://github.com/your-org/container-converter.git
cd container-converter
npm install
npm run build
npm link  # Makes CLI commands available globally
```

## Quick Start

### Basic Conversion

Convert a Dockerfile to an SDF:

```bash
container-converter Dockerfile
```

This creates a file named `Dockerfile-sdf.json` with the generated service definition.

### Specify Output and Metadata

```bash
container-converter Dockerfile \
  -o my-service.json \
  -n my-edge-service \
  --svc-version 2.0.0 \
  -a arm64 \
  --org myorg \
  --description "My edge computing service"
```

### Validate with Open Horizon CLI

```bash
container-converter Dockerfile --validate
```

### Convert and Publish

```bash
container-converter Dockerfile --publish --config agent-install.cfg --creds mycreds.env
```

## CLI Reference

### Usage

```
container-converter [options] <dockerfile>
```

### Arguments

| Argument | Description |
|----------|-------------|
| `<dockerfile>` | Path to the Dockerfile to convert |

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output path for generated SDF (default: `<dockerfile>-sdf.json`) |
| `-n, --name <name>` | Service name (inferred from Dockerfile if not provided) |
| `--svc-version <version>` | Service version (default: 1.0.0) |
| `-a, --arch <arch>` | Target architecture: amd64, arm64, arm (default: amd64) |
| `--org <org>` | Organization ID |
| `--description <desc>` | Service description |
| `--validate` | Validate generated SDF with Open Horizon CLI |
| `--publish` | Publish to Open Horizon Exchange after conversion |
| `--config <path>` | Path to Exchange configuration file (.cfg format) |
| `--creds <path>` | Path to credentials file (.env format) |
| `--overwrite` | Overwrite if service already exists in Exchange |
| `--dry-run` | Validate publish without actually publishing |
| `-V, --version` | Output version number |
| `-h, --help` | Display help |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `HZN_ORG_ID` | Organization ID for Exchange |
| `HZN_EXCHANGE_USER_AUTH` | User credentials in `user:password` format |
| `HZN_EXCHANGE_URL` | Exchange URL (e.g., `http://exchange.example.com:3090/v1`) |
| `DEBUG` | Set to any value to enable stack traces on errors |

## Examples

### Example 1: Simple Node.js Application

**Input Dockerfile:**

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
```

**Command:**

```bash
container-converter Dockerfile -n my-node-app --svc-version 1.0.0
```

**Generated SDF:**

```json
{
  "label": "my-node-app",
  "description": "Service generated from Dockerfile",
  "url": "my-node-app",
  "version": "1.0.0",
  "arch": "amd64",
  "sharable": "multiple",
  "deployment": {
    "services": {
      "my-node-app": {
        "image": "node:18-alpine",
        "ports": [
          {
            "HostIP": "0.0.0.0",
            "HostPort": "3000:3000/tcp"
          }
        ]
      }
    }
  }
}
```

### Example 2: Multi-port Service with Environment Variables

**Input Dockerfile:**

```dockerfile
FROM python:3.11-slim

ENV APP_PORT=8080
ENV DEBUG=false
ENV LOG_LEVEL=info

EXPOSE 8080
EXPOSE 9090

WORKDIR /app
COPY . .

CMD ["python", "app.py"]
```

**Command:**

```bash
container-converter Dockerfile -n python-api --org myorg --validate
```

### Example 3: Publishing to Exchange

```bash
# Using environment variables
export HZN_ORG_ID=myorg
export HZN_EXCHANGE_USER_AUTH=admin:password123
export HZN_EXCHANGE_URL=http://exchange.example.com:3090/v1

container-converter Dockerfile --publish

# Or using config files
container-converter Dockerfile \
  --publish \
  --config ~/agent-install.cfg \
  --creds ~/mycreds.env
```

## MCP Server

Container Converter includes an MCP (Model Context Protocol) server that exposes its functionality as tools for AI assistants.

### Running the MCP Server

```bash
# Run directly with tsx
npx tsx src/mcp/server.ts

# Or after building
container-converter-mcp
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `convert_dockerfile` | Convert a Dockerfile to an SDF |
| `validate_sdf` | Validate an SDF (schema and/or CLI) |
| `publish_sdf` | Publish SDF to Open Horizon Exchange |
| `check_hzn_cli` | Check if hzn CLI is available and get version |
| `list_exchange_services` | List services in the Exchange |

### Tool Parameters

#### convert_dockerfile

| Parameter | Required | Description |
|-----------|----------|-------------|
| `dockerfile_path` | Yes | Path to Dockerfile |
| `name` | No | Service name |
| `version` | No | Service version (default: 1.0.0) |
| `arch` | No | Target architecture (default: amd64) |
| `org` | No | Organization ID |
| `description` | No | Service description |
| `output_path` | No | Path to save generated SDF |

#### validate_sdf

| Parameter | Required | Description |
|-----------|----------|-------------|
| `sdf` | Yes | File path or SDF object |
| `use_cli` | No | Also validate with hzn CLI (default: true) |

#### publish_sdf

| Parameter | Required | Description |
|-----------|----------|-------------|
| `sdf` | Yes | File path or SDF object |
| `config_path` | No | Path to Exchange config file |
| `creds_path` | No | Path to credentials file |
| `overwrite` | No | Overwrite if service exists |
| `dry_run` | No | Validate without publishing |

### MCP Configuration for AI Assistants

Add to your MCP configuration:

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

## Interactive TUI

The interactive Terminal User Interface provides a conversational workflow for container conversion.

### Running the TUI

```bash
# Run directly with tsx
npx tsx src/tui/index.tsx

# Or after building
container-converter-tui
```

### TUI Commands

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

### TUI Features

- Conversational interface with command history
- Visual progress indicators
- SDF preview and editing workflow
- Color-coded output (info, success, warning, error)
- Keyboard shortcuts (Ctrl+C to exit)

## Library API

Container Converter can be used as a library in your Node.js projects.

### Installation

```bash
npm install container-converter
```

### Usage

```typescript
import {
  DockerfileParser,
  SDFGenerator,
  SDFValidator,
  publishService,
  getCredentials,
} from 'container-converter';
import { readFileSync } from 'fs';

// Parse a Dockerfile
const dockerfile = readFileSync('Dockerfile', 'utf-8');
const parser = new DockerfileParser();
const dockerfileData = parser.parse(dockerfile);

// Generate SDF
const generator = new SDFGenerator();
const sdf = generator.generate(dockerfileData, {
  name: 'my-service',
  version: '1.0.0',
  organization: 'myorg',
});

// Validate SDF
const validator = new SDFValidator();
const schemaResult = validator.validateSchema(sdf);
if (!schemaResult.valid) {
  console.error('Validation errors:', schemaResult.errors);
}

// Publish to Exchange
const credentials = await getCredentials();
if (credentials) {
  const result = await publishService({
    credentials,
    sdf,
  });
  console.log('Published:', result.serviceId);
}
```

### API Reference

#### DockerfileParser

```typescript
class DockerfileParser {
  parse(content: string): DockerfileData;
}

interface DockerfileData {
  baseImage: string;
  exposedPorts: number[];
  environment: Record<string, string>;
  commands: string[][];
  workdir: string;
  user: string;
  volumes: string[];
  labels: Record<string, string>;
}
```

#### SDFGenerator

```typescript
class SDFGenerator {
  generate(
    dockerfileData: DockerfileData,
    metadata?: Partial<ServiceMetadata>
  ): ServiceDefinition;
}

interface ServiceMetadata {
  name: string;
  version: string;
  architecture: string;
  organization: string;
  description: string;
}
```

#### SDFValidator

```typescript
class SDFValidator {
  validateSchema(sdf: ServiceDefinition): ValidationResult;
  validateWithCli(sdf: ServiceDefinition): Promise<ValidationResult>;
  validateFull(sdf: ServiceDefinition): Promise<ValidationResult>;
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{ field?: string; message: string }>;
  cliAvailable?: boolean;
}
```

## Troubleshooting

### Common Issues

#### "hzn CLI not found"

The Open Horizon CLI is required for validation and publishing. Install it from:
https://github.com/open-horizon/anax

```bash
# Check if hzn is installed
which hzn

# Check version
hzn version
```

#### "No Exchange credentials found"

Ensure environment variables are set:

```bash
export HZN_ORG_ID=your-org
export HZN_EXCHANGE_USER_AUTH=user:password
export HZN_EXCHANGE_URL=http://your-exchange:3090/v1
```

Or provide config files:

```bash
container-converter Dockerfile --publish \
  --config agent-install.cfg \
  --creds mycreds.env
```

#### "Exchange connection failed"

1. Verify the Exchange URL is correct and accessible
2. Check network connectivity
3. Ensure the Exchange service is running

```bash
# Test connectivity
curl -s $HZN_EXCHANGE_URL/admin/status
```

#### "Schema validation failed"

The generated SDF is missing required fields. Check:
- The Dockerfile has a valid `FROM` instruction
- Required fields are provided via CLI options if not inferable

### Debug Mode

Enable stack traces for detailed error information:

```bash
DEBUG=1 container-converter Dockerfile
```

## Development

### Setup

```bash
git clone https://github.com/your-org/container-converter.git
cd container-converter
npm install
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build production bundle |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run validate` | Run full validation (lint + typecheck + test) |

### Project Structure

```
src/
├── cli/           # Command-line interface
├── mcp/           # MCP Server implementation
├── tui/           # Interactive terminal UI
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

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern="sdf-generator"

# Run with coverage
npm run test:coverage
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run validation (`npm run validate`)
5. Commit your changes (`git commit -s -m "feat: add my feature"`)
6. Push to the branch (`git push origin feature/my-feature`)
7. Open a Pull Request

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test changes
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

## License

Apache-2.0

## Related Resources

- [Open Horizon Documentation](https://open-horizon.github.io/)
- [Open Horizon Examples](https://github.com/open-horizon/examples)
- [Model Context Protocol](https://modelcontextprotocol.io/)

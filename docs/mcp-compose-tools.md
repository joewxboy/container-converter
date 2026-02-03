# MCP Compose Tools Documentation

This document describes the Docker Compose-related tools available in the Container Converter MCP Server.

## Overview

The Container Converter MCP Server provides tools for converting docker-compose.yml files to Open Horizon Service Definition Files (SDFs). These tools support both single-SDF and multi-SDF generation strategies, making it easy to deploy multi-container applications to Open Horizon edge platforms.

## Available Tools

### 1. convert_compose

Convert a docker-compose.yml file to Open Horizon Service Definition File(s).

**Description:**
Parses a docker-compose.yml file and generates either a single SDF containing all services or multiple SDFs (one per service) based on the specified strategy. The tool automatically infers the best strategy if not specified.

**Input Schema:**

```json
{
  "compose_path": "string (required)",
  "strategy": "single-sdf | multi-sdf | auto (optional)",
  "name": "string (optional)",
  "version": "string (optional)",
  "arch": "amd64 | arm64 | arm (optional)",
  "org": "string (optional)",
  "output_dir": "string (optional)"
}
```

**Parameters:**

- `compose_path` (required): Path to the docker-compose.yml file to convert
- `strategy` (optional): SDF generation strategy
  - `single-sdf`: Generate one SDF containing all services
  - `multi-sdf`: Generate separate SDFs for each service
  - `auto`: Automatically infer based on complexity (default)
- `name` (optional): Project name (inferred from compose file if not provided)
- `version` (optional): Service version (default: 1.0.0)
- `arch` (optional): Target architecture (default: amd64)
- `org` (optional): Organization ID
- `output_dir` (optional): Output directory for saving generated SDF(s)

**Response (Single-SDF):**

```json
{
  "success": true,
  "strategy": "single-sdf",
  "sdf": {
    "label": "project-name",
    "url": "project-name",
    "version": "1.0.0",
    "arch": "amd64",
    "deployment": {
      "services": {
        "web": { "image": "nginx:latest" },
        "db": { "image": "postgres:latest" }
      }
    }
  },
  "summary": {
    "label": "project-name",
    "url": "project-name",
    "version": "1.0.0",
    "arch": "amd64",
    "serviceCount": 2
  }
}
```

**Response (Multi-SDF):**

```json
{
  "success": true,
  "strategy": "multi-sdf",
  "serviceCount": 2,
  "services": ["web", "db"],
  "dependencyGraph": {
    "web": ["db"],
    "db": []
  },
  "sdfs": {
    "web": { /* SDF for web service */ },
    "db": { /* SDF for db service */ }
  },
  "outputPaths": {
    "web": "/path/to/output/web.json",
    "db": "/path/to/output/db.json"
  },
  "summary": [
    {
      "name": "web",
      "label": "project - web",
      "url": "project.web",
      "version": "1.0.0",
      "dependencies": ["db"]
    },
    {
      "name": "db",
      "label": "project - db",
      "url": "project.db",
      "version": "1.0.0",
      "dependencies": []
    }
  ]
}
```

**Example Usage:**

```javascript
// Convert with auto strategy
const result = await callTool('convert_compose', {
  compose_path: './docker-compose.yml'
});

// Convert with explicit multi-SDF strategy
const result = await callTool('convert_compose', {
  compose_path: './docker-compose.yml',
  strategy: 'multi-sdf',
  output_dir: './sdfs',
  org: 'myorg',
  version: '2.0.0'
});
```

**Strategy Selection Guidelines:**

- **Single-SDF**: Best for simple applications with 1-3 services and no dependencies
- **Multi-SDF**: Best for complex applications with 4+ services or inter-service dependencies
- **Auto**: Automatically selects based on:
  - Service count (≤3 services → single-SDF)
  - Dependencies (has dependencies → multi-SDF)
  - Network complexity (multiple networks → multi-SDF)

---

### 2. parse_compose

Parse a docker-compose.yml file and return structured information without generating SDFs.

**Description:**
Analyzes a docker-compose.yml file and extracts detailed information about services, networks, volumes, dependencies, and other configuration. Useful for inspecting compose files before conversion.

**Input Schema:**

```json
{
  "compose_path": "string (required)"
}
```

**Parameters:**

- `compose_path` (required): Path to the docker-compose.yml file to parse

**Response:**

```json
{
  "success": true,
  "projectName": "my-project",
  "version": "3.8",
  "serviceCount": 3,
  "services": [
    {
      "name": "web",
      "image": "nginx:latest",
      "build": undefined,
      "ports": 2,
      "volumes": 1,
      "environment": 5,
      "dependencies": ["db"],
      "privileged": false
    },
    {
      "name": "db",
      "image": "postgres:14",
      "build": undefined,
      "ports": 0,
      "volumes": 1,
      "environment": 3,
      "dependencies": [],
      "privileged": false
    }
  ],
  "dependencyGraph": {
    "web": ["db"],
    "db": [],
    "cache": []
  },
  "networks": ["frontend", "backend"],
  "volumes": ["db-data", "cache-data"],
  "hasSecrets": false,
  "hasConfigs": false
}
```

**Example Usage:**

```javascript
// Parse compose file
const result = await callTool('parse_compose', {
  compose_path: './docker-compose.yml'
});

console.log(`Project: ${result.projectName}`);
console.log(`Services: ${result.serviceCount}`);
console.log(`Dependencies:`, result.dependencyGraph);
```

**Use Cases:**

- Inspect compose file structure before conversion
- Understand service dependencies
- Identify unsupported features (secrets, configs)
- Determine appropriate conversion strategy

---

### 3. validate_sdf (Enhanced for Arrays)

Validate one or more Open Horizon Service Definition Files.

**Description:**
Validates SDF(s) against the Open Horizon schema and optionally with the hzn CLI. Now supports validating arrays of SDFs, making it ideal for multi-SDF workflows.

**Input Schema:**

```json
{
  "sdf": "string | object | array (required)",
  "use_cli": "boolean (optional)"
}
```

**Parameters:**

- `sdf` (required): SDF(s) to validate
  - File path (string): Path to JSON file containing SDF or array of SDFs
  - Object: Single SDF object
  - Array: Array of SDF objects
- `use_cli` (optional): Also validate with hzn CLI (default: true)

**Response (Single SDF):**

```json
{
  "valid": true,
  "count": 1,
  "results": [
    {
      "label": "my-service",
      "url": "my-service",
      "valid": true,
      "schemaValidation": {
        "valid": true,
        "errors": []
      },
      "cliValidation": {
        "valid": true,
        "cliAvailable": true,
        "errors": []
      }
    }
  ]
}
```

**Response (Multiple SDFs):**

```json
{
  "valid": true,
  "count": 3,
  "results": [
    {
      "label": "project - web",
      "url": "project.web",
      "valid": true,
      "schemaValidation": { "valid": true, "errors": [] },
      "cliValidation": { "valid": true, "cliAvailable": true, "errors": [] }
    },
    {
      "label": "project - db",
      "url": "project.db",
      "valid": true,
      "schemaValidation": { "valid": true, "errors": [] },
      "cliValidation": { "valid": true, "cliAvailable": true, "errors": [] }
    },
    {
      "label": "project - cache",
      "url": "project.cache",
      "valid": false,
      "schemaValidation": {
        "valid": false,
        "errors": [
          { "field": "version", "message": "Required field missing" }
        ]
      },
      "cliValidation": null
    }
  ]
}
```

**Example Usage:**

```javascript
// Validate array of SDFs from multi-SDF conversion
const convertResult = await callTool('convert_compose', {
  compose_path: './docker-compose.yml',
  strategy: 'multi-sdf'
});

const sdfs = Object.values(convertResult.sdfs);
const validateResult = await callTool('validate_sdf', {
  sdf: sdfs,
  use_cli: true
});

console.log(`Validated ${validateResult.count} SDFs`);
console.log(`All valid: ${validateResult.valid}`);
```

---

### 4. publish_sdf (Enhanced for Arrays)

Publish one or more SDFs to the Open Horizon Exchange.

**Description:**
Publishes SDF(s) to the Open Horizon Exchange. Now supports publishing arrays of SDFs with configurable error handling, making it ideal for multi-SDF deployments.

**Input Schema:**

```json
{
  "sdf": "string | object | array (required)",
  "config_path": "string (optional)",
  "creds_path": "string (optional)",
  "overwrite": "boolean (optional)",
  "dry_run": "boolean (optional)",
  "continue_on_error": "boolean (optional)"
}
```

**Parameters:**

- `sdf` (required): SDF(s) to publish
  - File path (string): Path to JSON file containing SDF or array of SDFs
  - Object: Single SDF object
  - Array: Array of SDF objects
- `config_path` (optional): Path to Exchange config file (.cfg)
- `creds_path` (optional): Path to credentials file (.env)
- `overwrite` (optional): Overwrite if service exists (default: false)
- `dry_run` (optional): Validate without publishing (default: false)
- `continue_on_error` (optional): Continue publishing remaining SDFs if one fails (default: true)

**Response (Single SDF):**

```json
{
  "success": true,
  "count": 1,
  "successCount": 1,
  "failureCount": 0,
  "results": [
    {
      "label": "my-service",
      "url": "my-service",
      "version": "1.0.0",
      "success": true,
      "serviceId": "myorg/my-service_1.0.0_amd64"
    }
  ]
}
```

**Response (Multiple SDFs):**

```json
{
  "success": true,
  "count": 3,
  "successCount": 2,
  "failureCount": 1,
  "results": [
    {
      "label": "project - web",
      "url": "project.web",
      "version": "1.0.0",
      "success": true,
      "serviceId": "myorg/project.web_1.0.0_amd64"
    },
    {
      "label": "project - db",
      "url": "project.db",
      "version": "1.0.0",
      "success": true,
      "serviceId": "myorg/project.db_1.0.0_amd64"
    },
    {
      "label": "project - cache",
      "url": "project.cache",
      "version": "1.0.0",
      "success": false,
      "error": "Service already exists. Use overwrite=true to replace."
    }
  ]
}
```

**Example Usage:**

```javascript
// Publish all SDFs from multi-SDF conversion
const convertResult = await callTool('convert_compose', {
  compose_path: './docker-compose.yml',
  strategy: 'multi-sdf'
});

const sdfs = Object.values(convertResult.sdfs);
const publishResult = await callTool('publish_sdf', {
  sdf: sdfs,
  overwrite: false,
  continue_on_error: true
});

console.log(`Published ${publishResult.successCount}/${publishResult.count} services`);
if (publishResult.failureCount > 0) {
  console.log('Failed services:', 
    publishResult.results.filter(r => !r.success).map(r => r.label)
  );
}
```

**Error Handling:**

- `continue_on_error: true` (default): Continues publishing remaining SDFs if one fails
- `continue_on_error: false`: Stops at first failure

---

## Complete Workflow Examples

### Example 1: Simple Compose to Single SDF

```javascript
// 1. Parse to inspect
const parseResult = await callTool('parse_compose', {
  compose_path: './simple-app/docker-compose.yml'
});

console.log(`Services: ${parseResult.serviceCount}`);

// 2. Convert (auto-infers single-SDF for simple apps)
const convertResult = await callTool('convert_compose', {
  compose_path: './simple-app/docker-compose.yml',
  org: 'myorg',
  version: '1.0.0'
});

// 3. Validate
const validateResult = await callTool('validate_sdf', {
  sdf: convertResult.sdf
});

if (!validateResult.valid) {
  console.error('Validation failed:', validateResult.results[0].schemaValidation.errors);
  return;
}

// 4. Publish
const publishResult = await callTool('publish_sdf', {
  sdf: convertResult.sdf
});

console.log(`Published: ${publishResult.results[0].serviceId}`);
```

### Example 2: Complex Compose to Multi-SDF

```javascript
// 1. Parse to understand structure
const parseResult = await callTool('parse_compose', {
  compose_path: './complex-app/docker-compose.yml'
});

console.log('Dependency graph:', parseResult.dependencyGraph);

// 2. Convert with multi-SDF strategy
const convertResult = await callTool('convert_compose', {
  compose_path: './complex-app/docker-compose.yml',
  strategy: 'multi-sdf',
  output_dir: './sdfs',
  org: 'myorg',
  version: '2.0.0',
  arch: 'arm64'
});

console.log(`Generated ${convertResult.serviceCount} SDFs`);

// 3. Validate all SDFs
const sdfs = Object.values(convertResult.sdfs);
const validateResult = await callTool('validate_sdf', {
  sdf: sdfs
});

if (!validateResult.valid) {
  console.error('Some SDFs failed validation:');
  validateResult.results
    .filter(r => !r.valid)
    .forEach(r => console.error(`  ${r.label}:`, r.schemaValidation.errors));
  return;
}

// 4. Publish all SDFs
const publishResult = await callTool('publish_sdf', {
  sdf: sdfs,
  continue_on_error: true
});

console.log(`Published ${publishResult.successCount}/${publishResult.count} services`);
```

### Example 3: Dry Run and Validation

```javascript
// 1. Convert
const convertResult = await callTool('convert_compose', {
  compose_path: './docker-compose.yml',
  strategy: 'multi-sdf'
});

// 2. Validate
const validateResult = await callTool('validate_sdf', {
  sdf: Object.values(convertResult.sdfs),
  use_cli: true
});

if (!validateResult.valid) {
  console.error('Validation failed');
  return;
}

// 3. Dry run publish (validate without actually publishing)
const dryRunResult = await callTool('publish_sdf', {
  sdf: Object.values(convertResult.sdfs),
  dry_run: true
});

console.log('Dry run results:', dryRunResult);

// 4. If dry run successful, publish for real
if (dryRunResult.success) {
  const publishResult = await callTool('publish_sdf', {
    sdf: Object.values(convertResult.sdfs)
  });
  console.log('Published:', publishResult);
}
```

## Best Practices

### 1. Always Parse First

Before converting, use `parse_compose` to understand the structure:

```javascript
const parseResult = await callTool('parse_compose', {
  compose_path: './docker-compose.yml'
});

// Check for unsupported features
if (parseResult.hasSecrets || parseResult.hasConfigs) {
  console.warn('Compose file uses secrets/configs - these are not supported');
}

// Check for build contexts
const hasBuild = parseResult.services.some(s => s.build);
if (hasBuild) {
  console.warn('Some services use build - ensure images are pre-built and pushed');
}
```

### 2. Validate Before Publishing

Always validate SDFs before publishing:

```javascript
const validateResult = await callTool('validate_sdf', {
  sdf: sdfs,
  use_cli: true
});

if (!validateResult.valid) {
  // Handle validation errors
  return;
}

// Only publish if validation passes
const publishResult = await callTool('publish_sdf', { sdf: sdfs });
```

### 3. Use Appropriate Strategy

- Simple apps (1-3 services, no dependencies): Use `single-sdf` or `auto`
- Complex apps (4+ services, dependencies): Use `multi-sdf`
- When in doubt: Use `auto` to let the tool decide

### 4. Handle Publishing Errors

Use `continue_on_error: true` for multi-SDF publishing:

```javascript
const publishResult = await callTool('publish_sdf', {
  sdf: sdfs,
  continue_on_error: true
});

// Check for failures
if (publishResult.failureCount > 0) {
  const failed = publishResult.results.filter(r => !r.success);
  console.error('Failed to publish:', failed.map(r => r.label));
  
  // Retry failed services
  const retryResult = await callTool('publish_sdf', {
    sdf: failed.map(r => sdfs.find(s => s.label === r.label)),
    overwrite: true
  });
}
```

### 5. Save SDFs for Review

Always save generated SDFs for review:

```javascript
const convertResult = await callTool('convert_compose', {
  compose_path: './docker-compose.yml',
  strategy: 'multi-sdf',
  output_dir: './review-sdfs'
});

// Review files before publishing
console.log('SDFs saved to:', convertResult.outputPaths);
```

## Troubleshooting

### Common Issues

**Issue: "Service must specify an 'image'"**
- **Cause**: Compose service uses `build` without `image`
- **Solution**: Pre-build images and push to registry, then add `image` field

**Issue: "Compose file must contain at least one service"**
- **Cause**: Empty or invalid compose file
- **Solution**: Verify compose file has `services` section with at least one service

**Issue: "No Exchange credentials found"**
- **Cause**: Missing environment variables for Exchange
- **Solution**: Set `HZN_ORG_ID`, `HZN_EXCHANGE_USER_AUTH`, `HZN_EXCHANGE_URL`

**Issue: "Service already exists"**
- **Cause**: Service already published to Exchange
- **Solution**: Use `overwrite: true` or change version number

### Debug Tips

1. **Use parse_compose first**: Understand structure before converting
2. **Check validation errors**: Review `schemaValidation.errors` for details
3. **Use dry_run**: Test publishing without actually publishing
4. **Enable CLI validation**: Set `use_cli: true` for comprehensive validation
5. **Check dependency order**: Ensure dependencies are published before dependents

## Environment Variables

Required for publishing:

```bash
export HZN_ORG_ID="myorg"
export HZN_EXCHANGE_USER_AUTH="user:password"
export HZN_EXCHANGE_URL="https://exchange.example.com/v1"
```

Optional for logging:

```bash
export LOG_LEVEL="DEBUG"  # DEBUG, INFO, WARN, ERROR, SILENT
export DEBUG="1"          # Enable debug logging
```

## See Also

- [Docker Compose Support Plan](./docker-compose-support-plan.md)
- [Phase 2: Compose SDF Generation](./phase2-compose-sdf-generation.md)
- [Container Converter README](../README.md)
- [Open Horizon Documentation](https://open-horizon.github.io/)

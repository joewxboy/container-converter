# Container Converter Project - Dockerfile to Open Horizon Service Definition File

## Background and Motivation

The goal of this project is to create a TypeScript/Node.js tool that can intelligently convert Dockerfiles into Open Horizon Service Definition Files (SDFs). This tool will:

1. **Parse and understand Dockerfile entries** - Read Dockerfile instructions and extract meaningful information about the containerized service
2. **Apply conversion rules and heuristics** - Use rules, educated guesses, and intelligent interrogation to map Dockerfile constructs to Open Horizon SDF format
3. **Generate valid Service Definition Files** - Produce JSON files that conform to Open Horizon's SDF schema
4. **Validate generated SDFs** - Use the Open Horizon CLI (`hzn`) to validate the generated service definition files
5. **Optionally publish to Exchange** - Provide functionality to publish validated SDFs to an Open Horizon Exchange

This tool will help developers migrate existing containerized applications to the Open Horizon edge computing platform more efficiently, reducing manual conversion effort and potential errors.

## Key Challenges and Analysis

### Technical Challenges

1. **Dockerfile Parsing Complexity**
   - Dockerfiles can have complex multi-stage builds, variable substitutions, and conditional logic
   - Need to handle various instruction types: FROM, RUN, COPY, ADD, ENV, EXPOSE, CMD, ENTRYPOINT, WORKDIR, USER, VOLUME, etc.
   - Must understand the intent behind each instruction, not just parse syntax

2. **Mapping Dockerfile to SDF Structure**
   - Open Horizon SDF has a specific JSON schema with required and optional fields
   - Key mappings needed:
     - `FROM` → `deployment.services.<service-name>.image`
     - `EXPOSE` → port mappings in deployment configuration
     - `ENV` → environment variables (may need to be in `userInput` for configurability)
     - `CMD`/`ENTRYPOINT` → command in deployment configuration
     - `WORKDIR` → working directory in deployment
     - `USER` → user/group settings
     - `VOLUME` → volume mounts
   - Need to determine service name, version, architecture, and other metadata

3. **Intelligent Inference**
   - Service name and version may not be explicit in Dockerfile
   - Architecture detection (amd64, arm64, etc.)
   - Determining if service should be sharable
   - Identifying required services/dependencies
   - Understanding network requirements

4. **Validation Integration**
   - Need to interface with Open Horizon CLI (`hzn` command)
   - Handle validation errors and provide meaningful feedback
   - Ensure CLI is available and properly configured

5. **Exchange Publishing**
   - Authentication and authorization for Exchange
   - Handling publish errors
   - Version management and updates

### Open Horizon SDF Structure (Based on Research)

Key fields in an Open Horizon Service Definition File:
- `label`: Human-readable service name
- `description`: Service description
- `public`: Boolean indicating if service is public
- `url`: Unique service identifier
- `version`: Semantic version (e.g., "1.0.0")
- `arch`: Architecture (amd64, arm64, etc.)
- `sharable`: Sharing mode (none, singleton, multiple)
- `requiredServices`: Array of dependent services
- `userInputs`: Configuration variables
- `deployment`: Deployment configuration including:
  - `services`: Object with service definitions
    - `image`: Docker image reference
    - `ports`: Port mappings
    - `environment`: Environment variables
    - `command`: Startup command
    - `volumes`: Volume mounts

## High-level Task Breakdown

### Phase 1: Project Setup and Foundation
**Goal**: Establish the project structure, dependencies, and basic tooling

0. **Collect and Analyze SDF Examples** (Preparation Task)
   - Success Criteria:
     - Gather 3-5 real-world SDF examples from Open Horizon GitHub repositories
     - Document common patterns and field usage
     - Identify edge cases and variations
     - Create reference examples directory in project
     - Note: This will inform the SDF data model design (Task 7)

1. **Initialize TypeScript/Node.js Project**
   - Success Criteria:
     - `package.json` with TypeScript configuration
     - `tsconfig.json` with appropriate compiler options
     - Basic project structure (src/, tests/, etc.)
     - ESLint and Prettier configured
     - Git repository initialized with .gitignore

2. **Set Up Testing Framework**
   - Success Criteria:
     - Jest or similar testing framework configured
     - Test directory structure established
     - Sample test to verify setup works

3. **Install Core Dependencies**
   - Success Criteria:
     - Dockerfile parser library (`dockerfile-ast` or similar) installed
     - Type definitions available
     - Dependencies documented in package.json

### Phase 2: Dockerfile Parsing
**Goal**: Build capability to parse and extract information from Dockerfiles

4. **Implement Dockerfile Reader**
   - Success Criteria:
     - Function that reads Dockerfile from file path
     - Handles file not found and read errors gracefully
     - Returns raw Dockerfile content
     - Unit tests with sample Dockerfiles

5. **Implement Dockerfile Parser**
   - Success Criteria:
     - Parse Dockerfile into structured representation
     - Extract all major instruction types (FROM, EXPOSE, ENV, CMD, etc.)
     - Handle multi-stage builds
     - Handle variable substitutions and ARG instructions
     - Unit tests covering various Dockerfile patterns

6. **Create Dockerfile Instruction Analyzer**
   - Success Criteria:
     - Extract base image information
     - Identify exposed ports
     - Collect environment variables
     - Extract command/entrypoint
     - Identify working directory
     - Extract user information
     - Identify volume mounts
     - Unit tests for each instruction type

### Phase 3: SDF Generation Logic ✅ COMPLETE
**Goal**: Convert parsed Dockerfile information into Open Horizon SDF format

7. **Design SDF Data Model** ✅
   - Success Criteria:
     - ✅ TypeScript interfaces/types for SDF structure
     - ✅ Covers all required and optional fields
     - ✅ Type-safe structure
     - ✅ Added ServiceMetadata interface for metadata inference
     - ✅ Added documentation field to ServiceDefinition

8. **Implement Service Metadata Inference** ✅
   - Success Criteria:
     - ✅ Infer service name from Dockerfile labels or base image
     - ✅ Infer version from labels or image tag (default to 1.0.0)
     - ✅ Detect architecture from base image (arm64, arm, amd64)
     - ✅ Determine sharable mode based on service characteristics
     - ✅ Generate label and description from metadata
     - ✅ 32 passing unit tests for inference logic
   - Implementation: `src/generator/metadata-inference.ts` (197 lines)

9. **Implement Dockerfile to SDF Mapper** ✅
   - Success Criteria:
     - ✅ Map FROM instruction to image field
     - ✅ Map EXPOSE to port mappings (HostIP + HostPort format)
     - ✅ Map ENV to environment variables array
     - ✅ Map CMD/ENTRYPOINT to command array
     - ✅ Map WORKDIR to working directory
     - ✅ Map USER to user settings
     - ✅ Map VOLUME to volume binds
     - ✅ Handle edge cases and missing information
     - ✅ Comprehensive unit tests with various examples
   - Implementation: Integrated into `src/generator/sdf-generator.ts`

10. **Implement SDF Generator** ✅
    - Success Criteria:
      - ✅ Generate complete SDF JSON from mapped data
      - ✅ Validate required fields are present
      - ✅ Format JSON output properly (configurable indentation)
      - ✅ Handle optional fields appropriately
      - ✅ 17 passing unit tests generating valid SDFs
    - Implementation: `src/generator/sdf-generator.ts` (203 lines)
    - All validation checks passing (lint, typecheck, test)

### Phase 4: Validation Integration
**Goal**: Integrate with Open Horizon CLI for validation

11. **Implement CLI Detection**
    - Success Criteria:
      - Check if `hzn` command is available
      - Provide clear error if CLI not found
      - Check CLI version compatibility
      - Unit tests for detection logic

12. **Implement SDF Validation**
    - Success Criteria:
      - Execute `hzn exchange service verify` or similar validation command
      - Parse validation output
      - Report validation errors clearly
      - Return validation status (success/failure)
      - Handle CLI execution errors
      - Integration tests (may require mock CLI or conditional execution)

### Phase 5: Exchange Publishing (Optional)
**Goal**: Enable publishing validated SDFs to Open Horizon Exchange

13. **Implement Exchange Authentication**
    - Success Criteria:
      - Support reading credentials from environment or config
      - Handle authentication errors
      - Support different authentication methods
      - Unit tests for credential handling

14. **Implement SDF Publishing**
    - Success Criteria:
      - Execute `hzn exchange service publish` command
      - Handle publish errors
      - Report publish status
      - Support version updates
      - Integration tests (may require test Exchange or mocks)

### Phase 6: CLI Interface and User Experience
**Goal**: Create a user-friendly command-line interface

15. **Implement CLI Interface**
    - Success Criteria:
      - Command-line tool (e.g., `container-converter`)
      - Options for input Dockerfile path
      - Options for output SDF path
      - Options for service metadata (name, version, etc.)
      - Flag for validation
      - Flag for publishing
      - Help text and usage examples
      - Error handling and user-friendly messages

16. **Implement Interactive Mode (Optional Enhancement)**
    - Success Criteria:
      - Prompt user for missing information
      - Allow user to review and edit generated SDF
      - Confirm before publishing
      - Unit tests for interactive flows

### Phase 7: Documentation and Polish
**Goal**: Complete documentation and finalize the tool

17. **Write Documentation**
    - Success Criteria:
      - README.md with usage instructions
      - Examples of common Dockerfile conversions
      - Troubleshooting guide
      - API documentation (if exposing library API)

18. **Add Error Handling and Logging**
    - Success Criteria:
      - Comprehensive error handling throughout
      - Useful error messages
      - Logging levels (debug, info, warn, error)
      - Logging configuration

19. **Final Testing and Bug Fixes**
    - Success Criteria:
      - Test with various real-world Dockerfiles
      - Fix any discovered bugs
      - Performance testing for large Dockerfiles
      - Edge case handling verified

## Project Status Board

### Phase 1: Project Setup ✅
- [x] Task 0: Collect and Analyze SDF Examples (Preparation) - COMPLETED
- [x] Task 1: Initialize TypeScript/Node.js Project - COMPLETED
- [x] Task 2: Set Up Testing Framework - COMPLETED
- [x] Task 3: Install Core Dependencies - COMPLETED

### Phase 2: Dockerfile Parsing ✅
- [x] Task 4: Implement Dockerfile Reader - COMPLETED
- [x] Task 5: Implement Dockerfile Parser - COMPLETED
- [x] Task 6: Create Dockerfile Instruction Analyzer - COMPLETED

### Phase 3: SDF Generation ✅
- [x] Task 7: Design SDF Data Model - COMPLETED
  - `src/types/sdf.ts` (69 lines) - ServiceDefinition, ServiceMetadata, ServiceConfig, etc.
- [x] Task 8: Implement Service Metadata Inference - COMPLETED
  - `src/generator/metadata-inference.ts` (194 lines) - 32 passing tests
- [x] Task 9: Implement Dockerfile to SDF Mapper - COMPLETED
  - Integrated into `src/generator/sdf-generator.ts`
- [x] Task 10: Implement SDF Generator - COMPLETED
  - `src/generator/sdf-generator.ts` (197 lines) - 17 passing tests

### Phase 4: Validation Integration ✅
- [x] Task 11: Implement CLI Detection - COMPLETED
  - `src/validator/cli-detector.ts` (159 lines) - 21 passing tests
  - Functions: isHznCliAvailable(), getHznCliVersion(), isVersionCompatible()
- [x] Task 12: Implement SDF Validation - COMPLETED
  - `src/validator/sdf-validator.ts` (310 lines) - 34 passing tests
  - Schema validation for required fields, types, enums, deployment structure
  - CLI validation via `hzn service verify` (mocked in tests)
  - Combined validation with `validateFull()` method

### Phase 5: Exchange Publishing ✅
- [x] Task 13: Implement Exchange Authentication - COMPLETED
  - `src/publisher/exchange-auth.ts` (340 lines) - 39 passing tests
  - Functions: getCredentialsFromEnv(), loadCredentialsFromFile(), validateCredentials(), verifyExchangeConnection(), verifyUserAuth()
  - Supports environment variables and .cfg/.env file formats
  - User auth verified via `hzn exchange user list` command
- [x] Task 14: Implement SDF Publishing - COMPLETED
  - `src/publisher/exchange-publisher.ts` (280 lines) - 17 passing tests
  - Functions: publishService(), checkServiceExists(), getPublishedVersions(), unpublishService()
  - Supports overwrite, dry-run modes
  - Uses `hzn exchange service publish` command

### Phase 6: CLI Interface
- [ ] Task 15: Implement CLI Interface
- [ ] Task 16: Implement Interactive Mode (Optional)

### Phase 7: Documentation and Polish
- [ ] Task 17: Write Documentation
- [ ] Task 18: Add Error Handling and Logging
- [ ] Task 19: Final Testing and Bug Fixes

## Current Status / Progress Tracking

**Current Phase**: Phase 5 Complete - Ready for Phase 6 (CLI Interface)

**Last Updated**: 2026-01-26 - Task 14 (SDF Publishing) completed

**Overall Progress**: 14 of 19 tasks completed (74%)

**Test Status**: 187 passing tests, all validation passes (lint, typecheck, test)

**Notes**: 
- Plan has been created with 20 distinct tasks (including preparation task) across 7 phases
- Each task has clear success criteria
- Tasks are designed to be completed incrementally with testing at each step
- The plan follows TDD principles where applicable
- **Task 0 COMPLETED**: Collected 4 real-world SDF examples from open-horizon/examples repository
  - Examples saved in `examples/sdf-examples/` directory
  - Examples include: helloworld, cpu_percent, mqtt_broker, cpu2evtstreams
  - Each example includes both SDF and corresponding Dockerfile
  - Key findings documented in `examples/sdf-examples/README.md`
- **Phase 1 COMPLETED** (Tasks 1-3): Project setup and foundation
  - TypeScript/Node.js project initialized with strict mode
  - Complete project structure created (src/, tests/, docs/)
  - ESLint and Prettier configured and working
  - Jest testing framework set up with ts-jest
  - Core dependencies installed (dockerfile-ast, commander)
  - All validation passes (lint, typecheck, test)
  - Git repository initialized with initial commit
  - Detailed implementation plan documented in `docs/phase1-implementation-plan.md`
- **Phase 2 COMPLETED** (Tasks 4-6): Dockerfile parsing
  - File reader with comprehensive error handling (ENOENT, EACCES, EISDIR)
  - Dockerfile parser using dockerfile-ast library
  - Extraction of all major instructions: FROM, EXPOSE, ENV, CMD, ENTRYPOINT, WORKDIR, USER, VOLUME, LABEL
  - Multi-stage build support (extracts final stage)
  - Port parsing with protocol support (e.g., 8080/tcp)
  - ENV instruction support for both formats (key=value and key value)
  - 34 passing unit tests with comprehensive coverage
  - All validation passes (lint, typecheck, test)
- **Phase 3 COMPLETED** (Tasks 7-10): SDF Generation Logic
  - SDF data model with full type coverage (`src/types/sdf.ts`)
  - Service metadata inference from Dockerfile labels, base images (`src/generator/metadata-inference.ts`)
  - Dockerfile to SDF mapping for ports, env, cmd, volumes, etc.
  - SDF Generator class with JSON output formatting (`src/generator/sdf-generator.ts`)
  - 49 passing tests for generation logic
- **Phase 4 COMPLETED** (Tasks 11-12): Validation Integration
  - Task 11 COMPLETED: CLI Detection (`src/validator/cli-detector.ts`)
    - Checks for `hzn` CLI availability via `which hzn`
    - Version parsing from `hzn version` output
    - Version compatibility checking (semver comparison)
    - 21 passing unit tests with mocked exec
  - Task 12 COMPLETED: SDF Validation (`src/validator/sdf-validator.ts`)
    - Schema validation: required fields, types, enums, deployment structure
    - Port mapping, userInput, requiredServices validation
    - CLI validation via `hzn service verify` command
    - Combined validation with validateFull() method
    - 34 passing unit tests with mocked exec and fs

**Key Findings from SDF Examples**:
1. SDF structure confirmed with fields: org, label, description, url, version, arch, sharable, requiredServices, userInput, deployment
2. Deployment.services structure: image (required), ports (optional), privileged (optional)
3. Port format: `{"HostIP": "0.0.0.0", "HostPort": "8080:8080/tcp"}`
4. UserInput types: string, int, boolean
5. RequiredServices format: array with url, org, versionRange, arch
6. Many SDFs use template variables ($SERVICE_NAME, $ARCH, etc.) that need to be resolved
7. Sharable values: "multiple", "singleton", "none"
8. **Complex examples** (EdgeX Kamakura): Multi-service patterns, build-time generation via Makefiles, extensive use of template variables
9. Patterns group multiple services together for coordinated deployment

## Executor's Feedback or Assistance Requests

_This section will be populated by the Executor as work progresses._

---

## Refined Plan: Task 12 - Implement SDF Validation

### Overview
Task 12 involves extending `src/validator/sdf-validator.ts` to validate generated SDFs using two approaches:
1. **Schema validation** - Validate SDF structure locally against known schema requirements
2. **CLI validation** - Use `hzn` CLI to validate SDF against Open Horizon's validation rules

### Detailed Requirements

#### 12.1 Schema Validation (Local)
Validate SDF structure without requiring the `hzn` CLI:
- All required fields present: `label`, `description`, `url`, `version`, `arch`, `sharable`, `deployment`
- Field type validation (string, number, array, object)
- Enum validation for `sharable` (none, singleton, multiple)
- Deployment structure has at least one service
- Each service has required `image` field
- Port mapping format validation
- URL format validation

#### 12.2 CLI Validation (via hzn)
Integrate with Open Horizon CLI for authoritative validation:
- Use `hzn service verify` or equivalent command
- Parse CLI output for success/failure
- Extract specific validation errors
- Handle CLI unavailable scenario gracefully

### Success Criteria
1. `SDFValidator.validateSchema(sdf)` validates SDF structure locally
2. `SDFValidator.validateWithCli(sdf)` validates using `hzn` CLI (if available)
3. Clear error messages for each validation failure
4. Graceful fallback when CLI unavailable
5. Unit tests with mocked CLI responses
6. Integration tests (conditional on CLI availability)

### Implementation Notes
- Use the `cli-detector.ts` to check CLI availability before CLI validation
- Consider using a JSON schema validator library for schema validation
- The SDFGenerator already has a basic `validateSDF()` method - consider moving/extending
- Return structured validation results, not just boolean

### Files to Modify/Create
- `src/validator/sdf-validator.ts` - Extend placeholder with full implementation
- `tests/unit/validator/sdf-validator.test.ts` - Add comprehensive tests
- May need to add `ValidationResult` interface to `src/types/` or `src/validator/`

---

## Next Steps Summary (for Executor)

**Task 12 COMPLETED** - SDF Validation implemented with 34 passing tests.

**User selected Tasks 13-14 (Exchange Publishing)** - Proceed with authentication and publishing.

---

## Refined Plan: Tasks 13-14 - Exchange Authentication & Publishing

### Environment Configuration Reference

**Exchange URLs** (from `../agent-install.cfg`):
- `HZN_EXCHANGE_URL=http://open-horizon.lfedge.iol.unh.edu:3090/v1`
- `HZN_FSS_CSSURL=http://open-horizon.lfedge.iol.unh.edu:9443/`
- `HZN_AGBOT_URL=http://open-horizon.lfedge.iol.unh.edu:3111`

**User Credentials** (from `../mycreds.env`):
- `HZN_ORG_ID=examples`
- `HZN_EXCHANGE_USER_AUTH=joewxboy:4Weath*r` (username:password format)

---

### Task 13: Implement Exchange Authentication

**Goal**: Create a module to handle Exchange authentication and credential management.

#### 13.1 Credential Sources (priority order)
1. Environment variables (`HZN_ORG_ID`, `HZN_EXCHANGE_USER_AUTH`, `HZN_EXCHANGE_URL`)
2. Config file (user-provided path, supports `.cfg` and `.env` formats)
3. Manual input via CLI options

#### 13.2 Implementation Details

**New File**: `src/publisher/exchange-auth.ts`

**Interfaces**:
```typescript
interface ExchangeCredentials {
  orgId: string;           // HZN_ORG_ID
  userAuth: string;        // HZN_EXCHANGE_USER_AUTH (user:password)
  exchangeUrl: string;     // HZN_EXCHANGE_URL
}

interface AuthResult {
  authenticated: boolean;
  credentials?: ExchangeCredentials;
  error?: string;
}
```

**Functions**:
- `getCredentialsFromEnv(): ExchangeCredentials | null` - Read from environment
- `loadCredentialsFromFile(path: string): Promise<ExchangeCredentials | null>` - Parse `.cfg` or `.env` file
- `validateCredentials(creds: ExchangeCredentials): Promise<AuthResult>` - Test against Exchange
- `verifyExchangeConnection(creds: ExchangeCredentials): Promise<boolean>` - Check Exchange is reachable

#### 13.3 Success Criteria
- [ ] Read credentials from environment variables
- [ ] Load credentials from `.cfg` and `.env` file formats
- [ ] Validate credential format (non-empty, correct format)
- [ ] Test Exchange connectivity with `hzn exchange status` or HTTP request
- [ ] Clear error messages for missing/invalid credentials
- [ ] Unit tests with mocked environment and file system

---

### Task 14: Implement SDF Publishing

**Goal**: Publish validated SDFs to the Open Horizon Exchange.

#### 14.1 Implementation Details

**New File**: `src/publisher/exchange-publisher.ts`

**Interfaces**:
```typescript
interface PublishOptions {
  credentials: ExchangeCredentials;
  sdf: ServiceDefinition;
  dockerImageSource?: string;  // Optional: path to Dockerfile for image push
  overwrite?: boolean;         // Overwrite if service exists
  dryRun?: boolean;            // Validate only, don't publish
}

interface PublishResult {
  success: boolean;
  serviceUrl?: string;         // Full service URL in Exchange
  version?: string;
  error?: string;
  warnings?: string[];
}
```

**Functions**:
- `publishService(options: PublishOptions): Promise<PublishResult>`
- `checkServiceExists(creds, org, url, version): Promise<boolean>`
- `getPublishedVersions(creds, org, url): Promise<string[]>`

#### 14.2 CLI Command
Uses `hzn exchange service publish`:
```bash
hzn exchange service publish -f <sdf-file.json> \
  -o $HZN_ORG_ID \
  -u "$HZN_EXCHANGE_USER_AUTH"
```

#### 14.3 Success Criteria
- [ ] Execute `hzn exchange service publish` command with SDF file
- [ ] Pass credentials via environment variables (safer than CLI args)
- [ ] Handle publish success response
- [ ] Handle publish errors (already exists, auth failure, validation error)
- [ ] Support overwrite/update existing service
- [ ] Support dry-run mode (validate without publishing)
- [ ] Return structured result with service URL
- [ ] Unit tests with mocked CLI responses
- [ ] Integration test (conditional on Exchange availability)

---

### Task Breakdown for Executor

**Task 13 Sub-tasks**:
1. Create `src/publisher/exchange-auth.ts` with interfaces
2. Implement `getCredentialsFromEnv()`
3. Implement `loadCredentialsFromFile()` for .cfg/.env parsing
4. Implement `validateCredentials()` with format checking
5. Implement `verifyExchangeConnection()` using `hzn exchange status`
6. Write unit tests for all functions (mock env, fs, exec)
7. Add `ExchangeAuthError` to `src/utils/errors.ts`

**Task 14 Sub-tasks**:
1. Create `src/publisher/exchange-publisher.ts` with interfaces
2. Implement `publishService()` core function
3. Implement `checkServiceExists()` using `hzn exchange service list`
4. Implement error handling for various publish failures
5. Add `PublishError` to `src/utils/errors.ts`
6. Write unit tests with mocked CLI
7. Create integration test (skipped if Exchange unavailable)

---

### Files to Create/Modify

**New Files**:
- `src/publisher/exchange-auth.ts`
- `src/publisher/exchange-publisher.ts`
- `tests/unit/publisher/exchange-auth.test.ts`
- `tests/unit/publisher/exchange-publisher.test.ts`
- `tests/integration/exchange-publish.test.ts` (optional)

**Modified Files**:
- `src/utils/errors.ts` - Add ExchangeAuthError, PublishError
- `src/index.ts` - Export new modules

## Lessons

_This section will be populated with lessons learned during implementation._

### User Specified Lessons
- Include info useful for debugging in the program output.
- Read the file before you try to edit it.
- If there are vulnerabilities that appear in the terminal, run npm audit before proceeding
- Always ask before using the -force git command


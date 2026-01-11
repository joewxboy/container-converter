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

### Phase 3: SDF Generation Logic
**Goal**: Convert parsed Dockerfile information into Open Horizon SDF format

7. **Design SDF Data Model**
   - Success Criteria:
     - TypeScript interfaces/types for SDF structure
     - Covers all required and optional fields
     - Type-safe structure

8. **Implement Service Metadata Inference**
   - Success Criteria:
     - Infer service name from Dockerfile or user input
     - Infer version (default to 1.0.0 if not found)
     - Detect architecture from base image or user input
     - Determine sharable mode (with sensible defaults)
     - Generate label and description
     - Unit tests for inference logic

9. **Implement Dockerfile to SDF Mapper**
   - Success Criteria:
     - Map FROM instruction to image field
     - Map EXPOSE to port mappings
     - Map ENV to environment variables and userInputs
     - Map CMD/ENTRYPOINT to command
     - Map WORKDIR to working directory
     - Map USER to user settings
     - Map VOLUME to volume mounts
     - Handle edge cases and missing information
     - Unit tests with various Dockerfile examples

10. **Implement SDF Generator**
    - Success Criteria:
      - Generate complete SDF JSON from mapped data
      - Validate required fields are present
      - Format JSON output properly
      - Handle optional fields appropriately
      - Unit tests generating valid SDFs

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

- [x] Task 0: Collect and Analyze SDF Examples (Preparation) - COMPLETED
- [x] Task 1: Initialize TypeScript/Node.js Project - COMPLETED
- [x] Task 2: Set Up Testing Framework - COMPLETED
- [x] Task 3: Install Core Dependencies - COMPLETED
- [ ] Task 4: Implement Dockerfile Reader
- [ ] Task 5: Implement Dockerfile Parser
- [ ] Task 6: Create Dockerfile Instruction Analyzer
- [ ] Task 7: Design SDF Data Model
- [ ] Task 8: Implement Service Metadata Inference
- [ ] Task 9: Implement Dockerfile to SDF Mapper
- [ ] Task 10: Implement SDF Generator
- [ ] Task 11: Implement CLI Detection
- [ ] Task 12: Implement SDF Validation
- [ ] Task 13: Implement Exchange Authentication
- [ ] Task 14: Implement SDF Publishing
- [ ] Task 15: Implement CLI Interface
- [ ] Task 16: Implement Interactive Mode (Optional)
- [ ] Task 17: Write Documentation
- [ ] Task 18: Add Error Handling and Logging
- [ ] Task 19: Final Testing and Bug Fixes

## Current Status / Progress Tracking

**Current Phase**: Phase 1 Complete - Ready for Phase 2 (Dockerfile Parsing)

**Last Updated**: 2026-01-11 - After completing Phase 1 setup

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

## Lessons

_This section will be populated with lessons learned during implementation._

### User Specified Lessons
- Include info useful for debugging in the program output.
- Read the file before you try to edit it.
- If there are vulnerabilities that appear in the terminal, run npm audit before proceeding
- Always ask before using the -force git command


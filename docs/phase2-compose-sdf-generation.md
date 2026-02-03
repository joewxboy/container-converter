# Phase 2: Compose SDF Generation - Implementation Plan

## Overview
Implement the `ComposeSdfGenerator` class to convert parsed docker-compose data into Open Horizon Service Definition Files (SDFs). Support both single-SDF and multi-SDF generation strategies.

## Task Breakdown

### Task 2.1: Create ComposeSdfGenerator Base Structure
**File**: `src/generator/compose-sdf-generator.ts`

**Interfaces to Define**:
```typescript
export type GenerationStrategy = 'single-sdf' | 'multi-sdf';

export interface ComposeSdfOptions {
  strategy?: GenerationStrategy;
  organization?: string;
  version?: string;
  architecture?: string;
  projectName?: string;
}

export interface MultiSdfResult {
  sdfs: Record<string, ServiceDefinition>;
  dependencyGraph: Record<string, string[]>;
}
```

**Class Structure**:
```typescript
export class ComposeSdfGenerator {
  generate(composeData: ComposeData, options?: ComposeSdfOptions): ServiceDefinition | MultiSdfResult
  private inferStrategy(composeData: ComposeData): GenerationStrategy
  private generateSingleSdf(composeData: ComposeData, options: ComposeSdfOptions): ServiceDefinition
  private generateMultiSdf(composeData: ComposeData, options: ComposeSdfOptions): MultiSdfResult
  private mapComposeServiceToSdfService(service: ComposeService, name: string): ServiceConfig
  private mapPort(port: ComposePort): PortMapping
  private mapVolume(volume: ComposeVolumeMount): string
  private mapCommand(service: ComposeService): string[]
  private extractDependencies(service: ComposeService): string[]
}
```

**Success Criteria**:
- [ ] File created with all interfaces and class skeleton
- [ ] TypeScript compiles without errors
- [ ] All imports resolved correctly

---

### Task 2.2: Implement Strategy Inference Logic
**Method**: `inferStrategy(composeData: ComposeData): GenerationStrategy`

**Logic**:
- Count services in compose file
- Check for `depends_on` in any service
- Check for multiple custom networks
- **Decision Rules**:
  - Use `multi-sdf` if: serviceCount > 3 OR hasDependencies OR hasComplexNetworking
  - Otherwise use `single-sdf`

**Success Criteria**:
- [ ] Method implemented with clear decision logic
- [ ] Logs strategy decision with reasoning
- [ ] Unit tests cover all decision paths

---

### Task 2.3: Implement Service Mapping Helper Methods
**Methods**:
- `mapPort(port: ComposePort): PortMapping`
- `mapVolume(volume: ComposeVolumeMount): string`
- `mapCommand(service: ComposeService): string[]`
- `extractDependencies(service: ComposeService): string[]`

**Port Mapping**:
- Handle string format: "8080:80/tcp"
- Handle number format: 3000
- Handle object format: { target, published, protocol }
- Convert to SDF PortMapping: `{ HostIP: "0.0.0.0", HostPort: "8080:80/tcp" }`

**Volume Mapping**:
- Handle string format: "/host/path:/container/path:rw"
- Handle object format: { type, source, target, read_only }
- Warn on tmpfs volumes (should use tmpfs field)
- Convert to bind mount string

**Command Mapping**:
- Combine entrypoint + command
- Entrypoint takes precedence
- Return as string array

**Dependency Extraction**:
- Handle array format: ["db", "cache"]
- Handle object format: { db: { condition: "service_started" } }
- Return array of service names

**Success Criteria**:
- [ ] All helper methods implemented
- [ ] Handle all input formats
- [ ] Unit tests for each method with various inputs

---

### Task 2.4: Implement mapComposeServiceToSdfService
**Method**: `mapComposeServiceToSdfService(service: ComposeService, name: string): ServiceConfig`

**Validation**:
- **MUST** have `image` field (throw SDFGenerationError if missing)
- Error message should suggest pre-building and pushing to registry

**Mapping**:
- `image` → `ServiceConfig.image` (required)
- `ports` → `ServiceConfig.ports` (map each port)
- `environment` → `ServiceConfig.environment` (convert to KEY=VALUE array)
- `command` + `entrypoint` → `ServiceConfig.command` (combine)
- `volumes` → `ServiceConfig.binds` (map each volume)
- `privileged` → `ServiceConfig.privileged`
- `tmpfs` → `ServiceConfig.tmpfs` (convert to dictionary)

**Success Criteria**:
- [ ] Method implemented with all mappings
- [ ] Throws error if image missing
- [ ] Handles optional fields correctly
- [ ] Unit tests with various service configurations

---

### Task 2.5: Implement Single-SDF Generation
**Method**: `generateSingleSdf(composeData: ComposeData, options: ComposeSdfOptions): ServiceDefinition`

**Logic**:
1. Extract project name (from options, composeData.name, or default "compose-project")
2. Extract version, arch, org from options (with defaults)
3. Create empty services dictionary
4. For each service in composeData.services:
   - Map to ServiceConfig using `mapComposeServiceToSdfService`
   - Add to services dictionary
5. Build ServiceDefinition with all services in `deployment.services`
6. Set sharable to "multiple" (default for multi-container)

**Success Criteria**:
- [ ] Method implemented
- [ ] Generates valid SDF structure
- [ ] All services included in single SDF
- [ ] Unit tests with simple and complex compose files

---

### Task 2.6: Implement Multi-SDF Generation
**Method**: `generateMultiSdf(composeData: ComposeData, options: ComposeSdfOptions): MultiSdfResult`

**Logic**:
1. Extract project name, version, arch, org from options
2. Build dependency graph:
   - For each service, extract dependencies using `extractDependencies`
   - Store in dependencyGraph dictionary
3. Generate one SDF per service:
   - Service URL: `${projectName}.${serviceName}`
   - Map service to ServiceConfig
   - Build requiredServices from dependency graph
   - Set sharable based on privileged flag (singleton if privileged, multiple otherwise)
   - Create ServiceDefinition with single service in deployment
4. Return MultiSdfResult with sdfs and dependencyGraph

**Success Criteria**:
- [ ] Method implemented
- [ ] Generates one SDF per service
- [ ] Dependency graph correctly built
- [ ] requiredServices correctly mapped
- [ ] Unit tests with services that have dependencies

---

### Task 2.7: Implement Main Generate Method
**Method**: `generate(composeData: ComposeData, options?: ComposeSdfOptions): ServiceDefinition | MultiSdfResult`

**Logic**:
1. Determine strategy (from options or infer)
2. Log strategy decision
3. Call appropriate generation method
4. Return result

**Success Criteria**:
- [ ] Method implemented
- [ ] Correctly routes to single or multi-SDF generation
- [ ] Logs strategy decision
- [ ] Unit tests for both strategies

---

### Task 2.8: Write Comprehensive Unit Tests
**File**: `tests/unit/generator/compose-sdf-generator.test.ts`

**Test Suites**:

1. **Strategy Inference Tests**:
   - Simple compose (1-3 services, no deps) → single-sdf
   - Complex compose (4+ services) → multi-sdf
   - Compose with dependencies → multi-sdf
   - Compose with multiple networks → multi-sdf

2. **Helper Method Tests**:
   - Port mapping: string, number, object formats
   - Volume mapping: string, object formats, tmpfs warning
   - Command mapping: entrypoint only, command only, both
   - Dependency extraction: array, object formats

3. **Service Mapping Tests**:
   - Service with all fields
   - Service with minimal fields (image only)
   - Service missing image (should throw)
   - Service with privileged flag
   - Service with tmpfs

4. **Single-SDF Generation Tests**:
   - Simple compose (2 services)
   - Compose with custom project name
   - Compose with all service features
   - Verify all services in single SDF

5. **Multi-SDF Generation Tests**:
   - Compose with dependencies
   - Verify one SDF per service
   - Verify requiredServices correctly set
   - Verify dependency graph
   - Verify sharable based on privileged

6. **Integration Tests**:
   - Use real compose fixtures from `tests/fixtures/compose/`
   - Test with simple.docker-compose.yml
   - Test with with-dependencies.docker-compose.yml
   - Test with wordpress.docker-compose.yml

**Success Criteria**:
- [ ] All test suites implemented
- [ ] >90% code coverage for compose-sdf-generator.ts
- [ ] All tests passing
- [ ] Tests use fixtures from tests/fixtures/compose/

---

### Task 2.9: Add Integration Tests
**File**: `tests/integration/compose-conversion.test.ts`

**Test Cases**:
1. End-to-end: Parse compose → Generate SDF → Validate schema
2. WordPress example: Parse → Generate multi-SDF → Validate all SDFs
3. Simple example: Parse → Generate single-SDF → Validate
4. Verify generated SDFs match expected structure

**Success Criteria**:
- [ ] Integration test file created
- [ ] Tests use ComposeParser + ComposeSdfGenerator + SDFValidator
- [ ] All integration tests passing

---

## Implementation Order

1. **Task 2.1**: Create base structure (30 min)
2. **Task 2.3**: Implement helper methods (1 hour)
3. **Task 2.4**: Implement service mapping (1 hour)
4. **Task 2.2**: Implement strategy inference (30 min)
5. **Task 2.5**: Implement single-SDF generation (1 hour)
6. **Task 2.6**: Implement multi-SDF generation (1.5 hours)
7. **Task 2.7**: Implement main generate method (30 min)
8. **Task 2.8**: Write unit tests (2 hours)
9. **Task 2.9**: Write integration tests (1 hour)

**Total Estimated Time**: 8-10 hours

---

## Success Criteria for Phase 2 Completion

- [ ] `src/generator/compose-sdf-generator.ts` fully implemented
- [ ] All public methods have JSDoc comments
- [ ] Unit tests with >90% coverage
- [ ] Integration tests passing
- [ ] All validation passes (lint, typecheck, test)
- [ ] Can generate single-SDF from simple compose files
- [ ] Can generate multi-SDF from complex compose files
- [ ] Dependency graph correctly constructed
- [ ] Error handling for missing image field
- [ ] Warnings for unsupported features

---

## Next Steps After Phase 2

Once Phase 2 is complete:
1. Update TODO list to mark Phase 2 complete
2. Proceed to Phase 3: CLI Integration
3. Update AGENTS.md with Phase 2 completion status

# Open Horizon Service Definition File Examples

This directory contains real-world examples of Open Horizon Service Definition Files (SDFs) and their corresponding Dockerfiles, collected from the [open-horizon/examples](https://github.com/open-horizon/examples) repository.

## Examples Included

### 0. edgex-kamakura (Complex Example)
- **Pattern**: `edgex-kamakura-pattern.json`
- **Source**: [edgexfoundry-holding/orra](https://github.com/edgexfoundry-holding/orra/tree/main/demos/OH-EXF-Kamakura)
- **Features**: 
  - Multi-service pattern with service dependencies
  - Uses template variables extensively
  - Complex EdgeX Foundry deployment
  - Service definitions are generated via Makefiles
- **Note**: This is a more complex example showing how multiple services work together in a pattern. Individual service definitions are generated at build time.

### 1. helloworld
- **SDF**: `helloworld-service.definition.json`
- **Dockerfile**: `helloworld-Dockerfile`
- **Features**: Simple service with userInput, basic deployment
- **Sharable**: multiple

### 2. cpu_percent
- **SDF**: `cpu_percent-service.definition.json`
- **Dockerfile**: `cpu_percent-Dockerfile`
- **Features**: Port mappings, singleton service
- **Sharable**: singleton
- **Ports**: 8080:8080/tcp

### 3. mqtt_broker
- **SDF**: `mqtt_broker-service.definition.json`
- **Dockerfile**: `mqtt_broker-Dockerfile`
- **Features**: Privileged mode, singleton service
- **Sharable**: singleton
- **Privileged**: true

### 4. cpu2evtstreams
- **SDF**: `cpu2evtstreams-service.definition.json`
- **Dockerfile**: `cpu2evtstreams-Dockerfile` (to be added)
- **Features**: Required services, extensive userInput with various types
- **Sharable**: multiple
- **RequiredServices**: ibm.cpu, ibm.gps
- **UserInput**: Multiple fields including strings, ints, booleans

## Key Patterns Observed

1. **Service Metadata**:
   - `org`: Organization ID (often template variable)
   - `label`: Human-readable name
   - `description`: Service description
   - `url`: Service identifier
   - `version`: Semantic version
   - `arch`: Architecture (amd64, arm64, etc.)
   - `sharable`: "none", "singleton", or "multiple"

2. **Deployment Structure**:
   - `deployment.services.<service-name>.image`: Docker image reference
   - `deployment.services.<service-name>.ports`: Port mappings (optional)
   - `deployment.services.<service-name>.privileged`: Privileged mode (optional)

3. **User Input**:
   - Array of input definitions
   - Each input has: `name`, `label`, `type`, `defaultValue`
   - Types observed: `string`, `int`, `boolean`

4. **Required Services**:
   - Array of service dependencies
   - Each dependency has: `url`, `org`, `versionRange`, `arch`

## Notes

- Many SDFs use template variables like `$SERVICE_NAME`, `$ARCH`, `$SERVICE_VERSION`
- These are typically replaced during the build/publish process
- The examples show various complexity levels from simple to complex with dependencies
- Complex deployments (like EdgeX Kamakura) may use build systems (Makefiles) to generate service definitions dynamically
- Patterns are used to group multiple services together for deployment


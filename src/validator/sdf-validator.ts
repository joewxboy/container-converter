/**
 * SDF Validator
 * Validates Open Horizon Service Definition Files
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { ServiceDefinition, RequiredService, UserInput, PortMapping } from '../types/sdf';

const execAsync = promisify(exec);

/**
 * Validation error details
 */
export interface ValidationError {
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Result of validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[];
  cliAvailable?: boolean;
}

/**
 * SDF Validator class
 * Provides schema validation and CLI validation for Service Definition Files
 */
export class SDFValidator {
  private static readonly REQUIRED_FIELDS = [
    'label',
    'description',
    'url',
    'version',
    'arch',
    'sharable',
    'deployment',
  ] as const;

  private static readonly VALID_SHARABLE_VALUES = ['none', 'singleton', 'multiple'] as const;
  private static readonly VALID_USER_INPUT_TYPES = ['string', 'int', 'boolean'] as const;

  /**
   * Validate an SDF using schema validation
   * @param sdf - The SDF object to validate
   * @returns Validation result with errors
   */
  validateSchema(sdf: ServiceDefinition): ValidationResult {
    const errors: ValidationError[] = [];

    // Check for null/undefined/non-object
    if (sdf === null) {
      return {
        valid: false,
        errors: [{ message: 'SDF cannot be null', severity: 'error' }],
      };
    }

    if (sdf === undefined) {
      return {
        valid: false,
        errors: [{ message: 'SDF cannot be undefined', severity: 'error' }],
      };
    }

    if (typeof sdf !== 'object') {
      return {
        valid: false,
        errors: [{ message: 'SDF must be an object', severity: 'error' }],
      };
    }

    // Validate required fields
    this.validateRequiredFields(sdf, errors);

    // Validate field values
    this.validateFieldValues(sdf, errors);

    // Validate deployment structure
    this.validateDeployment(sdf, errors);

    // Validate optional arrays
    if (sdf.userInput) {
      this.validateUserInput(sdf.userInput, errors);
    }

    if (sdf.requiredServices) {
      this.validateRequiredServices(sdf.requiredServices, errors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate required fields are present
   */
  private validateRequiredFields(sdf: ServiceDefinition, errors: ValidationError[]): void {
    const sdfRecord = sdf as unknown as Record<string, unknown>;

    for (const field of SDFValidator.REQUIRED_FIELDS) {
      if (!(field in sdfRecord) || sdfRecord[field] === undefined) {
        errors.push({
          field,
          message: `Field "${field}" is required`,
          severity: 'error',
        });
      }
    }
  }

  /**
   * Validate field values are correct types and non-empty
   */
  private validateFieldValues(sdf: ServiceDefinition, errors: ValidationError[]): void {
    // Validate string fields are non-empty
    const stringFields = ['label', 'description', 'url', 'version', 'arch'] as const;

    for (const field of stringFields) {
      const value = sdf[field];
      if (value !== undefined && typeof value === 'string' && value.trim() === '') {
        errors.push({
          field,
          message: `Field "${field}" cannot be empty`,
          severity: 'error',
        });
      }
    }

    // Validate sharable enum
    if (
      sdf.sharable !== undefined &&
      !SDFValidator.VALID_SHARABLE_VALUES.includes(sdf.sharable as (typeof SDFValidator.VALID_SHARABLE_VALUES)[number])
    ) {
      errors.push({
        field: 'sharable',
        message: `Field "sharable" must be one of: ${SDFValidator.VALID_SHARABLE_VALUES.join(', ')}`,
        severity: 'error',
      });
    }
  }

  /**
   * Validate deployment structure
   */
  private validateDeployment(sdf: ServiceDefinition, errors: ValidationError[]): void {
    if (!sdf.deployment) {
      return; // Already caught by required field check
    }

    if (!sdf.deployment.services || Object.keys(sdf.deployment.services).length === 0) {
      errors.push({
        field: 'deployment.services',
        message: 'Deployment must contain at least one service',
        severity: 'error',
      });
      return;
    }

    // Validate each service
    for (const [serviceName, serviceConfig] of Object.entries(sdf.deployment.services)) {
      // Validate image is present and non-empty
      if (serviceConfig.image === undefined || serviceConfig.image === null) {
        errors.push({
          field: `deployment.services.${serviceName}.image`,
          message: `Service "${serviceName}" image is required`,
          severity: 'error',
        });
      } else if (typeof serviceConfig.image === 'string' && serviceConfig.image.trim() === '') {
        errors.push({
          field: `deployment.services.${serviceName}.image`,
          message: `Service "${serviceName}" image cannot be empty`,
          severity: 'error',
        });
      }

      // Validate ports if present
      if (serviceConfig.ports) {
        this.validatePorts(serviceName, serviceConfig.ports, errors);
      }
    }
  }

  /**
   * Validate port mappings
   */
  private validatePorts(serviceName: string, ports: PortMapping[], errors: ValidationError[]): void {
    for (let i = 0; i < ports.length; i++) {
      const port = ports[i];
      if (!port.HostPort) {
        errors.push({
          field: `deployment.services.${serviceName}.ports[${i}]`,
          message: `Port mapping must have HostPort`,
          severity: 'error',
        });
      }
    }
  }

  /**
   * Validate userInput array
   */
  private validateUserInput(userInput: UserInput[], errors: ValidationError[]): void {
    for (let i = 0; i < userInput.length; i++) {
      const input = userInput[i];

      if (!input.name) {
        errors.push({
          field: `userInput[${i}]`,
          message: `User input item must have a name`,
          severity: 'error',
        });
      }

      if (!input.label) {
        errors.push({
          field: `userInput[${i}]`,
          message: `User input item must have a label`,
          severity: 'error',
        });
      }

      if (
        !input.type ||
        !SDFValidator.VALID_USER_INPUT_TYPES.includes(input.type as (typeof SDFValidator.VALID_USER_INPUT_TYPES)[number])
      ) {
        errors.push({
          field: `userInput[${i}]`,
          message: `User input type must be one of: ${SDFValidator.VALID_USER_INPUT_TYPES.join(', ')}`,
          severity: 'error',
        });
      }
    }
  }

  /**
   * Validate requiredServices array
   */
  private validateRequiredServices(requiredServices: RequiredService[], errors: ValidationError[]): void {
    for (let i = 0; i < requiredServices.length; i++) {
      const service = requiredServices[i];

      if (!service.url) {
        errors.push({
          field: `requiredServices[${i}]`,
          message: `Required service must have a url`,
          severity: 'error',
        });
      }

      if (!service.org) {
        errors.push({
          field: `requiredServices[${i}]`,
          message: `Required service must have an org`,
          severity: 'error',
        });
      }

      if (!service.versionRange) {
        errors.push({
          field: `requiredServices[${i}]`,
          message: `Required service must have a versionRange`,
          severity: 'error',
        });
      }

      if (!service.arch) {
        errors.push({
          field: `requiredServices[${i}]`,
          message: `Required service must have an arch`,
          severity: 'error',
        });
      }
    }
  }

  /**
   * Validate SDF using the Open Horizon CLI
   * @param sdf - The SDF object to validate
   * @returns Promise resolving to validation result
   */
  async validateWithCli(sdf: ServiceDefinition): Promise<ValidationResult> {
    // Write SDF to temporary file
    const tempFile = join(tmpdir(), `sdf-validate-${Date.now()}.json`);

    try {
      await writeFile(tempFile, JSON.stringify(sdf, null, 2), 'utf-8');

      // Run hzn service verify command
      // Note: The actual command may vary based on hzn CLI version
      const { stdout, stderr } = await execAsync(`hzn service verify -f ${tempFile}`, {
        timeout: 30000, // 30 second timeout
      });

      // Check for validation success
      const output = stdout + stderr;
      if (output.toLowerCase().includes('error') || output.toLowerCase().includes('invalid')) {
        return {
          valid: false,
          errors: [{ message: output.trim() || 'CLI validation failed', severity: 'error' }],
          cliAvailable: true,
        };
      }

      return {
        valid: true,
        errors: [],
        cliAvailable: true,
      };
    } catch (error) {
      // Handle various error types
      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;

        // CLI not found
        if (nodeError.code === 'ENOENT' || nodeError.message.includes('not found')) {
          return {
            valid: false,
            errors: [
              {
                message: 'Open Horizon CLI (hzn) is not available. Please install it to use CLI validation.',
                severity: 'error',
              },
            ],
            cliAvailable: false,
          };
        }

        // Timeout
        if (nodeError.code === 'ETIMEDOUT' || nodeError.message.includes('timeout')) {
          return {
            valid: false,
            errors: [{ message: 'CLI validation timeout - command took too long', severity: 'error' }],
            cliAvailable: true,
          };
        }

        // Command execution error (validation failure)
        const execError = error as { stderr?: string; stdout?: string };
        const errorOutput = execError.stderr || execError.stdout || error.message;
        return {
          valid: false,
          errors: [{ message: errorOutput.trim() || 'CLI validation failed', severity: 'error' }],
          cliAvailable: true,
        };
      }

      return {
        valid: false,
        errors: [{ message: 'Unknown error during CLI validation', severity: 'error' }],
        cliAvailable: false,
      };
    } finally {
      // Clean up temp file
      try {
        await unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Validate SDF using schema validation (synchronous)
   * @param sdf - The SDF object to validate
   * @returns Validation result
   */
  validate(sdf: ServiceDefinition): ValidationResult {
    return this.validateSchema(sdf);
  }

  /**
   * Validate SDF using both schema and CLI validation
   * @param sdf - The SDF object to validate
   * @returns Promise resolving to combined validation result
   */
  async validateFull(sdf: ServiceDefinition): Promise<ValidationResult> {
    // First run schema validation
    const schemaResult = this.validateSchema(sdf);

    // If schema validation fails, return early
    if (!schemaResult.valid) {
      return schemaResult;
    }

    // Run CLI validation
    const cliResult = await this.validateWithCli(sdf);

    // Combine results
    return {
      valid: cliResult.valid,
      errors: [...schemaResult.errors, ...cliResult.errors],
      cliAvailable: cliResult.cliAvailable,
    };
  }
}

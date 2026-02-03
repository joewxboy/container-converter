/**
 * Container Converter TUI Application
 * Interactive terminal UI for converting Dockerfiles to SDFs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';

import { DockerfileParser } from '../parser/dockerfile-parser';
import { ComposeParser } from '../parser/compose-parser';
import { SDFGenerator } from '../generator/sdf-generator';
import { ComposeSdfGenerator, type MultiSdfResult } from '../generator/compose-sdf-generator';
import { SDFValidator } from '../validator/sdf-validator';
import { readDockerfile } from '../utils/file-reader';
import { getCredentials, validateCredentials, verifyExchangeConnection, verifyUserAuth } from '../publisher/exchange-auth';
import { publishService } from '../publisher/exchange-publisher';
import type { ServiceDefinition, ServiceMetadata } from '../types/sdf';

/**
 * Message in the chat history
 */
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * Application state
 */
type AppState = 
  | 'idle'
  | 'input'
  | 'processing'
  | 'confirm'
  | 'select'
  | 'preview'
  | 'error';

/**
 * Main App Component
 */
export const App: React.FC = () => {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>('input');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'system',
      content: 'Welcome to Container Converter! Type a command or describe what you want to do.',
      timestamp: new Date(),
    },
    {
      id: '2',
      role: 'assistant',
      content: 'I can help you convert Dockerfiles to Open Horizon SDFs. Try:\n  • "convert <dockerfile>" - Convert a Dockerfile\n  • "validate <sdf>" - Validate an SDF\n  • "publish <sdf>" - Publish to Exchange\n  • "check cli" - Check hzn CLI status\n  • "help" - Show all commands\n  • "quit" - Exit',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [currentSdf, setCurrentSdf] = useState<ServiceDefinition | null>(null);
  const [currentMultiSdf, setCurrentMultiSdf] = useState<MultiSdfResult | null>(null);
  const [currentStrategy, setCurrentStrategy] = useState<'single-sdf' | 'multi-sdf' | 'auto'>('auto');
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null);
  const [selectItems, setSelectItems] = useState<Array<{ label: string; value: string }>>([]);
  const [selectHandler, setSelectHandler] = useState<((value: string) => void) | null>(null);

  // Add a message to the chat
  const addMessage = useCallback((role: Message['role'], content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role,
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Handle user input
  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim()) return;

    const trimmed = value.trim().toLowerCase();
    addMessage('user', value);
    setInput('');

    // Check for quit command
    if (trimmed === 'quit' || trimmed === 'exit' || trimmed === 'q') {
      addMessage('assistant', 'Goodbye!');
      setTimeout(() => exit(), 500);
      return;
    }

    // Check for help command
    if (trimmed === 'help' || trimmed === '?') {
      addMessage('assistant', `Available commands:
  convert <dockerfile>       - Convert a Dockerfile to SDF
  convert compose <file>     - Convert a docker-compose.yml to SDF(s)
  parse compose <file>       - Parse and inspect a compose file
  strategy <single|multi>    - Set SDF generation strategy for compose
  validate <sdf-file>        - Validate an SDF file
  publish <sdf-file>         - Publish SDF to Exchange
  check cli                  - Check if hzn CLI is available
  list services              - List services in current compose/Exchange
  preview                    - Preview current SDF(s)
  save <path>                - Save current SDF(s) to file/directory
  help                       - Show this help
  quit                       - Exit the application

You can also describe what you want to do in natural language!`);
      return;
    }

    setState('processing');

    try {
      // Parse and execute command
      if (trimmed.startsWith('convert compose ')) {
        const composePath = value.trim().substring(16).trim();
        await handleConvertCompose(composePath);
      } else if (trimmed.startsWith('parse compose ')) {
        const composePath = value.trim().substring(14).trim();
        await handleParseCompose(composePath);
      } else if (trimmed.startsWith('convert ')) {
        const dockerfilePath = value.trim().substring(8).trim();
        await handleConvert(dockerfilePath);
      } else if (trimmed.startsWith('validate ')) {
        const sdfPath = value.trim().substring(9).trim();
        await handleValidate(sdfPath);
      } else if (trimmed.startsWith('publish ')) {
        const sdfPath = value.trim().substring(8).trim();
        await handlePublish(sdfPath);
      } else if (trimmed === 'check cli' || trimmed === 'check hzn') {
        await handleCheckCli();
      } else if (trimmed === 'list services' || trimmed === 'list') {
        await handleListServices();
      } else if (trimmed.startsWith('strategy ')) {
        const strategy = value.trim().substring(9).trim() as 'single-sdf' | 'multi-sdf' | 'auto';
        handleSetStrategy(strategy);
      } else if (trimmed === 'preview') {
        handlePreview();
      } else if (trimmed.startsWith('save ')) {
        const savePath = value.trim().substring(5).trim();
        await handleSave(savePath);
      } else {
        // Try to understand the intent
        await handleNaturalLanguage(value);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addMessage('assistant', `Error: ${message}`);
      setState('error');
    }

    setState('input');
  }, [addMessage, exit]);

  // Handle convert command
  const handleConvert = async (dockerfilePath: string) => {
    addMessage('assistant', `Converting ${dockerfilePath}...`);

    try {
      const content = await readDockerfile(dockerfilePath);
      const parser = new DockerfileParser();
      const dockerfileData = parser.parse(content);

      addMessage('assistant', `Parsed Dockerfile:\n  Base image: ${dockerfileData.baseImage}\n  Ports: ${dockerfileData.exposedPorts.join(', ') || 'none'}\n  Env vars: ${Object.keys(dockerfileData.environment).length}`);

      const generator = new SDFGenerator();
      const sdf = generator.generate(dockerfileData, {});
      setCurrentSdf(sdf);
      setCurrentMultiSdf(null);

      addMessage('assistant', `Generated SDF:
  Label: ${sdf.label}
  URL: ${sdf.url}
  Version: ${sdf.version}
  Architecture: ${sdf.arch}

Type "preview" to see full SDF, "save <path>" to save, or "publish <path>" to publish.`);
    } catch (error) {
      throw new Error(`Failed to convert: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle convert compose command
  const handleConvertCompose = async (composePath: string) => {
    addMessage('assistant', `Converting ${composePath} (strategy: ${currentStrategy})...`);

    try {
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);

      const serviceCount = Object.keys(composeData.services).length;
      addMessage('assistant', `Parsed compose file:\n  Project: ${composeData.name || 'unnamed'}\n  Services: ${serviceCount}\n  Services: ${Object.keys(composeData.services).join(', ')}`);

      const generator = new ComposeSdfGenerator();
      const options = {
        strategy: currentStrategy === 'auto' ? undefined : currentStrategy,
        projectName: composeData.name,
      };

      const result = generator.generate(composeData, options);

      // Check if single or multi SDF
      if ('label' in result) {
        // Single SDF
        const sdf = result as ServiceDefinition;
        setCurrentSdf(sdf);
        setCurrentMultiSdf(null);

        addMessage('assistant', `Generated single SDF with ${Object.keys(sdf.deployment.services).length} services:
  Label: ${sdf.label}
  URL: ${sdf.url}
  Version: ${sdf.version}
  Architecture: ${sdf.arch}

Type "preview" to see full SDF, "save <path>" to save, or "publish <path>" to publish.`);
      } else {
        // Multi SDF
        const multiResult = result as MultiSdfResult;
        setCurrentSdf(null);
        setCurrentMultiSdf(multiResult);

        const serviceList = Object.entries(multiResult.sdfs)
          .map(([name, sdf]) => {
            const deps = multiResult.dependencyGraph[name] || [];
            return `  • ${name} (${sdf.url})${deps.length > 0 ? ` → depends on: ${deps.join(', ')}` : ''}`;
          })
          .join('\n');

        addMessage('assistant', `Generated ${Object.keys(multiResult.sdfs).length} SDFs (multi-SDF strategy):
${serviceList}

Type "preview" to see all SDFs, "save <dir>" to save to directory, or "publish <dir>" to publish all.`);
      }
    } catch (error) {
      throw new Error(`Failed to convert compose: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle parse compose command
  const handleParseCompose = async (composePath: string) => {
    addMessage('assistant', `Parsing ${composePath}...`);

    try {
      const parser = new ComposeParser();
      const composeData = await parser.parseFile(composePath);

      const serviceCount = Object.keys(composeData.services).length;
      const networkCount = composeData.networks ? Object.keys(composeData.networks).length : 0;
      const volumeCount = composeData.volumes ? Object.keys(composeData.volumes).length : 0;

      // Build dependency graph
      const dependencyGraph: Record<string, string[]> = {};
      for (const [serviceName, service] of Object.entries(composeData.services)) {
        const deps: string[] = [];
        if (service.depends_on) {
          if (Array.isArray(service.depends_on)) {
            deps.push(...service.depends_on);
          } else {
            deps.push(...Object.keys(service.depends_on));
          }
        }
        dependencyGraph[serviceName] = deps;
      }

      const serviceDetails = Object.entries(composeData.services)
        .map(([name, service]) => {
          const deps = dependencyGraph[name];
          const ports = service.ports?.length || 0;
          const volumes = service.volumes?.length || 0;
          return `  • ${name}:\n    Image: ${service.image || 'build'}\n    Ports: ${ports}\n    Volumes: ${volumes}${deps.length > 0 ? `\n    Depends on: ${deps.join(', ')}` : ''}`;
        })
        .join('\n');

      addMessage('assistant', `Compose file structure:
  Project: ${composeData.name || 'unnamed'}
  Version: ${composeData.version || 'Compose Spec'}
  Services: ${serviceCount}
  Networks: ${networkCount}
  Volumes: ${volumeCount}

Services:
${serviceDetails}

Use "convert compose ${composePath}" to generate SDF(s).`);
    } catch (error) {
      throw new Error(`Failed to parse compose: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle set strategy command
  const handleSetStrategy = (strategy: 'single-sdf' | 'multi-sdf' | 'auto') => {
    if (!['single-sdf', 'multi-sdf', 'auto'].includes(strategy)) {
      addMessage('assistant', 'Invalid strategy. Use: single-sdf, multi-sdf, or auto');
      return;
    }
    setCurrentStrategy(strategy);
    addMessage('assistant', `Strategy set to: ${strategy}`);
  };

  // Handle validate command
  const handleValidate = async (sdfPath: string) => {
    addMessage('assistant', `Validating ${sdfPath}...`);

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(sdfPath, 'utf-8');
      const sdf = JSON.parse(content) as ServiceDefinition;

      const validator = new SDFValidator();
      const schemaResult = validator.validateSchema(sdf);

      if (schemaResult.valid) {
        addMessage('assistant', '✓ Schema validation passed!');
        
        const cliResult = await validator.validateWithCli(sdf);
        if (cliResult.cliAvailable === false) {
          addMessage('assistant', '⚠ hzn CLI not available - skipping CLI validation');
        } else if (cliResult.valid) {
          addMessage('assistant', '✓ CLI validation passed!');
        } else {
          const errors = cliResult.errors.map((e) => `  - ${e.message}`).join('\n');
          addMessage('assistant', `✗ CLI validation failed:\n${errors}`);
        }
      } else {
        const errors = schemaResult.errors.map((e) => `  - ${e.field ? `${e.field}: ` : ''}${e.message}`).join('\n');
        addMessage('assistant', `✗ Schema validation failed:\n${errors}`);
      }
    } catch (error) {
      throw new Error(`Failed to validate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle publish command
  const handlePublish = async (sdfPath: string) => {
    // Check if we have multi-SDF in memory
    if (currentMultiSdf && !sdfPath) {
      addMessage('assistant', 'Publishing all SDFs from current multi-SDF result...');
      await handlePublishMultiSdf(currentMultiSdf);
      return;
    }

    addMessage('assistant', `Preparing to publish ${sdfPath}...`);

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(sdfPath, 'utf-8');
      const loaded = JSON.parse(content);

      // Check if it's an array of SDFs
      if (Array.isArray(loaded)) {
        addMessage('assistant', `Found ${loaded.length} SDFs in file. Publishing all...`);
        await handlePublishMultipleSdfs(loaded);
        return;
      }

      const sdf = loaded as ServiceDefinition;

      // Check credentials
      const credentials = await getCredentials();
      if (!credentials) {
        addMessage('assistant', `No Exchange credentials found. Please set:
  HZN_ORG_ID - Organization ID
  HZN_EXCHANGE_USER_AUTH - User credentials (user:password)
  HZN_EXCHANGE_URL - Exchange URL`);
        return;
      }

      const authResult = validateCredentials(credentials);
      if (!authResult.authenticated) {
        addMessage('assistant', `Invalid credentials: ${authResult.error}`);
        return;
      }

      addMessage('assistant', `Credentials found for org: ${credentials.orgId}`);

      // Verify connection
      const connectionResult = await verifyExchangeConnection(credentials);
      if (!connectionResult.connected) {
        addMessage('assistant', `Cannot connect to Exchange: ${connectionResult.error}`);
        return;
      }

      addMessage('assistant', `Connected to Exchange${connectionResult.exchangeVersion ? ` (v${connectionResult.exchangeVersion})` : ''}`);

      // Verify user auth
      const userResult = await verifyUserAuth(credentials);
      if (!userResult.valid) {
        addMessage('assistant', `Authentication failed: ${userResult.error}`);
        return;
      }

      addMessage('assistant', `Authenticated as: ${userResult.username}\n\nPublishing ${sdf.url} v${sdf.version}...`);

      // Publish
      const publishResult = await publishService({
        credentials,
        sdf,
      });

      if (publishResult.success) {
        addMessage('assistant', `✓ Published successfully!\n  Service ID: ${publishResult.serviceId}`);
      } else {
        addMessage('assistant', `✗ Publish failed: ${publishResult.error}`);
      }
    } catch (error) {
      throw new Error(`Failed to publish: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle publishing multi-SDF result
  const handlePublishMultiSdf = async (multiResult: MultiSdfResult) => {
    const credentials = await getCredentials();
    if (!credentials) {
      addMessage('assistant', `No Exchange credentials found. Please set environment variables.`);
      return;
    }

    const authResult = validateCredentials(credentials);
    if (!authResult.authenticated) {
      addMessage('assistant', `Invalid credentials: ${authResult.error}`);
      return;
    }

    const connectionResult = await verifyExchangeConnection(credentials);
    if (!connectionResult.connected) {
      addMessage('assistant', `Cannot connect to Exchange: ${connectionResult.error}`);
      return;
    }

    const userResult = await verifyUserAuth(credentials);
    if (!userResult.valid) {
      addMessage('assistant', `Authentication failed: ${userResult.error}`);
      return;
    }

    addMessage('assistant', `Publishing ${Object.keys(multiResult.sdfs).length} services...`);

    let successCount = 0;
    let failureCount = 0;

    for (const [serviceName, sdf] of Object.entries(multiResult.sdfs)) {
      try {
        addMessage('assistant', `Publishing ${serviceName} (${sdf.url})...`);
        const publishResult = await publishService({
          credentials,
          sdf,
        });

        if (publishResult.success) {
          addMessage('assistant', `  ✓ ${serviceName} published successfully`);
          successCount++;
        } else {
          addMessage('assistant', `  ✗ ${serviceName} failed: ${publishResult.error}`);
          failureCount++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        addMessage('assistant', `  ✗ ${serviceName} failed: ${message}`);
        failureCount++;
      }
    }

    addMessage('assistant', `\nPublish complete: ${successCount} succeeded, ${failureCount} failed`);
  };

  // Handle publishing multiple SDFs from array
  const handlePublishMultipleSdfs = async (sdfs: ServiceDefinition[]) => {
    const credentials = await getCredentials();
    if (!credentials) {
      addMessage('assistant', `No Exchange credentials found. Please set environment variables.`);
      return;
    }

    const authResult = validateCredentials(credentials);
    if (!authResult.authenticated) {
      addMessage('assistant', `Invalid credentials: ${authResult.error}`);
      return;
    }

    const connectionResult = await verifyExchangeConnection(credentials);
    if (!connectionResult.connected) {
      addMessage('assistant', `Cannot connect to Exchange: ${connectionResult.error}`);
      return;
    }

    const userResult = await verifyUserAuth(credentials);
    if (!userResult.valid) {
      addMessage('assistant', `Authentication failed: ${userResult.error}`);
      return;
    }

    addMessage('assistant', `Publishing ${sdfs.length} services...`);

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < sdfs.length; i++) {
      const sdf = sdfs[i];
      const label = sdf.label || `SDF ${i + 1}`;

      try {
        addMessage('assistant', `Publishing ${label} (${sdf.url})...`);
        const publishResult = await publishService({
          credentials,
          sdf,
        });

        if (publishResult.success) {
          addMessage('assistant', `  ✓ ${label} published successfully`);
          successCount++;
        } else {
          addMessage('assistant', `  ✗ ${label} failed: ${publishResult.error}`);
          failureCount++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        addMessage('assistant', `  ✗ ${label} failed: ${message}`);
        failureCount++;
      }
    }

    addMessage('assistant', `\nPublish complete: ${successCount} succeeded, ${failureCount} failed`);
  };

  // Handle check CLI command
  const handleCheckCli = async () => {
    addMessage('assistant', 'Checking hzn CLI...');

    try {
      const { isHznCliAvailable } = await import('../validator/cli-detector');
      const result = await isHznCliAvailable();

      if (result.available) {
        addMessage('assistant', `✓ hzn CLI is available
  Path: ${result.path}
  Version: ${result.version || 'unknown'}`);
      } else {
        addMessage('assistant', `✗ hzn CLI not found
  ${result.error || 'Please install Open Horizon CLI'}`);
      }
    } catch (error) {
      throw new Error(`Failed to check CLI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle list services command
  const handleListServices = async () => {
    // If we have a multi-SDF loaded, list those services
    if (currentMultiSdf) {
      const serviceList = Object.entries(currentMultiSdf.sdfs)
        .map(([name, sdf]) => {
          const deps = currentMultiSdf.dependencyGraph[name] || [];
          return `  • ${name}\n    URL: ${sdf.url}\n    Version: ${sdf.version}${deps.length > 0 ? `\n    Dependencies: ${deps.join(', ')}` : ''}`;
        })
        .join('\n');

      addMessage('assistant', `Services in current multi-SDF (${Object.keys(currentMultiSdf.sdfs).length}):\n${serviceList}`);
      return;
    }

    addMessage('assistant', 'Listing Exchange services...');

    try {
      const credentials = await getCredentials();
      if (!credentials) {
        addMessage('assistant', 'No Exchange credentials found. Please set environment variables.');
        return;
      }

      const { getPublishedVersions } = await import('../publisher/exchange-publisher');
      // This would require a service URL to filter, so show a message
      addMessage('assistant', `To list services, please provide a service URL filter.
Example: list services myservice`);
    } catch (error) {
      throw new Error(`Failed to list services: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle preview command
  const handlePreview = () => {
    if (currentMultiSdf) {
      // Preview multi-SDF
      const serviceList = Object.keys(currentMultiSdf.sdfs).join(', ');
      addMessage('assistant', `Current multi-SDF (${Object.keys(currentMultiSdf.sdfs).length} services: ${serviceList}):`);
      
      for (const [serviceName, sdf] of Object.entries(currentMultiSdf.sdfs)) {
        addMessage('assistant', `\n--- ${serviceName} ---\n\`\`\`json\n${JSON.stringify(sdf, null, 2)}\n\`\`\``);
      }
      return;
    }

    if (!currentSdf) {
      addMessage('assistant', 'No SDF loaded. Use "convert <dockerfile>" or "convert compose <file>" first.');
      return;
    }

    addMessage('assistant', `Current SDF:\n\`\`\`json\n${JSON.stringify(currentSdf, null, 2)}\n\`\`\``);
  };

  // Handle save command
  const handleSave = async (savePath: string) => {
    if (currentMultiSdf) {
      // Save multi-SDF to directory
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        // Create directory if it doesn't exist
        await fs.mkdir(savePath, { recursive: true });
        
        const savedFiles: string[] = [];
        for (const [serviceName, sdf] of Object.entries(currentMultiSdf.sdfs)) {
          const filePath = path.join(savePath, `${serviceName}.json`);
          await fs.writeFile(filePath, JSON.stringify(sdf, null, 2), 'utf-8');
          savedFiles.push(filePath);
        }
        
        addMessage('assistant', `✓ Saved ${savedFiles.length} SDFs to ${savePath}:\n  ${savedFiles.map(f => path.basename(f)).join('\n  ')}`);
      } catch (error) {
        throw new Error(`Failed to save multi-SDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return;
    }

    if (!currentSdf) {
      addMessage('assistant', 'No SDF loaded. Use "convert <dockerfile>" or "convert compose <file>" first.');
      return;
    }

    try {
      const fs = await import('fs/promises');
      await fs.writeFile(savePath, JSON.stringify(currentSdf, null, 2), 'utf-8');
      addMessage('assistant', `✓ Saved SDF to ${savePath}`);
    } catch (error) {
      throw new Error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle natural language input
  const handleNaturalLanguage = async (text: string) => {
    const lower = text.toLowerCase();

    // Simple pattern matching for common phrases
    if (lower.includes('convert') && (lower.includes('compose') || lower.includes('docker-compose'))) {
      addMessage('assistant', 'To convert a docker-compose.yml file, use: convert compose <path/to/docker-compose.yml>');
    } else if (lower.includes('parse') && lower.includes('compose')) {
      addMessage('assistant', 'To parse a compose file, use: parse compose <path/to/docker-compose.yml>');
    } else if (lower.includes('convert') && lower.includes('dockerfile')) {
      addMessage('assistant', 'To convert a Dockerfile, use: convert <path/to/Dockerfile>');
    } else if (lower.includes('strategy') || lower.includes('single') || lower.includes('multi')) {
      addMessage('assistant', 'To set the SDF generation strategy, use: strategy <single-sdf|multi-sdf|auto>');
    } else if (lower.includes('validate')) {
      addMessage('assistant', 'To validate an SDF, use: validate <path/to/sdf.json>');
    } else if (lower.includes('publish')) {
      addMessage('assistant', 'To publish an SDF, use: publish <path/to/sdf.json>');
    } else if (lower.includes('list') && lower.includes('service')) {
      await handleListServices();
    } else if (lower.includes('cli') || lower.includes('hzn')) {
      await handleCheckCli();
    } else {
      addMessage('assistant', `I didn't understand that. Type "help" to see available commands.`);
    }
  };

  // Handle keyboard shortcuts
  useInput((input: string, key: { ctrl: boolean }) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  // Render messages
  const renderMessages = () => {
    // Show last 10 messages
    const recentMessages = messages.slice(-10);
    return recentMessages.map((msg) => (
      <Box key={msg.id} flexDirection="column" marginBottom={1}>
        <Text color={msg.role === 'user' ? 'cyan' : msg.role === 'assistant' ? 'green' : 'gray'}>
          {msg.role === 'user' ? '> ' : msg.role === 'assistant' ? '  ' : '# '}
          {msg.content}
        </Text>
      </Box>
    ));
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="blue">Container Converter</Text>
        <Text color="gray"> - Interactive Mode</Text>
      </Box>

      {/* Message history */}
      <Box flexDirection="column" marginBottom={1}>
        {renderMessages()}
      </Box>

      {/* Input area */}
      {state === 'processing' ? (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
            {' Processing...'}
          </Text>
        </Box>
      ) : state === 'select' && selectItems.length > 0 ? (
        <SelectInput
          items={selectItems}
          onSelect={(item: { value: string }) => selectHandler?.(item.value)}
        />
      ) : (
        <Box>
          <Text color="cyan">{'> '}</Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type a command or describe what you want to do..."
          />
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Press Ctrl+C to exit | Type "help" for commands
        </Text>
      </Box>
    </Box>
  );
};

export default App;

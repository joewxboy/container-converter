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
import { SDFGenerator } from '../generator/sdf-generator';
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
  convert <dockerfile>  - Convert a Dockerfile to SDF
  validate <sdf-file>   - Validate an SDF file
  publish <sdf-file>    - Publish SDF to Exchange
  check cli             - Check if hzn CLI is available
  list services         - List services in Exchange
  preview               - Preview current SDF
  save <path>           - Save current SDF to file
  help                  - Show this help
  quit                  - Exit the application

You can also describe what you want to do in natural language!`);
      return;
    }

    setState('processing');

    try {
      // Parse and execute command
      if (trimmed.startsWith('convert ')) {
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
    addMessage('assistant', `Preparing to publish ${sdfPath}...`);

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(sdfPath, 'utf-8');
      const sdf = JSON.parse(content) as ServiceDefinition;

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
    if (!currentSdf) {
      addMessage('assistant', 'No SDF loaded. Use "convert <dockerfile>" first.');
      return;
    }

    addMessage('assistant', `Current SDF:\n\`\`\`json\n${JSON.stringify(currentSdf, null, 2)}\n\`\`\``);
  };

  // Handle save command
  const handleSave = async (savePath: string) => {
    if (!currentSdf) {
      addMessage('assistant', 'No SDF loaded. Use "convert <dockerfile>" first.');
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
    if (lower.includes('convert') && lower.includes('dockerfile')) {
      addMessage('assistant', 'To convert a Dockerfile, use: convert <path/to/Dockerfile>');
    } else if (lower.includes('validate')) {
      addMessage('assistant', 'To validate an SDF, use: validate <path/to/sdf.json>');
    } else if (lower.includes('publish')) {
      addMessage('assistant', 'To publish an SDF, use: publish <path/to/sdf.json>');
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

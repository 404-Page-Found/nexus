import {
  cancel,
  confirm,
  isCancel,
  multiselect,
  password,
  select,
  text
} from '@clack/prompts';
import type { AppConfig, McpServerConfig, ProviderKind } from '../core/types.js';
import { createDefaultConfig, getDefaultModel } from './schema.js';
import { saveConfig } from './persistence.js';
import { storeProviderApiKey } from '../providers/auth.js';
import { nativeToolCatalog } from '../tools/nativeTools.js';

function asArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function asRecord(value: string | undefined): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>);
      if (entries.every(([, item]) => typeof item === 'string')) {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function promptMcpServer(): Promise<McpServerConfig | null> {
  const name = await text({
    message: 'MCP server name',
    placeholder: 'filesystem'
  });

  if (isCancel(name)) {
    return null;
  }

  const transport = await select({
    message: `Transport for ${name}`,
    options: [
      { label: 'stdio', value: 'stdio' },
      { label: 'http', value: 'http' }
    ]
  });

  if (isCancel(transport)) {
    return null;
  }

  if (transport === 'stdio') {
    const command = await text({
      message: 'Command to start the server',
      placeholder: 'node'
    });

    if (isCancel(command)) {
      return null;
    }

    const args = await text({
      message: 'Command args as JSON array',
      placeholder: '["server.js"]',
      initialValue: '[]'
    });

    if (isCancel(args)) {
      return null;
    }

    const cwd = await text({
      message: 'Optional working directory',
      placeholder: 'C:/path/to/server'
    });

    if (isCancel(cwd)) {
      return null;
    }

    const env = await text({
      message: 'Optional environment JSON object',
      placeholder: '{"DEBUG":"1"}',
      initialValue: '{}'
    });

    if (isCancel(env)) {
      return null;
    }

    const parsedEnv = asRecord(env);

    return {
      name,
      transport,
      command,
      args: asArray(args),
      ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
      ...(parsedEnv ? { env: parsedEnv } : {}),
      enabled: true
    };
  }

  const url = await text({
    message: 'HTTP MCP endpoint URL',
    placeholder: 'http://localhost:3000/mcp'
  });

  if (isCancel(url)) {
    return null;
  }

  const headers = await text({
    message: 'Optional request headers JSON object',
    placeholder: '{"Authorization":"Bearer ..."}',
    initialValue: '{}'
  });

  if (isCancel(headers)) {
    return null;
  }

  const parsedHeaders = asRecord(headers);

  return {
    name,
    transport,
    url,
    ...(parsedHeaders ? { headers: parsedHeaders } : {}),
    enabled: true
  };
}

export async function runConfigWizard(): Promise<AppConfig> {
  const defaults = createDefaultConfig();

  console.clear();

  const provider = await select({
    message: 'Select your primary provider',
    options: [
      { label: 'OpenAI', value: 'openai' },
      { label: 'Anthropic', value: 'anthropic' },
      { label: 'OpenAI-compatible endpoint', value: 'openai-compatible' }
    ]
  });

  if (isCancel(provider)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  const model = await text({
    message: 'Default model',
    initialValue: getDefaultModel(provider as ProviderKind)
  });

  if (isCancel(model)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  let baseUrl: string | undefined;
  if (provider === 'openai-compatible') {
    const compatibleBaseUrl = await text({
      message: 'Base URL for the compatible endpoint',
      placeholder: 'https://example.com/v1'
    });

    if (isCancel(compatibleBaseUrl)) {
      cancel('Setup cancelled');
      process.exit(0);
    }

    baseUrl = compatibleBaseUrl.trim() || undefined;
  }

  const saveApiKey = await confirm({
    message: 'Store an API key now?'
  });

  if (isCancel(saveApiKey)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  if (saveApiKey) {
    const apiKey = await password({
      message: 'API key'
    });

    if (isCancel(apiKey)) {
      cancel('Setup cancelled');
      process.exit(0);
    }

    await storeProviderApiKey(provider as ProviderKind, apiKey);
  }

  const availableNativeTools = Object.entries(nativeToolCatalog).map(([name, tool]) => ({
    value: name,
    label: `${name} - ${tool.spec.description}`
  }));

  const nativeTools = await multiselect({
    message: 'Select native tools to enable',
    options: availableNativeTools,
    required: false
  });

  if (isCancel(nativeTools)) {
    cancel('Setup cancelled');
    process.exit(0);
  }

  const mcpServers: McpServerConfig[] = [];
  while (await confirm({ message: 'Add an MCP server?' })) {
    const server = await promptMcpServer();
    if (!server) {
      break;
    }

    mcpServers.push(server);
  }

  const config: AppConfig = {
    ...defaults,
    provider: {
      kind: provider as ProviderKind,
      model,
      ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {})
    },
    tools: {
      native: nativeTools as string[],
      mcpServers
    },
    ui: {
      autoConnectMcp: true
    }
  };

  await saveConfig(config);

  console.log('Saved config to ~/.agent/config.yaml');
  return config;
}

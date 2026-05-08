import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import YAML from 'yaml';
import type { AppConfig } from '../core/types.js';
import { createDefaultConfig, parseConfig } from './schema.js';

export const agentHomeDir = join(homedir(), '.agent');
export const configPath = join(agentHomeDir, 'config.yaml');

async function ensureAgentHome(): Promise<void> {
  await mkdir(agentHomeDir, { recursive: true });
}

export async function loadConfig(): Promise<AppConfig | null> {
  try {
    const raw = await readFile(configPath, 'utf8');
    return parseConfig(YAML.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await ensureAgentHome();
  const output = YAML.stringify(config, { indent: 2 });
  await writeFile(configPath, output, { encoding: 'utf8' });
}

export async function loadOrCreateConfig(): Promise<AppConfig> {
  return (await loadConfig()) ?? createDefaultConfig();
}

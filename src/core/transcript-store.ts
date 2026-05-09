import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';
import { z } from 'zod';
import { agentHomeDir } from '../config/persistence.js';
import type { ChatMessage } from './types.js';

const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.unknown()
});

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
  toolCalls: z.array(toolCallSchema).optional()
});

const transcriptSchema = z.object({
  messages: z.array(chatMessageSchema)
});

export const transcriptPath = join(agentHomeDir, 'history.yaml');

async function ensureAgentHome(): Promise<void> {
  await mkdir(agentHomeDir, { recursive: true });
}

export async function loadTranscript(): Promise<ChatMessage[]> {
  try {
    const raw = await readFile(transcriptPath, 'utf8');
    return transcriptSchema.parse(YAML.parse(raw)).messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.name !== undefined ? { name: message.name } : {}),
      ...(message.toolCallId !== undefined ? { toolCallId: message.toolCallId } : {}),
      ...(message.toolCalls !== undefined
        ? {
            toolCalls: message.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments
            }))
          }
        : {})
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    return [];
  }
}

export async function saveTranscript(messages: ChatMessage[]): Promise<void> {
  await ensureAgentHome();
  const output = YAML.stringify({ messages }, { indent: 2 });
  await writeFile(transcriptPath, output, { encoding: 'utf8' });
}

export async function clearTranscript(): Promise<void> {
  try {
    await unlink(transcriptPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }
}
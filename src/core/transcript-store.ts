import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
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
const transcriptArchiveDir = join(agentHomeDir, 'history');

async function ensureAgentHome(): Promise<void> {
  await mkdir(agentHomeDir, { recursive: true });
}

async function ensureTranscriptArchiveDir(): Promise<void> {
  await ensureAgentHome();
  await mkdir(transcriptArchiveDir, { recursive: true });
}

function mapTranscriptMessage(message: z.infer<typeof chatMessageSchema>): ChatMessage {
  return {
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
  };
}

async function readTranscriptFile(path: string): Promise<ChatMessage[] | null> {
  const raw = await readFile(path, 'utf8');
  const parsed = transcriptSchema.parse(YAML.parse(raw));
  return parsed.messages.map(mapTranscriptMessage);
}

function summarizeTranscript(messages: ChatMessage[]): string {
  const firstMeaningfulMessage = messages.find((message) => message.role !== 'system');
  if (!firstMeaningfulMessage) {
    return 'Empty transcript';
  }

  const preview = firstMeaningfulMessage.content.trim().replace(/\s+/g, ' ');
  if (!preview) {
    return 'Empty transcript';
  }

  return preview.length > 72 ? `${preview.slice(0, 69)}...` : preview;
}

function createArchiveFileName(): string {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.yaml`;
}

async function statIfExists(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

export async function loadTranscript(): Promise<ChatMessage[]> {
  try {
    return (await readTranscriptFile(transcriptPath)) ?? [];
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

export async function archiveTranscript(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  await ensureTranscriptArchiveDir();
  const output = YAML.stringify({ messages }, { indent: 2 });
  await writeFile(join(transcriptArchiveDir, createArchiveFileName()), output, { encoding: 'utf8' });
}

export async function loadArchivedSummaries(): Promise<Array<{ id: string; messageCount: number; preview: string; updatedAt: string }>> {
  await ensureTranscriptArchiveDir();
  const entries = await readdir(transcriptArchiveDir, { withFileTypes: true });
  const summaries = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
      .map(async (entry) => {
        const path = join(transcriptArchiveDir, entry.name);
        try {
          const [raw, fileStats] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
          const parsed = YAML.parse(raw) as { messages?: unknown[] };
          const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
          if (messages.length === 0) {
            return null;
          }

          const firstMeaningful = messages.find(
            (m) => typeof m === 'object' && m !== null && 'role' in m && (m as { role: string }).role !== 'system'
          ) as { content?: string } | undefined;

          const content = typeof firstMeaningful?.content === 'string' ? firstMeaningful.content : '';
          const preview = content.trim().replace(/\s+/g, ' ');

          return {
            id: entry.name,
            messageCount: messages.length,
            preview: preview.length > 72 ? `${preview.slice(0, 69)}...` : (preview || 'Empty transcript'),
            updatedAt: fileStats.mtime.toISOString()
          };
        } catch {
          return null;
        }
      })
  );

  return summaries.filter((s): s is { id: string; messageCount: number; preview: string; updatedAt: string } => s !== null);
}

export async function loadArchivedTranscripts(): Promise<Array<{ id: string; messages: ChatMessage[]; updatedAt: string }>> {
  await ensureTranscriptArchiveDir();
  const entries = await readdir(transcriptArchiveDir, { withFileTypes: true });
  const transcripts = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
      .map(async (entry) => {
        const path = join(transcriptArchiveDir, entry.name);
        try {
          const [messages, fileStats] = await Promise.all([readTranscriptFile(path), stat(path)]);
          if (!messages) {
            return null;
          }

          return {
            id: entry.name,
            messages,
            updatedAt: fileStats.mtime.toISOString()
          };
        } catch {
          return null;
        }
      })
  );

  return transcripts.filter((transcript): transcript is { id: string; messages: ChatMessage[]; updatedAt: string } => transcript !== null);
}

export async function loadTranscriptById(id: string): Promise<ChatMessage[]> {
  if (id === 'current') {
    return loadTranscript();
  }

  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`Invalid transcript id: ${id}`);
  }

  const resolvedPath = resolve(transcriptArchiveDir, id);
  if (!resolvedPath.startsWith(resolve(transcriptArchiveDir))) {
    throw new Error(`Invalid transcript id: ${id}`);
  }

  return (await readTranscriptFile(resolvedPath)) ?? [];
}

export async function listTranscripts(): Promise<
  Array<{
    id: string;
    label: string;
    messageCount: number;
    preview: string;
    updatedAt: string;
    isCurrent: boolean;
  }>
> {
  const currentMessages = await loadTranscript();
  const currentTranscript = currentMessages.length
    ? [
        {
          id: 'current',
          label: 'Current conversation',
          messageCount: currentMessages.length,
          preview: summarizeTranscript(currentMessages),
          updatedAt: (await statIfExists(transcriptPath)) ?? new Date(0).toISOString(),
          isCurrent: true
        }
      ]
    : [];

  const archiveTranscripts = await loadArchivedSummaries();
  const archivedSummaries = archiveTranscripts.map((transcript) => ({
    id: transcript.id,
    label: transcript.preview.length > 48 ? `${transcript.preview.slice(0, 45)}...` : transcript.preview,
    messageCount: transcript.messageCount,
    preview: transcript.preview,
    updatedAt: transcript.updatedAt,
    isCurrent: false
  }));

  return [...currentTranscript, ...archivedSummaries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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

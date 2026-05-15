import type { AppConfig } from '../core/types.js';
import type { ChatMessage } from '../core/types.js';
import { spawnSync } from 'child_process';
import { AgentStateManager } from '../core/state-manager.js';
import { runAgentLoop } from '../core/agent-loop.js';
import { loadConfig } from '../config/persistence.js';
import {
  archiveTranscript,
  clearTranscript,
  listTranscripts as loadSavedTranscripts,
  loadTranscript,
  loadTranscriptById,
  saveTranscript
} from '../core/transcript-store.js';
import { createProviderClient } from '../providers/index.js';
import { ToolRegistry } from '../tools/registry.js';

export interface TuiCommand {
  id: string;
  label: string;
  description: string;
}

export interface TuiSession {
  state: AgentStateManager;
  commands: TuiCommand[];
  submitPrompt(prompt: string): Promise<void>;
  startNewChat(): Promise<void>;
  listTranscripts(): Promise<TranscriptSummary[]>;
  openTranscript(transcriptId: string): Promise<void>;
  refreshAuth(): Promise<void>;
  refreshTools(): Promise<void>;
  clearConversation(): void;
  abort(): void;
  executeCommand(commandId: string): Promise<void>;
  dispose(): Promise<void>;
}

export interface TranscriptSummary {
  id: string;
  label: string;
  messageCount: number;
  preview: string;
  updatedAt: string;
  isCurrent: boolean;
}

export async function createTuiSession(config: AppConfig): Promise<TuiSession> {
  const initialMessages = await loadTranscript();
  let transcriptWriteQueue = Promise.resolve();
  let activeConfig = config;

  const persistConversation = (messages: ChatMessage[]): Promise<void> => {
    transcriptWriteQueue = transcriptWriteQueue
      .catch(() => undefined)
      .then(async () => {
        if (messages.length === 0) {
          await clearTranscript();
          return;
        }

        await saveTranscript(messages);
      });

    void transcriptWriteQueue.catch(() => undefined);
    return transcriptWriteQueue;
  };

  const waitForTranscriptWrites = async (): Promise<void> => {
    await transcriptWriteQueue.catch(() => undefined);
  };

  const state = new AgentStateManager(config, {
    initialMessages,
    onConversationChange: persistConversation
  });
  const initialProvider = await createProviderClient(activeConfig);
  let provider = initialProvider.client;
  state.setAuthSource(initialProvider.secretSource);
  let tools = new ToolRegistry(activeConfig);
  await tools.refresh();
  state.setMcpInspector(tools.getMcpInspector());

  let activeController: AbortController | null = null;
  let refreshInProgress = false;
  let refreshPromise: Promise<void> | null = null;

  const launchConfigEditor = (): boolean => {
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'setup'], {
      stdio: 'inherit'
    });

    if (result.error) {
      state.setError(`Failed to launch config editor: ${result.error.message}`);
      return false;
    }

    if (result.status !== 0) {
      state.setError(`Config editor exited with code ${result.status ?? 'unknown'}`);
      return false;
    }

    return true;
  };

  const reloadProvider = async (nextConfig: AppConfig): Promise<void> => {
    const nextProvider = await createProviderClient(nextConfig);
    const previousProvider = provider;
    provider = nextProvider.client;
    state.setAuthSource(nextProvider.secretSource);

    try {
      await previousProvider.close?.();
    } catch {
      // Best-effort cleanup; the live session already points at the refreshed provider.
    }
  };

  const refreshAuth = async (): Promise<void> => {
    if (state.getSnapshot().isBusy) {
      state.setStatus('Finish the active turn before refreshing credentials');
      return;
    }

    state.markBusy('Refreshing provider credentials');

    try {
      await reloadProvider(activeConfig);
      state.markIdle('Provider credentials refreshed');
    } catch (error) {
      state.setError(`Failed to refresh provider credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const refreshTools = async (): Promise<void> => {
    if (state.getSnapshot().isBusy) {
      state.setStatus('Finish the active turn before refreshing MCP tools');
      return;
    }

    if (refreshInProgress) {
      state.setStatus('MCP tools refresh already in progress');
      return refreshPromise ?? Promise.resolve();
    }

    refreshInProgress = true;
    state.markBusy('Refreshing MCP tools');
    let nextTools: ToolRegistry | null = null;
    const previousTools = tools;

    refreshPromise = (async () => {
      try {
        const reloadedConfig = await loadConfig();
        if (!reloadedConfig) {
          throw new Error('No config file found. Run setup before refreshing MCP tools.');
        }

        const nextConfig = reloadedConfig;
        nextTools = new ToolRegistry(nextConfig);

        await nextTools.refresh();

        await reloadProvider(nextConfig);

        tools = nextTools;
        activeConfig = nextConfig;
        state.replaceConfig(nextConfig);
        state.setMcpInspector(tools.getMcpInspector());
        state.markIdle(`Loaded ${tools.toProviderTools().length} tools`);

        try {
          await previousTools.dispose();
        } catch {
          // Best-effort cleanup; the live session already points at the refreshed resources.
        }
      } catch (error) {
        if (nextTools) {
          await nextTools.dispose();
        }
        state.setError(`Failed to refresh MCP tools: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        refreshInProgress = false;
        refreshPromise = null;
        if (state.getSnapshot().isBusy) {
          state.markIdle();
        }
      }
    })();

    return refreshPromise;
  };

  const submitPrompt = async (prompt: string): Promise<void> => {
    if (!prompt.trim() || state.getSnapshot().isBusy) {
      return;
    }

    activeController = new AbortController();
    try {
      await runAgentLoop(
        {
          config: activeConfig,
          state,
          provider,
          tools,
          signal: activeController.signal
        },
        prompt.trim(),
      );
    } catch {
      // The state manager already captured the failure.
    } finally {
      activeController = null;
    }
  };

  const startNewChat = async (): Promise<void> => {
    if (state.getSnapshot().isBusy) {
      state.setStatus('Finish the active turn before starting a new chat');
      return;
    }

    try {
      await waitForTranscriptWrites();
      const currentMessages = state.getSnapshot().messages;
      await archiveTranscript(currentMessages);
      state.clearConversation();
      state.setMcpInspector(tools.getMcpInspector());
    } catch (error) {
      state.setError(`Failed to start a new chat: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const openTranscript = async (transcriptId: string): Promise<void> => {
    if (state.getSnapshot().isBusy) {
      state.setStatus('Finish the active turn before opening a transcript');
      return;
    }

    try {
      await waitForTranscriptWrites();
      if (transcriptId !== 'current') {
        const currentMessages = state.getSnapshot().messages;
        await archiveTranscript(currentMessages);
      }
      const messages = await loadTranscriptById(transcriptId);
      state.replaceConversation(messages);
    } catch (error) {
      state.setError(`Failed to open transcript: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const listSavedTranscripts = async (): Promise<TranscriptSummary[]> => {
    await waitForTranscriptWrites();
    return loadSavedTranscripts();
  };

  const executeCommand = async (commandId: string): Promise<void> => {
    switch (commandId) {
      case 'new-chat':
        await startNewChat();
        break;
      case 'browse-transcripts':
        break;
      case 'edit-config':
        if (state.getSnapshot().isBusy) {
          state.setStatus('Finish the active turn before editing config');
          break;
        }

        state.setStatus('Editing configuration');

        if (launchConfigEditor()) {
          await refreshTools();
        }
        break;
      case 'refresh-auth':
        await refreshAuth();
        break;
      case 'refresh-tools':
        await refreshTools();
        break;
      case 'abort':
        activeController?.abort();
        break;
      default:
        break;
    }
  };

  return {
    state,
    commands: [
      {
        id: 'new-chat',
        label: 'New chat',
        description: 'Archive the current conversation and start a clean chat'
      },
      {
        id: 'browse-transcripts',
        label: 'Browse transcripts',
        description: 'View saved chats and reopen one without deleting it'
      },
      {
        id: 'edit-config',
        label: 'Edit config',
        description: 'Open the configuration editor and reload settings after saving'
      },
      {
        id: 'refresh-auth',
        label: 'Refresh auth',
        description: 'Re-read the active provider credentials from env, keychain, or vault'
      },
      {
        id: 'refresh-tools',
        label: 'Refresh tools',
        description: 'Reconnect MCP servers, reload the tool list, and re-resolve provider auth'
      },
      {
        id: 'abort',
        label: 'Abort turn',
        description: 'Stop the active provider or tool request'
      },
      {
        id: 'quit',
        label: 'Quit',
        description: 'Exit the terminal UI'
      }
    ],
    submitPrompt,
    startNewChat,
    listTranscripts: listSavedTranscripts,
    openTranscript,
    refreshAuth,
    refreshTools,
    clearConversation: () => state.clearConversation(),
    abort: () => activeController?.abort(),
    executeCommand,
    dispose: async () => {
      await transcriptWriteQueue.catch(() => undefined);
      await refreshPromise?.catch(() => undefined);
      await tools.dispose();
      await provider.close?.();
    }
  };
}

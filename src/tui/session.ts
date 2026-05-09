import type { AppConfig } from '../core/types.js';
import type { ChatMessage } from '../core/types.js';
import { AgentStateManager } from '../core/state-manager.js';
import { runAgentLoop } from '../core/agent-loop.js';
import { loadConfig } from '../config/persistence.js';
import { clearTranscript, loadTranscript, saveTranscript } from '../core/transcript-store.js';
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
  refreshTools(): Promise<void>;
  clearConversation(): void;
  abort(): void;
  executeCommand(commandId: string): Promise<void>;
  dispose(): Promise<void>;
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

  const state = new AgentStateManager(config, {
    initialMessages,
    onConversationChange: persistConversation
  });
  let provider = await createProviderClient(activeConfig);
  let tools = new ToolRegistry(activeConfig);
  await tools.refresh();

  let activeController: AbortController | null = null;
  let refreshInProgress = false;

  const refreshTools = async (): Promise<void> => {
    if (state.getSnapshot().isBusy) {
      state.setStatus('Finish the active turn before refreshing MCP tools');
      return;
    }

    if (refreshInProgress) {
      state.setStatus('MCP tools refresh already in progress');
      return;
    }

    refreshInProgress = true;

    state.setStatus('Refreshing MCP tools');
    let nextTools: ToolRegistry | null = null;
    let nextProvider: typeof provider | null = null;
    const previousProvider = provider;
    const previousTools = tools;

    try {
      const reloadedConfig = await loadConfig();
      const nextConfig = reloadedConfig ?? activeConfig;
      nextTools = new ToolRegistry(nextConfig);

      await nextTools.refresh();

      if (nextConfig !== activeConfig) {
        nextProvider = await createProviderClient(nextConfig);
      }

      if (nextProvider) {
        provider = nextProvider;
      }

      tools = nextTools;
      activeConfig = nextConfig;
      state.replaceConfig(nextConfig);
      state.setStatus(`Loaded ${tools.toProviderTools().length} tools`);

      try {
        await previousTools.dispose();
        if (nextProvider) {
          await previousProvider.close?.();
        }
      } catch {
        // Best-effort cleanup; the live session already points at the new resources.
      }
    } catch (error) {
      if (nextProvider) {
        await nextProvider.close?.();
      }
      if (nextTools) {
        await nextTools.dispose();
      }
      state.setError(`Failed to refresh MCP tools: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      refreshInProgress = false;
    }
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

  const executeCommand = async (commandId: string): Promise<void> => {
    switch (commandId) {
      case 'new-chat':
        state.clearConversation();
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
        description: 'Clear the conversation history and saved transcript'
      },
      {
        id: 'refresh-tools',
        label: 'Refresh tools',
        description: 'Reconnect MCP servers and reload the tool list'
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
    refreshTools,
    clearConversation: () => state.clearConversation(),
    abort: () => activeController?.abort(),
    executeCommand,
    dispose: async () => {
      await transcriptWriteQueue.catch(() => undefined);
      await tools.dispose();
      await provider.close?.();
    }
  };
}

import type { AppConfig } from '../core/types.js';
import { AgentStateManager } from '../core/state-manager.js';
import { runAgentLoop } from '../core/agent-loop.js';
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
  const state = new AgentStateManager(config);
  const provider = await createProviderClient(config);
  const tools = new ToolRegistry(config);
  await tools.refresh();

  let activeController: AbortController | null = null;

  const refreshTools = async (): Promise<void> => {
    state.setStatus('Refreshing MCP tools');
    await tools.refresh();
    state.setStatus(`Loaded ${tools.toProviderTools().length} tools`);
  };

  const submitPrompt = async (prompt: string): Promise<void> => {
    if (!prompt.trim() || state.getSnapshot().isBusy) {
      return;
    }

    activeController = new AbortController();
    try {
      await runAgentLoop(
        {
          config,
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
        description: 'Clear the conversation history'
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
      await tools.dispose();
      await provider.close?.();
    }
  };
}

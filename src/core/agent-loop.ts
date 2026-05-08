import { DEFAULT_SYSTEM_PROMPT } from './prompts.js';
import type { AppConfig, ChatMessage, ToolCall, ToolResult } from './types.js';
import type { AgentStateManager } from './state-manager.js';
import type { LLMClient } from '../providers/types.js';
import type { ToolRegistry } from '../tools/registry.js';

export interface AgentLoopDependencies {
  config: AppConfig;
  state: AgentStateManager;
  provider: LLMClient;
  tools: ToolRegistry;
  signal?: AbortSignal;
  maxRounds?: number;
}

export interface AgentLoopResult {
  finalMessage?: ChatMessage;
  toolCalls: ToolCall[];
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildConversation(messages: ChatMessage[]): ChatMessage[] {
  return [{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }, ...messages];
}

function toolResultMessage(toolCall: ToolCall, result: ToolResult): ChatMessage {
  return {
    role: 'tool',
    content: result.content,
    name: toolCall.name,
    toolCallId: toolCall.id
  };
}

export async function runAgentLoop(dependencies: AgentLoopDependencies, userPrompt: string): Promise<AgentLoopResult> {
  const { config, state, provider, tools, signal } = dependencies;
  const maxRounds = dependencies.maxRounds ?? 6;
  const toolCalls: ToolCall[] = [];

  state.appendMessage({ role: 'user', content: userPrompt });
  state.markBusy(`Thinking with ${config.provider.kind}/${config.provider.model}`);

  let conversation = buildConversation(state.getSnapshot().messages);

  try {
    for (let round = 0; round < maxRounds; round += 1) {
      state.setStatus(`Model round ${round + 1}`);
      state.setStreamingText('');

      const completion = await provider.complete({
        messages: conversation,
        tools: tools.toProviderTools(),
        signal,
        onToken: (token) => {
          state.appendStreamingText(token);
        }
      });

      state.clearStreamingText();
      state.appendMessage(completion.message);
      conversation = buildConversation([...state.getSnapshot().messages]);

      if (completion.toolCalls.length === 0) {
        state.markIdle('Idle');
        return {
          finalMessage: completion.message,
          toolCalls
        };
      }

      for (const call of completion.toolCalls) {
        if (signal?.aborted) {
          throw new Error('Agent run aborted');
        }

        toolCalls.push(call);
        state.setStatus(`Running tool ${call.name}`);
        const result = await tools.invoke(call.name, call.arguments, {
          config,
          ...(signal ? { signal } : {})
        });
        state.appendMessage(toolResultMessage(call, result));
        conversation = buildConversation([...state.getSnapshot().messages]);
      }
    }

    state.markIdle(`Stopped after ${maxRounds} rounds`);
    return { toolCalls };
  } catch (error) {
    const message = formatError(error);
    if (signal?.aborted) {
      state.setError('Aborted');
    } else {
      state.setError(message);
    }

    throw error;
  }
}

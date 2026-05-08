import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { ChatMessage } from '../core/types.js';

function roleLabel(role: ChatMessage['role']): string {
  switch (role) {
    case 'assistant':
      return 'assistant';
    case 'tool':
      return 'tool';
    case 'system':
      return 'system';
    case 'user':
    default:
      return 'you';
  }
}

function roleColor(role: ChatMessage['role']): 'green' | 'cyan' | 'gray' | 'magenta' {
  switch (role) {
    case 'assistant':
      return 'cyan';
    case 'tool':
      return 'magenta';
    case 'system':
      return 'gray';
    case 'user':
    default:
      return 'green';
  }
}

export function MessageList({ messages, streamingText }: { messages: ChatMessage[]; streamingText: string }): ReactElement {
  const visibleMessages = messages.slice(-12);

  return (
    <Box flexDirection="column" gap={1}>
      {visibleMessages.map((message, index) => (
        <Box key={`${message.role}-${index}`} flexDirection="column" marginBottom={1}>
          <Text color={roleColor(message.role)}>{roleLabel(message.role)}</Text>
          <Text>{message.content || '(empty)'}</Text>
        </Box>
      ))}
      {streamingText ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyan">assistant</Text>
          <Text dimColor>{streamingText}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function StatusBar({
  status,
  provider,
  model,
  busy,
  error
}: {
  status: string;
  provider: string;
  model: string;
  busy: boolean;
  error: string | undefined;
}): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={busy ? 'yellow' : 'green'}>
        {status}
        {'  '}
        {provider}/{model}
      </Text>
      {error ? <Text color="red">{error}</Text> : null}
    </Box>
  );
}

export function InputLine({ draft }: { draft: string }): ReactElement {
  return (
    <Box marginTop={1}>
      <Text color="gray">&gt; </Text>
      <Text>{draft || 'Type a message. Ctrl+K opens the command palette.'}</Text>
    </Box>
  );
}

export function CommandPalette({
  commands,
  selectedIndex
}: {
  commands: Array<{ label: string; description: string }>;
  selectedIndex: number;
}): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="blue" paddingX={1}>
      <Text color="blue">Command palette</Text>
      {commands.map((command, index) => (
        <Box key={`${command.label}-${index}`} flexDirection="column" marginTop={1}>
          <Text color={index === selectedIndex ? 'yellow' : 'white'}>
            {index === selectedIndex ? '>' : ' '}
            {' '}
            {command.label}
          </Text>
          <Text dimColor>{command.description}</Text>
        </Box>
      ))}
    </Box>
  );
}

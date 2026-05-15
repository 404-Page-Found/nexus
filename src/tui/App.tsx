import { useApp, useInput } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { TuiSession } from './session.js';
import { CommandPalette, InputLine, MessageList, McpInspectorPanel, StatusBar } from './StreamingRenderer.js';

export function App({ session }: { session: TuiSession }): ReactElement {
  const { exit } = useApp();
  const subscribe = useMemo(() => session.state.subscribe.bind(session.state), [session.state]);
  const getSnapshot = useMemo(() => session.state.getSnapshot.bind(session.state), [session.state]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [draft, setDraft] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);

  const commands = useMemo(() => session.commands, [session.commands]);

  useEffect(() => {
    if (paletteIndex >= commands.length) {
      setPaletteIndex(0);
    }
  }, [commands.length, paletteIndex]);

  useInput((input, key) => {
    if (paletteOpen) {
      if (key.escape) {
        setPaletteOpen(false);
        return;
      }

      if (key.upArrow) {
        setPaletteIndex((value) => Math.max(0, value - 1));
        return;
      }

      if (key.downArrow) {
        setPaletteIndex((value) => Math.min(commands.length - 1, value + 1));
        return;
      }

      if (key.return) {
        const selected = commands[paletteIndex];
        if (selected) {
          void session.executeCommand(selected.id);
          if (selected.id === 'quit') {
            exit();
          }
        }
        setPaletteOpen(false);
        return;
      }

      return;
    }

    if (key.ctrl && input === 'k') {
      setPaletteOpen(true);
      return;
    }

    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (key.escape) {
      session.abort();
      return;
    }

    if (key.return) {
      const value = draft.trim();
      setDraft('');
      if (value) {
        void session.submitPrompt(value);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setDraft((value) => value.slice(0, -1));
      return;
    }

    if (input) {
      setDraft((value) => `${value}${input}`);
    }
  });

  return (
    <>
      <MessageList messages={snapshot.messages} streamingText={snapshot.streamingText} />
      <StatusBar
        status={snapshot.status}
        provider={snapshot.config.provider.kind}
        model={snapshot.config.provider.model}
        authSource={snapshot.authSource}
        busy={snapshot.isBusy}
        error={snapshot.error}
      />
      <McpInspectorPanel inspector={snapshot.mcpInspector} />
      <InputLine draft={draft} />
      {paletteOpen ? <CommandPalette commands={commands} selectedIndex={paletteIndex} /> : null}
    </>
  );
}

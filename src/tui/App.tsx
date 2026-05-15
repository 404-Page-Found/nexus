import { useApp, useInput } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { TuiSession, TranscriptSummary } from './session.js';
import { CommandPalette, InputLine, MessageList, McpInspectorPanel, StatusBar, TranscriptBrowser } from './StreamingRenderer.js';

export function App({ session }: { session: TuiSession }): ReactElement {
  const { exit } = useApp();
  const subscribe = useMemo(() => session.state.subscribe.bind(session.state), [session.state]);
  const getSnapshot = useMemo(() => session.state.getSnapshot.bind(session.state), [session.state]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [draft, setDraft] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [transcriptBrowserOpen, setTranscriptBrowserOpen] = useState(false);
  const [transcriptBrowserLoading, setTranscriptBrowserLoading] = useState(false);
  const [transcriptBrowserIndex, setTranscriptBrowserIndex] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptSummary[]>([]);

  const commands = useMemo(() => session.commands, [session.commands]);

  useEffect(() => {
    if (paletteIndex >= commands.length) {
      setPaletteIndex(0);
    }
  }, [commands.length, paletteIndex]);

  useEffect(() => {
    if (!transcriptBrowserOpen) {
      return;
    }

    let cancelled = false;

    setTranscriptBrowserLoading(true);
    void (async () => {
      try {
        const entries = await session.listTranscripts();
        if (cancelled) {
          return;
        }

        setTranscripts(entries);
        setTranscriptBrowserIndex(0);
      } catch (error) {
        if (!cancelled) {
          session.state.setError(`Failed to load transcripts: ${error instanceof Error ? error.message : String(error)}`);
          setTranscriptBrowserOpen(false);
        }
      } finally {
        if (!cancelled) {
          setTranscriptBrowserLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, transcriptBrowserOpen]);

  useEffect(() => {
    if (transcriptBrowserIndex < 0 || transcriptBrowserIndex >= transcripts.length) {
      setTranscriptBrowserIndex(0);
    }
  }, [transcriptBrowserIndex, transcripts.length]);

  useInput((input, key) => {
    if (transcriptBrowserOpen) {
      if (key.ctrl && input === 'c') {
        exit();
        return;
      }

      if (key.escape) {
        setTranscriptBrowserOpen(false);
        return;
      }

      if (transcripts.length === 0) {
        return;
      }

      if (key.upArrow) {
        setTranscriptBrowserIndex((value) => Math.max(0, value - 1));
        return;
      }

      if (key.downArrow) {
        setTranscriptBrowserIndex((value) => Math.min(transcripts.length - 1, value + 1));
        return;
      }

      if (key.return) {
        const selectedTranscript = transcripts[transcriptBrowserIndex];
        if (selectedTranscript) {
          setTranscriptBrowserOpen(false);
          void session.openTranscript(selectedTranscript.id);
        }
        return;
      }

      return;
    }

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
          if (selected.id === 'browse-transcripts') {
            setTranscriptBrowserOpen(true);
          }
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
      {transcriptBrowserOpen ? (
        <TranscriptBrowser
          transcripts={transcripts}
          selectedIndex={transcriptBrowserIndex}
          loading={transcriptBrowserLoading}
        />
      ) : null}
    </>
  );
}

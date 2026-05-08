import type { AppConfig, ChatMessage } from './types.js';

export interface AgentStateSnapshot {
  config: AppConfig;
  messages: ChatMessage[];
  status: string;
  isBusy: boolean;
  streamingText: string;
  error: string | undefined;
}

type StateListener = () => void;

export class AgentStateManager {
  private snapshotValue: AgentStateSnapshot;

  private readonly listeners = new Set<StateListener>();

  public constructor(config: AppConfig) {
    this.snapshotValue = {
      config,
      messages: [],
      status: 'Idle',
      isBusy: false,
      streamingText: '',
      error: undefined
    };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): AgentStateSnapshot {
    return this.snapshotValue;
  }

  public markBusy(status: string): void {
    this.update((snapshot) => {
      snapshot.isBusy = true;
      snapshot.status = status;
      snapshot.error = undefined;
      snapshot.streamingText = '';
    });
  }

  public markIdle(status = 'Idle'): void {
    this.update((snapshot) => {
      snapshot.isBusy = false;
      snapshot.status = status;
      snapshot.streamingText = '';
    });
  }

  public setStatus(status: string): void {
    this.update((snapshot) => {
      snapshot.status = status;
    });
  }

  public setError(error: string): void {
    this.update((snapshot) => {
      snapshot.error = error;
      snapshot.status = 'Error';
      snapshot.isBusy = false;
      snapshot.streamingText = '';
    });
  }

  public appendMessage(message: ChatMessage): void {
    this.update((snapshot) => {
      snapshot.messages = [...snapshot.messages, structuredClone(message)];
    });
  }

  public setStreamingText(text: string): void {
    this.update((snapshot) => {
      snapshot.streamingText = text;
    });
  }

  public appendStreamingText(chunk: string): void {
    if (!chunk) {
      return;
    }

    this.update((snapshot) => {
      snapshot.streamingText += chunk;
    });
  }

  public clearStreamingText(): void {
    this.update((snapshot) => {
      snapshot.streamingText = '';
    });
  }

  public clearConversation(): void {
    this.update((snapshot) => {
      snapshot.messages = [];
      snapshot.status = 'Idle';
      snapshot.isBusy = false;
      snapshot.streamingText = '';
      snapshot.error = undefined;
    });
  }

  public replaceConfig(config: AppConfig): void {
    this.update((snapshot) => {
      snapshot.config = config;
    });
  }

  private update(mutator: (snapshot: AgentStateSnapshot) => void): void {
    const nextSnapshot: AgentStateSnapshot = {
      ...this.snapshotValue,
      messages: [...this.snapshotValue.messages]
    };
    mutator(nextSnapshot);
    this.snapshotValue = nextSnapshot;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

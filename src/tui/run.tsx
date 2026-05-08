import { render } from 'ink';
import type { AppConfig } from '../core/types.js';
import { createTuiSession } from './session.js';
import { App } from './App.js';

export async function runTui(config: AppConfig): Promise<void> {
  const session = await createTuiSession(config);
  const { waitUntilExit } = render(<App session={session} />);

  try {
    await waitUntilExit();
  } finally {
    await session.dispose();
  }
}

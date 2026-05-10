import { loadConfig } from './config/persistence.js';
import { runConfigWizard } from './config/wizard.js';
import { runTui } from './tui/run.js';

const argv = new Set(process.argv.slice(2));
let existingConfig = null;

try {
  existingConfig = await loadConfig();
} catch {
  existingConfig = null;
}

if (argv.has('--setup') || argv.has('setup') || argv.has('config')) {
  await runConfigWizard(existingConfig ?? undefined);
  process.exit(0);
}

const config = existingConfig ?? (await runConfigWizard());
await runTui(config);

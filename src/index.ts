import { loadConfig } from './config/persistence.js';
import { runConfigWizard } from './config/wizard.js';
import { runTui } from './tui/run.js';

const argv = new Set(process.argv.slice(2));

if (argv.has('--setup') || argv.has('setup') || argv.has('config')) {
  await runConfigWizard();
  process.exit(0);
}

const config = (await loadConfig()) ?? (await runConfigWizard());
await runTui(config);

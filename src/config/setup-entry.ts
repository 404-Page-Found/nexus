import { runConfigWizard } from './wizard.js';
import { loadConfig } from './persistence.js';

await runConfigWizard(await loadConfig() ?? undefined);

import { runConfigWizard } from './wizard.js';
import { loadConfig } from './persistence.js';

let existingConfig = null;

try {
	existingConfig = await loadConfig();
} catch {
	existingConfig = null;
}

await runConfigWizard(existingConfig ?? undefined);

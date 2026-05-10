import { runConfigWizard } from './wizard.js';
import { loadConfig } from './persistence.js';

let existingConfig = null;

try {
	existingConfig = await loadConfig();
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
		throw error;
	}
}

await runConfigWizard(existingConfig ?? undefined);

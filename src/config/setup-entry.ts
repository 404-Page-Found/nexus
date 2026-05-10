import { runConfigWizard } from './wizard.js';
import { loadConfig } from './persistence.js';

let existingConfig: Awaited<ReturnType<typeof loadConfig>> = null;

try {
	existingConfig = await loadConfig();
} catch (error) {
	if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
		existingConfig = null;
	} else {
		console.warn(
			`Unable to read existing config; opening setup with defaults: ${error instanceof Error ? error.message : String(error)}`
		);
		existingConfig = null;
	}
}

await runConfigWizard(existingConfig ?? undefined);

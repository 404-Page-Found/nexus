import type { AppConfig } from '../core/types.js';
import type { LLMClient } from './types.js';
import { resolveProviderSecret } from './auth.js';
import { AnthropicClient } from './anthropic.js';
import { OpenAICompatibleClient } from './openai-compatible.js';

const openAIBaseUrl = 'https://api.openai.com/v1';
const anthropicBaseUrl = 'https://api.anthropic.com/v1';

export async function createProviderClient(config: AppConfig): Promise<LLMClient> {
  const secret = await resolveProviderSecret(config.provider.kind);
  if (!secret) {
    throw new Error(
      `No API key found for ${config.provider.kind}. Set an environment variable, use the keychain, or run npm run setup.`,
    );
  }

  const baseUrl = config.provider.baseUrl ?? (config.provider.kind === 'anthropic' ? anthropicBaseUrl : openAIBaseUrl);

  if (config.provider.kind === 'anthropic') {
    return new AnthropicClient({
      model: config.provider.model,
      baseUrl,
      apiKey: secret.apiKey,
      temperature: config.provider.temperature,
      maxTokens: config.provider.maxTokens
    });
  }

  return new OpenAICompatibleClient({
    provider: config.provider.kind,
    model: config.provider.model,
    baseUrl,
    apiKey: secret.apiKey,
    temperature: config.provider.temperature,
    maxTokens: config.provider.maxTokens
  });
}

import type { AppConfig } from '../core/types.js';
import type { LLMClient } from './types.js';
import { getProviderAuthMessage, resolveProviderSecret } from './auth.js';
import { getProviderDefinition } from './catalog.js';
import { AnthropicClient } from './anthropic.js';
import { OpenAICompatibleClient } from './openai-compatible.js';

const openAIBaseUrl = 'https://api.openai.com/v1';

export async function createProviderClient(config: AppConfig): Promise<LLMClient> {
  const definition = getProviderDefinition(config.provider.kind);
  const secret = await resolveProviderSecret(config.provider.kind);
  if (!secret) {
    throw new Error(getProviderAuthMessage(config.provider.kind));
  }

  const baseUrl = config.provider.baseUrl ?? definition.defaultBaseUrl ?? openAIBaseUrl;

  if (definition.clientKind === 'anthropic') {
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

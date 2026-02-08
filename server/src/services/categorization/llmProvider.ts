import { createOpenRouter } from '@openrouter/ai-sdk-provider';

/**
 * Centralized AI model config for server-side categorization.
 *
 * Uses OpenRouter as the only provider - no fallback.
 * OpenRouter provides access to 300+ models including free tiers.
 *
 * - Keeps "lazy initialization" semantics (only create model when needed)
 * - Provides a single place to change default model/provider behavior
 */

export type FinishReason = 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';

// OpenRouter config - GLM model only
const OPENROUTER_DEFAULT_MODEL = 'z-ai/glm-4.5-air:free';
const OPENROUTER_MODEL_ID_ENV_VAR = 'OPENROUTER_MODEL_ID';

// Cache
let cachedOpenRouterModel: ReturnType<ReturnType<typeof createOpenRouter>> | null = null;
let cachedOpenRouterClient: ReturnType<typeof createOpenRouter> | null = null;

export function getCategorizationModelId(): string {
  return process.env[OPENROUTER_MODEL_ID_ENV_VAR] || OPENROUTER_DEFAULT_MODEL;
}

function requireOpenRouterApiKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      'Missing required env var: OPENROUTER_API_KEY. Set it in your environment (or `server/.env`) before using OpenRouter.'
    );
  }
}

export function getCategorizationModel(): ReturnType<ReturnType<typeof createOpenRouter>> {
  if (!cachedOpenRouterModel) {
    requireOpenRouterApiKey();
    if (!cachedOpenRouterClient) {
      cachedOpenRouterClient = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      });
    }
    cachedOpenRouterModel = cachedOpenRouterClient(getCategorizationModelId());
  }
  return cachedOpenRouterModel;
}

export function getAIProvider(): string {
  return 'openrouter';
}

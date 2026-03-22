import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/**
 * Centralized AI model provider for all LLM calls.
 *
 * Supports any OpenAI-compatible endpoint (OpenRouter, OpenCode, OpenAI, etc.)
 * plus native Google Gemini. Switching providers = change env vars only.
 *
 * Config:
 *   AI_PROVIDER=openrouter | opencode | openai | google
 *   OPENROUTER_API_KEY=sk-or-v1-...     (for openrouter)
 *   OPENCODE_API_KEY=...                 (for opencode, or use "public" for free)
 *   OPENAI_API_KEY=sk-...               (for openai)
 *   GOOGLE_GENERATIVE_AI_API_KEY=AIza... (for google)
 *
 * Model ID:
 *   LLM_MODEL_ID=arcee-ai/trinity-mini:free  (overrides provider default)
 */

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------

interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKeyEnvVar: string;
  defaultModel: string;
  /** If true, use native SDK instead of openai-compatible wrapper */
  native?: 'google';
}

const PROVIDERS: Record<string, ProviderConfig> = {
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    defaultModel: 'arcee-ai/trinity-mini:free',
  },
  opencode: {
    name: 'OpenCode Zen',
    baseURL: 'https://opencode.ai/zen/v1',
    apiKeyEnvVar: 'OPENCODE_API_KEY',
    defaultModel: 'big-pickle',
  },
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
  google: {
    name: 'Google Gemini',
    baseURL: '', // not used, native SDK
    apiKeyEnvVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    defaultModel: 'gemini-1.5-flash',
    native: 'google',
  },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type FinishReason = 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';

let cachedModel: unknown = null;
let cachedProviderId: string = '';
let cachedModelId: string = '';

// ---------------------------------------------------------------------------
// Config Resolution
// ---------------------------------------------------------------------------

function getActiveProviderId(): string {
  return process.env.AI_PROVIDER || 'openrouter';
}

function getProviderConfig(): ProviderConfig {
  const id = getActiveProviderId();
  const config = PROVIDERS[id];
  if (!config) {
    throw new Error(
      `Unknown AI_PROVIDER: "${id}". Supported: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return config;
}

export function getAIProvider(): string {
  return getActiveProviderId();
}

export function getCategorizationModelId(): string {
  const config = getProviderConfig();
  return process.env.LLM_MODEL_ID || process.env.OPENROUTER_MODEL_ID || process.env.CATEGORIZATION_MODEL_ID || config.defaultModel;
}

function getApiKey(config: ProviderConfig): string {
  // OpenCode "public" key for free tier
  if (config.name === 'OpenCode Zen') {
    return process.env[config.apiKeyEnvVar] || 'public';
  }

  const key = process.env[config.apiKeyEnvVar];
  if (!key) {
    throw new Error(
      `Missing required env var: ${config.apiKeyEnvVar}. Set it in server/.env`
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Model Creation
// ---------------------------------------------------------------------------

export function getCategorizationModel(): ReturnType<ReturnType<typeof createOpenAICompatible>> | ReturnType<typeof google> {
  const config = getProviderConfig();
  const modelId = getCategorizationModelId();

  // Return cached if same provider + model
  if (cachedModel && cachedProviderId === config.name && cachedModelId === modelId) {
    return cachedModel as any;
  }

  const apiKey = getApiKey(config);

  if (config.native === 'google') {
    cachedModel = google(modelId);
  } else {
    const client = createOpenAICompatible({
      apiKey,
      baseURL: config.baseURL,
      headers: {
        // OpenCode free tier needs these headers for higher rate limits
        ...(config.name === 'OpenCode Zen' && apiKey === 'public' && {
          'Connection': 'keep-alive',
          'x-opencode-client': 'cli',
        }),
      },
    });
    cachedModel = client(modelId);
  }

  cachedProviderId = config.name;
  cachedModelId = modelId;
  return cachedModel as any;
}

// ---------------------------------------------------------------------------
// Provider Options (reasoning/thinking config)
// ---------------------------------------------------------------------------

const MODEL_THINKING_CONFIG: Record<string, { canDisable: boolean; disableByDefault?: boolean }> = {
  'openai/gpt-4o': { canDisable: true, disableByDefault: true },
  'openai/gpt-4o-mini': { canDisable: true, disableByDefault: true },
  'openai/o3-mini': { canDisable: true, disableByDefault: true },
  'anthropic/claude-3.7-sonnet': { canDisable: true, disableByDefault: true },
  'anthropic/claude-3.5-sonnet': { canDisable: true, disableByDefault: true },
  'google/gemini-2.5-flash': { canDisable: true, disableByDefault: true },
  'google/gemini-2.5-pro': { canDisable: true, disableByDefault: true },
  'google/gemini-1.5-flash': { canDisable: true, disableByDefault: true },
  'google/gemini-1.5-pro': { canDisable: true, disableByDefault: true },
};

export function getProviderOptions(): Record<string, unknown> {
  const providerId = getActiveProviderId();
  const modelId = getCategorizationModelId();
  const config = MODEL_THINKING_CONFIG[modelId];

  if (!config?.canDisable || !config?.disableByDefault) {
    return {};
  }

  // OpenRouter and OpenCode use the same openrouter providerOptions format
  if (providerId === 'openrouter' || providerId === 'opencode') {
    return {
      openrouter: {
        reasoning: { effort: 'none' },
      },
    };
  }

  return {};
}

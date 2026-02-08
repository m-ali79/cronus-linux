import { google } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

/**
 * Centralized AI model config for server-side categorization.
 *
 * Supports multiple providers:
 * - OpenRouter (default): Access to 300+ models including free tiers
 * - Google Gemini: Direct Google AI integration
 *
 * - Keeps "lazy initialization" semantics (only create model when needed)
 * - Provides a single place to change default model/provider behavior
 */

export type FinishReason = 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';

// Provider selection
const AI_PROVIDER = process.env.AI_PROVIDER || 'openrouter'; // 'openrouter' | 'google'

const OPENROUTER_DEFAULT_MODEL = 'google/gemma-2-9b-it:free';
const OPENROUTER_MODEL_ID_ENV_VAR = 'OPENROUTER_MODEL_ID';

// Google config (fallback)
const GOOGLE_DEFAULT_MODEL = 'gemini-1.5-flash';
const GOOGLE_MODEL_ID_ENV_VAR = 'CATEGORIZATION_MODEL_ID';

// Cache for both providers
let cachedOpenRouterModel: ReturnType<ReturnType<typeof createOpenRouter>> | null = null;
let cachedGoogleModel: ReturnType<typeof google> | null = null;
let cachedOpenRouterClient: ReturnType<typeof createOpenRouter> | null = null;

export function getCategorizationModelId(): string {
  if (AI_PROVIDER === 'openrouter') {
    return process.env[OPENROUTER_MODEL_ID_ENV_VAR] || OPENROUTER_DEFAULT_MODEL;
  }
  return process.env[GOOGLE_MODEL_ID_ENV_VAR] || GOOGLE_DEFAULT_MODEL;
}

function requireOpenRouterApiKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      'Missing required env var: OPENROUTER_API_KEY. Set it in your environment (or `server/.env`) before using OpenRouter.'
    );
  }
}

function requireGoogleGenerativeAiApiKey(): void {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      'Missing required env var: GOOGLE_GENERATIVE_AI_API_KEY. Set it in your environment (or `server/.env`) before using Google AI.'
    );
  }
}

export function getCategorizationModel():
  | ReturnType<ReturnType<typeof createOpenRouter>>
  | ReturnType<typeof google> {
  if (AI_PROVIDER === 'openrouter') {
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

  // Fallback to Google
  if (!cachedGoogleModel) {
    requireGoogleGenerativeAiApiKey();
    cachedGoogleModel = google(getCategorizationModelId());
  }
  return cachedGoogleModel;
}

export function getAIProvider(): string {
  return AI_PROVIDER;
}

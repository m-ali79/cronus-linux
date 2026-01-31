import { google } from '@ai-sdk/google';

/**
 * Centralized Google/Gemini model config for server-side categorization.
 *
 * - Keeps "lazy initialization" semantics (only create model when needed)
 * - Provides a single place to change default model/provider behavior
 */

export type FinishReason =
  | 'stop'
  | 'length'
  | 'content-filter'
  | 'tool-calls'
  | 'error'
  | 'other';

const DEFAULT_CATEGORIZATION_MODEL_ID = 'gemini-2.5-flash-lite';
const MODEL_ID_ENV_VAR = 'CATEGORIZATION_MODEL_ID';
let cachedModel: ReturnType<typeof google> | null = null;

export function getCategorizationModelId(): string {
  return process.env[MODEL_ID_ENV_VAR] || DEFAULT_CATEGORIZATION_MODEL_ID;
}

export function getCategorizationModel() {
  if (!cachedModel) {
    cachedModel = google(getCategorizationModelId());
  }
  return cachedModel;
}


import { google } from '@ai-sdk/google';

/**
 * Centralized Google/Gemini model config for server-side categorization.
 *
 * - Keeps "lazy initialization" semantics (only create model when needed)
 * - Provides a single place to change default model/provider behavior
 */

const DEFAULT_CATEGORIZATION_MODEL_ID = 'gemini-2.5-flash-lite';
const MODEL_ID_ENV_VAR = 'CATEGORIZATION_MODEL_ID';

let cachedModel: ReturnType<typeof google> | null = null;

/**
 * Resolve which model ID to use for categorization.
 *
 * @returns The value of the `CATEGORIZATION_MODEL_ID` environment variable if set; otherwise `"gemini-2.5-flash-lite"`.
 */
export function getCategorizationModelId(): string {
  return process.env[MODEL_ID_ENV_VAR] || DEFAULT_CATEGORIZATION_MODEL_ID;
}

/**
 * Lazily initializes and returns the cached Google/Gemini model instance used for categorization.
 *
 * Initializes and caches the model on first invocation; subsequent calls return the same instance.
 *
 * @returns The cached Google model instance used for categorization
 */
export function getCategorizationModel() {
  if (!cachedModel) {
    cachedModel = google(getCategorizationModelId());
  }
  return cachedModel;
}

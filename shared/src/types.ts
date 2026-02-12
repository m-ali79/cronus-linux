export interface ActiveWindowEvent {
  _id?: string;
  userId: string;
  windowId: number;
  ownerName: string;
  type: 'window' | 'browser' | 'system' | 'manual';
  browser?: 'chrome' | 'safari' | 'arc' | 'firefox' | 'brave' | 'helium' | null;
  title?: string | null;
  url?: string | null;
  content?: string | null;
  categoryId?: string | null;
  categoryReasoning?: string | null;
  llmSummary?: string | null;
  generatedTitle?: string | null;
  timestamp: number;
  screenshotS3Url?: string | null;
  durationMs?: number;
  captureReason?: 'app_switch' | 'periodic_backup' | 'system_sleep' | 'system_wake' | null;
  lastCategorizationAt?: Date;
  oldCategoryId?: string;
  oldCategoryReasoning?: string;
  oldLlmSummary?: string;
}

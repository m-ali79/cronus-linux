export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  hasSubscription?: boolean;
  isWaitlisted?: boolean;
  hasCompletedOnboarding?: boolean;
  isInEU?: boolean;
  stripeCustomerId?: string;
  tokenVersion?: number;
  electronAppSettings?: {
    calendarZoomLevel?: number;
    theme?: 'light' | 'dark' | 'system';
    playDistractionSound?: boolean;
    distractionSoundInterval?: number;
    showDistractionNotifications?: boolean;
    distractionNotificationInterval?: number;
    optedOutOfPosthogTracking?: boolean;
  };
  userProjectsAndGoals?: string;
}

export interface ActiveWindowDetails {
  windowId?: number;
  ownerName: string;
  type: 'window' | 'browser' | 'system' | 'manual' | 'calendar';
  browser?: 'chrome' | 'safari' | 'arc' | 'firefox' | 'brave' | 'helium' | null;
  title?: string | null;
  url?: string | null;
  content?: string | null;
  timestamp: number;
  contentSource?: 'ocr' | 'accessibility' | null;
  localScreenshotPath?: string | null;
  screenshotS3Url?: string | null;
  durationMs?: number;
}

export interface ActiveWindowEvent extends ActiveWindowDetails {
  _id?: string;
  userId: string;
  categoryId?: string | null;
  categoryReasoning?: string | null;
  llmSummary?: string | null;
  lastCategorizationAt?: Date;
  generatedTitle?: string | null;
  oldCategoryId?: string | null;
  oldCategoryReasoning?: string | null;
  oldLlmSummary?: string | null;
}

export interface Category {
  _id: string;
  userId: string;
  name: string;
  description?: string;
  color: string; // Hex color code, e.g., "#FF5733"
  emoji?: string;
  isProductive: boolean;
  isDefault: boolean;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEventSuggestion {
  _id: string;
  userId: string;
  googleCalendarEventId: string;
  startTime: string; // Is a string after JSON serialization
  endTime: string;
  name: string;
  suggestedCategoryId?: string;
  status: 'pending' | 'accepted' | 'rejected';
  reasoning?: string;
  // Fields added by the router populate
  categoryColor?: string;
  categoryName?: string;
}

// Mirrors `electron-app/src/native-modules/native-linux/types.ts` (LinuxDependencyType)
export enum DependencyType {
  Hyprland = 0,
  Grim = 1,
  Tesseract = 2,
  DBus = 3,
  BrowserDebug = 4,
}

export interface LinuxDependency {
  type: DependencyType;
  name: string;
  installed: boolean;
  required: boolean;
  version?: string;
  purpose: string;
  installCommand: string;
}

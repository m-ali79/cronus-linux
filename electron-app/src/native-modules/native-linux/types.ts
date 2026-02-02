/**
 * Linux-specific types for the native-linux module
 */

import { ActiveWindowDetails } from 'shared'

// Re-export for convenience
export type { ActiveWindowDetails }

/**
 * Linux dependency types - replaces macOS permission types
 * On Linux, we check for installed tools rather than OS permissions
 */
export enum LinuxDependencyType {
  Hyprland = 0, // Is Hyprland running? (HYPRLAND_INSTANCE_SIGNATURE set)
  Grim = 1, // Is grim installed? (for screenshots)
  Tesseract = 2, // Is tesseract installed? (for OCR)
  DBus = 3, // Is D-Bus accessible?
  BrowserDebug = 4 // Is browser launched with debug port?
}

/**
 * Dependency status - matches macOS PermissionStatus for API compatibility
 */
export enum DependencyStatus {
  NotInstalled = 0, // Maps to Denied
  Installed = 1, // Maps to Granted
  Unknown = 2 // Maps to Pending
}

/**
 * Detailed dependency info for UI
 */
export interface DependencyInfo {
  type: LinuxDependencyType
  name: string
  installed: boolean
  required: boolean
  version?: string
  purpose: string
  installCommand: string
}

/**
 * Hyprland window information from hyprctl activewindow -j
 */
export interface HyprlandWindow {
  address: string
  mapped: boolean
  hidden: boolean
  at: [number, number]
  size: [number, number]
  workspace: {
    id: number
    name: string
  }
  floating: boolean
  pseudo: boolean
  monitor: number
  class: string
  title: string
  initialClass: string
  initialTitle: string
  pid: number
  xwayland: boolean
  pinned: boolean
  fullscreen: number
  fullscreenClient: number
  grouped: string[]
  tags: string[]
  swallowing: string
  focusHistoryID: number
}

/**
 * Hyprland monitor information
 */
export interface HyprlandMonitor {
  id: number
  name: string
  description: string
  make: string
  model: string
  serial: string
  width: number
  height: number
  refreshRate: number
  x: number
  y: number
  activeWorkspace: {
    id: number
    name: string
  }
  specialWorkspace: {
    id: number
    name: string
  }
  reserved: [number, number, number, number]
  scale: number
  transform: number
  focused: boolean
  dpmsStatus: boolean
  vrr: boolean
  activelyTearing: boolean
  disabled: boolean
  currentFormat: string
  availableModes: string[]
}

/**
 * Screenshot settings
 */
export interface ScreenshotSettings {
  captureMode: 'window' | 'fullscreen'
  captureQuality: number // 0-100 JPEG quality
  enableOCR: boolean
  ocrLanguage: string // 'eng', 'eng+deu', etc.
}

/**
 * Screenshot result
 */
export interface ScreenshotResult {
  success: boolean
  imagePath?: string
  ocrText?: string
  error?: string
}

/**
 * Browser types supported on Linux
 */
// NOTE: This must stay assignable to `shared.ActiveWindowDetails['browser']`.
// macOS/server currently expect: 'chrome' | 'safari' | 'arc' | null (plus optional/undefined).
// For Hyprland-only v1 we intentionally map other Chromium-family browsers into these buckets:
// - Brave -> 'chrome'
// - Helium -> 'arc'
export type LinuxBrowserType = 'chrome' | 'arc' | null

/**
 * Browser detection mapping from window class to browser type
 */
export const BROWSER_DETECTION: Record<string, LinuxBrowserType> = {
  'google-chrome': 'chrome',
  'Google-chrome': 'chrome',
  chromium: 'chrome',
  Chromium: 'chrome',
  'chromium-browser': 'chrome',
  'brave-browser': 'chrome',
  Brave: 'chrome',
  'Brave-browser': 'chrome',
  Arc: 'arc',
  arc: 'arc',
  Helium: 'arc',
  helium: 'arc'
}

/**
 * Capture reason for events - matches macOS
 */
export type CaptureReason =
  | 'app_switch'
  | 'browser_tab_switch'
  | 'periodic_backup'
  | 'system_sleep'
  | 'system_wake'
  | 'system_lock'
  | 'system_unlock'
  | 'initial'

/**
 * System event types
 */
export type SystemEventType = 'sleep' | 'wake' | 'lock' | 'unlock'

/**
 * Notification for missing dependencies
 */
export interface DependencyNotification {
  type: 'dependency-missing'
  feature: string
  dependency: string
  message: string
  installCommand: string
  dismissable: boolean
  persistent: boolean
}

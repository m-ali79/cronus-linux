/**
 * Native Linux Module
 *
 * Main entry point for Linux-specific functionality.
 * Implements the same interface as native-windows for feature parity.
 */

import { ActiveWindowDetails } from 'shared'
import { existsSync } from 'fs'
import { join } from 'path'
import { hyprlandWindowTracker } from './hyprland/windowTracker'
import { browserTracker } from './browser/browserTracker'
import { screenshotManager } from './screenshot/screenshotManager'
import { systemEventObserver } from './system/systemEventObserver'
import { hasPermissionsForContentExtraction } from './permissions/dependencyChecker'
import {
  createStabilizingWrapper,
  TRACKER_STABILIZATION_PERIOD_MS
} from './trackingCoordinator'
import { LinuxDependencyType, DependencyStatus, ScreenshotResult } from './types'

// Re-export types for consumers
export { LinuxDependencyType, DependencyStatus }
export type { DependencyInfo } from './types'
export { getAllDependencies } from './permissions/dependencyChecker'

/**
 * Permission types enum - maps to LinuxDependencyType for API compatibility
 * These match the macOS PermissionType enum values
 */
export enum PermissionType {
  Accessibility = 0, // Maps to Hyprland
  AppleEvents = 1, // Maps to BrowserDebug (not really used on Linux)
  ScreenRecording = 2 // Maps to Grim
}

/**
 * Permission status enum - matches macOS
 */
export enum PermissionStatus {
  Denied = 0,
  Granted = 1,
  Pending = 2
}

/**
 * NativeLinux class - implements same interface as NativeWindows (macOS)
 */
type CheckCategorizationPayload = {
  ownerName: string
  type: string
  title: string
  url?: string | null
}
type CheckCategorizationResult = { isCategorized: boolean; content?: string }

class NativeLinux {
  private permissionDialogsEnabled = false
  private isObserving = false
  private windowCallback: ((details: ActiveWindowDetails | null) => void) | null = null
  private checkCategorizationProvider?: (
    payload: CheckCategorizationPayload
  ) => Promise<CheckCategorizationResult>

  public setCheckCategorizationProvider(
    fn: (payload: CheckCategorizationPayload) => Promise<CheckCategorizationResult>
  ): void {
    this.checkCategorizationProvider = fn
  }

  /**
   * Start observing active window changes
   */
  public startActiveWindowObserver(callback: (details: ActiveWindowDetails | null) => void): void {
    if (this.isObserving) {
      console.log('[NativeLinux] Already observing, stopping first...')
      this.stopActiveWindowObserver()
    }

    this.windowCallback = callback
    this.isObserving = true

    // Initialize components
    this.initializeTracking()
  }

  /**
   * Initialize all tracking components
   */
  private async initializeTracking(): Promise<void> {
    const trackerStartTime = Date.now()

    try {
      // Initialize screenshot manager
      await screenshotManager.initialize()

      const innerCallback = async (details: ActiveWindowDetails | null) => {
        if (!this.isObserving || !this.windowCallback) return

        let enrichedDetails: ActiveWindowDetails | null = details

        if (details) {
          // Enrich with browser URL if applicable
          if (details.type === 'browser' && details.browser) {
            console.log(`[BrowserTracker] Enriching browser event for ${details.browser}`)
            enrichedDetails = await browserTracker.enrichWithBrowserUrl(details)
          }

          // Capture OCR after window switch debounce (stabilization drops events in first 10s)
          if ((await hasPermissionsForContentExtraction()) && enrichedDetails) {
            let skipOcr = false
            if (this.checkCategorizationProvider) {
              try {
                const checkResult = await this.checkCategorizationProvider({
                  ownerName: enrichedDetails.ownerName,
                  type: enrichedDetails.type,
                  title: enrichedDetails.title ?? '',
                  url: enrichedDetails.url ?? null
                })
                if (checkResult.isCategorized && checkResult.content != null) {
                  enrichedDetails = {
                    ...enrichedDetails,
                    content: checkResult.content,
                    contentSource: 'ocr' as const
                  }
                  skipOcr = true
                  console.log(
                    `[OCR] Skipped OCR for ${enrichedDetails.ownerName} (already categorized, reusing content)`
                  )
                }
              } catch {
                /* fail-open: run OCR below */
              }
            }
            if (!skipOcr) {
              try {
                console.log(`[OCR] Starting OCR capture for ${enrichedDetails.ownerName}`)
                const ocrResult = await screenshotManager.captureAndOCR()
                if (ocrResult.success && ocrResult.ocrText) {
                  enrichedDetails = {
                    ...enrichedDetails,
                    content: ocrResult.ocrText,
                    contentSource: 'ocr' as const,
                    localScreenshotPath: ocrResult.imagePath || null
                  }
                  console.log(
                    `[OCR] OCR completed for ${enrichedDetails.ownerName}: ${ocrResult.ocrText.length} chars`
                  )
                } else if (ocrResult.error) {
                  console.warn(
                    `[OCR] OCR failed for ${enrichedDetails.ownerName}: ${ocrResult.error}`
                  )
                }
              } catch (error) {
                console.error(`[OCR] OCR error for ${enrichedDetails.ownerName}:`, error)
              }
            }
          }
        }

        const jsonString = JSON.stringify(enrichedDetails)
        try {
          const parsed = JSON.parse(jsonString)
          const mapped: ActiveWindowDetails = {
            ...parsed,
            windowId: parsed.windowId || 0
          }
          this.windowCallback(mapped)
        } catch (error) {
          console.error('[NativeLinux] Error processing window details:', error)
          this.windowCallback(null)
        }
      }

      const wrappedCallback = createStabilizingWrapper(
        trackerStartTime,
        TRACKER_STABILIZATION_PERIOD_MS,
        innerCallback
      )

      await hyprlandWindowTracker.start(wrappedCallback)

      await browserTracker.start()

      await systemEventObserver.start((event) => {
        wrappedCallback(event)
      })

      console.log('[NativeLinux] All tracking components started')
    } catch (error) {
      console.error('[NativeLinux] Failed to initialize tracking:', error)
    }
  }

  /**
   * Stop observing active window changes
   */
  public stopActiveWindowObserver(): void {
    this.isObserving = false

    hyprlandWindowTracker.stop()
    browserTracker.stop()
    systemEventObserver.stop()

    this.windowCallback = null

    console.log('[NativeLinux] Stopped observing')
  }

  /**
   * Enable/disable permission dialogs
   * On Linux, this controls whether we show dependency check notifications
   */
  public setPermissionDialogsEnabled(enabled: boolean): void {
    this.permissionDialogsEnabled = enabled
  }

  /**
   * Get whether permission dialogs are enabled
   */
  public getPermissionDialogsEnabled(): boolean {
    return this.permissionDialogsEnabled
  }

  /**
   * Get the status of a specific permission/dependency
   */
  public getPermissionStatus(permissionType: PermissionType): PermissionStatus {
    // Map PermissionType to LinuxDependencyType
    const dependencyMap: Record<PermissionType, LinuxDependencyType> = {
      [PermissionType.Accessibility]: LinuxDependencyType.Hyprland,
      [PermissionType.AppleEvents]: LinuxDependencyType.BrowserDebug,
      [PermissionType.ScreenRecording]: LinuxDependencyType.Grim
    }

    const dependencyType = dependencyMap[permissionType]
    if (dependencyType === undefined) {
      return PermissionStatus.Denied
    }

    // Check dependency synchronously using cached result
    // For full async check, use checkDependency directly
    return this.getPermissionStatusSync(dependencyType)
  }

  /**
   * Synchronous permission status check (uses cached/quick checks)
   */
  private getPermissionStatusSync(type: LinuxDependencyType): PermissionStatus {
    switch (type) {
      case LinuxDependencyType.Hyprland:
        // Quick check: is HYPRLAND_INSTANCE_SIGNATURE set?
        return process.env.HYPRLAND_INSTANCE_SIGNATURE
          ? PermissionStatus.Granted
          : PermissionStatus.Denied

      case LinuxDependencyType.BrowserDebug:
        // Can't check synchronously
        return PermissionStatus.Pending

      default:
        // For others, return Pending (requires async check)
        return PermissionStatus.Pending
    }
  }

  /**
   * Check if we have permissions for title extraction
   */
  public hasPermissionsForTitleExtraction(): boolean {
    // Synchronous check - just verify Hyprland is available
    return !!process.env.HYPRLAND_INSTANCE_SIGNATURE
  }

  /**
   * Check if we have permissions for content extraction
   * Note: This is a sync method matching macOS API, but we can't really check async here
   */
  public hasPermissionsForContentExtraction(): boolean {
    // Return true optimistically - actual check happens at capture time
    return true
  }

  /**
   * Capture screenshot and perform OCR for current window
   */
  public captureScreenshotAndOCRForCurrentWindow(): ScreenshotResult {
    // This needs to be sync to match macOS API, but we'll return a promise-like result
    // The actual implementation should be called async
    return {
      success: false,
      error: 'Use async captureScreenshotAndOCRAsync instead'
    }
  }

  /**
   * Async version of screenshot capture (preferred)
   */
  public async captureScreenshotAndOCRAsync(): Promise<ScreenshotResult> {
    return await screenshotManager.captureAndOCR()
  }

  /**
   * Request a specific permission
   * On Linux, this opens instructions for installing dependencies
   */
  public requestPermission(permissionType: PermissionType): void {
    // On Linux, we can't request permissions like macOS
    // Instead, we could show a dialog with installation instructions
    console.log(
      `[NativeLinux] Permission request for type ${permissionType} - showing instructions not implemented`
    )
  }

  /**
   * Get the icon path for a specific app
   * On Linux, we look in XDG icon directories
   */
  public getAppIconPath(appName: string): string | null {
    // Normalize app name: remove common suffixes and convert to lowercase
    const normalizedName = appName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    // XDG icon directories (standard locations)
    const xdgDataDirs = process.env.XDG_DATA_DIRS
      ? process.env.XDG_DATA_DIRS.split(':')
      : ['/usr/local/share', '/usr/share']
    const homeDir = process.env.HOME || ''
    const iconDirs = [
      ...(homeDir ? [join(homeDir, '.local/share/icons')] : []),
      ...xdgDataDirs.map((dir) => join(dir, 'icons')),
      '/usr/share/pixmaps'
    ]

    // Common icon sizes and formats to check
    const sizes = ['512x512', '256x256', '128x128', '96x96', '64x64', '48x48', '32x32', 'scalable']
    const formats = ['png', 'svg', 'xpm']

    // Try to find icon synchronously (this is a limitation of the sync API)
    // For a proper implementation, this should be async, but we match macOS API
    for (const iconDir of iconDirs) {
      for (const size of sizes) {
        for (const format of formats) {
          const iconPath = join(iconDir, size, `${normalizedName}.${format}`)
          try {
            if (existsSync(iconPath)) {
              return iconPath
            }
          } catch {
            // Continue searching
          }
        }
      }

      // Also check in hicolor theme (most common)
      for (const size of sizes) {
        for (const format of formats) {
          const iconPath = join(iconDir, 'hicolor', size, 'apps', `${normalizedName}.${format}`)
          try {
            if (existsSync(iconPath)) {
              return iconPath
            }
          } catch {
            // Continue searching
          }
        }
      }
    }

    // If not found, return null (matching macOS behavior when icon not found)
    return null
  }
}

// Export singleton instance matching native-windows pattern
export const nativeLinux = new NativeLinux()

// Also export as nativeWindows for drop-in replacement
// This allows the main process to use the same variable name
export { nativeLinux as nativeWindows }

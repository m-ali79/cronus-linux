import { app } from 'electron'
import path from 'path'
import { ActiveWindowDetails } from 'shared/dist/types.js'

// TODO: duplicated in renderer/src/components/Settings/PermissionsStatus.tsx
// Permission types enum to match native layer
export enum PermissionType {
  Accessibility = 0,
  AppleEvents = 1,
  ScreenRecording = 2
}

// Permission status enum to match native layer
export enum PermissionStatus {
  Denied = 0,
  Granted = 1,
  Pending = 2
}

interface ScreenshotOCRResult {
  success: boolean
  error?: string
  ocrText?: string
}

interface Addon {
  startActiveWindowObserver: (callback: (jsonString: string) => void) => void
  stopActiveWindowObserver: () => void
  setPermissionDialogsEnabled: (shouldRequest: boolean) => void
  getPermissionDialogsEnabled: () => boolean
  getPermissionStatus: (permissionType: number) => number
  hasPermissionsForTitleExtraction: () => boolean
  hasPermissionsForContentExtraction: () => boolean
  requestPermission: (permissionType: number) => void
  captureScreenshotAndOCRForCurrentWindow: () => ScreenshotOCRResult
  getAppIconPath: (appName: string) => string | null
}

const isDevelopment = !app.isPackaged

const addonPath = isDevelopment
  ? path.join(
    process.cwd(),
    'src',
    'native-modules',
    'native-windows',
    'build',
    'Release',
    'nativeWindows.node'
  )
  : path.join(process.resourcesPath, 'native', 'nativeWindows.node')

// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon: Addon = require(addonPath)

class NativeWindows {
  /**
   * Subscribes to active window changes
   */
  public startActiveWindowObserver(callback: (details: ActiveWindowDetails | null) => void): void {
    addon.startActiveWindowObserver((jsonString: string) => {
      try {
        if (jsonString) {
          // Log the raw JSON string received from the native module
          // console.log('[NativeWindowsWrapper] Received from native module:', jsonString)
          const detailsJson = JSON.parse(jsonString)
          // Ensure that the id field from the native module is mapped to windowId
          const details: ActiveWindowDetails = {
            ...detailsJson,
            windowId: detailsJson.id || 0 // Default to 0 if id is missing
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (details as any).id // remove original id if it exists to avoid confusion
          // console.log('[NativeWindowsWrapper] Processed event:', details)
          callback(details)
        } else {
          // console.log('[NativeWindowsWrapper] Received null event')
          callback(null)
        }
      } catch (error) {
        console.error('Error parsing window details JSON:', error, 'Received string:', jsonString)
        callback(null)
      }
    })
  }

  public stopActiveWindowObserver(): void {
    addon.stopActiveWindowObserver()
  }

  /**
   * Controls whether explicit permission dialogs should be shown to users
   * Call this with true after onboarding is complete to enable permission requests
   * This does NOT prevent automatic system dialogs when APIs are first used
   */
  public setPermissionDialogsEnabled(enabled: boolean): void {
    addon.setPermissionDialogsEnabled(enabled)
  }

  /**
   * Gets the icon path for a specific app
   * @param appName The name of the app
   * @returns The path to the icon file, or null if not found
   */
  public getAppIconPath(appName: string): string | null {
    return addon.getAppIconPath(appName)
  }

  /**
   * Returns whether explicit permission requests are currently enabled
   * This does NOT indicate whether automatic system dialogs are prevented
   */
  public getPermissionDialogsEnabled(): boolean {
    return addon.getPermissionDialogsEnabled()
  }

  /**
   * Gets the status of a specific permission
   * @param permissionType The permission type to check
   * @returns PermissionStatus enum value
   */
  public getPermissionStatus(permissionType: PermissionType): PermissionStatus {
    return addon.getPermissionStatus(permissionType) as PermissionStatus
  }

  /**
   * Checks if the app has permissions for title extraction
   */
  public hasPermissionsForTitleExtraction(): boolean {
    return addon.hasPermissionsForTitleExtraction()
  }

  /**
   * Checks if the app has permissions for content extraction
   */
  public hasPermissionsForContentExtraction(): boolean {
    return addon.hasPermissionsForContentExtraction()
  }

  /**
   * Captures screenshot and performs ocr for current window
   */
  public captureScreenshotAndOCRForCurrentWindow(): ScreenshotOCRResult {
    return addon.captureScreenshotAndOCRForCurrentWindow()
  }

  /**
   * Manually requests a specific permission
   * @param permissionType The permission type to request
   */
  public requestPermission(permissionType: PermissionType): void {
    addon.requestPermission(permissionType)
  }
}

export const nativeWindows = new NativeWindows()

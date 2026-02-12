import { ActiveWindowDetails, PermissionType } from 'shared/types'

import type { DependencyInfo } from '../native-modules/native-linux/types'

interface NativeWindows {
  startActiveWindowObserver: (callback: (details: ActiveWindowDetails | null) => void) => void
  stopActiveWindowObserver: () => void
  setPermissionDialogsEnabled: (enabled: boolean) => void
  getPermissionDialogsEnabled: () => boolean
  getPermissionStatus: (permissionType: PermissionType) => number
  hasPermissionsForTitleExtraction: () => boolean
  hasPermissionsForContentExtraction: () => boolean
  requestPermission: (permissionType: PermissionType) => void
  captureScreenshotAndOCRForCurrentWindow: () => {
    success: boolean
    error?: string
    ocrText?: string
  }
  captureScreenshotAndOCRAsync?: () => Promise<{
    success: boolean
    error?: string
    ocrText?: string
    imagePath?: string
  }>
  getAppIconPath: (appName: string) => string | null
}

type GetAllDependenciesFunction = (() => Promise<DependencyInfo[]>) | undefined

let initPromise: Promise<void> | undefined
let nativeWindows: NativeWindows | undefined
let permissionType: typeof PermissionType | undefined
let getAllDependenciesFn: GetAllDependenciesFunction | undefined

// Initialize native module based on platform (memoized / idempotent)
export async function initNativeModule(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    if (process.platform === 'linux') {
      try {
        const nativeLinuxModule = await import('../native-modules/native-linux/index.js')
        nativeWindows = nativeLinuxModule.nativeLinux as NativeWindows
        permissionType = PermissionType
        getAllDependenciesFn = nativeLinuxModule.getAllDependencies as
          | GetAllDependenciesFunction
          | undefined
      } catch (error) {
        console.error('Failed to load native-linux module:', error)
        throw error
      }
    } else {
      try {
        const nativeWindowsModule = await import('../native-modules/native-windows/index.js')
        nativeWindows = nativeWindowsModule.nativeWindows as NativeWindows
        permissionType = PermissionType
        getAllDependenciesFn = undefined // macOS doesn't have getAllDependencies
      } catch (error) {
        console.error('Failed to load native-windows module:', error)
        throw error
      }
    }

    if (!permissionType) {
      throw new Error('PermissionType enum not initialized')
    }
  })()

  return initPromise
}

export function getNativeWindows(): NativeWindows {
  if (!nativeWindows) {
    throw new Error('Native module not initialized. Call initNativeModule() first.')
  }
  return nativeWindows
}

export function getPermissionType(): typeof PermissionType {
  if (!permissionType) {
    throw new Error('Native module not initialized. Call initNativeModule() first.')
  }
  return permissionType
}

export function getAllDependencies(): GetAllDependenciesFunction {
  return getAllDependenciesFn
}

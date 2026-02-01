import { is, optimizer } from '@electron-toolkit/utils'
import dotenv from 'dotenv'
import { app, BrowserWindow, session } from 'electron'
import path from 'path'
import { ActiveWindowDetails } from 'shared/dist/types.js'
import { initializeAutoUpdater, registerAutoUpdaterHandlers } from './auto-updater'
import { registerIpcHandlers } from './ipc'
import { initializeLoggers } from './logging'
import { getNativeWindows, initNativeModule } from './nativeModule'
import {
  getUrlToHandleOnReady,
  handleAppUrl,
  setupProtocolHandlers,
  setupSingleInstanceLock
} from './protocol'
import { createFloatingWindow, createMainWindow, setIsAppQuitting } from './windows'

const APP_ID = 'com.cronus.app'
const LINUX_WM_CLASS = 'cronus'

declare global {
  // Expose these for IPC handlers that need to control the native observer lifecycle.
  let stopActiveWindowObserver: (() => void) | undefined
  let startActiveWindowObserver: (() => void) | undefined
}

/**
 * Ensure a stable app identity across different dev launch methods on Linux.
 *
 * On Linux, `requestSingleInstanceLock()` relies on a lock namespace derived from the app identity.
 * If protocol-launched processes ("Instance B") and the running dev process ("Instance A") end up
 * with different identity/userData paths, both can acquire independent locks -> "split brain".
 *
 * This MUST run before `requestSingleInstanceLock()`.
 */
function configureStableAppIdentity(): void {
  // Harmless on non-Windows; important on Windows for taskbar grouping.
  app.setAppUserModelId(APP_ID)

  if (process.platform === 'linux') {
    // Match electron-builder linux.desktop.StartupWMClass
    app.setName('Cronus')
    app.commandLine.appendSwitch('class', LINUX_WM_CLASS)

    // Use a stable userData path for all non-packaged runs (electron-vite dev, xdg protocol desktop).
    // In packaged production builds we let Electron use the standard path derived from the app metadata.
    if (!app.isPackaged) {
      app.setPath('userData', path.join(app.getPath('appData'), 'Cronus-dev'))
    }
  }
}

// Explicitly load .env files to ensure production run-time app uses the correct .env file
// NODE_ENV set in build isn't present in the run-time app
dotenv.config({ path: app.isPackaged ? '.env.production' : '.env.development' })

// Initialize Sentry
// if (!is.dev) {
//   Sentry.init({
//     dsn: 'https://771e73ad5ad9618684204fb0513a3298@o4509521859051520.ingest.us.sentry.io/4509521865015296',
//     integrations: [],
//     defaultIntegrations: false
//   })
// }

let mainWindow: BrowserWindow | null = null
let floatingWindow: BrowserWindow | null = null

let isTrackingPaused = false

// ---- Must happen before any async initialization ----
configureStableAppIdentity()

const gotSingleInstanceLock = setupSingleInstanceLock(() => mainWindow)
if (gotSingleInstanceLock) {
  // Only the primary instance should register handlers and initialize the app lifecycle.
  setupProtocolHandlers(() => mainWindow)
}

function App() {
  async function initializeApp() {
    await initializeLoggers()

    // Initialize native module before using it
    await initNativeModule()

    if (process.platform === 'darwin') {
      await app.dock?.show()
    }

    // Register cronus:// protocol handler for development mode
    // In production, this is handled by electron-builder during packaging
    // Commented out to reduce log spam in dev mode
    // if (!app.isPackaged) {
    //   console.log('[App] Attempting to register cronus:// protocol...')
    //   let protocolRegistered = false
    //   if (process.platform === 'linux') {
    //     protocolRegistered = app.setAsDefaultProtocolClient('cronus', process.execPath, [
    //       path.resolve(process.argv[1])
    //     ])
    //   } else {
    //     protocolRegistered = app.setAsDefaultProtocolClient('cronus')
    //   }
    //
    //   if (protocolRegistered) {
    //     console.log('[App] Successfully registered cronus:// protocol')
    //   } else {
    //     console.warn(
    //       '[App] Failed to register cronus:// protocol (may already be registered or permission denied)'
    //     )
    //   }
    // }

    setupCsp()

    mainWindow = createMainWindow(getUrlToHandleOnReady, (url) => handleAppUrl(url, mainWindow))
    initializeAutoUpdater(mainWindow)
    floatingWindow = createFloatingWindow(() => mainWindow)

    mainWindow.on('closed', () => {
      mainWindow = null
      windows.mainWindow = null
    })

    if (floatingWindow) {
      floatingWindow.on('closed', () => {
        floatingWindow = null
        windows.floatingWindow = null
      })
    }

    // Create windows object that IPC handlers will reference
    const windows: { mainWindow: BrowserWindow | null; floatingWindow: BrowserWindow | null } = {
      mainWindow,
      floatingWindow
    }

    const recreateMainWindow = (): BrowserWindow => {
      mainWindow = createMainWindow(getUrlToHandleOnReady, (url) => handleAppUrl(url, mainWindow))
      // Update the windows object reference for IPC handlers
      windows.mainWindow = mainWindow
      return mainWindow
    }

    const recreateFloatingWindow = (): void => {
      if (!floatingWindow) {
        floatingWindow = createFloatingWindow(() => mainWindow)
        // Update the windows object reference for IPC handlers
        windows.floatingWindow = floatingWindow

        // Set up closed event handler for the new floating window
        if (floatingWindow) {
          floatingWindow.on('closed', () => {
            floatingWindow = null
            windows.floatingWindow = null
          })
        }
      }
    }

    await registerIpcHandlers(windows, recreateFloatingWindow, recreateMainWindow)
    registerAutoUpdaterHandlers()

    // Don't start observing active window changes immediately
    // This will be started after onboarding is complete via IPC call
    // Store the callback for later use
    const windowChangeCallback = (windowInfo: ActiveWindowDetails | null) => {
      if (
        windowInfo &&
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.webContents.isDestroyed() &&
        !isTrackingPaused
      ) {
        mainWindow.webContents.send('active-window-changed', windowInfo)
      }
    }

    // Make the callback available to IPC handlers
    globalThis.stopActiveWindowObserver = () => {
      isTrackingPaused = true
      getNativeWindows().stopActiveWindowObserver()
    }
    globalThis.startActiveWindowObserver = () => {
      isTrackingPaused = false
      getNativeWindows().startActiveWindowObserver(windowChangeCallback)
    }

    // Handle app activation (e.g., clicking the dock icon on macOS)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow(getUrlToHandleOnReady, (url) => handleAppUrl(url, mainWindow))
        windows.mainWindow = mainWindow
      } else {
        // If there are windows (like the floating window), show the main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
          if (mainWindow.isMinimized()) {
            mainWindow.restore()
          }
        } else {
          // Main window doesn't exist, recreate it
          mainWindow = createMainWindow(getUrlToHandleOnReady, (url) =>
            handleAppUrl(url, mainWindow)
          )
          windows.mainWindow = mainWindow
        }
      }
    })
  }

  function setupCsp() {
    const devServerURL = 'http://localhost:5173'
    const csp = `default-src 'self'; script-src 'self' 'unsafe-eval' https://accounts.google.com https://*.googleusercontent.com https://us-assets.i.posthog.com https://eu-assets.i.posthog.com https://*.loom.com https://*.prod-east.frontend.public.atl-paas.net https://cdn.segment.com ${is.dev ? "'unsafe-inline' " + devServerURL : ''}; style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.gstatic.com https://*.loom.com https://*.prod-east.frontend.public.atl-paas.net; font-src 'self' https://fonts.gstatic.com https://*.loom.com https://*.prod-east.frontend.public.atl-paas.net; media-src 'self' data: blob: https://cdn.loom.com https://*.loom.com; img-src * data:; frame-src https://accounts.google.com https://*.googleusercontent.com https://accounts.youtube.com https://*.loom.com; connect-src 'self' https://cdn.jsdelivr.net http://localhost:3001 http://127.0.0.1:3001 https://play.google.com https://accounts.google.com https://*.googleusercontent.com https://accounts.youtube.com https://*.loom.com https://api-private.atlassian.com https://as.atlassian.com https://*.sentry.io https://api.segment.io https://cdn.segment.com https://*.prod-east.frontend.public.atl-paas.net https://whatdidyougetdonetoday.s3.us-east-1.amazonaws.com https://whatdidyougetdonetoday.s3.amazonaws.com https://us.i.posthog.com https://eu.i.posthog.com https://us-assets.i.posthog.com https://eu-assets.i.posthog.com https://whatdidyougetdonetoday-ai-server.onrender.com ${is.dev ? devServerURL : ''}; worker-src 'self' blob:`

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
          'Cross-Origin-Opener-Policy': ['unsafe-none']
        }
      })
    })
  }

  app.whenReady().then(initializeApp)

  // Handle app quit attempts (Cmd+Q, Dock → Quit, Menu → Quit)
  app.on('before-quit', (event) => {
    setIsAppQuitting(true)

    // Only show quit modal for Cmd+Q when app is focused
    if (mainWindow && mainWindow.isFocused()) {
      event.preventDefault()
      setIsAppQuitting(false) // Reset since we're preventing
      mainWindow.webContents.send('show-quit-confirmation')
    }
    // For dock/menu quit or unfocused app, allow normal quit
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
}

if (gotSingleInstanceLock) {
  App()
}

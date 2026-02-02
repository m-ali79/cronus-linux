import { is } from '@electron-toolkit/utils'
import { BrowserWindow, nativeTheme, screen } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

// Quit handling state
let allowForcedQuit = false
let isAppQuitting = false

// Export functions to manage quit state
export function setAllowForcedQuit(allow: boolean): void {
  allowForcedQuit = allow
}

export function setIsAppQuitting(quitting: boolean): void {
  isAppQuitting = quitting
}

export function getIsAppQuitting(): boolean {
  return isAppQuitting
}

const FLOATING_WINDOW_WIDTH = 400
const FLOATING_WINDOW_HEIGHT = 43
const IS_FLOATING_WINDOW_DEV_MODE = false

export function createFloatingWindow(
  getMainWindow: () => BrowserWindow | null
): BrowserWindow | null {
  nativeTheme.themeSource = 'system'
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize

  const x = Math.round(screenWidth / 2 - FLOATING_WINDOW_WIDTH / 2)
  const y = 0

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: FLOATING_WINDOW_WIDTH,
    height: FLOATING_WINDOW_HEIGHT,
    x: x,
    y: y,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    type: process.platform === 'darwin' ? 'panel' : 'normal',
    webPreferences: {
      preload: join(__dirname, '../preload/floatingPreload.js'),
      sandbox: false,
      contextIsolation: true
    }
  }

  const floatingWindow = new BrowserWindow(windowOptions)
  if (!floatingWindow) {
    console.error('Failed to create floating window')
    return null
  }

  floatingWindow.on('show', () => {
    const main = getMainWindow()
    if (main && !main.isDestroyed() && !main.webContents.isDestroyed()) {
      main.webContents.send('floating-window-visibility-changed', true)
    }
  })
  floatingWindow.on('hide', () => {
    const main = getMainWindow()
    if (main && !main.isDestroyed() && !main.webContents.isDestroyed()) {
      main.webContents.send('floating-window-visibility-changed', false)
    }
  })

  // Prevent full screen mode
  floatingWindow.on('enter-full-screen', () => {
    console.log('Preventing floating window from entering full screen mode')
    floatingWindow.setFullScreen(false)
  })

  if (process.platform === 'darwin') {
    floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  floatingWindow.webContents.on('did-finish-load', () => {
    if (is.dev && IS_FLOATING_WINDOW_DEV_MODE) {
      floatingWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  floatingWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`Floating window failed to load: ${errorCode}, ${errorDescription}`)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const floatingUrl = `${process.env['ELECTRON_RENDERER_URL']}/floating.html`
    floatingWindow
      .loadURL(floatingUrl)
      .catch((err) => console.error('Failed to load floating URL (dev):', err))
  } else {
    const floatingFilePath = join(__dirname, '../renderer/floating.html')
    floatingWindow
      .loadFile(floatingFilePath)
      .catch((err) => console.error('Failed to load floating file (prod):', err))
  }

  floatingWindow.on('closed', () => {
    console.log('Floating window closed.')
    // The reference will be cleared in the main file
  })

  return floatingWindow
}

export function createMainWindow(
  getUrlToHandleOnReady: () => string | null,
  handleAppUrl: (url: string) => void
): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  const windowWidth = 800
  const windowHeight = is.dev ? 1200 : 900

  const mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: is.dev ? Math.round(screenWidth - windowWidth) : Math.round((screenWidth - windowWidth) / 2),
    y: Math.round((screenHeight - windowHeight) / 2),
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    acceptFirstMouse: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (!mainWindow) {
    throw new Error('Failed to create main window')
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (is.dev) {
    const devUrl = process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173'
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'bottom' })

    // Suppress Chrome DevTools Autofill protocol errors (harmless but noisy)
    // These errors come from Chromium's internal DevTools protocol client
    // Using the new Event API format to avoid deprecation warnings
    mainWindow.webContents.on('console-message', (event) => {
      const { message, sourceId } = event
      // Filter out Autofill protocol errors from DevTools internal code
      if (
        sourceId?.includes('devtools://') &&
        (message.includes('Autofill.enable') ||
          message.includes('Autofill.setAddresses') ||
          message.includes("'Autofill.enable' wasn't found") ||
          message.includes("'Autofill.setAddresses' wasn't found") ||
          message.includes('Request Autofill.enable failed') ||
          message.includes('Request Autofill.setAddresses failed'))
      ) {
        // Suppress these specific DevTools protocol errors
        event.preventDefault()
      }
    })
  }

  mainWindow.webContents.on('did-finish-load', () => {
    const pendingUrl = getUrlToHandleOnReady()
    if (pendingUrl) {
      handleAppUrl(pendingUrl)
    }
  })

  // Handle close button - hide window instead of destroying it to keep tracking active
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !isAppQuitting && !allowForcedQuit) {
      // This is the red traffic light button - hide instead of close
      event.preventDefault()
      mainWindow.hide()
    }
    // If isAppQuitting or allowForcedQuit is true, allow normal close behavior
  })

  return mainWindow
}

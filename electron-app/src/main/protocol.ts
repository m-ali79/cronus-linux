import { app, BrowserWindow } from 'electron'

const PROTOCOL_SCHEME = 'cronus'
let urlToHandleOnReady: string | null = null
const PROTOCOL_PREFIX = `${PROTOCOL_SCHEME}://`

export function handleAppUrl(url: string, mainWindow: BrowserWindow | null): void {
  let code: string | null = null
  try {
    const parsedUrl = new URL(url)
    code = parsedUrl.searchParams.get('code')
  } catch (e) {
    console.error('[Protocol] Parse Error:', e)
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    urlToHandleOnReady = url
    return
  }

  // FORCE Instance A to the front
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()

  if (code) {
    mainWindow.webContents.send('auth-code-received', code)
  }
}

export function setupSingleInstanceLock(getMainWindow: () => BrowserWindow | null): boolean {
  // On Linux, the lock namespace is effectively derived from the app identity / userData path.
  // That should be made stable before calling this (see `configureStableAppIdentity()` in main entry).
  // On Windows, AppUserModelId still matters for grouping and some shell integrations.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.cronus.app')
  }

  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    console.log('!!! SECOND INSTANCE DETECTED - KILLING PROCESS !!!')
    app.exit(0) // app.exit is more aggressive than app.quit()
    return false
  }

  app.on('second-instance', (_event, commandLine) => {
    console.log('Received data from second instance...')
    const mainWindow = getMainWindow()
    // On Linux the protocol URL can appear in a variety of argv shapes depending on the `.desktop` Exec.
    // Examples:
    // - cronus://auth?code=...
    // - -- cronus://auth?code=...
    // - --some-flag=cronus://auth?code=...
    const url = commandLine.find((arg) => arg.includes(PROTOCOL_PREFIX))

    if (url) {
      const extracted = url.slice(url.indexOf(PROTOCOL_PREFIX))
      handleAppUrl(extracted, mainWindow)
    } else if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  return true
}

export function setupProtocolHandlers(getMainWindow: () => BrowserWindow | null): void {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAppUrl(url, getMainWindow())
  })

  const initialArg = process.argv.find((arg) => arg.includes(PROTOCOL_PREFIX))
  const initialUrl = initialArg ? initialArg.slice(initialArg.indexOf(PROTOCOL_PREFIX)) : undefined
  if (initialUrl) urlToHandleOnReady = initialUrl
}

export function getUrlToHandleOnReady(): string | null {
  const url = urlToHandleOnReady
  urlToHandleOnReady = null
  return url
}

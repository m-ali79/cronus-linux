/**
 * Hyprland Window Tracker
 *
 * Tracks active window changes using Hyprland's socket2 event stream.
 * This is event-driven (like macOS) rather than polling-based.
 */

import net from 'net'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'
import { ActiveWindowDetails } from 'shared'
import { HyprlandWindow, BROWSER_DETECTION, LinuxBrowserType, CaptureReason } from '../types'
import { getHyprlandSocketPathAsync } from '../permissions/dependencyChecker'

const execFileAsync = promisify(execFile)

// Constants matching macOS behavior
const STABILIZATION_DELAY_MS = 100 // Wait 100ms after window switch for state to settle
const PERIODIC_BACKUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const DEBOUNCE_DELAY_MS = 10 * 1000 // 10 seconds - only capture final window after inactivity

export class HyprlandWindowTracker extends EventEmitter {
  private eventSocket: net.Socket | null = null
  private callback: ((details: ActiveWindowDetails | null) => void) | null = null
  private lastWindowAddress: string | null = null
  private lastWindowDetails: ActiveWindowDetails | null = null
  private backupTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private buffer = ''
  private debounceTimer: NodeJS.Timeout | null = null
  private pendingCaptureReason: CaptureReason | null = null
  private stabilizationTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
  }

  /**
   * Start observing active window changes
   */
  async start(callback: (details: ActiveWindowDetails | null) => void): Promise<void> {
    if (this.isRunning) {
      console.log('[HyprlandWindowTracker] Already running')
      return
    }

    this.callback = callback
    this.isRunning = true

    // Connect to Hyprland event socket
    await this.connectToSocket()

    // Start periodic backup timer
    this.startPeriodicBackup()

    // Capture initial window state
    await this.captureCurrentWindow('initial')
  }

  /**
   * Stop observing active window changes
   */
  stop(): void {
    this.isRunning = false

    if (this.eventSocket) {
      this.eventSocket.destroy()
      this.eventSocket = null
    }

    if (this.backupTimer) {
      clearInterval(this.backupTimer)
      this.backupTimer = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer)
      this.stabilizationTimer = null
    }

    this.callback = null
    this.lastWindowAddress = null
    this.lastWindowDetails = null
    this.buffer = ''
    this.pendingCaptureReason = null
  }

  /**
   * Connect to Hyprland's socket2 event stream
   */
  private async connectToSocket(): Promise<void> {
    const socketPath = await getHyprlandSocketPathAsync()

    if (!socketPath) {
      console.error('[HyprlandWindowTracker] Hyprland socket path not found')
      // Do NOT emit 'error' (special EventEmitter behavior can crash the process if unhandled).
      this.emit('tracker-error', new Error('Hyprland not running'))
      this.scheduleReconnect()
      return
    }

    return new Promise((resolve, reject) => {
      let settled = false
      this.eventSocket = net.createConnection(socketPath)

      this.eventSocket.on('connect', () => {
        console.log('[HyprlandWindowTracker] Connected to Hyprland socket')
        settled = true
        resolve()
      })

      this.eventSocket.on('data', (data) => {
        this.handleSocketData(data)
      })

      this.eventSocket.on('error', (err) => {
        console.error('[HyprlandWindowTracker] Socket error:', err)
        // Do NOT emit 'error' (special EventEmitter behavior can crash the process if unhandled).
        this.emit('tracker-error', err)

        // If we haven't connected yet, don't block startup forever.
        if (!settled) {
          settled = true
          resolve()
        }

        if (!this.isRunning) reject(err)
        else this.scheduleReconnect()
      })

      this.eventSocket.on('close', () => {
        console.log('[HyprlandWindowTracker] Socket closed')
        if (!settled) {
          settled = true
          resolve()
        }
        if (this.isRunning) {
          this.scheduleReconnect()
        }
      })
    })
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return
    }

    console.log('[HyprlandWindowTracker] Scheduling reconnect in 5 seconds...')
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (this.isRunning) {
        try {
          await this.connectToSocket()
        } catch (err) {
          console.error('[HyprlandWindowTracker] Reconnect failed:', err)
          this.scheduleReconnect()
        }
      }
    }, 5000)
  }

  /**
   * Handle data from Hyprland socket
   */
  private handleSocketData(data: Buffer): void {
    this.buffer += data.toString()

    // Process complete lines
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        this.handleEvent(line.trim())
      }
    }
  }

  /**
   * Handle window switch with debouncing
   * Only captures the final window after 10 seconds of no new switches
   */
  private handleWindowSwitch(): void {
    // Cancel any pending stabilization and debounce timers
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer)
      this.stabilizationTimer = null
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Set pending capture reason
    this.pendingCaptureReason = 'app_switch'

    // Start stabilization delay (100ms) then schedule debounce
    this.stabilizationTimer = setTimeout(() => {
      this.stabilizationTimer = null

      // Now schedule the actual capture after debounce delay
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null
        const reason = this.pendingCaptureReason!
        this.pendingCaptureReason = null

        console.log(`[WindowTracker] Capturing window after debounce: reason=${reason}`)
        this.captureCurrentWindow(reason)
      }, DEBOUNCE_DELAY_MS)

      console.log(
        `[WindowTracker] Window switch detected, debouncing for ${DEBOUNCE_DELAY_MS}ms...`
      )
    }, STABILIZATION_DELAY_MS)
  }

  /**
   * Handle a single Hyprland event
   */
  private handleEvent(event: string): void {
    // Events are in format: eventtype>>data
    const [eventType] = event.split('>>')

    switch (eventType) {
      case 'activewindow':
        // Format: class,title
        // Debounce window switches: only capture final window after 10s of inactivity
        this.handleWindowSwitch()
        break

      case 'activewindowv2':
        // Format: window_address (just the address)
        // We'll use activewindow event instead as it's more consistent
        break

      case 'workspace':
        // Workspace changed - may want to capture this
        break

      case 'closewindow':
        // Window closed
        break

      default:
        // Ignore other events
        break
    }
  }

  /**
   * Capture current active window state
   */
  async captureCurrentWindow(reason: CaptureReason): Promise<void> {
    try {
      const { stdout } = await execFileAsync('hyprctl', ['activewindow', '-j'], {
        timeout: 5000
      })

      const window: HyprlandWindow = JSON.parse(stdout)

      // Skip if same window as last time (for periodic backup)
      if (reason === 'periodic_backup' && window.address === this.lastWindowAddress) {
        return
      }

      this.lastWindowAddress = window.address

      const browser = this.detectBrowser(window.class)
      const type = browser ? 'browser' : 'window'

      const details: ActiveWindowDetails = {
        windowId: parseInt(window.address.replace('0x', ''), 16) || 0,
        ownerName: window.class || window.initialClass || 'Unknown',
        type: type,
        browser: browser,
        title: window.title || null,
        url: null, // Will be filled by BrowserTracker if needed
        content: null, // Will be filled by ScreenshotManager if needed
        timestamp: Date.now(),
        contentSource: null,
        // Keep this aligned with what the server schema accepts.
        captureReason: reason === 'periodic_backup' ? 'periodic_backup' : 'app_switch',
        durationMs: 0
      }

      this.lastWindowDetails = details

      console.log(`[WindowTracker] Window captured: ${details.ownerName} (${details.type})`)

      // Emit the event
      if (this.callback) {
        this.callback(details)
      }

      this.emit('window-changed', details)
    } catch (error) {
      console.error('[HyprlandWindowTracker] Failed to capture window:', error)

      if (this.callback) {
        this.callback(null)
      }

      // Do NOT emit 'error' (special EventEmitter behavior can crash the process if unhandled).
      this.emit('tracker-error', error)
    }
  }

  /**
   * Detect if the window class is a browser
   */
  private detectBrowser(windowClass: string): LinuxBrowserType {
    if (!windowClass) {
      return null
    }

    // Check exact match first
    if (BROWSER_DETECTION[windowClass]) {
      return BROWSER_DETECTION[windowClass]
    }

    // Check lowercase
    const lower = windowClass.toLowerCase()
    for (const [key, value] of Object.entries(BROWSER_DETECTION)) {
      if (lower === key.toLowerCase()) {
        return value
      }
    }

    // Check if contains browser name
    if (lower.includes('chrome') || lower.includes('chromium')) return 'chrome'
    if (lower.includes('arc')) return 'arc'
    if (lower.includes('brave')) return 'chrome'
    if (lower.includes('helium')) return 'arc'

    return null
  }

  /**
   * Start the periodic backup timer
   */
  private startPeriodicBackup(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer)
    }

    this.backupTimer = setInterval(() => {
      this.captureCurrentWindow('periodic_backup')
    }, PERIODIC_BACKUP_INTERVAL_MS)
  }

  /**
   * Get the last captured window details
   */
  getLastWindowDetails(): ActiveWindowDetails | null {
    return this.lastWindowDetails
  }

  /**
   * Check if the tracker is currently running
   */
  getIsRunning(): boolean {
    return this.isRunning
  }
}

// Export a singleton instance
export const hyprlandWindowTracker = new HyprlandWindowTracker()

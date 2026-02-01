/**
 * Browser Tracker for Linux
 *
 * Purpose: Enrich browser window events with actual tab URL via CDP.
 *
 * Important:
 * - Window/tab switch detection happens via Hyprland socket events.
 * - CDP is ONLY used to get the URL of the active tab when a browser window is detected.
 * - If CDP is unavailable, browser events still fire but with url: null.
 * - CDP requires browser to be launched with --remote-debugging-port=9222.
 */

import { ActiveWindowDetails } from 'shared'
import { LinuxBrowserType } from '../types'

// Default Chrome DevTools Protocol port
const DEFAULT_CDP_PORT = 9222

interface BrowserTab {
  url: string
  title: string
}

interface CDPTarget {
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl?: string
}

export class BrowserTracker {
  private isRunning = false
  private cdpPort: number = DEFAULT_CDP_PORT

  constructor() {
    // No initialization needed
  }

  /**
   * Start tracking browser URLs (no-op, CDP is queried on-demand)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[BrowserTracker] Already running')
      return
    }

    this.isRunning = true
    console.log('[BrowserTracker] Started (CDP will be queried on-demand for browser events)')
  }

  /**
   * Stop tracking browser URLs
   */
  stop(): void {
    this.isRunning = false
    console.log('[BrowserTracker] Stopped')
  }

  /**
   * Get the current browser tab URL and title
   * Called when we detect a browser is active
   */
  async getCurrentTab(browserType: LinuxBrowserType): Promise<BrowserTab | null> {
    if (!browserType) {
      return null
    }

    // Try Chrome DevTools Protocol for Chromium-based browsers
    if (browserType === 'chrome' || browserType === 'arc') {
      return await this.getCDPTab()
    }

    return null
  }

  /**
   * Get active tab via Chrome DevTools Protocol
   * Called on-demand when a browser window is detected
   */
  private async getCDPTab(): Promise<BrowserTab | null> {
    try {
      // Fetch list of targets from CDP
      const response = await fetch(`http://127.0.0.1:${this.cdpPort}/json/list`, {
        signal: AbortSignal.timeout(2000)
      })

      if (!response.ok) {
        return null
      }

      const targets: CDPTarget[] = await response.json()

      // Find the active page target
      // CDP lists targets in focus order, so the first "page" type is usually active
      const pageTarget = targets.find(
        (t) => t.type === 'page' && t.url && !t.url.startsWith('devtools://')
      )

      if (!pageTarget) {
        return null
      }

      return {
        url: pageTarget.url,
        title: pageTarget.title
      }
    } catch {
      // CDP not available - browser may not have been started with --remote-debugging-port
      // This is expected, we'll just return null
      return null
    }
  }

  /**
   * Enrich window details with browser URL if applicable
   * Called when a browser window is detected (on app_switch or any event)
   */
  async enrichWithBrowserUrl(details: ActiveWindowDetails): Promise<ActiveWindowDetails> {
    if (details.type !== 'browser' || !details.browser) {
      return details
    }

    const tab = await this.getCurrentTab(details.browser as LinuxBrowserType)

    if (tab) {
      console.log(`[BrowserTracker] CDP enrichment success: ${tab.url.substring(0, 50)}...`)
      return {
        ...details,
        url: tab.url,
        title: tab.title || details.title // Prefer browser title if available
      }
    }

    console.warn(
      `[BrowserTracker] CDP enrichment failed: CDP unavailable or browser not running with --remote-debugging-port=${this.cdpPort}`
    )
    return details
  }

  /**
   * Set the CDP port (default 9222)
   */
  setCDPPort(port: number): void {
    this.cdpPort = port
  }

  /**
   * Check if CDP is available
   */
  async isCDPAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.cdpPort}/json/version`, {
        signal: AbortSignal.timeout(2000)
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// Export a singleton instance
export const browserTracker = new BrowserTracker()

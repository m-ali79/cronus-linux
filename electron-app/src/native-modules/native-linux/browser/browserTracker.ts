import { readFileSync } from 'fs'
import { ActiveWindowDetails } from 'shared'
import { LinuxBrowserType } from '../types'

interface BrowserTab {
  url: string
}

export class BrowserTracker {
  private isRunning = false

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[BrowserTracker] Already running')
      return
    }

    this.isRunning = true
    console.log('[BrowserTracker] Started (File-based tracking)')
  }

  stop(): void {
    this.isRunning = false
    console.log('[BrowserTracker] Stopped')
  }

  async getCurrentTab(browserType: LinuxBrowserType): Promise<BrowserTab | null> {
    if (!this.isRunning || !browserType) {
      return null
    }

    try {
      const fileName = this.getBrowserFileName(browserType)
      const filePath = `/tmp/cronus-url-${fileName}.json`

      const data = readFileSync(filePath, 'utf8')
      const { url, timestamp } = JSON.parse(data)

      const age = Date.now() - timestamp
      if (age > 15000) {
        console.log(`[BrowserTracker] URL stale (${age}ms old)`)
        return null
      }

      return { url }
    } catch (error) {
      return null
    }
  }

  private getBrowserFileName(browserType: LinuxBrowserType): string {
    switch (browserType) {
      case 'chrome':
        return 'chrome'
      case 'arc':
        return 'arc'
      default:
        return 'chrome'
    }
  }

  async enrichWithBrowserUrl(details: ActiveWindowDetails): Promise<ActiveWindowDetails> {
    if (details.type !== 'browser' || !details.browser) {
      return details
    }

    const tab = await this.getCurrentTab(details.browser as LinuxBrowserType)

    if (tab) {
      console.log(`[BrowserTracker] URL enrichment success: ${tab.url.substring(0, 50)}...`)
      return {
        ...details,
        url: tab.url
      }
    }

    console.warn(`[BrowserTracker] No URL available for ${details.browser}`)
    return details
  }
}

export const browserTracker = new BrowserTracker()

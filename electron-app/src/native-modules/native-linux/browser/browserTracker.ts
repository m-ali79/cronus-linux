import { readFileSync } from 'fs'
import { ActiveWindowDetails } from 'shared'

interface LatestUrl {
  url: string
  timestamp: number
}

export class BrowserTracker {
  private isRunning = false
  private readonly FILE_PATH = '/tmp/cronus-url-latest.json'

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[BrowserTracker] Already running')
      return
    }
    this.isRunning = true
    console.log('[BrowserTracker] Started (Single-file tracking)')
  }

  stop(): void {
    this.isRunning = false
    console.log('[BrowserTracker] Stopped')
  }

  async getCurrentUrl(): Promise<LatestUrl | null> {
    if (!this.isRunning) {
      return null
    }

    try {
      const data = readFileSync(this.FILE_PATH, 'utf8')
      const parsed = JSON.parse(data)
      
      const age = Date.now() - parsed.timestamp
      if (age > 15000) {
        console.log(`[BrowserTracker] URL stale (${age}ms old)`)
        return null
      }

      return { url: parsed.url, timestamp: parsed.timestamp }
    } catch (error) {
      return null
    }
  }

  async enrichWithBrowserUrl(details: ActiveWindowDetails): Promise<ActiveWindowDetails> {
    if (details.type !== 'browser' || !details.browser) {
      return details
    }

    const latest = await this.getCurrentUrl()

    if (latest) {
      console.log(`[BrowserTracker] URL enriched: ${latest.url.substring(0, 50)}...`)
      return {
        ...details,
        url: latest.url
      }
    }

    console.warn(`[BrowserTracker] No URL available`)
    return details
  }
}

export const browserTracker = new BrowserTracker()

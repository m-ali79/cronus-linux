/**
 * Screenshot Manager for Linux
 *
 * Captures screenshots using grim and performs OCR using tesseract.
 * Saves screenshots locally with date-organized structure for timeline feature.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import { HyprlandWindow, HyprlandMonitor, ScreenshotSettings, ScreenshotResult } from '../types'

const execFileAsync = promisify(execFile)

// Default settings
const DEFAULT_SETTINGS: ScreenshotSettings = {
  captureMode: 'window',
  captureQuality: 80,
  enableOCR: true,
  ocrLanguage: 'eng'
}

// Max OCR text length (matching macOS)
const MAX_OCR_TEXT_LENGTH = 2000

// OCR timeout (ms)
const OCR_TIMEOUT_MS = 60_000

// Tessdata: prefer fast, fallback to default (best)
const TESSDATA_FAST_DIR = '/usr/share/tessdata_fast'
const TESSDATA_FAST_ENG = path.join(TESSDATA_FAST_DIR, 'eng.traineddata')

export async function resolveTessdataEnv(): Promise<{
  env?: NodeJS.ProcessEnv
  label: string
}> {
  try {
    await fs.access(TESSDATA_FAST_ENG)
    return {
      env: { ...process.env, TESSDATA_PREFIX: TESSDATA_FAST_DIR + path.sep },
      label: 'tessdata_fast'
    }
  } catch {
    return { label: 'tessdata_best (fast not available)' }
  }
}

// Per-folder write queue to prevent concurrent metadata.json RMW races.
const metadataWriteQueueByFolder = new Map<string, Promise<void>>()

function formatLocalDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function enqueueFolderWrite(folderPath: string, op: () => Promise<void>): Promise<void> {
  const previous = metadataWriteQueueByFolder.get(folderPath) ?? Promise.resolve()

  const next = previous
    // Ensure a previous failure doesn't block later queued operations.
    .catch(() => {})
    .then(op)

  const nextWithCleanup = next.finally(() => {
    // Only remove the key if this is still the tail.
    if (metadataWriteQueueByFolder.get(folderPath) === nextWithCleanup) {
      metadataWriteQueueByFolder.delete(folderPath)
    }
  })

  metadataWriteQueueByFolder.set(folderPath, nextWithCleanup)
  return nextWithCleanup
}

export class ScreenshotManager {
  private basePath: string
  private settings: ScreenshotSettings

  constructor() {
    this.basePath = path.join(app.getPath('userData'), 'screenshots')
    this.settings = { ...DEFAULT_SETTINGS }
  }

  /**
   * Initialize the screenshot manager
   */
  async initialize(): Promise<void> {
    // Ensure base directory exists
    await fs.mkdir(this.basePath, { recursive: true })
  }

  /**
   * Update screenshot settings
   */
  setSettings(settings: Partial<ScreenshotSettings>): void {
    this.settings = { ...this.settings, ...settings }
  }

  /**
   * Get current settings
   */
  getSettings(): ScreenshotSettings {
    return { ...this.settings }
  }

  /**
   * Capture screenshot and perform OCR
   */
  async captureAndOCR(): Promise<ScreenshotResult> {
    try {
      // Get active window info for capture
      const windowInfo = await this.getActiveWindowInfo()

      // Capture screenshot
      const imageBuffer = await this.captureScreenshot(windowInfo)

      if (!imageBuffer) {
        return { success: false, error: 'Screenshot capture failed' }
      }

      // Save screenshot locally
      const imagePath = await this.saveScreenshot(imageBuffer, windowInfo)

      // Perform OCR if enabled
      let ocrText: string | undefined
      if (this.settings.enableOCR) {
        ocrText = await this.performOCR(imagePath)
      }

      return {
        success: true,
        imagePath,
        ocrText
      }
    } catch (error) {
      console.error('[ScreenshotManager] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Capture screenshot only (no OCR)
   */
  async captureOnly(): Promise<{ success: boolean; imagePath?: string; error?: string }> {
    try {
      const windowInfo = await this.getActiveWindowInfo()
      const imageBuffer = await this.captureScreenshot(windowInfo)

      if (!imageBuffer) {
        return { success: false, error: 'Screenshot capture failed' }
      }

      const imagePath = await this.saveScreenshot(imageBuffer, windowInfo)
      return { success: true, imagePath }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Perform OCR on an existing image. Uses tessdata_fast when available, else default (best). Timeout 60s.
   */
  async performOCR(imagePath: string): Promise<string | undefined> {
    try {
      const { env, label } = await resolveTessdataEnv()
      console.log(`[OCR] Using ${label}`)
      console.log(`[OCR] Starting OCR for ${imagePath}`)
      const { stdout } = await execFileAsync(
        'tesseract',
        [imagePath, 'stdout', '-l', this.settings.ocrLanguage, '--psm', '6', 'quiet'],
        { timeout: OCR_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, env }
      )

      let text = stdout.trim()
      if (text.length > MAX_OCR_TEXT_LENGTH) {
        text = text.substring(0, MAX_OCR_TEXT_LENGTH)
      }

      console.log(`[OCR] OCR completed: ${text.length} characters extracted`)
      return text
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[OCR] OCR failed:', errorMessage)
      return undefined
    }
  }

  /**
   * Get active window information from Hyprland
   */
  private async getActiveWindowInfo(): Promise<HyprlandWindow | null> {
    try {
      const { stdout } = await execFileAsync('hyprctl', ['activewindow', '-j'], {
        timeout: 5000
      })
      return JSON.parse(stdout)
    } catch {
      return null
    }
  }

  /**
   * Get focused monitor information
   */
  private async getFocusedMonitor(): Promise<HyprlandMonitor | null> {
    try {
      const { stdout } = await execFileAsync('hyprctl', ['monitors', '-j'], {
        timeout: 5000
      })
      const monitors: HyprlandMonitor[] = JSON.parse(stdout)
      return monitors.find((m) => m.focused) || monitors[0] || null
    } catch {
      return null
    }
  }

  /**
   * Capture screenshot using grim
   */
  private async captureScreenshot(windowInfo: HyprlandWindow | null): Promise<Buffer | null> {
    try {
      const grimArgs: string[] = []

      if (this.settings.captureMode === 'window' && windowInfo) {
        // Capture specific window region
        const [x, y] = windowInfo.at
        const [width, height] = windowInfo.size
        grimArgs.push('-g', `${x},${y} ${width}x${height}`)
      } else {
        // Capture full screen (focused monitor)
        const monitor = await this.getFocusedMonitor()
        if (monitor) {
          grimArgs.push('-o', monitor.name)
        }
      }

      // Output format
      grimArgs.push('-t', 'jpeg')
      grimArgs.push('-q', this.settings.captureQuality.toString())
      grimArgs.push('-') // Output to stdout

      const { stdout } = await execFileAsync('grim', grimArgs, {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024, // 50MB max
        timeout: 10000
      })

      // stdout is already a Buffer when encoding is 'buffer'
      return Buffer.from(stdout as Buffer)
    } catch (error) {
      console.error('[ScreenshotManager] grim capture failed:', error)
      return null
    }
  }

  /**
   * Save screenshot with date-organized structure
   */
  private async saveScreenshot(buffer: Buffer, windowInfo: HyprlandWindow | null): Promise<string> {
    const now = new Date()

    // Date folder: YYYY-MM-DD
    const dateFolder = formatLocalDateYYYYMMDD(now)

    // Time: HH-MM-SS
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-')

    // App name (sanitized)
    const appName = (windowInfo?.class || 'unknown')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .toLowerCase()
      .substring(0, 20)

    // Timestamp
    const timestamp = now.getTime()

    // Construct path
    const folderPath = path.join(this.basePath, dateFolder)
    await fs.mkdir(folderPath, { recursive: true })

    const filename = `${time}_${appName}_${timestamp}.jpg`
    const filepath = path.join(folderPath, filename)

    // Write file
    await fs.writeFile(filepath, buffer)

    // Update metadata.json
    await this.updateMetadata(folderPath, {
      timestamp,
      filepath,
      filename,
      appName: windowInfo?.class || 'unknown',
      title: windowInfo?.title || ''
    })

    return filepath
  }

  /**
   * Update metadata.json for the date folder
   */
  private async updateMetadata(
    folderPath: string,
    entry: {
      timestamp: number
      filepath: string
      filename: string
      appName: string
      title: string
    }
  ): Promise<void> {
    return enqueueFolderWrite(folderPath, async () => {
      const metadataPath = path.join(folderPath, 'metadata.json')

      try {
        let metadata: { screenshots: (typeof entry)[] } = { screenshots: [] }

        try {
          const existing = await fs.readFile(metadataPath, 'utf-8')
          metadata = JSON.parse(existing)
        } catch {
          // File doesn't exist, use empty array
        }

        metadata.screenshots.push(entry)

        // Keep sorted by timestamp
        metadata.screenshots.sort((a, b) => a.timestamp - b.timestamp)

        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
      } catch (error) {
        console.error('[ScreenshotManager] Failed to update metadata:', error)
      }
    })
  }

  /**
   * Get screenshots for a specific date
   */
  async getScreenshotsForDate(
    dateString: string
  ): Promise<{ timestamp: number; filepath: string; appName: string; title: string }[]> {
    const metadataPath = path.join(this.basePath, dateString, 'metadata.json')

    try {
      const content = await fs.readFile(metadataPath, 'utf-8')
      const metadata = JSON.parse(content)
      return metadata.screenshots || []
    } catch {
      return []
    }
  }

  /**
   * Get available dates (folders)
   */
  async getAvailableDates(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true })
      return entries
        .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map((e) => e.name)
        .sort()
        .reverse() // Most recent first
    } catch {
      return []
    }
  }

  /**
   * Clean up old screenshots (older than keepDays)
   */
  async cleanupOldScreenshots(keepDays: number): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - keepDays)
    const cutoffString = formatLocalDateYYYYMMDD(cutoffDate)

    const dates = await this.getAvailableDates()
    let deletedCount = 0

    for (const date of dates) {
      if (date < cutoffString) {
        try {
          const folderPath = path.join(this.basePath, date)
          await fs.rm(folderPath, { recursive: true })
          deletedCount++
        } catch (error) {
          console.error(`[ScreenshotManager] Failed to delete ${date}:`, error)
        }
      }
    }

    return deletedCount
  }
}

// Export a singleton instance
export const screenshotManager = new ScreenshotManager()

/**
 * System Event Observer for Linux
 *
 * Monitors system events (sleep/wake/lock/unlock) using D-Bus.
 * This replaces macOS NSWorkspace notifications.
 */

import { EventEmitter } from 'events'
import { ActiveWindowDetails } from 'shared'
import { SystemEventType } from '../types'

// D-Bus interface names
const LOGIN1_MANAGER = 'org.freedesktop.login1.Manager'
const LOGIN1_PATH = '/org/freedesktop/login1'
const SCREENSAVER_INTERFACE = 'org.freedesktop.ScreenSaver'
const SCREENSAVER_PATH = '/org/freedesktop/ScreenSaver'

// Minimal D-Bus types (dbus-next doesn't export types)
interface DBusBus {
  disconnect(): void
  getProxyObject(service: string, path: string): Promise<DBusProxyObject>
}

interface DBusProxyObject {
  getInterface(interfaceName: string): DBusInterface
}

interface DBusInterface {
  on(event: string, callback: (...args: unknown[]) => void): void
}

interface DBusModule {
  systemBus(): DBusBus
  sessionBus(): DBusBus
}

export class SystemEventObserver extends EventEmitter {
  private callback: ((event: ActiveWindowDetails) => void) | null = null
  private isRunning = false
  private dbus: DBusModule | null = null
  private systemBus: DBusBus | null = null
  private sessionBus: DBusBus | null = null

  constructor() {
    super()
  }

  /**
   * Start observing system events
   */
  async start(callback: (event: ActiveWindowDetails) => void): Promise<void> {
    if (this.isRunning) {
      console.log('[SystemEventObserver] Already running')
      return
    }

    this.callback = callback
    this.isRunning = true

    try {
      console.log('[SystemEventObserver] Connecting to D-Bus...')
      // Dynamically import dbus-next
      // This is done at runtime to avoid issues if the library isn't installed
      this.dbus = (await import('dbus-next')) as unknown as DBusModule

      // Connect to system bus for sleep/wake events
      await this.connectSystemBus()

      // Connect to session bus for lock/unlock events
      await this.connectSessionBus()

      console.log('[SystemEventObserver] Started successfully')
    } catch (error) {
      console.error('[SystemEventObserver] Failed to start:', error)
      // Don't throw - system events are optional
    }
  }

  /**
   * Stop observing system events
   */
  stop(): void {
    this.isRunning = false

    if (this.systemBus) {
      try {
        this.systemBus.disconnect()
      } catch {
        // Ignore disconnect errors
      }
      this.systemBus = null
    }

    if (this.sessionBus) {
      try {
        this.sessionBus.disconnect()
      } catch {
        // Ignore disconnect errors
      }
      this.sessionBus = null
    }

    this.callback = null

    console.log('[SystemEventObserver] Stopped')
  }

  /**
   * Connect to system bus for sleep/wake events
   */
  private async connectSystemBus(): Promise<void> {
    if (!this.dbus) {
      console.warn('[SystemEventObserver] D-Bus module not loaded')
      return
    }

    try {
      console.log('[SystemEventObserver] Connecting to system bus...')
      this.systemBus = this.dbus.systemBus()

      const loginManager = await this.systemBus.getProxyObject(
        'org.freedesktop.login1',
        LOGIN1_PATH
      )

      const managerInterface = loginManager.getInterface(LOGIN1_MANAGER)

      // Listen for PrepareForSleep signal
      managerInterface.on('PrepareForSleep', (...args: unknown[]) => {
        const sleeping = args[0] as boolean
        console.log(
          `[SystemEventObserver] PrepareForSleep signal received: ${sleeping ? 'sleeping' : 'waking'}`
        )

        if (sleeping) {
          this.emitSystemEvent('sleep')
        } else {
          this.emitSystemEvent('wake')
        }
      })

      console.log('[SystemEventObserver] Connected to system bus successfully')
    } catch (error) {
      console.error('[SystemEventObserver] Failed to connect to system bus:', error)
    }
  }

  /**
   * Connect to session bus for lock/unlock events
   */
  private async connectSessionBus(): Promise<void> {
    if (!this.dbus) {
      console.warn('[SystemEventObserver] D-Bus module not loaded')
      return
    }

    try {
      console.log('[SystemEventObserver] Connecting to session bus...')
      this.sessionBus = this.dbus.sessionBus()

      // Try freedesktop ScreenSaver
      try {
        const screenSaver = await this.sessionBus.getProxyObject(
          'org.freedesktop.ScreenSaver',
          SCREENSAVER_PATH
        )

        const ssInterface = screenSaver.getInterface(SCREENSAVER_INTERFACE)

        // Listen for ActiveChanged signal
        ssInterface.on('ActiveChanged', (...args: unknown[]) => {
          const active = args[0] as boolean
          console.log(
            `[SystemEventObserver] ScreenSaver ActiveChanged signal received: ${active ? 'locked' : 'unlocked'}`
          )

          if (active) {
            this.emitSystemEvent('lock')
          } else {
            this.emitSystemEvent('unlock')
          }
        })

        console.log('[SystemEventObserver] Connected to freedesktop ScreenSaver successfully')
        return
      } catch {
        console.log('[SystemEventObserver] freedesktop ScreenSaver not available, trying GNOME...')
        // freedesktop ScreenSaver not available, try GNOME
      }

      // Try GNOME ScreenSaver
      try {
        const gnomeSS = await this.sessionBus.getProxyObject(
          'org.gnome.ScreenSaver',
          '/org/gnome/ScreenSaver'
        )

        const gnomeInterface = gnomeSS.getInterface('org.gnome.ScreenSaver')

        gnomeInterface.on('ActiveChanged', (...args: unknown[]) => {
          const active = args[0] as boolean
          console.log(
            `[SystemEventObserver] GNOME ScreenSaver ActiveChanged signal received: ${active ? 'locked' : 'unlocked'}`
          )

          if (active) {
            this.emitSystemEvent('lock')
          } else {
            this.emitSystemEvent('unlock')
          }
        })

        console.log('[SystemEventObserver] Connected to GNOME ScreenSaver successfully')
        return
      } catch {
        console.log('[SystemEventObserver] GNOME ScreenSaver not available')
        // GNOME ScreenSaver not available
      }

      console.warn(
        '[SystemEventObserver] No ScreenSaver interface found (lock/unlock events will not be detected)'
      )
    } catch (error) {
      console.error('[SystemEventObserver] Failed to connect to session bus:', error)
    }
  }

  /**
   * Emit a system event
   */
  private emitSystemEvent(eventType: SystemEventType): void {
    console.log(`[SystemEventObserver] Emitting system event: ${eventType}`)
    const ownerNameMap: Record<SystemEventType, string> = {
      sleep: 'System Sleep',
      wake: 'System Wake',
      lock: 'System Lock',
      unlock: 'System Unlock'
    }

    const titleMap: Record<SystemEventType, string> = {
      sleep: 'Computer going to sleep',
      wake: 'Computer woke from sleep',
      lock: 'Screen was locked',
      unlock: 'Screen was unlocked'
    }

    const captureReasonMap: Record<SystemEventType, 'system_sleep' | 'system_wake'> = {
      sleep: 'system_sleep',
      wake: 'system_wake',
      lock: 'system_sleep', // Use system_sleep for lock
      unlock: 'system_wake' // Use system_wake for unlock
    }

    const event: ActiveWindowDetails = {
      windowId: 0,
      ownerName: ownerNameMap[eventType],
      type: 'system',
      title: titleMap[eventType],
      timestamp: Date.now(),
      captureReason: captureReasonMap[eventType],
      durationMs: 0
    }

    if (this.callback) {
      this.callback(event)
    }

    this.emit('system-event', event)
  }
}

// Export a singleton instance
export const systemEventObserver = new SystemEventObserver()

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { Category } from 'shared/types'

// Define the structure of the data being sent
interface FloatingStatusUpdate {
  latestStatus: 'productive' | 'unproductive' | 'maybe' | null
  dailyProductiveMs: number
  dailyUnproductiveMs: number
  categoryDetails?: Category
  activityIdentifier?: string
  itemType?: 'app' | 'website'
  activityName?: string
  activityUrl?: string
  categoryReasoning?: string
}

export interface ActivityToRecategorize {
  identifier: string
  nameToDisplay: string
  itemType: 'app' | 'website'
  currentCategoryId: string
  currentCategoryName: string
  currentCategoryColor: string
  categoryReasoning?: string
  originalUrl?: string
}

export interface FloatingWindowApi {
  onStatusUpdate: (
    callback: (data: FloatingStatusUpdate) => void // Expect the full data object
  ) => () => void
  moveWindow: (deltaX: number, deltaY: number) => void
  hideFloatingWindow: () => void
  requestRecategorizeView: (activity: ActivityToRecategorize) => void
  openMainAppWindow: () => void
}

const floatingApi: FloatingWindowApi = {
  onStatusUpdate: (callback: (data: FloatingStatusUpdate) => void) => {
    // The listener now expects the full FloatingStatusUpdate object
    const listener = (_event: IpcRendererEvent, data: FloatingStatusUpdate) => callback(data)
    ipcRenderer.on('floating-window-status-updated', listener)
    return () => {
      ipcRenderer.removeListener('floating-window-status-updated', listener)
    }
  },
  moveWindow: (deltaX: number, deltaY: number) => {
    ipcRenderer.send('move-floating-window', { deltaX, deltaY })
  },
  hideFloatingWindow: () => {
    ipcRenderer.send('hide-floating-window')
  },
  requestRecategorizeView: (activity: ActivityToRecategorize) => {
    ipcRenderer.send('request-recategorize-view', activity)
  },
  openMainAppWindow: () => {
    ipcRenderer.send('open-main-app-window')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('floatingApi', floatingApi)
  } catch (error) {
    console.error('Error exposing floatingApi:', error)
  }
} else {
  // @ts-ignore (unsafe assignment)
  window.floatingApi = floatingApi
}

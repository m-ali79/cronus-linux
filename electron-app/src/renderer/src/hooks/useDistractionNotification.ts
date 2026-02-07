import { useEffect, useRef } from 'react'
import { ActiveWindowDetails, Category } from 'shared'
import { useAuth } from '../contexts/AuthContext'
import { trpc } from '../utils/trpc'

export interface NotificationRichData {
  confidence?: number | null
  reasoning?: string | null
  goalName?: string | null
}

export const useDistractionNotification = (
  categoryDetails: Category | null | undefined,
  activeWindow: ActiveWindowDetails | null,
  statusText: string,
  richData?: NotificationRichData
): void => {
  const { token } = useAuth()
  const { data: electronSettings } = trpc.user.getElectronAppSettings.useQuery(
    { token: token || '' },
    {
      enabled: !!token,
      staleTime: 1000 * 60 * 5 // 5 minutes
    }
  )

  const lastNotifiedRef = useRef<number | null>(null)
  const distractionStartRef = useRef<number | null>(null)

  useEffect(() => {
    if ((electronSettings as any)?.showDistractionNotifications === false) {
      distractionStartRef.current = null
      lastNotifiedRef.current = null
      return
    }

    const notificationIntervalMs =
      ((electronSettings as any)?.distractionNotificationInterval || 60) * 1000

    let isDistracting = false
    let isProductive = false
    if (categoryDetails && typeof categoryDetails === 'object' && '_id' in categoryDetails) {
      const fullCategoryDetails = categoryDetails as Category
      if (fullCategoryDetails.isProductive === false) {
        isDistracting = true
      } else if (fullCategoryDetails.isProductive === true) {
        isProductive = true
      }
    }

    // Reset if not distracting
    if (!isDistracting) {
      distractionStartRef.current = null
      lastNotifiedRef.current = null
      return
    }

    // When a distraction starts, record the time.
    if (!distractionStartRef.current) {
      distractionStartRef.current = Date.now()
    }

    const checkAndNotify = () => {
      if (!activeWindow) return

      const now = Date.now()

      // Ensure user has been on a distracting site for at least the interval duration
      if (
        !distractionStartRef.current ||
        now - distractionStartRef.current < notificationIntervalMs
      ) {
        return
      }

      // Format the notification with rich context
      const appName = activeWindow.ownerName || 'Current Application'
      const pageTitle = activeWindow.title || ''
      const url = activeWindow.url || ''
      const confidence = richData?.confidence
      const reasoning = richData?.reasoning || ''
      const goalName = richData?.goalName || ''

      // Build the site info string
      let siteInfo = appName
      if (pageTitle && pageTitle !== appName) {
        siteInfo = `${appName} - '${pageTitle}'`
      } else if (url) {
        try {
          const urlObj = new URL(url)
          siteInfo = urlObj.hostname
        } catch {
          siteInfo = url
        }
      }

      // Determine notification title and content based on confidence
      let notificationTitle: string
      let notificationBody: string

      if (isProductive) {
        // High confidence productive notification
        notificationTitle = '✅ Work Detected'
        notificationBody = formatProductiveNotification(siteInfo, confidence, goalName, reasoning)
      } else {
        // Distraction notification
        notificationTitle = '⚠️ Distraction Detected'
        notificationBody = formatDistractionNotification(siteInfo, confidence, goalName, reasoning)
      }

      // @ts-ignore
      window.api.showNotification({
        title: notificationTitle,
        body: notificationBody
      })
      lastNotifiedRef.current = now
    }

    const intervalId = setInterval(checkAndNotify, notificationIntervalMs)

    return () => {
      clearInterval(intervalId)
    }
  }, [categoryDetails, activeWindow, statusText, electronSettings, richData])
}

/**
 * Format a notification for productive activity
 */
function formatProductiveNotification(
  siteInfo: string,
  confidence: number | undefined | null,
  goalName: string,
  reasoning: string
): string {
  let body = siteInfo

  if (confidence !== undefined && confidence !== null) {
    body += `\n\nConfidence: ${confidence}%`
  }

  if (goalName) {
    body += `\nGoal: ${goalName}`
  }

  if (reasoning) {
    body += `\nReason: ${reasoning}`
  }

  return body
}

/**
 * Format a notification for distracting activity
 */
function formatDistractionNotification(
  siteInfo: string,
  confidence: number | undefined | null,
  goalName: string,
  reasoning: string
): string {
  let body = siteInfo

  if (confidence !== undefined && confidence !== null) {
    body += `\n\nConfidence: ${confidence}%`
  }

  if (goalName) {
    body += `\nGoal: ${goalName}`
  }

  if (reasoning) {
    body += `\nReason: ${reasoning}`
  }

  return body
}

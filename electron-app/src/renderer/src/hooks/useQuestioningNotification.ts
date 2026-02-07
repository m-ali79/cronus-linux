import { useEffect, useRef, useCallback } from 'react'
import { ActiveWindowDetails, Category } from 'shared'
import { useAuth } from '../contexts/AuthContext'
import { trpc } from '../utils/trpc'

interface QuestioningNotificationData {
  notificationId: string
  title: string
  body: string
  actions: Array<{ text: string; id: string }>
  timeout: number
}

interface UseQuestioningNotificationProps {
  categoryDetails: Category | null | undefined
  activeWindow: ActiveWindowDetails | null
  confidence: number | null
  categorizationAction: 'auto-classify' | 'ask-question' | 'mark-distraction' | null
  onUserResponse?: (response: 'work' | 'distraction' | 'timeout', notificationId: string) => void
}

export const useQuestioningNotification = ({
  categoryDetails,
  activeWindow,
  confidence,
  categorizationAction,
  onUserResponse
}: UseQuestioningNotificationProps): void => {
  const { token } = useAuth()
  const { data: electronSettings } = trpc.user.getElectronAppSettings.useQuery(
    { token: token || '' },
    {
      enabled: !!token,
      staleTime: 1000 * 60 * 5 // 5 minutes
    }
  )

  const pendingNotificationRef = useRef<QuestioningNotificationData | null>(null)
  const lastNotifiedRef = useRef<number | null>(null)

  // Check if we should ask a question
  const shouldAskQuestion = useCallback(() => {
    // Check if notifications are disabled
    if ((electronSettings as any)?.showDistractionNotifications === false) {
      return false
    }

    // Only ask if action is 'ask-question' and confidence is 50-80
    if (categorizationAction !== 'ask-question') {
      return false
    }

    if (confidence === null) {
      return false
    }

    // Confidence must be between 50 and 80
    if (confidence < 50 || confidence > 80) {
      return false
    }

    return true
  }, [categorizationAction, confidence, electronSettings])

  // Handle notification response
  const handleNotificationResponse = useCallback(
    (response: 'work' | 'distraction') => {
      if (pendingNotificationRef.current && onUserResponse) {
        onUserResponse(response, pendingNotificationRef.current.notificationId)
        pendingNotificationRef.current = null
      }
    },
    [onUserResponse]
  )

  // Listen for notification actions from the main process
  useEffect(() => {
    const handleAction = (_event: Electron.IpcRendererEvent, actionId: string) => {
      if (actionId === 'work') {
        handleNotificationResponse('work')
      } else if (actionId === 'distraction') {
        handleNotificationResponse('distraction')
      } else if (actionId === 'timeout') {
        if (pendingNotificationRef.current && onUserResponse) {
          onUserResponse('timeout', pendingNotificationRef.current.notificationId)
          pendingNotificationRef.current = null
        }
      }
    }

    // @ts-expect-error - onNotificationAction might not be defined in window.api types yet
    if (window.api?.onNotificationAction) {
      // @ts-expect-error
      window.api.onNotificationAction(handleAction)
    }

    return () => {
      // Cleanup if needed
    }
  }, [handleNotificationResponse, onUserResponse])

  useEffect(() => {
    // Don't show if we shouldn't ask
    if (!shouldAskQuestion()) {
      pendingNotificationRef.current = null
      lastNotifiedRef.current = null
      return
    }

    // Don't show if we already have a pending notification
    if (pendingNotificationRef.current) {
      return
    }

    // Debounce - don't ask too frequently (minimum 5 minutes between questions)
    if (lastNotifiedRef.current) {
      const now = Date.now()
      const fiveMinutes = 5 * 60 * 1000
      if (now - lastNotifiedRef.current < fiveMinutes) {
        return
      }
    }

    const appName = activeWindow?.ownerName || 'Current Application'
    const site = activeWindow?.url
      ? (() => {
          try {
            return new URL(activeWindow.url!).hostname.replace('www.', '')
          } catch {
            return appName
          }
        })()
      : appName

    // Build notification content
    const title = 'Is this work?'
    const body = `You're on ${site} - "${activeWindow?.title || 'Unknown'}". This doesn't clearly match your goal. Is this work or distraction?`

    const notificationData: QuestioningNotificationData = {
      notificationId: `question-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      body,
      actions: [
        { text: 'Work', id: 'work' },
        { text: 'Distraction', id: 'distraction' }
      ],
      timeout: 30000 // 30 seconds
    }

    // Show notification
    // @ts-expect-error - showNotification might not be defined in window.api types yet
    window.api.showNotification({
      title: notificationData.title,
      body: notificationData.body,
      actions: notificationData.actions,
      timeout: notificationData.timeout,
      notificationId: notificationData.notificationId,
      onAction: (actionId: string) => {
        if (actionId === 'work') {
          handleNotificationResponse('work')
        } else if (actionId === 'distraction') {
          handleNotificationResponse('distraction')
        } else if (actionId === 'timeout') {
          if (onUserResponse) {
            onUserResponse('timeout', notificationData.notificationId)
          }
        }
        pendingNotificationRef.current = null
      }
    })

    pendingNotificationRef.current = notificationData
    lastNotifiedRef.current = Date.now()
  }, [
    shouldAskQuestion,
    activeWindow,
    handleNotificationResponse,
    onUserResponse,
    confidence,
    categorizationAction
  ])
}

// Export the questioning notification hook alongside the existing distraction notification
export { useDistractionNotification } from './useDistractionNotification'

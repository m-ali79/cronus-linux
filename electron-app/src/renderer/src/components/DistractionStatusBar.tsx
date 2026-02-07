import { ActivityToRecategorize } from '@renderer/hooks/useActivityTracking'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  CircleQuestionMark,
  EditIcon,
  ExternalLink,
  Mail,
  MessageCircle,
  Pause,
  Play,
  Settings as SettingsIcon,
  Youtube
} from 'lucide-react'
import React, { JSX, useEffect, useMemo, useRef, useState } from 'react'
import { ActiveWindowDetails, ActiveWindowEvent, Category } from 'shared'
import { useAuth } from '../contexts/AuthContext'
import { useDistractionNotification } from '../hooks/useDistractionNotification'
import { useDistractionSound } from '../hooks/useDistractionSound'
import { useRecategorizationHandler } from '../hooks/useRecategorizationHandler'
import {
  getCardBgColor,
  getDisplayWindowInfo,
  getStatusText,
  getStatusTextColor
} from '../utils/distractionStatusBarUIHelpers'
import { calculateProductivityMetrics } from '../utils/timeMetrics'
import { trpc } from '../utils/trpc'
import { ActivityIcon } from './ActivityList/ActivityIcon'
import DistractionStatusLoadingSkeleton from './DistractionStatusLoadingSkeleton'
import PauseInfoModal from './PauseInfoModal'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

interface DistractionStatusBarProps {
  activeWindow: ActiveWindowDetails | null
  onOpenMiniTimerClick: () => void
  isMiniTimerVisible: boolean
  onOpenRecategorizeDialog: (target: ActivityToRecategorize) => void
  onSettingsClick: () => void
  isSettingsOpen: boolean
  isTrackingPaused: boolean
  onToggleTracking: () => void
}

// Props comparison can be simplified or removed if activeWindow prop changes don't directly trigger new data fetching logic
// For now, let's keep it, but its role might change.
const arePropsEqual = (
  prevProps: DistractionStatusBarProps,
  nextProps: DistractionStatusBarProps
): boolean => {
  const activeWindowEqual =
    (!prevProps.activeWindow && !nextProps.activeWindow) ||
    !!(
      prevProps.activeWindow &&
      nextProps.activeWindow &&
      prevProps.activeWindow.ownerName === nextProps.activeWindow.ownerName &&
      prevProps.activeWindow.title === nextProps.activeWindow.title &&
      prevProps.activeWindow.url === nextProps.activeWindow.url &&
      prevProps.activeWindow.content === nextProps.activeWindow.content &&
      prevProps.activeWindow.type === nextProps.activeWindow.type &&
      prevProps.activeWindow.browser === nextProps.activeWindow.browser
    )

  return (
    activeWindowEqual &&
    prevProps.isMiniTimerVisible === nextProps.isMiniTimerVisible &&
    prevProps.onOpenRecategorizeDialog === nextProps.onOpenRecategorizeDialog &&
    prevProps.onSettingsClick === nextProps.onSettingsClick &&
    prevProps.isSettingsOpen === nextProps.isSettingsOpen &&
    prevProps.isTrackingPaused === nextProps.isTrackingPaused &&
    prevProps.onToggleTracking === nextProps.onToggleTracking
  )
}

const DistractionStatusBar = ({
  activeWindow,
  onOpenMiniTimerClick,
  isMiniTimerVisible,
  onOpenRecategorizeDialog,
  onSettingsClick,
  isSettingsOpen,
  isTrackingPaused,
  onToggleTracking
}: DistractionStatusBarProps): JSX.Element | null => {
  const { token } = useAuth()
  const [isNarrowView, setIsNarrowView] = useState(false)
  const [showPauseModal, setShowPauseModal] = useState(false)
  const lastSentData = useRef<string | null>(null)

  const handlePauseClick = () => {
    const hasPausedBefore = localStorage.getItem('cronus-has-paused-before')

    if (!hasPausedBefore && !isTrackingPaused) {
      // First time pausing - show modal
      setShowPauseModal(true)
    } else {
      // Not first time - directly toggle
      onToggleTracking()
    }
  }

  const handlePauseConfirm = () => {
    // Mark as paused before
    localStorage.setItem('cronus-has-paused-before', 'true')
    setShowPauseModal(false)
    onToggleTracking()
  }

  const handlePauseCancel = () => {
    setShowPauseModal(false)
  }

  useEffect(() => {
    const handleResize = (): void => {
      setIsNarrowView(window.innerWidth < 800)
    }
    window.addEventListener('resize', handleResize)
    handleResize() // Initial check
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const { data: latestEvent, isLoading: isLoadingLatestEvent } =
    // note: make sure you invalidate the query when you create a new event, otherwise it will not be updated
    trpc.activeWindowEvents.getLatestEvent.useQuery(
      { token: token || '' },
      {
        enabled: !!token && typeof token === 'string' && token.length > 0,
        refetchInterval: 1000, // Poll every 1 second
        select: (data) => {
          if (!data) {
            return null
          }
          const event = data as unknown as ActiveWindowEvent
          return {
            ...event,
            lastCategorizationAt: event.lastCategorizationAt
              ? new Date(event.lastCategorizationAt)
              : undefined,
            categoryReasoning: event.categoryReasoning
          }
        }
      }
    )

  useEffect(() => {
    if (latestEvent) {
      // @ts-ignore - Window API is injected by Electron at runtime and not available in TypeScript types
      window.api?.logToFile(
        '[DistractionCategorizationResult] Received latest event from server:',
        latestEvent
      )
    }
  }, [latestEvent])

  const categoryId = latestEvent?.categoryId

  const {
    data: categoryDetails,
    isLoading: isLoadingCategory,
    error: categoryError
  } = trpc.category.getCategoryById.useQuery(
    { token: token || '', categoryId: categoryId || '' },
    {
      enabled:
        !!token &&
        typeof token === 'string' &&
        token.length > 0 &&
        !!categoryId &&
        categoryId !== ''
    }
  )

  const { data: userCategories, isLoading: isLoadingUserCategories } =
    trpc.category.getCategories.useQuery(
      { token: token || '' },
      { enabled: !!token && typeof token === 'string' && token.length > 0 }
    )

  const [currentDayStartDateMs, setCurrentDayStartDateMs] = React.useState<number | null>(null)
  const [currentDayEndDateMs, setCurrentDayEndDateMs] = React.useState<number | null>(null)

  React.useEffect(() => {
    const updateDates = (): void => {
      const now = new Date()
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
      setCurrentDayStartDateMs(startOfToday.getTime())
      setCurrentDayEndDateMs(endOfToday.getTime())
    }

    updateDates()
    const intervalId = setInterval(updateDates, 10000) // Check every 10 seconds

    return () => clearInterval(intervalId)
  }, [])

  const { data: todayEvents, isLoading: isLoadingTodayEvents } =
    trpc.activeWindowEvents.getEventsForDateRange.useQuery(
      {
        token: token || '',
        startDateMs: currentDayStartDateMs!,
        endDateMs: currentDayEndDateMs!
      },
      {
        enabled:
          !!token &&
          typeof token === 'string' &&
          token.length > 0 &&
          currentDayStartDateMs !== null &&
          currentDayEndDateMs !== null,
        refetchInterval: 30000,
        select: (data) => {
          if (!data) {
            return []
          }
          return data.map((event) => {
            const e = event as unknown as ActiveWindowEvent
            return {
              ...e,
              lastCategorizationAt: e.lastCategorizationAt
                ? new Date(e.lastCategorizationAt)
                : undefined
            }
          })
        }
      }
    )

  // Fetch user goals for rich notifications
  const { data: userGoals } = trpc.user.getUserProjectsAndGoals.useQuery(
    { token: token || '' },
    {
      enabled: !!token && typeof token === 'string' && token.length > 0,
      staleTime: 1000 * 60 * 5 // 5 minutes
    }
  )

  useDistractionSound(categoryDetails as Category | null | undefined)

  const displayWindowInfo = useMemo(
    () => getDisplayWindowInfo(latestEvent, activeWindow),
    [latestEvent, activeWindow]
  )

  useEffect(() => {
    const sendUpdate = async (): Promise<void> => {
      if (!latestEvent || !userCategories || !todayEvents || !window.electron?.ipcRenderer) {
        return
      }

      let latestStatus: 'productive' | 'unproductive' | 'maybe' = 'maybe'
      let categoryDetailsForFloatingWindow: Category | undefined

      if (categoryDetails && typeof categoryDetails === 'object' && '_id' in categoryDetails) {
        const fullCategoryDetails = categoryDetails as Category
        if (fullCategoryDetails.isProductive === true) latestStatus = 'productive'
        else if (fullCategoryDetails.isProductive === false) {
          latestStatus = 'unproductive'
        }
        categoryDetailsForFloatingWindow = fullCategoryDetails
      } else if (categoryDetails === null) {
        latestStatus = 'maybe'
      }

      const { dailyProductiveMs, dailyUnproductiveMs } = calculateProductivityMetrics(
        todayEvents as ActiveWindowEvent[],
        (userCategories as unknown as Category[]) || []
      )

      const itemType = displayWindowInfo.url ? 'website' : 'app'
      const activityIdentifier = displayWindowInfo.isApp
        ? displayWindowInfo.ownerName
        : displayWindowInfo.url
      const activityName = displayWindowInfo.ownerName

      const dataToSend = {
        latestStatus,
        dailyProductiveMs,
        dailyUnproductiveMs,
        categoryDetails: categoryDetailsForFloatingWindow,
        itemType,
        activityIdentifier,
        activityName,
        activityUrl: displayWindowInfo.url,
        categoryReasoning: latestEvent?.categoryReasoning,
        isTrackingPaused
      }

      const currentDataString = JSON.stringify(dataToSend)

      if (currentDataString === lastSentData.current) {
        return // Data hasn't changed, no need to send.
      }

      if (window.api?.getFloatingWindowVisibility) {
        const isVisible = await window.api.getFloatingWindowVisibility()
        if (isVisible) {
          window.electron.ipcRenderer.send('update-floating-window-status', dataToSend)
          lastSentData.current = currentDataString
        }
      }
    }

    sendUpdate()
  }, [
    latestEvent,
    categoryDetails,
    userCategories,
    todayEvents,
    token,
    displayWindowInfo,
    isTrackingPaused
  ])

  const statusText = useMemo(
    () =>
      getStatusText(
        latestEvent,
        activeWindow,
        categoryId,
        isLoadingCategory,
        isLoadingUserCategories,
        categoryDetails,
        categoryError
      ),
    [
      latestEvent,
      activeWindow,
      categoryId,
      isLoadingCategory,
      isLoadingUserCategories,
      categoryDetails,
      categoryError
    ]
  )

  useDistractionNotification(
    categoryDetails as Category | null | undefined,
    activeWindow,
    statusText,
    {
      confidence: null, // TODO: Add confidence field to ActiveWindowEvent model and populate it
      reasoning: latestEvent?.categoryReasoning || null,
      goalName: userGoals || null
    }
  )

  const cardBgColor = useMemo(
    () => getCardBgColor(categoryDetails, categoryError),
    [categoryDetails, categoryError]
  )
  const statusTextColor = useMemo(
    () => getStatusTextColor(categoryDetails, categoryError),
    [categoryDetails, categoryError]
  )

  const isLoadingPrimary =
    isLoadingLatestEvent ||
    (token && !latestEvent && !isLoadingCategory && !isLoadingUserCategories)

  const handleOpenRecategorize = useRecategorizationHandler(
    latestEvent,
    displayWindowInfo,
    categoryDetails,
    onOpenRecategorizeDialog
  )

  if (isLoadingPrimary) {
    return <DistractionStatusLoadingSkeleton cardBgColor={cardBgColor} />
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <div
        className={clsx(
          'rounded-lg',
          'p-2 px-4 py-[10px] flex-1 min-w-0 flex flex-row items-center justify-between sm:gap-x-3',
          cardBgColor,
          'relative'
        )}
      >
        {/* Paused overlay */}
        {isTrackingPaused && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg z-10 flex items-center justify-center">
            <div className="bg-blue-700 text-white px-3 py-1.5 rounded-lg opacity-75 font-semibold text-sm shadow-lg flex items-center gap-1">
              <Pause size={14} />
              PAUSED
            </div>
          </div>
        )}

        <div className="flex-grow min-w-0 flex items-center">
          <AnimatePresence>
            <motion.div
              key={displayWindowInfo.ownerName}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-grow min-w-0 flex items-center"
            >
              {/* Icon Display Logic */}
              <ActivityIcon
                url={displayWindowInfo.isApp ? undefined : displayWindowInfo.url}
                appName={displayWindowInfo.ownerName}
                size={16}
                className="mr-2"
              />
              <span className="text-sm text-foreground truncate">
                {displayWindowInfo.title || displayWindowInfo.ownerName}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
        <div>
          <div
            className={`text-sm select-none font-semibold ${statusTextColor} whitespace-nowrap flex items-center gap-1 cursor-pointer hover:opacity-80`}
            onClick={handleOpenRecategorize}
            title="Re-categorize this activity"
          >
            {statusText}
            {latestEvent && categoryId && !isLoadingCategory && (
              <EditIcon size={14} className="ml-1 flex-shrink-0" />
            )}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 text-right flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800/50">
        {isTrackingPaused && (
          <Button
            className="hover:bg-gray-200 dark:hover:bg-gray-700/50"
            variant="ghost"
            onClick={onToggleTracking}
            title="Resume Tracking"
          >
            <Play size={20} />
            {!isNarrowView && <span className="ml-2">Resume</span>}
          </Button>
        )}

        {!isMiniTimerVisible && (
          <Button
            className="hover:bg-gray-200 dark:hover:bg-gray-700/50"
            variant="ghost"
            onClick={onOpenMiniTimerClick}
            title="Open Mini Timer"
          >
            <ExternalLink size={20} />
            {!isNarrowView && <span className="ml-2">{'Open Mini Timer'}</span>}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="hover:bg-gray-200 dark:hover:bg-gray-700/50"
              variant="ghost"
              title="Open Feedback"
            >
              <CircleQuestionMark size={20} />
            </Button>
          </DropdownMenuTrigger>
          <AnimatePresence>
            <DropdownMenuContent
              className="w-56 border border-black/[0.03] dark:border-white/[0.03] shadow-[0_2px_4px_0_rgb(0,0,0,0.05)] dark:shadow-[0_2px_4px_0_rgb(255,255,255,0.02)]"
              align="end"
              sideOffset={8}
              asChild
            >
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <DropdownMenuItem
                  className="flex items-center gap-2 cursor-pointer transition-colors data-[highlighted]:bg-black/[0.02] dark:data-[highlighted]:bg-white/[0.02]"
                  onClick={() =>
                    window.open(
                      'mailto:wallawitsch@gmail.com, arne.strickmann@googlemail.com?subject=Cronus%20Feedback'
                    )
                  }
                >
                  <Mail size={20} />
                  Email Feedback
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2 cursor-pointer transition-colors data-[highlighted]:bg-black/[0.02] dark:data-[highlighted]:bg-white/[0.02]"
                  onClick={() =>
                    window.open('https://chat.whatsapp.com/Lrge0tDN19THKld1kCjdwB', '_blank')
                  }
                >
                  <MessageCircle size={20} />
                  WhatsApp Us
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2 cursor-pointer transition-colors data-[highlighted]:bg-black/[0.02] dark:data-[highlighted]:bg-white/[0.02]"
                  onClick={() =>
                    window.open(
                      'https://www.loom.com/share/34531aee1ce94343a2c4c7cee04a0dc8?sid=a601c97f-9d16-4a7d-97e3-d8fc3db96679',
                      '_blank'
                    )
                  }
                >
                  <Youtube size={20} />
                  1.5m Tutorial Video
                </DropdownMenuItem>
              </motion.div>
            </DropdownMenuContent>
          </AnimatePresence>
        </DropdownMenu>
        <Button
          variant="ghost"
          size={isNarrowView ? 'icon' : 'default'}
          className={!isNarrowView ? 'w-32 hover:bg-gray-200 dark:hover:bg-gray-700/50' : ''}
          onClick={onSettingsClick}
          title="Settings"
        >
          {isSettingsOpen ? <ArrowLeft size={20} /> : <SettingsIcon size={20} />}
          {!isNarrowView &&
            (isSettingsOpen ? (
              <span className="ml-2">Dashboard</span>
            ) : (
              <span className="ml-2">Settings</span>
            ))}
        </Button>
      </div>
      <PauseInfoModal
        isOpen={showPauseModal}
        onClose={handlePauseCancel}
        onConfirm={handlePauseConfirm}
      />
    </div>
  )
}

export default React.memo(DistractionStatusBar, arePropsEqual)

import { RefreshCw } from 'lucide-react'
import { memo, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { usePlatform } from '../hooks/usePlatform'
import { CategoryManagementSettings } from './Settings/CategoryManagementSettings'
import { DisableUsageAnalyticsSettings } from './Settings/DisableUsageAnalyticsSettings'
import { DistractionSoundSettings } from './Settings/DistractionSoundSettings'
import GoalInputForm from './Settings/GoalInputForm'
import { GoogleCalendarSettings } from './Settings/GoogleCalendarSettings'
import { LinuxDependenciesStatus } from './Settings/LinuxDependenciesStatus'
import { ManualUpdateSettings } from './Settings/ManualUpdateSettings'
import { MultiPurposeAppsSettings } from './Settings/MultiPurposeAppsSettings'
import PauseTrackingSettings from './Settings/PauseTrackingSettings'
import { PermissionsStatus } from './Settings/PermissionsStatus'
import { ThemeSwitcher } from './Settings/ThemeSwitcher'
import { AppInformation } from './Settings/VersionDisplay'
import { Button } from './ui/button'

interface SettingsPageProps {
  onResetOnboarding: () => void
  isTrackingPaused: boolean
  onToggleTracking: () => void
}

// We've extracted LogOutButtonSection to be its own component.
// This prevents it from being recreated on every render of SettingsPage.
const LogOutButtonSection = memo(
  ({
    user,
    logout,
    onResetOnboarding
  }: {
    user: { email: string | undefined } | null
    logout: () => void
    onResetOnboarding: () => void
  }) => {
    return (
      <div className="space-y-4">
        <div className="bg-muted/30 rounded-lg p-6 border border-border">
          <h2 className="text-xl font-semibold mb-4">Account & Onboarding</h2>
          <p className="text-muted-foreground mb-4">Logged in as: {user?.email || 'Unknown'}</p>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                logout()
                onResetOnboarding()
              }}
              variant="destructive"
              size="sm"
              type="button"
            >
              Logout
            </Button>
            <Button type="button" onClick={onResetOnboarding} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset Onboarding
            </Button>
          </div>
        </div>
      </div>
    )
  }
)

LogOutButtonSection.displayName = 'LogOutButtonSection'

export const SettingsPage = memo(function SettingsPage({
  onResetOnboarding,
  isTrackingPaused,
  onToggleTracking
}: SettingsPageProps) {
  const { user, logout } = useAuth()
  const { focusOn, setFocusOn } = useSettings()
  const { isLinux, isLoading } = usePlatform()
  const [showPermissions, setShowPermissions] = useState(false)

  useEffect(() => {
    if (focusOn === 'goal-input' || focusOn === 'pause-tracking') {
      // The focusing logic will be inside the respective components
      // We reset the focus request here after a short delay
      // to allow the component to render and focus.
      setTimeout(() => setFocusOn(null), 100)
    }
  }, [focusOn, setFocusOn])

  // By wrapping this in useCallback, we ensure the function reference doesn't
  // change on re-renders, preventing unnecessary re-renders of AppInformation.
  const handleShowPermissions = useCallback(() => {
    setShowPermissions((v) => !v)
  }, [])

  return (
    <div className="flex-1 flex flex-col overflow-y-auto scrollbar-thin scrollbar-track-gray-900 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500 p-2 pt-0 pb-4">
      <div className="space-y-4">
        <GoalInputForm shouldFocus={focusOn === 'goal-input'} />
        <CategoryManagementSettings />
        <PauseTrackingSettings
          isTrackingPaused={isTrackingPaused}
          onToggleTracking={onToggleTracking}
          shouldFocus={focusOn === 'pause-tracking'}
        />
        <DistractionSoundSettings />
        <MultiPurposeAppsSettings />
        <ThemeSwitcher />
        <GoogleCalendarSettings />
        <ManualUpdateSettings />
        <DisableUsageAnalyticsSettings />
        <LogOutButtonSection user={user} logout={logout} onResetOnboarding={onResetOnboarding} />
        <AppInformation onShowPermissions={handleShowPermissions} />
        {showPermissions && !isLoading && (isLinux ? <LinuxDependenciesStatus /> : <PermissionsStatus />)}
      </div>
    </div>
  )
})

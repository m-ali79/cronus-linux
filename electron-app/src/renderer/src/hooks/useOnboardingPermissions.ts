import { useState } from 'react'
import { PermissionType, PermissionStatus } from 'shared/types'

export function useOnboardingPermissions() {
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<number | null>(null)
  const [isRequestingScreenRecording, setIsRequestingScreenRecording] = useState(false)
  const [hasRequestedScreenRecording, setHasRequestedScreenRecording] = useState(false)
  const [screenRecordingStatus, setScreenRecordingStatus] = useState<number | null>(null)

  const checkPermissionStatus = async () => {
    try {
      const status = await window.api.getPermissionStatus(PermissionType.Accessibility)
      console.log('📦 Raw accessibility status from main:', status)
      console.log(`♿️ Accessibility permission is: ${PermissionStatus[status]}`)
      setPermissionStatus(status)
    } catch (error) {
      console.error('Failed to check permission status:', error)
    }
  }

  const checkScreenRecordingStatus = async () => {
    try {
      const status = await window.api.getPermissionStatus(PermissionType.ScreenRecording)
      console.log('📦 Raw screen recording status from main:', status)
      console.log(`🖥️ Screen Recording permission is: ${PermissionStatus[status]}`)
      setScreenRecordingStatus(status)
    } catch (error) {
      console.error('Failed to check screen recording status:', error)
    }
  }

  const handleRequestAccessibilityPermission = async () => {
    setIsRequestingPermission(true)
    console.log('👉 Requesting Accessibility permission from user...')
    try {
      await window.api.requestPermission(PermissionType.Accessibility)
      setHasRequestedPermission(true)
      console.log('✅ OS dialog for Accessibility permission should be visible.')

      setTimeout(() => {
        checkPermissionStatus()
        setIsRequestingPermission(false)
      }, 1000)
    } catch (error) {
      console.error('Failed to request accessibility permission:', error)
      setIsRequestingPermission(false)
      setHasRequestedPermission(true)
    }
  }

  const handleRequestScreenRecordingPermission = async () => {
    setIsRequestingScreenRecording(true)
    console.log('👉 Requesting Screen Recording permission from user...')
    try {
      await window.api.requestPermission(PermissionType.ScreenRecording)
      setHasRequestedScreenRecording(true)
      console.log('✅ OS dialog for Screen Recording permission should be visible.')

      setTimeout(() => {
        checkScreenRecordingStatus()
        setIsRequestingScreenRecording(false)
      }, 1000)
    } catch (error) {
      console.error('Failed to request screen recording permission:', error)
      setIsRequestingScreenRecording(false)
      setHasRequestedScreenRecording(true)
    }
  }

  const resetPermissionStates = (stepId: string) => {
    if (stepId === 'accessibility') {
      setHasRequestedPermission(false)
      setPermissionStatus(null)
      setIsRequestingPermission(false)
    } else if (stepId === 'screen-recording') {
      setHasRequestedScreenRecording(false)
      setScreenRecordingStatus(null)
      setIsRequestingScreenRecording(false)
    }
  }

  const startPermissionPolling = (stepId: string) => {
    if (stepId === 'accessibility') {
      console.log('👀 Polling for Accessibility permission status.')
      checkPermissionStatus()
      const interval = setInterval(checkPermissionStatus, 2000)
      return () => {
        console.log('🛑 Stopped polling for Accessibility.')
        clearInterval(interval)
      }
    } else if (stepId === 'screen-recording') {
      console.log('👀 Polling for Screen Recording permission status.')
      checkScreenRecordingStatus()
      const interval = setInterval(checkScreenRecordingStatus, 2000)
      return () => {
        console.log('🛑 Stopped polling for Screen Recording.')
        clearInterval(interval)
      }
    }
    return () => {}
  }

  return {
    isRequestingPermission,
    hasRequestedPermission,
    permissionStatus,
    isRequestingScreenRecording,
    hasRequestedScreenRecording,
    screenRecordingStatus,
    handleRequestAccessibilityPermission,
    handleRequestScreenRecordingPermission,
    resetPermissionStates,
    startPermissionPolling
  }
}

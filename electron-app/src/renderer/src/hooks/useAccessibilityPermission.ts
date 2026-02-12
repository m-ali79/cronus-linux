import { useEffect, useState } from 'react'
import { PermissionStatus, PermissionType } from 'shared/types'

interface UseAccessibilityPermissionProps {
  token: string | null
}

interface UseAccessibilityPermissionReturn {
  accessibilityPermissionChecked: boolean
  missingAccessibilityPermissions: boolean
}

export function useAccessibilityPermission({
  token
}: UseAccessibilityPermissionProps): UseAccessibilityPermissionReturn {
  const [accessibilityPermissionChecked, setAccessibilityPermissionChecked] = useState(false)
  const [missingAccessibilityPermissions, setMissingAccessibilityPermissions] = useState(false)

  useEffect(() => {
    const checkPermissions = async (): Promise<void> => {
      if (token) {
        try {
          const accessibilityStatus = await window.api.getPermissionStatus(
            PermissionType.Accessibility
          )
          setMissingAccessibilityPermissions(accessibilityStatus !== PermissionStatus.Granted)
        } catch (error) {
          console.error('Failed to check permissions:', error)
          setMissingAccessibilityPermissions(true)
        } finally {
          setAccessibilityPermissionChecked(true)
        }
      }
    }
    checkPermissions()
  }, [token])

  return {
    accessibilityPermissionChecked,
    missingAccessibilityPermissions
  }
}

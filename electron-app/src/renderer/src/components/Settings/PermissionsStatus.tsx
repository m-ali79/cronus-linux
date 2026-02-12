import { PermissionType, PermissionStatus } from 'shared/types'
import { AlertTriangle, CheckCircle, Loader2, Shield, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface PermissionInfo {
  type: PermissionType
  name: string
  description: string
  status: PermissionStatus
  required: boolean
}

export function PermissionsStatus() {
  const [permissions, setPermissions] = useState<PermissionInfo[]>([])
  const [permissionRequestsEnabled, setPermissionRequestsEnabled] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState<PermissionType[]>([])
  const [polling, setPolling] = useState<PermissionType[]>([]) // Track which permissions we're polling for

  const permissionDefinitions: Omit<PermissionInfo, 'status'>[] = [
    {
      type: PermissionType.Accessibility,
      name: 'Accessibility',
      description: 'We read window titles and content from other applications.',
      required: true
    },
    {
      type: PermissionType.AppleEvents,
      name: 'Apple Events',
      description: 'Required to track system sleep and wake events.',
      required: false
    },
    {
      type: PermissionType.ScreenRecording,
      name: 'Screen Recording',
      description:
        'We capture your screen and then OCR the content to help categorize your activity. Enhances categorization.',
      required: false
    }
  ]

  const loadPermissionStatus = async () => {
    try {
      const requestsEnabled = await window.api.getPermissionRequestStatus()
      setPermissionRequestsEnabled(requestsEnabled)

      const permissionStatuses = await Promise.all(
        permissionDefinitions.map(async (perm) => ({
          ...perm,
          status: await window.api.getPermissionStatus(perm.type)
        }))
      )

      setPermissions(permissionStatuses)
    } catch (error) {
      console.error('Error loading permission status:', error)
    } finally {
      setLoading(false)
    }
  }

  // Polling function to check permission status
  const pollPermissionStatus = (permissionType: PermissionType, maxAttempts: number = 30) => {
    let attempts = 0

    const pollInterval = setInterval(async () => {
      attempts++

      try {
        const currentStatus = await window.api.getPermissionStatus(permissionType)

        // Update the specific permission in our state
        setPermissions((prev) =>
          prev.map((perm) =>
            perm.type === permissionType ? { ...perm, status: currentStatus } : perm
          )
        )

        // If permission is granted or we've tried too many times, stop polling
        if (currentStatus === PermissionStatus.Granted || attempts >= maxAttempts) {
          setPolling((prev) => prev.filter((type) => type !== permissionType))
          clearInterval(pollInterval)

          if (currentStatus === PermissionStatus.Granted) {
            console.log(`✅ Permission ${permissionType} was granted!`)
          } else {
            console.log(
              `⏰ Stopped polling for permission ${permissionType} after ${attempts} attempts`
            )
          }
        }
      } catch (error) {
        console.error('Error polling permission status:', error)
        setPolling((prev) => prev.filter((type) => type !== permissionType))
        clearInterval(pollInterval)
      }
    }, 2000) // Check every 2 seconds

    // Cleanup after max time (60 seconds)
    setTimeout(() => {
      setPolling((prev) => prev.filter((type) => type !== permissionType))
      clearInterval(pollInterval)
    }, 60000)
  }

  useEffect(() => {
    loadPermissionStatus()
  }, [])

  const handleRequestPermission = async (permissionType: PermissionType) => {
    try {
      setRequesting((prev) => [...prev, permissionType])
      await window.api.requestPermission(permissionType)

      // Start polling for this permission
      setPolling((prev) => [...prev, permissionType])
      pollPermissionStatus(permissionType)

      // Remove from requesting state after a short delay
      setTimeout(() => {
        setRequesting((prev) => prev.filter((type) => type !== permissionType))
      }, 2000)
    } catch (error) {
      console.error('Error requesting permission:', error)
      setRequesting((prev) => prev.filter((type) => type !== permissionType))
    }
  }

  const handleForceEnablePermissionRequests = async () => {
    try {
      await window.api.forceEnablePermissionRequests()
      setPermissionRequestsEnabled(true)
      loadPermissionStatus()
    } catch (error) {
      console.error('Error enabling permission requests:', error)
    }
  }

  const getStatusBadge = (status: PermissionStatus) => {
    switch (status) {
      case PermissionStatus.Granted:
        return (
          <Badge
            variant="secondary"
            className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-800 hover:bg-green-200 dark:hover:bg-green-800"
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Granted
          </Badge>
        )
      case PermissionStatus.Pending:
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Pending
          </Badge>
        )
      case PermissionStatus.Denied:
      default:
        return (
          <Badge
            variant="secondary"
            className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200 dark:border-red-800 hover:bg-red-200 dark:hover:bg-red-800"
          >
            <XCircle className="w-3 h-3 mr-1" />
            Denied
          </Badge>
        )
    }
  }

  const getStatusIcon = (status: PermissionStatus) => {
    switch (status) {
      case PermissionStatus.Granted:
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case PermissionStatus.Pending:
        return <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />
      case PermissionStatus.Denied:
      default:
        return <XCircle className="w-5 h-5 text-red-600" />
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading permissions...
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasPermissionIssues = permissions.some(
    (p) => p.required && p.status !== PermissionStatus.Granted
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Shield className="w-5 h-5 mr-2" />
          Permissions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasPermissionIssues && (
          <div className="flex items-start space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Some required permissions are missing. This may prevent the app from tracking your
              activity properly. Optional permissions can enhance functionality but aren't required.
            </p>
          </div>
        )}

        {!permissionRequestsEnabled && (
          <div className="flex items-start space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div className="flex-1 flex items-center justify-between">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Permission requests are currently disabled. This may be due to incomplete
                onboarding.
              </p>
              <Button size="sm" variant="outline" onClick={handleForceEnablePermissionRequests}>
                Enable Requests
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {permissions.map((permission) => (
            <div
              key={permission.type}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center space-x-3">
                {getStatusIcon(permission.status)}
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium">{permission.name}</h4>
                    {getStatusBadge(permission.status)}
                    {permission.required ? (
                      <Badge variant="destructive" className="text-xs">
                        Required
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Optional
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{permission.description}</p>
                  {polling.includes(permission.type) && (
                    <p className="text-xs text-blue-600 mt-1 flex items-center">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Waiting for permission to be granted in System Preferences...
                    </p>
                  )}
                </div>
              </div>

              {permission.status !== PermissionStatus.Granted && permissionRequestsEnabled && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRequestPermission(permission.type)}
                  disabled={
                    requesting.includes(permission.type) || polling.includes(permission.type)
                  }
                >
                  {requesting.includes(permission.type) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Requesting...
                    </>
                  ) : polling.includes(permission.type) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Waiting...
                    </>
                  ) : (
                    'Request'
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Permission Requests</p>
              <p className="text-xs text-muted-foreground">
                {permissionRequestsEnabled
                  ? 'Permission dialogs will be shown when needed'
                  : 'Permission dialogs are currently disabled'}
              </p>
            </div>
            <Badge variant={permissionRequestsEnabled ? 'secondary' : 'outline'}>
              {permissionRequestsEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

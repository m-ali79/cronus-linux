import { AlertTriangle, CheckCircle, Copy, Loader2, Package, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '../../hooks/use-toast'
import type { LinuxDependency } from 'shared/types'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

export function LinuxDependenciesStatus() {
  const { toast } = useToast()
  const [dependencies, setDependencies] = useState<LinuxDependency[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadDependencies = async () => {
    try {
      const deps = await window.api.getLinuxDependencies()
      if (deps) {
        setDependencies(deps)
      }
    } catch (error) {
      console.error('Error loading Linux dependencies:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadDependencies()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadDependencies()
  }

  const handleCopyCommand = async (command: string) => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API not available')
      }
      await navigator.clipboard.writeText(command)
      toast({
        title: 'Copied',
        description: 'Command copied to clipboard.',
        duration: 2000
      })
    } catch (error) {
      console.error('Error copying command to clipboard:', error)
      toast({
        title: 'Copy failed',
        description: 'Could not copy command to clipboard.',
        variant: 'destructive',
        duration: 2000
      })
    }
  }

  const getStatusIcon = (installed: boolean) => {
    if (installed) {
      return <CheckCircle className="w-5 h-5 text-green-600" />
    }
    return <XCircle className="w-5 h-5 text-red-600" />
  }

  const getStatusBadge = (installed: boolean) => {
    if (installed) {
      return (
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-800 hover:bg-green-200 dark:hover:bg-green-800"
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Installed
        </Badge>
      )
    }
    return (
      <Badge
        variant="secondary"
        className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200 dark:border-red-800 hover:bg-red-200 dark:hover:bg-red-800"
      >
        <XCircle className="w-3 h-3 mr-1" />
        Not Installed
      </Badge>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">Dependencies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Checking dependencies...
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasDependencyIssues = dependencies.some((d) => d.required && !d.installed)
  const missingOptional = dependencies.filter((d) => !d.required && !d.installed)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Package className="w-5 h-5 mr-2" />
            Linux Dependencies
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasDependencyIssues && (
          <div className="flex items-start space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                Required dependencies are missing
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                Cronus requires Hyprland to be running for window tracking. Please ensure you are
                running Hyprland as your window manager.
              </p>
            </div>
          </div>
        )}

        {!hasDependencyIssues && missingOptional.length > 0 && (
          <div className="flex items-start space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Some optional dependencies are missing. Install them to enable additional features
              like screenshots and OCR.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {dependencies.map((dep) => (
            <div key={dep.type} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                {getStatusIcon(dep.installed)}
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium">{dep.name}</h4>
                    {getStatusBadge(dep.installed)}
                    {dep.required ? (
                      <Badge variant="destructive" className="text-xs">
                        Required
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Optional
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{dep.purpose}</p>
                  {dep.version && (
                    <p className="text-xs text-muted-foreground mt-1">Version: {dep.version}</p>
                  )}
                </div>
              </div>

              {!dep.installed && dep.installCommand && (
                <div className="flex items-center space-x-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                    {dep.installCommand}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyCommand(dep.installCommand)}
                    title="Copy to clipboard"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 border-t">
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
            <h4 className="font-medium mb-2">Installing Dependencies</h4>
            <p className="text-sm text-muted-foreground">
              On Arch Linux, you can install all optional dependencies with:
            </p>
            <div className="flex items-center space-x-2 mt-2">
              <code className="text-sm bg-muted px-3 py-2 rounded font-mono flex-1">
                sudo pacman -S grim tesseract tesseract-data-eng
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  handleCopyCommand('sudo pacman -S grim tesseract tesseract-data-eng')
                }
              >
                Copy
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

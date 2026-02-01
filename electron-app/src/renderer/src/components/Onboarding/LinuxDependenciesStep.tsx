import { CheckCircle, Package, Terminal, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LinuxDependency } from 'shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface LinuxDependenciesStepProps {
  onAllRequiredInstalled: () => void
}

export function LinuxDependenciesStep({ onAllRequiredInstalled }: LinuxDependenciesStepProps) {
  const [dependencies, setDependencies] = useState<LinuxDependency[]>([])
  const [loading, setLoading] = useState(true)

  const hasFiredAllRequiredInstalledRef = useRef(false)

  const loadDependencies = useCallback(async () => {
    try {
      const deps = await window.api.getLinuxDependencies()
      if (deps) {
        setDependencies(deps)
        // Check if all required dependencies are installed
        const requiredDeps = deps.filter((d) => d.required)
        const allRequiredInstalled =
          requiredDeps.length > 0 && requiredDeps.every((d) => d.installed)
        if (allRequiredInstalled && !hasFiredAllRequiredInstalledRef.current) {
          hasFiredAllRequiredInstalledRef.current = true
          onAllRequiredInstalled()
        }
      }
    } catch (error) {
      console.error('Error loading Linux dependencies:', error)
    } finally {
      setLoading(false)
    }
  }, [onAllRequiredInstalled])

  useEffect(() => {
    loadDependencies()
    // Poll for dependency changes every 3 seconds
    const interval = setInterval(loadDependencies, 3000)
    return () => clearInterval(interval)
  }, [loadDependencies])

  const requiredDeps = dependencies.filter((d) => d.required)
  const optionalDeps = dependencies.filter((d) => !d.required)
  const allRequiredInstalled =
    requiredDeps.length > 0 && requiredDeps.every((d) => d.installed)

  if (loading) {
    return (
      <div className="text-center space-y-4 flex flex-col items-center">
        <div className="bg-blue-100 dark:bg-blue-900 p-4 rounded-full">
          <Package className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-pulse" />
        </div>
        <p className="text-muted-foreground">Checking system dependencies...</p>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4 flex flex-col items-center max-w-lg">
      <div className="bg-blue-100 dark:bg-blue-900 p-4 rounded-full">
        <Terminal className="w-12 h-12 text-blue-600 dark:text-blue-400" />
      </div>

      <Card className="w-full text-left">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Required Dependencies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {requiredDeps.map((dep) => (
            <Card key={dep.type} className="shadow-none">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {dep.installed ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <div className="text-left">
                    <p className="font-medium">{dep.name}</p>
                    <p className="text-xs text-muted-foreground">{dep.purpose}</p>
                  </div>
                </div>
                {dep.installed && dep.version && (
                  <span className="text-xs text-muted-foreground">{dep.version}</span>
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {!allRequiredInstalled && (
        <Card className="w-full border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <CardContent className="pt-6 text-sm text-left text-red-800 dark:text-red-200">
            <p className="font-semibold mb-2">Hyprland Required</p>
            <p>
              Cronus requires Hyprland as your window manager for activity tracking. Please make
              sure you are running this app under a Hyprland session.
            </p>
          </CardContent>
        </Card>
      )}

      {allRequiredInstalled && (
        <>
          <Card className="w-full border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
            <CardContent className="pt-6 text-sm text-green-800 dark:text-green-200 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 mr-2" />
              <span className="font-medium">Required dependencies detected! You can continue.</span>
            </CardContent>
          </Card>

          <Card className="w-full text-left">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Optional Dependencies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="text-sm text-muted-foreground mb-3">
                These enhance functionality but are not required:
              </p>
              {optionalDeps.map((dep) => (
                <Card key={dep.type} className="shadow-none">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {dep.installed ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-yellow-600" />
                      )}
                      <div className="text-left">
                        <p className="font-medium">{dep.name}</p>
                        <p className="text-xs text-muted-foreground">{dep.purpose}</p>
                      </div>
                    </div>
                    {!dep.installed && (
                      <code className="text-xs bg-muted px-2 py-1 rounded">{dep.installCommand}</code>
                    )}
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

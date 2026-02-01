import { useEffect, useState } from 'react'

export function usePlatform() {
  const [platform, setPlatform] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const detectedPlatform = await window.api.getPlatform()
        if (!cancelled) setPlatform(detectedPlatform)
      } catch (error) {
        console.error('Failed to get platform, defaulting to darwin', error)
        if (!cancelled) setPlatform('darwin')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return {
    platform,
    isLinux: platform === 'linux',
    isMac: platform === 'darwin',
    isWindows: platform === 'win32',
    isLoading: platform === null
  }
}

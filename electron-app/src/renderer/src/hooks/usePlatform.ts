import { useEffect, useState } from 'react'

export function usePlatform() {
  const [platform, setPlatform] = useState<string>('darwin')

  useEffect(() => {
    window.api
      .getPlatform()
      .then(setPlatform)
      .catch(() => setPlatform('darwin'))
  }, [])

  return {
    platform,
    isLinux: platform === 'linux',
    isMac: platform === 'darwin'
  }
}

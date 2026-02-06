import './assets/custom-title-bar.css'
import './styles/index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PostHogProvider } from 'posthog-js/react'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppWrapper'
import { CheckCategorizationIpcListener } from './CheckCategorizationIpcListener'
import { AuthProvider } from './contexts/AuthContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { createTrpcClient, trpc } from './utils/trpc'

// Initialize Sentry
// if (!import.meta.env.DEV) {
//   Sentry.init({
//     dsn: 'https://771e73ad5ad9618684204fb0513a3298@o4509521859051520.ingest.us.sentry.io/4509521865015296'
//   })
// }

const Main = () => {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClientInstance] = useState(() => createTrpcClient())
  const [posthogKey, setPosthogKey] = useState<string | null>(null)
  const [posthogHost, setPosthogHost] = useState<string | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)

  useEffect(() => {
    window.api.getEnvVariables().then((envVars) => {
      setPosthogKey(envVars.POSTHOG_KEY)
      setPosthogHost(envVars.POSTHOG_HOST)
      setIsLoadingConfig(false)
    })
  }, [])

  if (isLoadingConfig) return null

  const options = {
    api_host: posthogHost || ''
  }

  return (
    <React.StrictMode>
      <PostHogProvider apiKey={posthogKey || ''} options={options}>
        <trpc.Provider client={trpcClientInstance} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <CheckCategorizationIpcListener />
            <AuthProvider>
              <ThemeProvider>
                <SettingsProvider>
                  <App />
                </SettingsProvider>
              </ThemeProvider>
            </AuthProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </PostHogProvider>
    </React.StrictMode>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Main />)

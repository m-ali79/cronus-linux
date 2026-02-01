import { usePostHog } from 'posthog-js/react'
import { createContext, JSX, ReactNode, useContext, useEffect, useState } from 'react'
import type { User } from 'shared/types'
import { useToast } from '../hooks/use-toast'
import { exchangeGoogleCodeForTokens } from '../lib/auth'
import { trpc } from '../utils/trpc'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  justLoggedIn: boolean
  login: (accessToken: string, refreshToken?: string, userData?: User) => void
  logout: () => void
  loginWithGoogleCode: (code: string, isDesktopFlow: boolean) => Promise<void>
  handleCalendarAuthCode: (code: string) => Promise<void>
  connectCalendarForCurrentUser: (code: string) => Promise<void>
  resetJustLoggedIn: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('accessToken'))
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [justLoggedIn, setJustLoggedIn] = useState(false)
  const posthog = usePostHog()

  const { toast } = useToast()

  const trpcUtils = trpc.useContext()

  const {
    data: _fetchedUser,
    error: _userError,
    isLoading: userIsLoading,
    refetch: refetchUser
  } = trpc.auth.getUser.useQuery(
    { token: token! },
    {
      enabled: !!token && !user,
      retry: 1,
      onSuccess: (data) => {
        if (token) {
          login(token, undefined, data as User)
        }
      },
      onError: (err) => {
        console.error('[AuthContext] Failed to fetch user with token during query:', err)
        // Check if the error message indicates a server error (5xx) or common transient errors
        const isServerError = /5\d{2}/.test(err.message)
        const isNetworkError =
          err.message?.toLowerCase().includes('network') ||
          err.message?.toLowerCase().includes('fetch') ||
          err.message?.toLowerCase().includes('connection')
        const isTimeoutError = err.message?.toLowerCase().includes('timeout')
        const isTransientError = isServerError || isNetworkError || isTimeoutError

        if (!isTransientError) {
          console.log('[AuthContext] Calling logout due to non-transient error in getUser query.')
          // log the actual error
          console.log('[AuthContext] Error:', err)
          console.trace('Logout trace')
          logout()
        } else {
          console.warn(
            '[AuthContext] Transient error detected in getUser query, preserving session.',
            {
              isServerError,
              isNetworkError,
              isTimeoutError,
              errorMessage: err.message
            }
          )
        }
      }
    }
  )

  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken')
    if (!storedToken) {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent): void => {
      if (event.key === 'accessToken') {
        const newToken = event.newValue
        setToken(newToken)
        if (newToken) {
          refetchUser()
        } else {
          setUser(null)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [refetchUser])

  const login = (accessToken: string, newRefreshToken?: string, userData?: User): void => {
    console.log('[AuthContext] login called.', {
      hasUserData: !!userData,
      userEmail: userData?.email
    })
    localStorage.setItem('accessToken', accessToken)
    setToken(accessToken)
    if (newRefreshToken) {
      localStorage.setItem('refreshToken', newRefreshToken)
    }
    if (userData) {
      setUser(userData)
      posthog?.identify(userData.email, {
        email: userData.email,
        name: userData.name,
        user_id: userData.id
      })

      // // Set user context in Sentry (renderer process)
      // Sentry.setUser({
      //   id: userData.id,
      //   email: userData.email,
      //   username: userData.name
      // })

      // // Set user context in Sentry (main process)
      // window.api.setSentryUser({
      //   id: userData.id,
      //   email: userData.email,
      //   username: userData.name
      // })
    }
    setJustLoggedIn(true)
    setIsLoading(false)
  }

  const logout = (): void => {
    console.error('🚨 [ONBOARDING DEBUG] LOGOUT CALLED! This may clear hasCompletedOnboarding')
    console.error('[AuthContext] logout called. See trace below for culprit.')
    console.trace('Logout trace')
    const currentToken = localStorage.getItem('accessToken')
    console.log('🔍 [ONBOARDING DEBUG] localStorage before logout:', {
      hasCompletedOnboarding: localStorage.getItem('hasCompletedOnboarding'),
      allKeys: Object.keys(localStorage)
    })
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    setToken(null)
    setUser(null)
    setIsLoading(false)

    posthog?.reset()

    // // Clear user context from Sentry (renderer process)
    // Sentry.setUser(null)

    // // Clear user context from Sentry (main process)
    // window.api.setSentryUser(null)

    if (currentToken) {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'accessToken',
          oldValue: currentToken,
          newValue: null,
          storageArea: localStorage
        })
      )
    }
    trpcUtils.invalidate()
  }

  const handleCalendarAuthCode = async (code: string): Promise<void> => {
    try {
      const { accessToken, refreshToken, user } = await exchangeGoogleCodeForTokens(code, true)
      login(accessToken, refreshToken, user)

      toast({
        title: 'Calendar Connected!',
        description: 'Your Google Calendar has been successfully connected.'
      })
    } catch (error) {
      console.error('Calendar auth failed:', error)
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect Google Calendar. Please try again.',
        variant: 'destructive'
      })
    }
  }

  const loginWithGoogleCode = async (code: string, isDesktopFlow: boolean): Promise<void> => {
    const { accessToken, refreshToken, user } = await exchangeGoogleCodeForTokens(
      code,
      isDesktopFlow
    )
    login(accessToken, refreshToken, user)
  }

  const connectCalendarForCurrentUser = async (code: string): Promise<void> => {
    try {
      const { user: returnedUser } = await exchangeGoogleCodeForTokens(code, true)
      console.log('[AuthContext] connectCalendarForCurrentUser', {
        returnedUser,
        user
      })
      if (returnedUser.id === user?.id) {
        console.log('[AuthContext] connectCalendarForCurrentUser: user id matches')
        // REMOVED: Incorrect onboarding completion logic that was causing the bug
        // Calendar connection should not mark onboarding as complete
        console.log(
          '🔍 [ONBOARDING DEBUG] connectCalendarForCurrentUser: calendar connected successfully, NOT setting hasCompletedOnboarding'
        )
        toast({
          duration: 1500,
          title: 'Calendar Connected!',
          description: 'Your Google Calendar has been successfully connected.'
        })
      } else {
        toast({
          duration: 1500,
          title: 'Account Mismatch',
          description: 'The Google account you used does not match your current login.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Calendar auth failed:', error)
      toast({
        duration: 1500,
        title: 'Connection Failed',
        description: 'Failed to connect Google Calendar. Please try again.',
        variant: 'destructive'
      })
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        justLoggedIn,
        login,
        logout,
        loginWithGoogleCode,
        handleCalendarAuthCode,
        connectCalendarForCurrentUser,
        resetJustLoggedIn: () => setJustLoggedIn(false)
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

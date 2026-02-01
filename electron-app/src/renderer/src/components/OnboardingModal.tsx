import { Loader2 } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useOnboardingCompletion } from '../hooks/useOnboardingCompletion'
import { useOnboardingPermissions } from '../hooks/useOnboardingPermissions'
import { useOnboardingQueries } from '../hooks/useOnboardingQueries'
import { useOnboardingSteps } from '../hooks/useOnboardingSteps'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog'
import { Button } from './ui/button'

interface OnboardingModalProps {
  onComplete: () => void
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [showSkipConfirmDialog, setShowSkipConfirmDialog] = useState(false)
  const { user } = useAuth()
  const posthog = usePostHog()

  const {
    isDev,
    userGoals,
    isAiCategoriesLoading,
    setIsAiCategoriesLoading,
    referralSource,
    setReferralSource,
    hasCategories,
    hasExistingGoals,
    hasExistingReferral,
    isLoading,
    handleGoalsComplete,
    handleCategoriesComplete
  } = useOnboardingQueries()

  const {
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
  } = useOnboardingPermissions()

  const handleGoalsCompleteAndNext = (goals: string) => {
    handleGoalsComplete(goals)
    handleStepNext()
  }

  const handleCategoriesCompleteAndNext = async (categories: any[]) => {
    await handleCategoriesComplete(categories)
    handleStepNext()
  }

  const {
    currentStep,
    steps,
    currentStepData,
    isLastStep,
    isGoalStep,
    isAiCategoriesStep,
    isAccessibilityStep,
    isScreenRecordingStep,
    isWelcomeStep,
    isPosthogOptInStep,
    isLinuxDependenciesStep,
    linuxDepsInstalled,
    handleNext: handleStepNext,
    handleBack,
    handleSkipToEnd
  } = useOnboardingSteps({
    user,
    hasExistingGoals: hasExistingGoals || false,
    hasCategories: hasCategories || false,
    hasExistingReferral,
    userGoals,
    permissionStatus,
    hasRequestedPermission,
    screenRecordingStatus,
    hasRequestedScreenRecording,
    referralSource,
    setReferralSource,
    onGoalsComplete: handleGoalsCompleteAndNext,
    onCategoriesComplete: handleCategoriesCompleteAndNext,
    onNext: () => {}, // Will be updated after completion hook
    onAiCategoriesLoadingChange: setIsAiCategoriesLoading
  })

  const { isCompleting, setHasOptedInToPosthog, handleComplete } = useOnboardingCompletion({
    token: (user as any)?.token || null,
    steps
  })

  // Check permission status when on accessibility step
  useEffect(() => {
    const activeStepDefinition = steps[currentStep]
    if (!activeStepDefinition) return
    return startPermissionPolling(activeStepDefinition.id)
  }, [currentStep, steps, startPermissionPolling])

  useEffect(() => {
    if (currentStepData?.id) {
      posthog?.capture('viewed_onboarding_step', { step: currentStepData.id })
    }
  }, [currentStepData?.id])

  const handleBackWithReset = () => {
    const currentStepId = steps[currentStep]?.id
    resetPermissionStates(currentStepId)
    handleBack()
  }

  const handleNext = () => {
    if (isLastStep) {
      posthog?.capture('completed_onboarding')
      handleComplete(referralSource, onComplete)
    } else {
      handleStepNext()
    }
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <>
      <AlertDialog open={showSkipConfirmDialog} onOpenChange={setShowSkipConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to skip?</AlertDialogTitle>
            <AlertDialogDescription>
              This significantly improves the accuracy of AI categorization. Without it, we
              can&apos;t distinguish activities within the same desktop app (e.g., work vs. social).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNext}>
              Proceed with reduced accuracy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        className="fixed inset-0 bg-background z-50"
        onClick={isGoalStep ? undefined : () => handleComplete(referralSource, onComplete)}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="w-full max-w-2xl max-h-[90vh] overflow-auto flex flex-col">
          <div className="text-center pb-4">
            <h2 className="text-2xl font-bold text-card-foreground">{currentStepData?.title}</h2>
          </div>

          <div className="space-y-6">
            <div className="w-full bg-muted/60 rounded-full h-2 ">
              <div
                className="bg-gradient-to-r from-[#213BF7] to-[#8593FB] h-2 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
            {isDev && (
              <div className="text-center">
                <Button onClick={handleSkipToEnd} variant="link" size="sm">
                  (Dev) Skip to end
                </Button>
              </div>
            )}
            <div className="min-h-[320px] flex items-center justify-center pt-4">
              {currentStepData?.content}
            </div>

            {!isGoalStep && !isAiCategoriesStep && !isAiCategoriesLoading && (
              <div className="flex justify-center gap-4 items-center">
                {/* Back button - only show if not on first slide */}
                {currentStep > 0 ? (
                  <Button
                    onClick={handleBackWithReset}
                    variant="outline"
                    size="default"
                    className="min-w-[100px]"
                    disabled={isCompleting || isRequestingPermission}
                  >
                    Back
                  </Button>
                ) : (
                  <div></div> // Empty div to maintain spacing
                )}

                {/* Main action button */}
                {isPosthogOptInStep ? (
                  <>
                    <Button
                      onClick={() => {
                        setHasOptedInToPosthog(false)
                        handleNext()
                      }}
                      variant="outline"
                    >
                      Decline
                    </Button>
                    <Button
                      onClick={() => {
                        setHasOptedInToPosthog(true)
                        handleNext()
                      }}
                      variant="default"
                    >
                      Accept
                    </Button>
                  </>
                ) : isAccessibilityStep && !hasRequestedPermission ? (
                  <Button
                    onClick={() => {
                      posthog?.capture('clicked_grant_accessibility_permission')
                      handleRequestAccessibilityPermission()
                    }}
                    disabled={isRequestingPermission}
                    variant="default"
                    size="default"
                    className="min-w-[140px]"
                  >
                    {isRequestingPermission ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Requesting...
                      </div>
                    ) : (
                      'Grant Permission'
                    )}
                  </Button>
                ) : isScreenRecordingStep && !hasRequestedScreenRecording ? (
                  <>
                    <Button
                      onClick={() => {
                        posthog?.capture('clicked_skip_screen_recording_permission')
                        setShowSkipConfirmDialog(true)
                      }}
                      variant="outline"
                      size="default"
                      className="min-w-[100px]"
                    >
                      Skip
                    </Button>
                    <Button
                      onClick={() => {
                        posthog?.capture('clicked_grant_screen_recording_permission')
                        handleRequestScreenRecordingPermission()
                      }}
                      disabled={isRequestingScreenRecording}
                      variant="default"
                      size="default"
                      className="min-w-[140px]"
                    >
                      {isRequestingScreenRecording ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Requesting...
                        </div>
                      ) : (
                        'Grant Permission'
                      )}
                    </Button>
                  </>
                ) : isLinuxDependenciesStep ? (
                  <Button
                    onClick={handleNext}
                    disabled={!linuxDepsInstalled}
                    variant="default"
                    size="default"
                    className="min-w-[140px]"
                  >
                    {linuxDepsInstalled ? 'Continue' : 'Checking Dependencies...'}
                  </Button>
                ) : (
                  <Button
                    onClick={handleNext}
                    disabled={isCompleting}
                    variant="default"
                    size="default"
                    className="min-w-[140px]"
                  >
                    {isCompleting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Setting up...
                      </div>
                    ) : isLastStep ? (
                      'Get Started!'
                    ) : isWelcomeStep ? (
                      'Accept'
                    ) : (
                      'Next'
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

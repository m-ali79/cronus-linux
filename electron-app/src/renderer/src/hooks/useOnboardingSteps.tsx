import { useCallback, useMemo, useState } from 'react'
import type { User } from 'shared/types'
import { AccessibilityStep } from '../components/Onboarding/AccessibilityStep'
import { CompleteStep } from '../components/Onboarding/CompleteStep'
import { LinuxDependenciesStep } from '../components/Onboarding/LinuxDependenciesStep'
import { PostHogOptInEuStep } from '../components/Onboarding/PostHogOptInEuStep'
import { ScreenRecordingStep } from '../components/Onboarding/ScreenRecordingStep'
import { WelcomeStep } from '../components/Onboarding/WelcomeStep'
import { AiCategoryCustomization } from '../components/Settings/AiCategoryCustomization'
import GoalInputForm from '../components/Settings/GoalInputForm'
import { usePlatform } from './usePlatform'

interface UseOnboardingStepsProps {
  user: User | null
  hasExistingGoals: boolean
  hasCategories: boolean
  hasExistingReferral: boolean
  userGoals: string
  permissionStatus: number | null
  hasRequestedPermission: boolean
  screenRecordingStatus: number | null
  hasRequestedScreenRecording: boolean
  referralSource: string
  setReferralSource: (source: string) => void
  onGoalsComplete: (goals: string) => void
  onCategoriesComplete: (categories: any[]) => void
  onNext: () => void
  onAiCategoriesLoadingChange: (loading: boolean) => void
  onLinuxDepsInstalled?: () => void
}

export function useOnboardingSteps({
  user,
  hasExistingGoals,
  hasCategories,
  hasExistingReferral,
  userGoals,
  permissionStatus,
  hasRequestedPermission,
  screenRecordingStatus,
  hasRequestedScreenRecording,
  referralSource,
  setReferralSource,
  onGoalsComplete,
  onCategoriesComplete,
  onNext,
  onAiCategoriesLoadingChange,
  onLinuxDepsInstalled
}: UseOnboardingStepsProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const { isLinux, isLoading } = usePlatform()
  const [linuxDepsInstalled, setLinuxDepsInstalled] = useState(false)

  const handleLinuxDepsInstalled = useCallback(() => {
    setLinuxDepsInstalled(true)
    if (onLinuxDepsInstalled) {
      onLinuxDepsInstalled()
    }
  }, [onLinuxDepsInstalled])

  const baseSteps = useMemo(
    () => [
      {
        id: 'welcome',
        title: 'We care about your privacy',
        content: <WelcomeStep />
      },
      {
        id: 'posthog-opt-in-eu',
        title: 'PostHog Usage Analytics',
        content: <PostHogOptInEuStep />
      },
      {
        id: 'goals',
        title: '',
        content: <GoalInputForm onboardingMode={true} onComplete={onGoalsComplete} />
      },
      {
        id: 'ai-categories',
        title: 'Customize Your Categories',
        content: (
          <AiCategoryCustomization
            onComplete={onCategoriesComplete}
            goals={userGoals}
            onLoadingChange={onAiCategoriesLoadingChange}
          />
        )
      },
      {
        id: 'linux-dependencies',
        title: 'Check System Dependencies',
        content: <LinuxDependenciesStep onAllRequiredInstalled={handleLinuxDepsInstalled} />
      },
      {
        id: 'accessibility',
        title: 'Enable Accessibility Permission',
        content: (
          <AccessibilityStep
            permissionStatus={permissionStatus}
            hasRequestedPermission={hasRequestedPermission}
          />
        )
      },
      {
        id: 'screen-recording',
        title: 'Enable Window OCR Permission',
        content: (
          <ScreenRecordingStep
            screenRecordingStatus={screenRecordingStatus}
            hasRequestedScreenRecording={hasRequestedScreenRecording}
          />
        )
      },
      {
        id: 'complete',
        title: "You're All Set!",
        content: (
          <CompleteStep
            hasExistingReferral={hasExistingReferral}
            referralSource={referralSource}
            setReferralSource={setReferralSource}
            handleNext={onNext}
          />
        )
      }
    ],
    [
      userGoals,
      permissionStatus,
      hasRequestedPermission,
      screenRecordingStatus,
      hasRequestedScreenRecording,
      hasExistingReferral,
      referralSource,
      setReferralSource,
      onGoalsComplete,
      onCategoriesComplete,
      onNext,
      onAiCategoriesLoadingChange,
      handleLinuxDepsInstalled
    ]
  )

  const steps = useMemo(() => {
    return baseSteps.filter((step) => {
      if (step.id === 'posthog-opt-in-eu') {
        return user?.isInEU
      }

      if (step.id === 'goals' && hasExistingGoals) {
        return false
      }

      if (step.id === 'ai-categories' && hasCategories) {
        return false
      }

      // Avoid showing platform-specific UI until we know the platform
      if (isLoading) {
        return step.id !== 'linux-dependencies' && step.id !== 'accessibility' && step.id !== 'screen-recording'
      }

      // Linux-specific: show linux-dependencies step only on Linux
      if (step.id === 'linux-dependencies') {
        return isLinux
      }

      // macOS-specific: hide accessibility and screen-recording on Linux
      if (step.id === 'accessibility' || step.id === 'screen-recording') {
        return !isLinux
      }

      return true
    })
  }, [baseSteps, user?.isInEU, hasExistingGoals, hasCategories, isLinux, isLoading])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkipToEnd = () => {
    const completeStepIndex = steps.findIndex((step) => step.id === 'complete')
    if (completeStepIndex !== -1) {
      setCurrentStep(completeStepIndex)
    }
  }

  const currentStepData = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const isGoalStep = currentStepData?.id === 'goals'
  const isAiCategoriesStep = currentStepData?.id === 'ai-categories'
  const isAccessibilityStep = currentStepData?.id === 'accessibility'
  const isScreenRecordingStep = currentStepData?.id === 'screen-recording'
  const isWelcomeStep = currentStepData?.id === 'welcome'
  const isPosthogOptInStep = currentStepData?.id === 'posthog-opt-in-eu'
  const isLinuxDependenciesStep = currentStepData?.id === 'linux-dependencies'

  return {
    currentStep,
    setCurrentStep,
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
    isLinux,
    handleNext,
    handleBack,
    handleSkipToEnd
  }
}
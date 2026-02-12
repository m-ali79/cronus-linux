import { ActiveWindowEvent, Category } from 'shared'
import type { ActivityToRecategorize } from '../hooks/useActivityTracking'
import { DisplayWindowInfo, getIdentifierFromUrl } from '../utils/distractionStatusBarUIHelpers'

export const useRecategorizationHandler = (
  latestEvent: ActiveWindowEvent | null | undefined,
  displayWindowInfo: DisplayWindowInfo | null,
  categoryDetails: unknown,
  onOpenRecategorizeDialog: (target: ActivityToRecategorize) => void
) => {
  const handleOpenRecategorize = () => {
    if (!latestEvent || !displayWindowInfo) {
      console.warn('Cannot re-categorize: missing latestEvent or displayWindowInfo')
      return
    }

    const currentCat = categoryDetails as Category | null
    const currentCatId = latestEvent.categoryId || 'uncategorized'
    const currentCatName = currentCat?.name || 'Uncategorized'

    const identifier = displayWindowInfo.isApp
      ? displayWindowInfo.ownerName
      : displayWindowInfo.url
        ? getIdentifierFromUrl(displayWindowInfo.url)
        : displayWindowInfo.ownerName

    const target: ActivityToRecategorize = {
      identifier: identifier,
      nameToDisplay:
        displayWindowInfo.ownerName +
        (displayWindowInfo.title ? ` - ${displayWindowInfo.title}` : ''),
      itemType: displayWindowInfo.isApp ? 'app' : 'website',
      currentCategoryId: currentCatId,
      currentCategoryName: currentCatName,
      currentCategoryColor: currentCat?.color || '#000000',
      categoryReasoning: latestEvent.categoryReasoning || undefined
    }
    onOpenRecategorizeDialog(target)
  }

  return handleOpenRecategorize
}

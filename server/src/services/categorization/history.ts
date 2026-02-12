import { ActiveWindowDetails } from '../../../../shared/types';
import { ActiveWindowEventModel } from '../../models/activeWindowEvent';
import { CategoryModel } from '../../models/category';
import { UserModel } from '../../models/user';

const getProjectNameFromTitle = (title: string): string | null => {
  const parts = title.split('—');
  if (parts.length > 1) {
    return parts.pop()?.trim() || null;
  }
  return null;
};

export interface HistoryResult {
  categoryId: string;
  categoryReasoning: string | null;
  llmSummary: string | null;
  content?: string | null;
}

export async function checkActivityHistory(
  userId: string,
  goalId: string | null,
  activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'url' | 'type' | 'title'> | null | undefined
): Promise<HistoryResult | null> {
  // Guard against undefined/null activeWindow parameter
  if (!activeWindow) {
    return null;
  }

  try {
    const { ownerName, url, type, title } = activeWindow;

    // First, check if the app is in the user's multi-purpose list.
    // If so, we want to force a re-categorization by the LLM.
    if (ownerName) {
      const user = await UserModel.findById(userId).select('multiPurposeApps').lean();
      if (user?.multiPurposeApps?.includes(ownerName)) {
        return null;
      }
    }

    // Check if the URL matches any multi-purpose website patterns
    if (url) {
      const user = await UserModel.findById(userId).select('multiPurposeWebsites').lean();
      if (user?.multiPurposeWebsites?.some((pattern) => url.includes(pattern))) {
        console.log(`[Cache] Multi-purpose website ${url} - bypassing cache`);
        return null;
      }
    }

    const queryCondition: any = { userId };

    // Windsurf doesn't put the project name in the title
    const isCodeEditor = (ownerName: string) =>
      ['Cursor', 'Code', 'Visual Studio Code'].includes(ownerName);

    if (url && type === 'browser') {
      // Most specific: Match by exact URL for browser activities
      queryCondition.url = url;
      // Add cachedForGoalId for browser activities to enable goal-based caching
      queryCondition.cachedForGoalId = goalId;
    } else if (type === 'browser' && title && title.trim() !== '' && (!url || url.trim() === '')) {
      // Next specific: Browser activity, no URL (or empty URL), but has a non-empty title
      // Match by ownerName AND title to distinguish between different tabs/windows of the same browser if URL is missing
      queryCondition.ownerName = ownerName;
      queryCondition.title = title;
      // Add cachedForGoalId for browser activities to enable goal-based caching
      queryCondition.cachedForGoalId = goalId;
    } else if (ownerName && isCodeEditor(ownerName) && title) {
      const projectName = getProjectNameFromTitle(title);
      if (projectName) {
        queryCondition.ownerName = ownerName;
        // Match other files from the same project
        queryCondition.title = { $regex: `— ${projectName}$`, $options: 'i' };
      } else {
        // Fallback for editor if title format is unexpected (e.g., startup screen)
        queryCondition.ownerName = ownerName;
      }
    } else {
      // Fallback: Match by ownerName only (for non-browser apps, or browsers with no URL and no distinct title)
      if (ownerName) {
        queryCondition.ownerName = ownerName;
      }
    }

    if (Object.keys(queryCondition).length === 1 && queryCondition.userId) {
      return null;
    }

    console.log(`[Cache] Query: ${JSON.stringify(queryCondition)}`);
    const lastEventWithSameIdentifier = await ActiveWindowEventModel.findOne(queryCondition)
      .sort({ timestamp: -1 })
      .select('categoryId categoryReasoning llmSummary content')
      .lean();

    console.log(`[Cache] Found: ${!!lastEventWithSameIdentifier}`);
    if (lastEventWithSameIdentifier && lastEventWithSameIdentifier.categoryId) {
      const categoryId = lastEventWithSameIdentifier.categoryId as string;

      // Validate that the category still exists and is not archived
      const categoryExists = await CategoryModel.findOne({
        _id: categoryId,
        isArchived: false,
      }).lean();
      if (categoryExists) {
        return {
          categoryId,
          categoryReasoning: (lastEventWithSameIdentifier.categoryReasoning as string) || null,
          llmSummary: (lastEventWithSameIdentifier.llmSummary as string) || null,
          content:
            lastEventWithSameIdentifier.content !== undefined
              ? ((lastEventWithSameIdentifier.content as string) ?? null)
              : undefined,
        };
      }
    }
  } catch (error) {
    console.error('[CategorizationService] Error during history check:', error);
  }
  return null;
}

/**
 * Invalidates browser activity cache for a user when goals change.
 * This clears all cached browser activity entries for the specified user,
 * forcing re-categorization of browser activities.
 */
export async function invalidateBrowserActivityCache(userId: string): Promise<void> {
  // Cache now invalidates via cachedForGoalId query mismatch
  // No need to delete events - they remain for historical purposes
  console.log(`[Cache] Browser cache logically invalidated for user: ${userId} (goal changed)`);
}

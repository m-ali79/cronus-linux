import { UserModel } from '../../models/user';
import { ActiveWindowEventModel } from '../../models/activeWindowEvent';
import { CategoryModel } from '../../models/category';
import type { ActiveWindowDetails } from '../../../../shared/types';

export interface QuestioningContext {
  userId: string;
  activityId?: string;
  site?: string;
  title: string;
  goal?: string;
  confidence: number;
}

export interface QuestioningResult {
  action: 'work' | 'distraction' | 'timeout';
  categoryId?: string;
  categoryReasoning?: string;
}

// Store pending questions for timeout handling
const pendingQuestions = new Map<string, QuestioningContext>();

export async function createQuestioningNotification(
  context: QuestioningContext
): Promise<{ notificationId: string; context: QuestioningContext }> {
  const notificationId = `question-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  pendingQuestions.set(notificationId, context);

  // Clean up after 30 seconds (timeout)
  setTimeout(() => {
    const pending = pendingQuestions.get(notificationId);
    if (pending) {
      console.log(
        `[QuestioningService] Notification timeout for ${notificationId}, auto-classifying as distraction`
      );
      pendingQuestions.delete(notificationId);
    }
  }, 30000);

  return { notificationId, context };
}

export async function handleQuestionResponse(
  notificationId: string,
  response: 'work' | 'distraction' | 'timeout'
): Promise<QuestioningResult | null> {
  const context = pendingQuestions.get(notificationId);
  if (!context) {
    console.warn(`[QuestioningService] No pending question found for ${notificationId}`);
    return null;
  }

  pendingQuestions.delete(notificationId);

  if (response === 'timeout') {
    return { action: 'timeout' };
  }

  // Get user's work category or create default
  let categoryId: string | undefined;
  let categoryReasoning: string | undefined;

  if (response === 'work') {
    // Find a productive category for the user
    const categories = await CategoryModel.find({ userId: context.userId }).lean();

    // Try to find a productive category that matches
    const productiveCategory = categories.find((c) => c.isProductive === true);
    if (productiveCategory) {
      categoryId = productiveCategory._id.toString();
    }

    categoryReasoning = `User confirmed this is work: "${context.title}"${context.site ? ` on ${context.site}` : ''}`;
  } else {
    // Mark as distraction - typically goes to a "Distraction" or "Uncategorized" category
    categoryReasoning = `User marked as distraction: "${context.title}"${context.site ? ` on ${context.site}` : ''}`;
  }

  // Update activity if activityId was provided
  if (context.activityId) {
    await ActiveWindowEventModel.findByIdAndUpdate(context.activityId, {
      categoryId: categoryId || undefined,
      categoryReasoning,
      manuallyCategorized: true,
    });
  }

  return {
    action: response,
    categoryId,
    categoryReasoning,
  };
}

export function buildNotificationContent(context: QuestioningContext): {
  title: string;
  body: string;
  actions: Array<{ text: string; id: string }>;
} {
  const site = context.site || context.title;
  const goal = context.goal || 'your goals';
  const title = context.title !== site ? context.title : undefined;

  return {
    title: 'Is this work?',
    body: `You're on ${site}${title ? ` - "${title}"` : ''}. This doesn't clearly match ${goal}. Is this work or distraction?`,
    actions: [
      { text: 'Work', id: 'work' },
      { text: 'Distraction', id: 'distraction' },
    ],
  };
}

export function shouldAskQuestion(
  confidence: number | null,
  action: 'auto-classify' | 'ask-question' | 'mark-distraction' | null
): boolean {
  // Only ask question if action is 'ask-question' and confidence is in 50-80 range
  if (action !== 'ask-question') return false;
  if (confidence === null) return false;
  return confidence >= 50 && confidence <= 80;
}

export async function processCategorizationWithQuestioning(
  userId: string,
  activityId: string,
  activeWindow: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'type' | 'browser'>,
  categorization: {
    categoryId: string | null;
    categoryReasoning: string | null;
    confidence: number | null;
    action: 'auto-classify' | 'ask-question' | 'mark-distraction' | null;
  }
): Promise<{
  shouldNotify: boolean;
  notificationData?: {
    notificationId: string;
    title: string;
    body: string;
    actions: Array<{ text: string; id: string }>;
    timeout: number;
  };
  finalAction?: 'work' | 'distraction' | 'auto-classify' | 'mark-distraction';
}> {
  // Skip if action is not 'ask-question'
  if (!shouldAskQuestion(categorization.confidence, categorization.action)) {
    if (categorization.action === 'auto-classify') {
      return { shouldNotify: false, finalAction: 'auto-classify' };
    }
    if (categorization.action === 'mark-distraction') {
      return { shouldNotify: false, finalAction: 'mark-distraction' };
    }
    return { shouldNotify: false };
  }

  // Get user goals for context
  const user = await UserModel.findById(userId).select('userProjectsAndGoals').lean();
  const userGoals: string = user?.userProjectsAndGoals || 'your goals';

  // Extract site from URL
  let site: string | undefined;
  if (activeWindow.url) {
    try {
      const urlObj = new URL(activeWindow.url);
      site = urlObj.hostname.replace('www.', '');
    } catch {
      site = activeWindow.ownerName;
    }
  } else {
    site = activeWindow.ownerName;
  }

  // Create questioning context
  const context: QuestioningContext = {
    userId,
    activityId,
    site,
    title: activeWindow.title || 'Unknown',
    goal: userGoals,
    confidence: categorization.confidence || 0,
  };

  const { notificationId, context: savedContext } = await createQuestioningNotification(context);
  const content = buildNotificationContent(savedContext);

  return {
    shouldNotify: true,
    notificationData: {
      notificationId,
      title: content.title,
      body: content.body,
      actions: content.actions,
      timeout: 30000, // 30 seconds
    },
    finalAction: undefined, // Will be determined by user response
  };
}

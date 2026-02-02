import { UserModel } from 'src/models/user';
import { ActiveWindowDetails, Category as CategoryType } from '../../../../shared/types';
import { CategoryModel } from '../../models/category';
import { checkActivityHistory } from './history';
import { getLLMCategoryChoice, getLLMSummaryForBlock } from './llm';

export interface CategorizationResult {
  categoryId: string | null;
  categoryReasoning: string | null;
  llmSummary: string | null;
}

export async function categorizeActivity(
  userId: string,
  activeWindow: Pick<
    ActiveWindowDetails,
    'ownerName' | 'title' | 'url' | 'content' | 'type' | 'browser' | 'durationMs'
  >
): Promise<CategorizationResult> {
  // 1. History Check
  const historyResult = await checkActivityHistory(userId, activeWindow);
  if (historyResult) {
    return { ...historyResult, llmSummary: historyResult.llmSummary || null };
  }

  // 2. LLM-based Categorization by choosing from user's list
  const user = await UserModel.findById(userId).select('userProjectsAndGoals').lean();
  const userProjectsAndGoals: string = user?.userProjectsAndGoals || '';

  const rawUserCategories = await CategoryModel.find({ userId, isArchived: { $ne: true } }).lean();
  const userCategories: CategoryType[] = rawUserCategories.map((cat) => ({
    ...cat,
    _id: cat._id.toString(),
    userId: cat.userId.toString(),
    createdAt: cat.createdAt.toISOString(),
    updatedAt: cat.updatedAt.toISOString(),
  }));

  if (!userCategories || userCategories.length === 0) {
    console.warn(
      `[CategorizationService] User ${userId} has no categories defined. Cannot categorize.`
    );
    return { categoryId: null, categoryReasoning: null, llmSummary: null };
  }

  const categoryNamesForLLM = userCategories.map((c) => ({
    name: c.name,
    description: c.description,
  }));

  // TODO-maybe: could add "unclear" here and then check the screenshot etc
  const choice = await getLLMCategoryChoice(
    userProjectsAndGoals,
    categoryNamesForLLM,
    activeWindow
  );

  let determinedCategoryId: string | null = null;
  let categoryReasoning: string | null = null;
  let llmSummary: string | null = null;

  if (choice) {
    const { chosenCategoryName, reasoning, summary } = choice;
    const matchedCategory = userCategories.find(
      (cat) => cat.name.toLowerCase() === chosenCategoryName.toLowerCase()
    );
    if (matchedCategory) {
      determinedCategoryId = matchedCategory._id;
      categoryReasoning = reasoning;
      llmSummary = summary;
      console.log(
        `[CategorizationService] LLM chose category: "${chosenCategoryName}", ID: ${determinedCategoryId}. Reasoning: "${reasoning}", Summary: "${summary}"`
      );
    } else {
      console.warn(
        `[CategorizationService] LLM chose category name "${chosenCategoryName}" but it does not match any existing categories for user ${userId}. Reasoning: "${reasoning}"`
      );
    }
  } else {
    console.log('[CategorizationService] LLM did not choose a category.');
  }

  // TODO: I dont think this should ever run bc when the entry is created it's usually below 10min
  // Fallback: If reasoning is missing or too short, and block is "long" (e.g., >10min)
  const isLongBlock = activeWindow.durationMs && activeWindow.durationMs > 10 * 60 * 1000; // 10 minutes
  const isReasoningMissingOrShort = !categoryReasoning || categoryReasoning.length < 10;

  if (isLongBlock && isReasoningMissingOrShort) {
    const summary = await getLLMSummaryForBlock(activeWindow);
    if (summary) {
      categoryReasoning = summary;
    }
  }

  return { categoryId: determinedCategoryId, categoryReasoning, llmSummary };
}

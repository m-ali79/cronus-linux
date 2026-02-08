import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { Category as CategoryType } from '../../../../shared/types';
import { CategoryModel } from '../../models/category';
import { UserModel } from '../../models/user';
import type { CalendarEvent } from '../suggestions/suggestionGenerationService';
import { type FinishReason, getCategorizationModel, getCategorizationModelId } from './llmProvider';

export interface CategorizationResult {
  categoryId: string | null;
  categoryReasoning: string | null;
  llmSummary: string | null;
}

const CalendarCategoryChoiceSchema = z.object({
  chosenCategoryName: z.string(),
  reasoning: z
    .string()
    .describe('Brief explanation of why this category fits the calendar event. Max 15 words.'),
});

function buildCalendarEventContent(calendarEvent: CalendarEvent): string {
  let content = calendarEvent.description || '';

  if (calendarEvent.attendees && calendarEvent.attendees.length > 1) {
    content += `\nAttendees: ${calendarEvent.attendees.length} people`;
  }

  return content;
}

const STRICT_JSON_SYSTEM_PROMPT = `You are a reliable data extraction engine. 
You MUST output ONLY valid JSON matching the provided schema.
NO conversational text, NO markdown formatting (like \`\`\`json), NO "Confidence" prefixes.
Just the raw JSON object. Failure to comply will break the system.`;

async function getLLMCalendarCategoryChoice(
  userProjectsAndGoals: string,
  userCategories: Pick<CategoryType, 'name' | 'description'>[],
  calendarEvent: CalendarEvent
): Promise<z.infer<typeof CalendarCategoryChoiceSchema> | null> {
  const categoryListForPrompt = userCategories
    .map((cat) => `- "${cat.name}"${cat.description ? ': ' + cat.description : ''}`)
    .join('\n  ');

  const calendarContent = buildCalendarEventContent(calendarEvent);
  const duration = Math.round((calendarEvent.endTime - calendarEvent.startTime) / (1000 * 60)); // minutes

  const systemContent = `You are an AI assistant that categorizes calendar events based on their content and context.

Focus on:
- Event title and description
- Number of attendees (social vs individual activities)
- Event context in relation to user's goals
- Event duration and timing

Calendar events with multiple attendees often indicate social or collaborative activities.`;

  const userContent = `
USER'S PROJECTS AND GOALS:
${userProjectsAndGoals || 'Not set'}

USER'S CATEGORIES:
${categoryListForPrompt}

CALENDAR EVENT:
Title: ${calendarEvent.summary}
Description: ${calendarEvent.description || 'None'}
Duration: ${duration} minutes
${calendarContent ? `Additional Context: ${calendarContent}` : ''}

TASK:
Choose the category that best fits this calendar event. Consider:
- If multiple people are involved, it's likely social/collaborative
- If it's work-related, choose work categories
- If it's personal development, choose learning/development categories
- Match the event purpose to the user's goals and available categories

Respond with the category name and brief reasoning.`;

  try {
    const result = await generateObject({
      model: getCategorizationModel(),
      schema: CalendarCategoryChoiceSchema,
      mode: 'json',
      system: `${STRICT_JSON_SYSTEM_PROMPT}\n\n${systemContent}`,
      prompt: userContent,
      temperature: 0,
      providerOptions: {
        openrouter: {
          reasoning: {
            enabled: false,
          },
        },
      },
    });

    return result.object;
  } catch (error) {
    console.error('Error getting LLM calendar category choice:', error);
    return null;
  }
}

export async function categorizeCalendarActivity(
  userId: string,
  calendarEvent: CalendarEvent
): Promise<CategorizationResult> {
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
      `[CalendarCategorizationService] User ${userId} has no categories defined. Cannot categorize calendar event.`
    );
    return { categoryId: null, categoryReasoning: null, llmSummary: null };
  }

  const categoryNamesForLLM = userCategories.map((c) => ({
    name: c.name,
    description: c.description,
  }));

  const choice = await getLLMCalendarCategoryChoice(
    userProjectsAndGoals,
    categoryNamesForLLM,
    calendarEvent
  );

  let determinedCategoryId: string | null = null;
  let categoryReasoning: string | null = null;

  if (choice) {
    const { chosenCategoryName, reasoning } = choice;
    const matchedCategory = userCategories.find(
      (cat) => cat.name.toLowerCase() === chosenCategoryName.toLowerCase()
    );
    if (matchedCategory) {
      determinedCategoryId = matchedCategory._id;
      categoryReasoning = reasoning;
      console.log(
        `[CalendarCategorizationService] LLM chose category: "${chosenCategoryName}", ID: ${determinedCategoryId}. Reasoning: "${reasoning}"`
      );
    } else {
      console.warn(
        `[CalendarCategorizationService] LLM chose category name "${chosenCategoryName}" but it does not match any existing categories for user ${userId}. Reasoning: "${reasoning}"`
      );
    }
  } else {
    console.log('[CalendarCategorizationService] LLM did not choose a category.');
  }

  return { categoryId: determinedCategoryId, categoryReasoning, llmSummary: null };
}

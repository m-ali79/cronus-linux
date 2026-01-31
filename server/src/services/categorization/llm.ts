import { generateText, Output } from 'ai';
import { z } from 'zod';
import { ActiveWindowDetails, Category as CategoryType } from '../../../../shared/types';
import { getCategorizationModel, getCategorizationModelId } from './llmProvider';

type FinishReason = 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';

// NEW Zod schema for LLM output: Expecting the name of one of the user's categories
export interface CategoryChoice {
  chosenCategoryName: string;
  summary: string;
  reasoning: string;
}

const CategoryChoiceSchema = z.object({
  chosenCategoryName: z.string(),
  summary: z
    .string()
    .describe(
      'A short summary of what the user is seeing. DO NOT conjecture about what they might be doing. Max 10 words.'
    ),
  reasoning: z
    .string()
    .describe(
      'Short explanation of why this category was chosen based on the content and users work/goals. Keep it very short and concise. Max 20 words.'
    ),
}) satisfies z.ZodType<CategoryChoice>;

/**
 * Build the system+user message pair used to prompt the categorization LLM for choosing the best user category for an activity.
 *
 * The returned messages instruct the model to prioritize activity CONTENT and PURPOSE when selecting a category and provide
 * the user's projects/goals, category list, and a human-readable summary of the activity. The function truncates URLs to 150
 * characters and page content to 7000 characters when present.
 *
 * @param userProjectsAndGoals - A textual summary of the user's current projects and goals (may be empty or 'Not set').
 * @param userCategories - The user's categories (each with `name` and optional `description`) to choose from.
 * @param activityDetails - Key details about the activity: application owner, window title, url, page content, type, and browser.
 * @returns An array of two messages formatted for an LLM: the first is a `system` message with high-level instructions, and the second is a `user` message containing the projects/goals, category list, activity details, examples, and a TASK prompt.
 */
function _buildOpenAICategoryChoicePromptInput(
  userProjectsAndGoals: string,
  userCategories: Pick<CategoryType, 'name' | 'description'>[],
  activityDetails: Pick<
    ActiveWindowDetails,
    'ownerName' | 'title' | 'url' | 'content' | 'type' | 'browser'
  >
) {
  const { ownerName, title, url, content, type, browser } = activityDetails;

  const categoryListForPrompt = userCategories
    .map((cat) => `- "${cat.name}"${cat.description ? ': ' + cat.description : ''}`)
    .join('\n  ');

  const MAX_URL_LENGTH = 150;
  const MAX_CONTENT_LENGTH = 7000;
  const truncatedUrl =
    url && url.length > MAX_URL_LENGTH ? `${url.slice(0, MAX_URL_LENGTH)}...` : url;
  const truncatedContent =
    content && content.length > MAX_CONTENT_LENGTH
      ? `${content.slice(0, MAX_CONTENT_LENGTH)}...`
      : content;

  const activityDetailsString = [
    ownerName && `Application: ${ownerName}`,
    title && `Window Title: ${title}`,
    truncatedUrl && `URL: ${truncatedUrl}`,
    truncatedContent && `Page Content: ${truncatedContent}`,
    type && `Type: ${type}`,
    browser && `Browser: ${browser}`,
  ]
    .filter(Boolean)
    .join('\n    ');

  return [
    {
      role: 'system' as const,
      content: `You are an AI assistant that categorizes activities based on CONTENT and PURPOSE, not just the platform or application being used.

IMPORTANT: Focus on what the user is actually doing and why, not just where they're doing it:
- YouTube can be work if it's educational content related to their goals
- Twitter/social media can be work if it's for professional networking or research
- The content and context matter more than the platform.

Based on the user's goals, their current activity, and their list of personal categories, choose the category name that best fits the activity.
${
  truncatedContent
    ? 'Note that the page content is fetched via the accessibility API and might include noise (e.g., sidebars).'
    : ''
}`,
    },
    {
      role: 'user' as const,
      content: `
USER'S PROJECTS AND GOALS:
${userProjectsAndGoals || 'Not set'}

USER'S CATEGORIES:
${categoryListForPrompt}

CURRENT ACTIVITY:
${activityDetailsString}

EXAMPLES OF CORRECT CATEGORIZATION:
- Activity: Watching a programming tutorial on YouTube. Goal: "Finish coding new feature". Categories: "Work", "Distraction". Correct Category: "Work".
- Activity: Browsing Instagram profile. Goal: "Find dream wife". Categories: "Find Dream Wife", "Social Media Distraction". Correct Category: "Find Dream Wife".
- Activity: Twitter DMs about user research. Goal: "Build novel productivity software". Categories: "Product Management", "Distraction". Correct Category: "Product Management".
- Activity: Watching random entertainment on YouTube. Goal: "Finish coding new feature". Categories: "Work", "Distraction". Correct Category: "Distraction".
- Activity: Drafting emails for unrelated side project. Goal: "Working on new social app". Categories: "Work Communication", "Distraction". Correct Category: "Distraction".
- Activity: Adjusting System Settings and view Cronus. Goal: "Finish my biophysics PHD etc". Categories: "Work", "Distraction". Correct Category: "Work".
- Activity: Staff Meeting. Goal: "CPA work". Categories: "Work", "Distraction". Correct Category: "Work".
- Activity: Meet - HOLD for Performance Management Training. Goals: N/Y. Categories: "Work", "Distraction". Correct Category: "Work".
- Activity: Looking at buying washing machine. Goal: "Study for Law degree, working in part-time job administering AirBnb appartments". Categories: "Studies", "AirBnb Management", "Distraction". Correct Category: "AirBnb Management".
- Activity: Looking at flight booking site. Goal: "Source manufacturers for my lamp product (Brighter), learn ML for job opportunities". Categories: "Other work", "Brighter", "Distraction". Reasoning: User is likely planning work related travel to source manufacturers. Correct Category: "Brighter".
- Activity: Look at New Tab in browser, and other necessary browser operations (like settings, etc). Categories: "Work", "Distraction". Correct Category: "Work"
 

TASK:
- Look at the CURRENT ACTIVITY through the lens of the user's PROJECTS AND GOALS.
- Which of the USER'S CATEGORIES best supports their stated objectives?
- **Crucially, first consider if the CURRENT ACTIVITY could be a step in achieving one of the USER'S PROJECTS AND GOALS, even if it seems unrelated at first.**
- Life admin activities like booking flights, are most likely work related or at least not a distraction.
- If the activity is obviously unrelated to the user's stated projects and goals (if they properly set their projects/goals), it should be categorized as "Distraction" regardless of the activity type.
- If the activity doesn't neatly fit into any of the other categories it's likely a distraction.

Respond with the category name and your reasoning.
          `,
    },
  ];
}

/**
 * Selects the best-fitting user category for a given activity and returns the model's chosen category, a short summary, and brief reasoning.
 *
 * @param userProjectsAndGoals - A short description of the user's projects and goals to guide categorization.
 * @param userCategories - Array of the user's categories; each item must include `name` and optional `description`.
 * @param activityDetails - Activity/window details (ownerName, title, url, content, type, browser) used to determine the category.
 * @returns The chosen category object containing `chosenCategoryName`, `summary`, and `reasoning`, or `null` if the LLM fails to produce a valid result.
 */
export async function getOpenAICategoryChoice(
  userProjectsAndGoals: string,
  userCategories: Pick<CategoryType, 'name' | 'description'>[], // Pass only name and description for the prompt
  activityDetails: Pick<
    ActiveWindowDetails,
    'ownerName' | 'title' | 'url' | 'content' | 'type' | 'browser'
  >
): Promise<z.infer<typeof CategoryChoiceSchema> | null> {
  // Returns the chosen category NAME or null if error/no choice
  const promptInput = _buildOpenAICategoryChoicePromptInput(
    userProjectsAndGoals,
    userCategories,
    activityDetails
  );

  try {
    let finishReason: FinishReason | undefined;
    let rawFinishReason: string | undefined;

    const result = await generateText({
      model: getCategorizationModel(),
      temperature: 0, // Deterministic output
      messages: promptInput,
      output: Output.object({
        schema: CategoryChoiceSchema,
        name: 'category_choice',
        description: "Chosen category + short summary + short reasoning. Don't invent facts.",
      }),
      onFinish: ({ finishReason: fr, rawFinishReason: rfr }) => {
        finishReason = fr;
        rawFinishReason = rfr;
      },
    });

    if (finishReason && finishReason !== 'stop') {
      console.warn(
        `[LLM] category_choice non-stop finishReason="${finishReason}" raw="${rawFinishReason}" model="${getCategorizationModelId()}"`
      );
      return null;
    }

    const parsed = CategoryChoiceSchema.safeParse(result.output);
    if (!parsed.success) {
      console.warn(
        `[LLM] category_choice schema mismatch model="${getCategorizationModelId()}":`,
        parsed.error.flatten()
      );
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error('Error getting LLM category choice:', error);
    return null;
  }
}

/**
 * Generate a concise, one-line summary describing what the user was likely doing during an activity block.
 *
 * Uses the activity's app/owner, window title, URL, content, type, and browser to produce a short descriptive summary.
 *
 * @param activityDetails - Object containing `ownerName`, `title`, `url`, `content`, `type`, and `browser` used to build the summary
 * @returns The trimmed one-line summary as a `string`, or `null` if no summary could be produced or an error occurred
 */

export async function getOpenAISummaryForBlock(
  activityDetails: Pick<
    ActiveWindowDetails,
    'ownerName' | 'title' | 'url' | 'content' | 'type' | 'browser'
  >
): Promise<string | null> {
  // You can use a similar prompt structure as getOpenAICategoryChoice, but focused on summarization
  const prompt = [
    {
      role: 'system' as const,
      content: `You are an AI assistant that summarizes user activity blocks for productivity tracking. 
Provide a concise, one-line summary of what the user was likely doing in this time block, based on the app, window title, content, and any available context.`,
    },
    {
      role: 'user' as const,
      content: `
APP: ${activityDetails.ownerName}
TITLE: ${activityDetails.title || ''}
URL: ${activityDetails.url || ''}
CONTENT: ${activityDetails.content ? activityDetails.content.slice(0, 1000) : ''}
TYPE: ${activityDetails.type}
BROWSER: ${activityDetails.browser || ''}
`,
    },
  ];

  try {
    const { text } = await generateText({
      model: getCategorizationModel(),
      messages: prompt,
      maxOutputTokens: 50,
      temperature: 0.3,
    });
    return text.trim() || null;
  } catch (error) {
    console.error('Error getting LLM summary for block:', error);
    return null;
  }
}

/**
 * Determine whether a window or activity title is informative and specific about the user's action.
 *
 * @param title - The window or activity title to evaluate
 * @returns `true` if the title is informative and specific, `false` otherwise
 */
export async function isTitleInformative(title: string): Promise<boolean> {
  const prompt = [
    {
      role: 'system' as const,
      content:
        'You are an AI assistant that evaluates if a window or activity title is informative and specific about what the user was doing. Answer only "yes" or "no". Only rendering the name of an application is not informative.',
    },
    {
      role: 'user' as const,
      content: `Title: "${title}"`,
    },
  ];

  try {
    const { text } = await generateText({
      model: getCategorizationModel(),
      messages: prompt,
      maxOutputTokens: 3,
      temperature: 0,
    });
    const answer = text.trim().toLowerCase();
    const result = answer?.startsWith('yes') ?? false;
    return result;
  } catch (error) {
    return false;
  }
}

/**
 * Generate a concise 5–8 word title summarizing an activity block.
 *
 * Uses the provided activity data (app, window title, context, and any available content)
 * to produce a short, descriptive title that represents what the user was doing during that block.
 *
 * @param activityData - Raw activity information (app, window title, URL, content, browser, etc.) used to create the summary
 * @returns A short descriptive title (about 5–8 words) representing the activity, or an empty string if generation fails
 */
export async function generateActivitySummary(activityData: any): Promise<string> {
  const prompt = [
    {
      role: 'system' as const,
      content: `You are an AI assistant that summarizes user activity blocks for productivity tracking. 
      Provide a concise, short title (max 5-8 words) of what the user was doing, based on the app, window title, and context. You can include details about the content that you have about the activity. Be detailed, yet concise. The goal is to represent the activity in a way that is easy to understand and use for the user and make it easy for them to understand what they did during that activity block. It should not be just one or two words.`,
    },
    {
      role: 'user' as const,
      content: `ACTIVITY DATA: ${JSON.stringify(activityData)}`,
    },
  ];

  try {
    const { text } = await generateText({
      model: getCategorizationModel(),
      messages: prompt,
      maxOutputTokens: 50,
      temperature: 0.3,
    });
    const generatedTitle = text.trim();
    return generatedTitle;
  } catch (error) {
    return '';
  }
}

/**
 * Suggests a single emoji that best represents a category.
 *
 * @param name - The category name to represent
 * @param description - Optional category description to provide additional context
 * @returns The suggested emoji as a string, or `null` if the model did not produce a valid emoji
 */
export async function getEmojiForCategory(
  name: string,
  description?: string
): Promise<string | null> {
  const prompt = [
    {
      role: 'system' as const,
      content: `You are an AI assistant that suggests a single emoji for a category. Respond with only the emoji, no text.`,
    },
    {
      role: 'user' as const,
      content: `Suggest a single emoji (just the emoji, no text) for a category with the following details.\nName: ${name}\nDescription: ${description || ''}`,
    },
  ];
  try {
    const { text } = await generateText({
      model: getCategorizationModel(),
      messages: prompt,
      maxOutputTokens: 10, // Increased to accommodate more complex emojis
      temperature: 0,
    });
    const emoji = text.trim() || null;
    // More robust validation: check if it's a single emoji character or sequence
    // This regex broadly matches various unicode emoji patterns.
    const emojiRegex =
      /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
    if (emoji && emojiRegex.test(emoji) && emoji.length <= 10) {
      // Keep a length check, but regex is primary
      return emoji;
    }
    return null;
  } catch (error) {
    console.error('Error getting emoji for category:', error);
    return null;
  }
}
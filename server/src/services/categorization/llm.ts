import { generateText, Output } from 'ai';
import { z } from 'zod';
import { ActiveWindowDetails, Category as CategoryType } from '../../../../shared/types';
import {
  type FinishReason,
  getCategorizationModel,
  getCategorizationModelId,
  getProviderOptions,
} from './llmProvider';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Call generateText with structured output, validate finish reason + schema.
 * Returns parsed data or null on any failure.
 */
async function generateStructured<T>(
  name: string,
  schema: z.ZodType<T>,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  opts: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<T | null> {
  try {
    const result = await generateText({
      model: getCategorizationModel(),
      temperature: opts.temperature ?? 0,
      maxOutputTokens: opts.maxOutputTokens,
      messages,
      output: Output.object({ schema, name }),
      providerOptions: getProviderOptions(),
    });

    const finishReason = result.finishReason as FinishReason | undefined;
    if (finishReason && finishReason !== 'stop') {
      console.warn(`[LLM] ${name} non-stop finishReason="${finishReason}" raw="${result.rawFinishReason}" model="${getCategorizationModelId()}"`);
      return null;
    }

    const parsed = schema.safeParse(result.output);
    if (!parsed.success) {
      console.warn(`[LLM] ${name} schema mismatch model="${getCategorizationModelId()}":`, parsed.error.flatten());
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error(`[LLM] ${name} failed:`, error);
    return null;
  }
}

/**
 * Call generateText for plain text output.
 * Returns trimmed text or null on failure.
 */
async function generateText_simple(
  name: string,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  opts: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: getCategorizationModel(),
      temperature: opts.temperature ?? 0,
      maxOutputTokens: opts.maxOutputTokens,
      messages,
      providerOptions: getProviderOptions(),
    });
    return text.trim() || null;
  } catch (error) {
    console.error(`[LLM] ${name} failed:`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Category Choice (main categorization)
// ---------------------------------------------------------------------------

export interface CategoryChoice {
  chosenCategoryName: string;
  summary: string;
  reasoning: string;
  confidence: number;
}

const CategoryChoiceSchema = z.object({
  chosenCategoryName: z.string(),
  summary: z.string().describe('A short summary of what the user is seeing. DO NOT conjecture about what they might be doing. Max 10 words.'),
  reasoning: z.string().describe('Short explanation of why this category was chosen based on the content and users work/goals. Keep it very short and concise. Max 20 words.'),
  confidence: z.number().min(0).max(100).describe('Confidence score (0-100) indicating how certain you are that this classification is correct. Be conservative - if unsure, give a lower score.'),
}) satisfies z.ZodType<CategoryChoice>;

function _buildLLMCategoryChoicePromptInput(
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

Also provide a confidence score (0-100) indicating how certain you are that this classification is correct. Be conservative - if unsure, give a lower score.

Respond with the category name, your reasoning, and your confidence score.
          `,
    },
  ];
}

export async function getLLMCategoryChoice(
  userProjectsAndGoals: string,
  userCategories: Pick<CategoryType, 'name' | 'description'>[],
  activityDetails: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'content' | 'type' | 'browser'>
): Promise<z.infer<typeof CategoryChoiceSchema> | null> {
  const promptInput = _buildLLMCategoryChoicePromptInput(userProjectsAndGoals, userCategories, activityDetails);
  return generateStructured('category_choice', CategoryChoiceSchema, promptInput, { temperature: 0 });
}

export async function getLLMSummaryForBlock(
  activityDetails: Pick<ActiveWindowDetails, 'ownerName' | 'title' | 'url' | 'content' | 'type' | 'browser'>
): Promise<string | null> {
  const prompt = [
    { role: 'system' as const, content: 'You are an AI assistant that summarizes user activity blocks for productivity tracking. Provide a concise, one-line summary of what the user was likely doing in this time block, based on the app, window title, content, and any available context.' },
    { role: 'user' as const, content: `APP: ${activityDetails.ownerName}\nTITLE: ${activityDetails.title || ''}\nURL: ${activityDetails.url || ''}\nCONTENT: ${activityDetails.content ? activityDetails.content.slice(0, 1000) : ''}\nTYPE: ${activityDetails.type}\nBROWSER: ${activityDetails.browser || ''}` },
  ];
  return generateText_simple('block_summary', prompt, { temperature: 0.3, maxOutputTokens: 50 });
}

export async function isTitleInformative(title: string): Promise<boolean> {
  const prompt = [
    { role: 'system' as const, content: 'You are an AI assistant that evaluates if a window or activity title is informative and specific about what the user was doing. Answer only "yes" or "no". Only rendering the name of an application is not informative.' },
    { role: 'user' as const, content: `Title: "${title}"` },
  ];
  const answer = await generateText_simple('isTitleInformative', prompt, { temperature: 0, maxOutputTokens: 3 });
  return answer?.toLowerCase().startsWith('yes') ?? false;
}

export async function generateActivitySummary(activityData: any): Promise<string> {
  const prompt = [
    { role: 'system' as const, content: 'You are an AI assistant that summarizes user activity blocks for productivity tracking. Provide a concise, short title (max 5-8 words) of what the user was doing, based on the app, window title, and context. Be detailed, yet concise. It should not be just one or two words.' },
    { role: 'user' as const, content: `ACTIVITY DATA: ${JSON.stringify(activityData)}` },
  ];
  return (await generateText_simple('activity_summary', prompt, { temperature: 0.3, maxOutputTokens: 50 })) ?? '';
}

export async function getEmojiForCategory(name: string, description?: string): Promise<string | null> {
  const prompt = [
    { role: 'system' as const, content: 'You are an AI assistant that suggests a single emoji for a category. Respond with only the emoji, no text.' },
    { role: 'user' as const, content: `Suggest a single emoji (just the emoji, no text) for a category with the following details.\nName: ${name}\nDescription: ${description || ''}` },
  ];
  const emoji = await generateText_simple('emoji_suggestion', prompt, { temperature: 0, maxOutputTokens: 10 });
  if (!emoji) return null;
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  return emojiRegex.test(emoji) && emoji.length <= 10 ? emoji : null;
}

// Goal analysis types
export interface GoalAnalysisResult {
  confidence: number;
  question: string | null;
  refinedGoal: string | null;
  reasoning: string;
}

const GoalAnalysisSchema = z.object({
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe("Confidence score (0-100) indicating how well you understand the user's goals."),
  question: z
    .string()
    .nullable()
    .describe(
      'A clarifying question to ask the user if confidence is below 80%. Null if confidence >= 80%.'
    ),
  refinedGoal: z
    .string()
    .nullable()
    .describe('The refined, comprehensive goal statement if confidence >= 80%. Null otherwise.'),
  reasoning: z
    .string()
    .describe(
      'Brief explanation of your confidence assessment and what information you still need.'
    ),
});

function _buildGoalAnalysisPrompt(
  currentGoal: string,
  conversationHistory: Array<{ role: 'user' | 'ai'; content: string }>
): Array<{ role: 'system' | 'user'; content: string }> {
  const historyString =
    conversationHistory.length > 0
      ? conversationHistory
          .map((msg) => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`)
          .join('\n\n')
      : 'No previous conversation.';

  return [
    {
      role: 'system' as const,
      content: `You are an AI assistant that helps users clarify what counts as "WORK" vs "DISTRACTION" for their goals. Your job is to:

1. Analyze the user's stated goals to understand work boundaries
2. Determine how well you understand work vs distraction for this goal (confidence 0-100)
3. If confidence < 80%, ask ONE specific clarifying question about work boundaries
4. If confidence >= 80%, provide a comprehensive work/distraction boundary definition

Your goal is NOT project planning. It's understanding real-time work decisions:
- When the user is on YouTube, GitHub, StackOverflow - is that work or distraction?
- When they're reading docs, watching tutorials, browsing repos - work or distraction?

Ask clarifying questions like:
- "Does searching on StackOverflow count as work for you?"
- "Is watching tutorial videos work or distraction?"
- "What about browsing GitHub repos?"
- "Does reading documentation count as work?"
- "Is researching best practices work?"

Examples of goals with clear boundaries (high confidence):
- "Learning React by building a todo app. Work: coding, reading React docs, StackOverflow. Distraction: random YouTube videos, browsing Twitter, reading unrelated tech blogs."
- "Preparing for CPA exam. Work: reading study materials, watching exam prep videos, doing practice questions. Distraction: YouTube, social media, checking email."
- "Building a mobile fitness app. Work: coding, reading Flutter docs, browsing Flutter packages on pub.dev. Distraction: browsing unrelated GitHub repos, watching entertainment videos."

Examples of goals needing clarification (low confidence):
- "Learn coding" -> Ask: "Does watching YouTube tutorials count as work?"
- "Build a project" -> Ask: "Does searching on StackOverflow count as work?"
- "Study for exams" -> Ask: "Is watching educational videos work for you?"`,
    },
    {
      role: 'user' as const,
      content: `CONVERSATION HISTORY:
${historyString}

CURRENT GOAL STATEMENT:
${currentGoal}

TASK:
Analyze the goal and conversation history. Determine your confidence (0-100) in understanding work vs distraction boundaries for this goal.

If confidence < 80%, ask ONE specific clarifying question about work boundaries.
If confidence >= 80%, provide a refined goal statement that clearly defines what counts as WORK vs DISTRACTION.

Respond with your confidence score, question (if needed), refined goal (if confident), and reasoning.`,
    },
  ];
}

export async function analyzeGoalWithAI(
  currentGoal: string,
  conversationHistory: Array<{ role: 'user' | 'ai'; content: string }>
): Promise<GoalAnalysisResult | null> {
  const prompt = _buildGoalAnalysisPrompt(currentGoal, conversationHistory);
  return generateStructured('goal_analysis', GoalAnalysisSchema, prompt, { temperature: 0.3 });
}

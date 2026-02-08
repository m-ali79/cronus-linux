import { generateText, Output } from 'ai';
import { z } from 'zod';
import { ActiveWindowDetails, Category as CategoryType } from '../../../../shared/types';
import { type FinishReason, getCategorizationModel, getCategorizationModelId } from './llmProvider';

// NEW Zod schema for LLM output: Expecting the name of one of the user's categories
export interface CategoryChoice {
  chosenCategoryName: string;
  summary: string;
  reasoning: string;
  confidence: number;
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
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe(
      'Confidence score (0-100) indicating how certain you are that this classification is correct. Be conservative - if unsure, give a lower score.'
    ),
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

// TODO: could add Retry Logic with Consistency Check
export async function getLLMCategoryChoice(
  userProjectsAndGoals: string,
  userCategories: Pick<CategoryType, 'name' | 'description'>[], // Pass only name and description for the prompt
  activityDetails: Pick<
    ActiveWindowDetails,
    'ownerName' | 'title' | 'url' | 'content' | 'type' | 'browser'
  >
): Promise<z.infer<typeof CategoryChoiceSchema> | null> {
  // Returns the chosen category NAME or null if error/no choice
  const promptInput = _buildLLMCategoryChoicePromptInput(
    userProjectsAndGoals,
    userCategories,
    activityDetails
  );

  try {
    const result = await generateText({
      model: getCategorizationModel(),
      temperature: 0, // Deterministic output
      messages: promptInput,
      output: Output.object({
        schema: CategoryChoiceSchema,
        name: 'category_choice',
        description: "Chosen category + short summary + short reasoning. Don't invent facts.",
      }),
      providerOptions: {
        openrouter: {
          reasoning: {
            enabled: false,
          },
        },
      },
    });

    const finishReason: FinishReason | undefined = result.finishReason as FinishReason | undefined;
    const rawFinishReason: string | undefined = result.rawFinishReason;

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

// fallback for title

export async function getLLMSummaryForBlock(
  activityDetails: Pick<
    ActiveWindowDetails,
    'ownerName' | 'title' | 'url' | 'content' | 'type' | 'browser'
  >
): Promise<string | null> {
  // You can use a similar prompt structure as getLLMCategoryChoice, but focused on summarization
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
    console.debug(
      `[LLM] isTitleInformative failed model="${getCategorizationModelId()}" title="${title}"`,
      error
    );
    return false;
  }
}

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
    console.error(
      `[LLM] generateActivitySummary failed model="${getCategorizationModelId()}"`,
      {
        ownerName: activityData?.ownerName,
        title: activityData?.title,
        type: activityData?.type,
      },
      error
    );
    return '';
  }
}

/**
 * Suggest a single emoji for a category using an LLM.
 * @param name The category name
 * @param description The category description (optional)
 * @returns The suggested emoji as a string, or null if failed
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
    .describe('Brief reasoning about why you asked this question or how confident you are.'),
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
4. If confidence >= 80%, provide a comprehensive work/distaction boundary definition

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
Analyze the goal and conversation history. Determine your confidence (0-100) in understanding the user's objectives.

If confidence < 80%, ask ONE specific clarifying question that would most improve your understanding.
If confidence >= 80%, provide a refined, comprehensive goal statement that incorporates all the information gathered.

Respond with your confidence score, question (if needed), and refined goal (if confident).`,
    },
  ];
}

export async function analyzeGoalWithAI(
  currentGoal: string,
  conversationHistory: Array<{ role: 'user' | 'ai'; content: string }>
): Promise<GoalAnalysisResult | null> {
  const prompt = _buildGoalAnalysisPrompt(currentGoal, conversationHistory);

  try {
    const result = await generateText({
      model: getCategorizationModel(),
      temperature: 0.3,
      messages: prompt,
      output: Output.object({
        schema: GoalAnalysisSchema,
        name: 'goal_analysis',
        description:
          'Analysis of user goal with confidence score and clarifying question or refined goal.',
      }),
      providerOptions: {
        openrouter: {
          reasoning: {
            enabled: false,
          },
        },
      },
    });

    const parsed = GoalAnalysisSchema.safeParse(result.output);
    if (!parsed.success) {
      console.warn('[LLM] goal_analysis schema mismatch:', parsed.error.flatten());
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error('Error analyzing goal with AI:', error);
    return null;
  }
}

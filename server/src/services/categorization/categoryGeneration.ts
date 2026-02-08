import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { type FinishReason, getCategorizationModel, getCategorizationModelId } from './llmProvider';

export const SuggestedCategorySchema = z.object({
  name: z.string(),
  description: z.string(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  isProductive: z.boolean(),
  emoji: z.string().describe('A single emoji to represent the category.'),
});

export const SuggestedCategoriesSchema = z.object({
  categories: z.array(SuggestedCategorySchema),
});

function _buildLLMCategorySuggestionPromptInput(userProjectsAndGoals: string) {
  return [
    {
      role: 'system' as const,
      content: `You are an AI assistant that helps users create personalized productivity categories based on their goals.

You will be given a user's goals and a list of template categories.
Your task is to generate a list of 3-5 relevant categories tailored to the user's specific goals. For each category, you must suggest a name, description, color, a boolean for isProductive, and a single emoji.

IMPORTANT: Prefer using the provided template categories when they broadly cover an activity. Only create a new category if no template is a good fit.

Instructions details:
- If a user's goal is to "build the windows version of the app", the existing "Coding" category is a better choice than creating a new, highly specific "Windows Development" category.
- No need to only use the default categories. For ex. if someone says they have drawing as a hobby, they might need a "Drawing" category (in that case we dont use the "Design" category).
- If a user is a "CPA", they might need new categories like "Bookkeeping", "Tax", and "Consulting", since these are not in the template list.
- Don't litterally use XYZ but fill in the name of the specific company, project, client, etc.
- We already add a "Distraction" and a "Friends & Social" category, so no need to add them as part of your 3-5 categories.

Here are some good default categories that work for many people:
- name: Work Communication, description: Responding to emails, Slack, Notion, meetings or async updates, emoji: 💬, isProductive: true
- name: Contracting for XYZ, description: Working on a project for Contractor work for XYZ including meetings, emails, etc. related to that project
- name: Planning & Reflection, description: Journaling, reflecting on goals, or reviewing personal plans, emoji: 📝, isProductive: true

- name: Coding, description: Writing or reviewing code, debugging, working in IDEs or terminals, emoji: 💼, isProductive: true
- name: Design, description: Working in design tools like Figma or Illustrator on UX/UI or visual assets, emoji: 🎨
- name: Product Management, description: Planning features, writing specs, managing tickets, reviewing user feedback, emoji: 📈, isProductive: true
- name: Fundraising, description: Pitching to investors, refining decks, writing emails or grant applications, emoji: 💰, isProductive: true
- name: Growth & Marketing, description: Working on campaigns, analytics, user acquisition, SEO or outreach, emoji: 🚀, isProductive: true
- name: Dating, description: Using dating apps, messaging, browsing profiles, or going on dates, emoji: ❤️, isProductive: false
- name: Eating & Shopping, description: Eating meals, cooking, groceries, or online/in-person shopping, emoji: 🍔, isProductive: false
- name: Sport & Health, description: Exercising, walking, gym, sports, wellness, etc., emoji: 💪, isProductive: true
- name: Commuting, description: Traveling to or from work, errands, or social events, emoji: 🚗, isProductive: false

For the color, use Notion-style color like #3B82F6, #A855F7, #F97316, #CA8A04, #10B981, #06B6D4, #6B7280, #8B5CF6, #D946EF, #F59E0B, #22C5E, etc. (Don't use #EC4899)

Respond with a list of suggested categories in the format requested.`,
    },
    {
      role: 'user' as const,
      content: `
USER'S PROJECTS AND GOALS:
${userProjectsAndGoals}

TASK:
Generate a list of 3-5 personalized categories based on the user's goals.
`,
    },
  ];
}

const STRICT_JSON_SYSTEM_PROMPT = `You are a reliable data extraction engine. 
You MUST output ONLY valid JSON matching the provided schema.
NO conversational text, NO markdown formatting (like \`\`\`json), NO "Confidence" prefixes.
Just the raw JSON object. Failure to comply will break the system.`;

export async function getLLMCategorySuggestion(
  userProjectsAndGoals: string
): Promise<z.infer<typeof SuggestedCategoriesSchema> | null> {
  const promptInput = _buildLLMCategorySuggestionPromptInput(userProjectsAndGoals);

  const systemContent = promptInput.find((m) => m.role === 'system')?.content || '';
  const userContent = promptInput.find((m) => m.role === 'user')?.content || '';

  try {
    const result = await generateObject({
      model: getCategorizationModel(),
      schema: SuggestedCategoriesSchema,
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

    const distractionCategory = {
      name: 'Distraction',
      description: 'Scrolling social media, browsing unrelated content, or idle clicking',
      color: '#EC4899',
      emoji: '🎮',
      isProductive: false,
    };

    const friendsAndSocialCategory = {
      name: 'Friends & Social',
      description: 'Spending time with friends, social activities, or personal relationships',
      color: '#8B5CF6',
      emoji: '👥',
      isProductive: false,
    };

    return {
      categories: [...result.object.categories, distractionCategory, friendsAndSocialCategory],
    };
  } catch (error) {
    console.error('Error getting LLM category suggestion:', error);
    return null;
  }
}

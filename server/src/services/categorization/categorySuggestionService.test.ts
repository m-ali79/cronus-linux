import { describe, expect, test } from 'bun:test';
import { getLLMCategorySuggestion } from './categoryGeneration';

describe('getLLMCategorySuggestion', () => {
  const testCases = [
    {
      name: 'CPA and financial advisor',
      goals: 'I am a CPA and financial advisor.',
    },
    {
      name: 'UX/UI Designer',
      goals: 'I am a UX/UI Designer for PlymouthStreet.com. I study design at CODE university.',
    },
    {
      name: 'Founder of cronushq',
      goals:
        "I'm the founder of cronushq. I'm trying to get more users for the app and bulid the windows version and then get some enterprise design customers.",
    },
  ];

  for (const tc of testCases) {
    test(`should generate relevant categories for: ${tc.name}`, async () => {
      // Act
      const result = await getLLMCategorySuggestion(tc.goals);

      // Log for manual inspection
      console.log(`--- Test Case: ${tc.name} ---`);
      console.log('Goals:', tc.goals);
      console.log('Suggested Categories:', JSON.stringify(result, null, 2));

      // Assert
      expect(result).not.toBeNull();
      if (result) {
        expect(result.categories).toBeArray();
        expect(result.categories.length).toBeGreaterThan(0);
      }
    }, 30000); // Increased timeout for LLM call
  }
});

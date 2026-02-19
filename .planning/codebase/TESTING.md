# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Runner:**

- Bun's built-in test runner (Jest-compatible API)
- No separate config file - uses Bun's defaults
- Tests run with: `bun test`

**Assertion Library:**

- Bun's built-in `expect` (Jest-compatible)
- Imports: `import { expect, test, describe, beforeEach, afterEach } from 'bun:test'`

**Run Commands:**

```bash
# Run all tests
bun test

# Run specific test file
bun test src/services/categorization/categorizationService.test.ts

# Run specific test suite (from server/package.json)
bun run test:categorization
bun run test:history
bun run test:suggestions
```

## Test File Organization

**Location:**

- Co-located with source files in same directory
- Naming: `[sourceFile].test.ts` (e.g., `categorizationService.test.ts`)
- Mirror source directory structure

**Structure:**

```
server/src/services/categorization/
├── categorizationService.ts
├── categorizationService.test.ts
├── categorizationService-edgecases.test.ts
├── categorizationService-edgecases2.test.ts
├── history.ts
├── history.test.ts
├── history.integration.test.ts
└── integration.test.ts
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

describe('categorizeActivity', () => {
  describe('LLM-based Categorization', () => {
    test('should call the LLM and return a category when no history is found', async () => {
      // Arrange
      // Act
      // Assert
    }, 30000); // Timeout as last parameter
  });
});
```

**Patterns:**

- Use `describe` blocks for grouping related tests
- Nest `describe` for sub-features
- Test names should be descriptive: `should [expected behavior] when [condition]`
- Async tests: Use async/await with timeout as last parameter

## Mocking

**Framework:** Bun's built-in `mock` and `jest.fn()` compatibility

**Patterns:**

```typescript
import { jest, mock } from 'bun:test';

// Module mocking
const mockActiveWindowEventModel = {
  findOne: jest.fn(),
};
mock.module('../../models/activeWindowEvent', () => ({
  ActiveWindowEventModel: mockActiveWindowEventModel,
}));

// Function mocking
const callback = jest.fn();

// Clear mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

**What to Mock:**

- Database models and external APIs
- File system operations
- Electron IPC calls
- LLM/AI service calls (use real calls sparingly, marked with timeouts)

**What NOT to Mock:**

- Internal utility functions being tested
- Simple data transformations
- Type definitions

## Fixtures and Factories

**Test Data:**

```typescript
// Inline fixtures within test file
const dreamWifeCategory = {
  _id: new mongoose.Types.ObjectId().toString(),
  userId: mockUserId,
  name: 'Find Dream Wife',
  description: 'Look at Instagram profiles for potential dream wives',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Helper functions for dynamic data
const stubDetails = (overrides: Partial<ActiveWindowDetails> = {}): ActiveWindowDetails =>
  ({
    ownerName: 'Test',
    type: 'window',
    title: 'T',
    timestamp: Date.now(),
    ...overrides,
  }) as ActiveWindowDetails;
```

**Location:**

- Fixtures defined at top of test file or in `describe` block
- Shared fixtures can use helper functions
- No separate fixtures directory detected

## Coverage

**Requirements:** Not enforced in configuration

**View Coverage:**

```bash
# Bun test with coverage (not configured but supported)
bun test --coverage
```

## Test Types

**Unit Tests:**

- Scope: Individual functions and modules
- Location: Alongside source files
- Example: `categorizationService.test.ts` tests categorization logic

**Integration Tests:**

- Scope: Multiple modules working together
- Naming: `*.integration.test.ts` suffix
- Example: `history.integration.test.ts`, `integration.test.ts`
- Live API calls for LLM testing (with extended timeouts)

**E2E Tests:**

- Framework: Not detected
- Electron app testing: Manual testing appears primary method

## Common Patterns

**Async Testing:**

```typescript
test('should categorize browsing a female Instagram profile as "Find Dream Wife"', async () => {
  const activeWindow = {
    ownerName: 'Google Chrome',
    title: 'Alana Silber (@alanasilber)',
    url: 'https://www.instagram.com/alanasilber/',
    // ...
  };

  await runLlmCategorizationTest({
    activeWindow,
    mockUser: mockUserWithDatingSideProject,
    mockCategories: dreamWifeSeekingCategories,
    expectedCategoryName: dreamWifeCategory.name,
  });
}, 30000); // 30 second timeout for LLM calls
```

**Error Testing:**

```typescript
test('wrapper does not call callback when elapsed < TRACKER_STABILIZATION_PERIOD_MS', () => {
  const callback = () => {
    throw new Error('callback should not be called');
  };
  const wrapped = createStabilizingWrapper(start, TRACKER_STABILIZATION_PERIOD_MS, callback);
  wrapped(stubDetails({ timestamp: start }));
});
```

**State-based Testing:**

```typescript
test('should return false when confidence is below 50', () => {
  expect(shouldAskQuestion(30, 'ask-question')).toBe(false);
  expect(shouldAskQuestion(49, 'ask-question')).toBe(false);
});
```

**File Reading in Tests:**

```typescript
import { readFileSync } from 'fs';
import path from 'path';

const twitterDMContent = readFileSync(path.join(__dirname, './twitterConvoTestData.txt'), 'utf-8');
```

## Test Scripts

**Available in server/package.json:**

```bash
bun run test                         # Run all tests
bun run test:categorization          # Categorization service tests
bun run test:categorization:edgecases # Edge case tests
bun run test:categorization:all      # All categorization tests
bun run test:history                 # History service tests
bun run test:multi-purpose-apps      # Multi-purpose app tests
bun run test:category-suggestions    # Category suggestion tests
bun run test:suggestions             # Suggestion generation tests
bun run test:move                    # Move service tests
```

## Testing Best Practices

1. **Timeout Configuration:** Set explicit timeouts for tests with external dependencies:
   - Unit tests: Default (no timeout specified)
   - LLM/AI tests: 30000ms (30 seconds)
   - Integration tests: 30000ms+

2. **Mock Isolation:** Clear and restore mocks between tests:

   ```typescript
   beforeEach(() => {
     jest.clearAllMocks();
   });
   ```

3. **Test Data Files:** Store large test data in text files (e.g., `twitterConvoTestData.txt`)

4. **Environment Variables:** Tests may require env vars (e.g., `GOOGLE_GENERATIVE_AI_API_KEY` for LLM tests)

---

_Testing analysis: 2026-02-19_

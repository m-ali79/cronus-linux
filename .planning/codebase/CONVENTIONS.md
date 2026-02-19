# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**

- Components: PascalCase with `.tsx` extension (e.g., `ActivityList.tsx`, `WelcomeStep.tsx`)
- Utilities/Services: camelCase with `.ts` extension (e.g., `categorizationService.ts`, `logging.ts`)
- Tests: Co-located with source files using `.test.ts` suffix (e.g., `categorizationService.test.ts`)
- Constants: SCREAMING_SNAKE_CASE for values (e.g., `TRACKER_STABILIZATION_PERIOD_MS`)
- Styles/Config: kebab-case or lowercase (e.g., `tailwind.config.js`, `components.json`)

**Functions:**

- Use camelCase for all functions
- Async functions: `async function doSomething()`
- Private/internal functions: camelCase (no underscore prefix convention)
- React components: PascalCase functional components
- Hooks: `use[Name]` prefix (standard React convention)

**Variables:**

- camelCase for variables and constants
- Boolean flags: prefix with `is`, `has`, `should` (e.g., `isTrackingPaused`, `hasCompletedOnboarding`)
- React state: `[state, setState]` pattern

**Types/Interfaces:**

- Interfaces use PascalCase (e.g., `ActiveWindowDetails`, `CategorizationResult`)
- Enum values use PascalCase (e.g., `PermissionType.Accessibility`)
- Type files in `shared/types.ts` for cross-package types

## Code Style

**Formatting:**

- Tool: Prettier with config in `.prettierrc.yaml`
- Settings:
  - `semi: true` - Use semicolons
  - `singleQuote: true` - Single quotes for strings
  - `trailingComma: 'es5'` - Trailing commas where valid
  - `printWidth: 100` - Line length limit
  - `tabWidth: 2` - 2 spaces per indent
  - `useTabs: false` - Spaces, not tabs

**Linting:**

- Root: ESLint with `.eslintrc` using `@typescript-eslint`
- Electron app: `eslint.config.mjs` with flat config
  - Extends: `@electron-toolkit/eslint-config-ts`, `@electron-toolkit/eslint-config-prettier`
  - React-specific: `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- Key rules:
  - `prettier/prettier: error` - Enforce Prettier formatting
  - `@typescript-eslint/explicit-function-return-type: off`
  - `@typescript-eslint/no-explicit-any: off`
  - `class-methods-use-this: off`
  - `import/prefer-default-export: off`

## Import Organization

**Order:**

1. External libraries (React, Electron, Radix)
2. Workspace packages (e.g., `shared`)
3. Relative imports (utils, components, services)
4. Type imports marked with `type` keyword

**Path Aliases:**

- Electron app: `@/` aliased to `src/renderer/src/` (config in `tsconfig.web.json`)
- Server: `src/` path mapping in `tsconfig.json`
- Shared: Direct import from `shared` workspace

**Example:**

```typescript
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Category } from 'shared';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
```

## Error Handling

**Patterns:**

- Use try-catch for async operations with file system, network, or external APIs
- Log errors to console with descriptive messages
- Fallback gracefully (e.g., continue with reduced functionality)
- Use optional chaining for potentially null values

**Example:**

```typescript
export async function logMainToFile(message: string, data?: object): Promise<void> {
  try {
    await fs.appendFile(mainLogFilePath, logEntry + '\n');
  } catch (err) {
    console.error('Failed to write to main log file:', err);
  }
}
```

## Logging

**Framework:** Custom file-based logging (not console-only)

**Patterns:**

- Use `electron-log` for Electron main/renderer logs
- Custom file logging in `server/src/lib/logger.ts`
- Include ISO timestamp in all log entries
- Sanitize sensitive data using `@zapier/secret-scrubber`
- Prefix log messages with context: `[ServiceName] message`

**Example:**

```typescript
console.log(`[CategorizationService] LLM chose category: "${chosenCategoryName}"`);
console.warn(`[Cache] Invalidation failed for user ${userId}`);
```

## Comments

**When to Comment:**

- Complex business logic requires explanation
- Non-obvious workarounds or platform-specific behavior
- TODO/FIXME markers for future work
- JSDoc for exported functions with complex parameters

**JSDoc/TSDoc:**

- Use block comments for module-level documentation
- Describe parameter types inline with TypeScript, not JSDoc
- Explain "why" not "what" in implementation comments

**Example:**

```typescript
/**
 * ACTIVITY CATEGORIZATION CONFIDENCE vs GOAL CLARITY CONFIDENCE
 *
 * These are two SEPARATE confidence concepts in the system:
 * 1. GOAL CREATION CONFIDENCE - Measures AI understanding during goal setup
 * 2. ACTIVITY CATEGORIZATION CONFIDENCE - Measures AI confidence in work vs distraction
 */
```

## Function Design

**Size:**

- Keep functions under 50 lines when possible
- Extract helper functions for complex logic
- Single responsibility principle

**Parameters:**

- Use destructuring for options objects
- Provide defaults for optional parameters
- Type all parameters with TypeScript

**Example:**

```typescript
interface ActivityListProps {
  activities: ActivityItem[]
  currentCategory: ProcessedCategory
  isShowMore?: boolean  // Optional with default
}

export const ActivityList = ({
  activities,
  currentCategory,
  isShowMore = false,
}: ActivityListProps): React.ReactElement => {
```

## React Patterns

**Component Structure:**

- Functional components with explicit return type `React.ReactElement`
- Props interface named `[ComponentName]Props`
- Destructure props in function signature
- Use `forwardRef` for components that need ref forwarding

**State Management:**

- Local state with `useState`
- No global state library detected (props drilling for now)
- IPC for main/renderer communication in Electron

**Styling:**

- Tailwind CSS with custom design system
- Utility classes via `cn()` helper from `lib/utils`
- `class-variance-authority` for component variants
- Radix UI primitives for accessibility

**Example:**

```typescript
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
```

## Module Design

**Exports:**

- Named exports preferred over default exports
- Export interfaces/types alongside implementations
- Barrel files for component directories

**Electron-specific:**

- Main process: `src/main/` - Node.js APIs allowed
- Renderer process: `src/renderer/src/` - Browser APIs only
- Preload: `src/preload/` - Bridge between main and renderer
- IPC handlers registered in `src/main/ipc.ts`

---

_Convention analysis: 2026-02-19_

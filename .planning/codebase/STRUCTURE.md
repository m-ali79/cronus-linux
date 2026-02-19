# Codebase Structure

**Analysis Date:** 2026-02-19

## Directory Layout

```
[project-root]/
├── electron-app/           # Electron desktop application
│   ├── src/
│   │   ├── main/          # Main process (Node.js/Electron)
│   │   ├── preload/       # Preload scripts (secure bridge)
│   │   ├── renderer/      # Renderer process (React UI)
│   │   ├── shared/        # Shared between main/renderer
│   │   └── native-modules/# Platform-specific native code
│   ├── build/             # Build configuration
│   ├── public/            # Static assets (sounds, icons)
│   ├── resources/         # App resources
│   ├── scripts/           # Build/packaging scripts
│   └── native-host/       # Native messaging host
├── server/                # Backend API server
│   ├── src/
│   │   ├── routers/       # tRPC router definitions
│   │   ├── models/        # Mongoose schemas
│   │   ├── services/      # Business logic services
│   │   ├── lib/           # Utilities and helpers
│   │   ├── routes/        # Express routes (non-tRPC)
│   │   ├── scripts/       # One-off scripts
│   │   └── seeder/        # Database seeding
│   └── dist/              # Compiled output
├── shared/                # Shared types and constants
│   └── src/
│       └── types.ts       # Core type definitions
├── docs/                  # Documentation
├── .cursor/               # Cursor IDE configuration
│   └── skills/            # Cursor agent skills
├── .planning/             # Planning documents
│   └── codebase/          # Architecture docs (this folder)
└── .worktrees/            # Git worktrees for parallel development
```

## Directory Purposes

### electron-app/src/main/

- **Purpose**: Main Electron process code
- **Contains**: Window management, IPC handlers, native module coordination
- **Key files**:
  - `index.ts` - Main entry point
  - `ipc.ts` - IPC handler registration
  - `windows.ts` - BrowserWindow creation
  - `protocol.ts` - Custom protocol handling
  - `logging.ts` - File-based logging
  - `auto-updater.ts` - Auto-update logic
  - `redaction.ts` - Content redaction for privacy
  - `nativeModule.ts` - Native module initialization

### electron-app/src/preload/

- **Purpose**: Preload scripts that expose safe APIs to renderer
- **Contains**: API bridge between main and renderer
- **Key files**:
  - `index.ts` - Main preload script
  - `index.d.ts` - TypeScript declarations
  - `floatingPreload.ts` - Preload for floating window

### electron-app/src/renderer/src/

- **Purpose**: React UI application
- **Contains**: Components, hooks, contexts, utilities
- **Structure**:
  - `components/` - React components
  - `hooks/` - Custom React hooks
  - `contexts/` - React context providers
  - `lib/` - Utility libraries
  - `utils/` - Helper utilities
  - `styles/` - CSS and Tailwind styles
  - `assets/` - Static assets (icons, fonts)

### electron-app/src/renderer/src/components/

- **Purpose**: UI components
- **Subdirectories**:
  - `ActivityList/` - Activity list display components
  - `CalendarWidget/` - Calendar and timeline views
  - `layout/` - Layout components (PageContainer, etc.)
  - `Onboarding/` - Onboarding flow components
  - `Settings/` - Settings page components
  - `ui/` - Reusable UI primitives (shadcn/ui)

### electron-app/src/renderer/src/hooks/

- **Purpose**: Custom React hooks
- **Naming Pattern**: `use[Feature][Action].ts`
- **Key hooks**:
  - `useActivityTracking.ts` - Core activity tracking logic
  - `useAuth.ts` - Authentication hook (from AuthContext)
  - `useDistractionNotification.ts` - Distraction alert handling
  - `useOnboardingLogicApp.ts` - Onboarding state management
  - `useQuestioningNotification.ts` - Interactive questioning

### electron-app/src/native-modules/

- **Purpose**: Platform-specific native implementations
- **Structure**:
  - `native-windows/` - macOS native module (Objective-C/C++)
  - `native-linux/` - Linux implementation (TypeScript)

### electron-app/src/native-modules/native-linux/

- **Purpose**: Linux-specific tracking implementation
- **Components**:
  - `index.ts` - Main Linux tracker class
  - `hyprland/windowTracker.ts` - Hyprland window tracking
  - `browser/browserTracker.ts` - Browser URL extraction
  - `screenshot/screenshotManager.ts` - Screenshot + OCR
  - `system/systemEventObserver.ts` - System events
  - `permissions/dependencyChecker.ts` - Dependency checking
  - `trackingCoordinator.ts` - Event coordination/stabilization
  - `types.ts` - Linux-specific types

### server/src/routers/

- **Purpose**: tRPC router definitions
- **Naming Pattern**: `[domain]Router.ts`
- **Key routers**:
  - `auth.ts` - Authentication and OAuth
  - `activeWindowEvents.ts` - Activity event operations
  - `user.ts` - User management
  - `categoryRouter.ts` - Category CRUD
  - `calendar.ts` - Google Calendar integration
  - `payments.ts` - Stripe payments
  - `suggestions.ts` - AI suggestions
  - `statistics.ts` - Analytics

### server/src/models/

- **Purpose**: Mongoose schemas and types
- **Naming Pattern**: `[Entity].ts`
- **Key models**:
  - `user.ts` - User schema
  - `activeWindowEvent.ts` - Activity event schema
  - `category.ts` - Category schema

### server/src/services/

- **Purpose**: Business logic services
- **Subdirectories**:
  - `categorization/` - AI categorization logic
  - `questioning/` - Distraction questioning
  - `suggestions/` - AI suggestion generation
  - `move/` - Bulk operations
- **Key files**:
  - `categorization/categorizationService.ts` - Main categorization
  - `categorization/history.ts` - Activity history caching
  - `categorization/llm.ts` - AI SDK integration
  - `googleCalendar.ts` - Calendar sync

### server/src/lib/

- **Purpose**: Shared utilities
- **Key files**:
  - `authUtils.ts` - JWT verification utilities
  - `logger.ts` - Server logging
  - `versionUtils.ts` - Client version checking

## Key File Locations

### Entry Points

- `electron-app/src/main/index.ts` - Electron main process entry
- `electron-app/src/renderer/src/main.tsx` - React renderer entry
- `server/src/index.ts` - Express server entry
- `shared/src/types.ts` - Shared types entry

### Configuration

- `package.json` (root) - Workspace configuration
- `electron-app/package.json` - Electron app configuration
- `electron-app/electron.vite.config.ts` - Vite build config
- `server/package.json` - Server dependencies
- `server/tsconfig.json` - Server TypeScript config
- `shared/package.json` - Shared package config

### Core Logic

- `electron-app/src/renderer/src/App.tsx` - Main app component
- `electron-app/src/renderer/src/AppWrapper.tsx` - Auth wrapper
- `server/src/trpc.ts` - tRPC setup
- `server/src/index.ts` - App router composition

### Testing

- `server/src/services/**/*.test.ts` - Service unit tests
- `server/src/services/**/*.integration.test.ts` - Integration tests
- `electron-app/src/native-modules/**/*.test.ts` - Native module tests

## Naming Conventions

### Files

- **Components**: PascalCase (e.g., `DashboardView.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useActivityTracking.ts`)
- **Utils**: camelCase (e.g., `timeFormatting.ts`)
- **Types**: camelCase (e.g., `types.ts`)
- **Tests**: `[filename].test.ts` or `[filename].integration.test.ts`

### Directories

- **Feature directories**: camelCase (e.g., `activityList/`)
- **Component directories**: PascalCase matching component name
- **Service directories**: camelCase (e.g., `categorization/`)

### Exports

- **Components**: Named exports for hooks/utils, default for components
- **Models**: Named exports (e.g., `export { UserModel }`)
- **Services**: Named exports (e.g., `export { categorizeActivity }`)

## Where to Add New Code

### New Feature (Full Stack)

1. **Shared Types**: Add interfaces to `shared/src/types.ts`
2. **Server Router**: Create or extend router in `server/src/routers/`
3. **Server Service**: Add business logic to `server/src/services/[feature]/`
4. **Server Model**: Add schema to `server/src/models/` if needed
5. **Renderer Hook**: Create hook in `electron-app/src/renderer/src/hooks/`
6. **Renderer Component**: Create component in `electron-app/src/renderer/src/components/`
7. **Main Process**: Add IPC handlers to `electron-app/src/main/ipc.ts` if needed
8. **Preload**: Add API methods to `electron-app/src/preload/index.ts`

### New API Endpoint

- Add procedure to appropriate router in `server/src/routers/`
- Import router in `server/src/index.ts` and add to `appRouter`
- Type is automatically available to client via tRPC

### New React Component

- Create in `electron-app/src/renderer/src/components/[ComponentName]/`
- For UI primitives, add to `electron-app/src/renderer/src/components/ui/`
- For feature-specific, create subdirectory (e.g., `components/MyFeature/`)

### New Native Platform Feature (Linux)

- Add to `electron-app/src/native-modules/native-linux/`
- Create subdirectory for complex features (e.g., `native-linux/myfeature/`)
- Implement same interface as macOS version
- Add tests: `native-linux/myfeature/myFeature.test.ts`

### New Background Service (Server)

- Create in `server/src/services/[servicename]/`
- Export public API from `index.ts` or main file
- Add tests: `[service].test.ts`
- Add integration tests: `[service].integration.test.ts`

## Special Directories

### electron-app/out/

- **Purpose**: Compiled Electron output
- **Generated**: Yes (by electron-vite)
- **Committed**: No (in .gitignore)
- **Contents**: Compiled main, preload, and renderer bundles

### electron-app/dist/

- **Purpose**: Packaged application output
- **Generated**: Yes (by electron-builder)
- **Committed**: No (in .gitignore)
- **Contents**: DMG, AppImage, and other distribution files

### shared/dist/

- **Purpose**: Compiled shared package
- **Generated**: Yes (by `bun run build:shared`)
- **Committed**: No (in .gitignore)
- **Contents**: Compiled JS and type declarations

### server/dist/

- **Purpose**: Compiled server output
- **Generated**: Yes (by `tsc`)
- **Committed**: No (in .gitignore)
- **Contents**: Compiled server JS

### .worktrees/

- **Purpose**: Git worktrees for parallel feature development
- **Generated**: Yes (by git worktree commands)
- **Committed**: No (workspace isolation)
- **Branches**: Each subdirectory is a different branch checkout

---

_Structure analysis: 2026-02-19_

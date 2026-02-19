# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Multi-Process Desktop Application with tRPC API Backend

**Key Characteristics:**

- **Electron Desktop App**: Multi-process architecture with main, renderer, and preload processes
- **Client-Server Architecture**: tRPC-based API for type-safe communication between desktop app and backend
- **Monorepo Structure**: Bun workspaces with shared types package
- **Cross-Platform Native Modules**: Platform-specific implementations for macOS and Linux
- **AI-Powered Categorization**: LLM-based activity categorization with caching layer

## Layers

### Electron Main Process

- **Purpose**: Window management, native OS integration, IPC coordination, auto-updater
- **Location**: `electron-app/src/main/`
- **Contains**: Window creation, native module initialization, IPC handlers, protocol handlers
- **Depends on**: Native modules, Electron APIs
- **Used by**: Renderer process via IPC, Preload scripts

**Key Files:**

- `electron-app/src/main/index.ts` - Entry point, app lifecycle, CSP setup
- `electron-app/src/main/ipc.ts` - IPC handlers for renderer communication
- `electron-app/src/main/windows.ts` - Main and floating window creation
- `electron-app/src/main/protocol.ts` - Custom protocol handlers (cronus://)
- `electron-app/src/main/auto-updater.ts` - Electron auto-updater integration

### Electron Renderer Process

- **Purpose**: UI layer, React components, business logic hooks
- **Location**: `electron-app/src/renderer/src/`
- **Contains**: React components, hooks, contexts, utilities
- **Depends on**: Preload API, tRPC client, shared types
- **Used by**: User interactions, renders UI

**Key Files:**

- `electron-app/src/renderer/src/main.tsx` - React entry point with providers
- `electron-app/src/renderer/src/App.tsx` - Main app component with state management
- `electron-app/src/renderer/src/AppWrapper.tsx` - Auth flow wrapper
- `electron-app/src/renderer/src/utils/trpc.ts` - tRPC client with token refresh

### Electron Preload Scripts

- **Purpose**: Secure bridge between main and renderer processes
- **Location**: `electron-app/src/preload/`
- **Contains**: API exposure, type definitions
- **Depends on**: Electron APIs, shared types
- **Used by**: Renderer process

**Key File:**

- `electron-app/src/preload/index.ts` - Exposes window.api with typed methods

### Native Modules (Platform-Specific)

- **Purpose**: OS-level window tracking, screenshot capture, permissions
- **Location**: `electron-app/src/native-modules/`
- **Contains**: Platform-specific implementations for macOS and Linux
- **Depends on**: Node native addons, system APIs
- **Used by**: Main process IPC handlers

**Structure:**

- `native-windows/` - macOS implementation (Objective-C native addon)
- `native-linux/` - Linux implementation (TypeScript with external tools)

**Key Linux Components:**

- `native-linux/index.ts` - Main Linux tracker class
- `native-linux/hyprland/windowTracker.ts` - Hyprland window manager integration
- `native-linux/browser/browserTracker.ts` - Browser URL extraction
- `native-linux/screenshot/screenshotManager.ts` - Screenshot + OCR capture
- `native-linux/system/systemEventObserver.ts` - System events (lock/unlock/sleep)

### Backend Server

- **Purpose**: REST API, tRPC procedures, database operations, AI services
- **Location**: `server/src/`
- **Contains**: Routers, models, services, authentication
- **Depends on**: MongoDB, Express, tRPC, AI SDKs
- **Used by**: Electron renderer via tRPC

**Key Files:**

- `server/src/index.ts` - Express server setup, tRPC middleware, Stripe webhooks
- `server/src/trpc.ts` - tRPC router and context setup

### Routers (tRPC)

- **Purpose**: API endpoint definitions, request handling
- **Location**: `server/src/routers/`
- **Contains**: tRPC procedures for each domain

**Routers:**

- `auth.ts` - Google OAuth, token management, user onboarding
- `activeWindowEvents.ts` - Activity event CRUD, categorization
- `user.ts` - User profile, settings, preferences
- `categoryRouter.ts` - Category management
- `calendar.ts` - Google Calendar integration
- `payments.ts` - Stripe subscription management
- `suggestions.ts` - AI-generated activity suggestions
- `statistics.ts` - Analytics and reporting
- `waitlist.ts` - Waitlist management

### Models (MongoDB/Mongoose)

- **Purpose**: Database schema definitions and types
- **Location**: `server/src/models/`
- **Contains**: Mongoose schemas and interfaces

**Models:**

- `user.ts` - User accounts, OAuth tokens, settings
- `activeWindowEvent.ts` - Tracked activity events
- `category.ts` - User-defined categories for activities

### Services

- **Purpose**: Business logic, AI integration, external APIs
- **Location**: `server/src/services/`
- **Contains**: Domain-specific business logic

**Key Services:**

- `categorization/categorizationService.ts` - LLM-based activity categorization
- `categorization/history.ts` - Activity history caching
- `categorization/llm.ts` - AI SDK integration for categorization
- `questioning/questioningService.ts` - Distraction questioning logic
- `suggestions/suggestionGenerationService.ts` - AI activity suggestions
- `googleCalendar.ts` - Google Calendar API integration
- `move/updateEventCategoryInDateRange.ts` - Bulk category updates

### Shared Package

- **Purpose**: Type definitions shared between client and server
- **Location**: `shared/src/`
- **Contains**: TypeScript interfaces and constants

**Key Files:**

- `shared/src/types.ts` - Core type definitions (ActiveWindowEvent, User, Category)
- `shared/src/distractionRules.ts` - Distraction detection rules

## Data Flow

### Activity Tracking Flow:

1. **Native Detection** (Main Process)
   - Native module detects window change via OS APIs
   - Captures window title, app name, browser URL (if applicable)
   - Performs screenshot + OCR for content extraction (Linux)

2. **IPC Communication**
   - Main process sends `active-window-changed` event to renderer
   - Event contains: `ActiveWindowDetails` (ownerName, title, url, content, etc.)

3. **Event Upload** (Renderer)
   - Renderer receives window change via hook (`useActivityTracking.ts`)
   - Uploads event to server via tRPC `activeWindowEvents.create`
   - Includes screenshot S3 URL if captured

4. **Categorization** (Server)
   - Server receives event via tRPC router
   - Checks activity history cache (`checkActivityHistory`)
   - If not cached, calls LLM for categorization
   - Saves categorized event to MongoDB

5. **Response Flow**
   - Server returns categorization result
   - UI updates to show current activity and distraction status

### Authentication Flow:

1. **Google OAuth**
   - User clicks login, opens Google OAuth popup
   - Google redirects to `cronus://` protocol URL
   - Main process captures auth code via protocol handler
   - Sends code to renderer via IPC

2. **Token Exchange**
   - Renderer sends auth code to server via `auth.exchangeGoogleCode`
   - Server exchanges code for Google tokens
   - Server generates JWT access/refresh tokens
   - Returns tokens + user data

3. **Token Storage**
   - Renderer stores tokens in localStorage
   - Access token used for API requests (Bearer header)
   - Refresh token used for automatic token renewal

### Categorization Check Flow (Caching):

1. **Pre-flight Check** (Main Process)
   - Before OCR/screenshot, main process checks if activity already categorized
   - Calls renderer via IPC `check-categorization-request`

2. **Cache Lookup** (Renderer → Server)
   - Renderer calls `activeWindowEvents.checkCategorization` tRPC query
   - Server checks activity history for matching activity + current goal

3. **Cache Decision**
   - If cached: Return category + skip OCR
   - If not cached: Proceed with OCR + categorization

## Key Abstractions

### ActiveWindowDetails

- **Purpose**: Standardized window/activity information across platforms
- **Location**: `shared/src/types.ts`
- **Pattern**: Platform-native data normalized to common interface
- **Fields**: windowId, ownerName, title, url, content, type, browser, contentSource

### Native Platform Interface

- **Purpose**: Abstract OS-specific implementations
- **Pattern**: Factory pattern with platform detection
- **Implementation**: `native-windows/index.ts` (macOS), `native-linux/index.ts` (Linux)
- **Key Methods**: startActiveWindowObserver, stopActiveWindowObserver, captureScreenshotAndOCR

### Categorization Service

- **Purpose**: AI-powered activity classification
- **Location**: `server/src/services/categorization/categorizationService.ts`
- **Pattern**: Chain of responsibility (history → LLM → fallback)
- **Key Concepts**: Confidence scoring, goal-based caching, multi-purpose app handling

### tRPC Integration

- **Purpose**: Type-safe client-server communication
- **Pattern**: React Query + tRPC hooks
- **Location**: `electron-app/src/renderer/src/utils/trpc.ts`
- **Features**: Automatic token refresh, batching, error handling

## Entry Points

### Main Process Entry

- **Location**: `electron-app/src/main/index.ts`
- **Triggers**: App launch (electron .)
- **Responsibilities**:
  - Configure app identity (single instance lock)
  - Load environment variables
  - Initialize loggers
  - Setup protocol handlers
  - Create windows
  - Register IPC handlers

### Renderer Entry

- **Location**: `electron-app/src/renderer/src/main.tsx`
- **Triggers**: Main process loads renderer URL
- **Responsibilities**:
  - Initialize React
  - Setup providers (TRPC, QueryClient, Auth, Theme, Settings)
  - Load PostHog analytics
  - Render App component

### Server Entry

- **Location**: `server/src/index.ts`
- **Triggers**: bun run dev (or production start)
- **Responsibilities**:
  - Load environment variables
  - Setup Express app
  - Configure CORS and security headers
  - Register Stripe webhook handler
  - Setup tRPC middleware
  - Connect to MongoDB
  - Start HTTP server

### Shared Package

- **Location**: `shared/src/types.ts`
- **Build Output**: `shared/dist/`
- **Used By**: Both electron-app and server

## Error Handling

**Strategy:** Layered error handling with graceful degradation

**Patterns:**

- **Renderer**: Toast notifications for user-facing errors
- **tRPC**: Centralized error handling in `onError` callback
- **Auth Errors**: 401 status triggers automatic token refresh
- **Native Module Errors**: Logged to file, fallback to degraded mode
- **Server Errors**: Scrubbed with @zapier/secret-scrubber before logging

**Key Locations:**

- `electron-app/src/renderer/src/hooks/use-toast.ts` - Toast system
- `server/src/index.ts` - Express error handling middleware
- `electron-app/src/renderer/src/utils/trpc.ts` - Token refresh on 401

## Cross-Cutting Concerns

**Logging:**

- Main process: `electron-app/src/main/logging.ts` - File-based logging
- Server: `server/src/lib/logger.ts` - Structured logging

**Validation:**

- Zod schemas in tRPC procedures
- Input validation at router boundaries

**Authentication:**

- JWT access tokens (short-lived)
- JWT refresh tokens (long-lived, versioned)
- Token refresh with automatic retry

**Analytics:**

- PostHog for product analytics
- User identification on login
- Event tracking throughout app

---

_Architecture analysis: 2026-02-19_

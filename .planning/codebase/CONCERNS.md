# Codebase Concerns

**Analysis Date:** 2026-02-19

## Tech Debt

**Debug Logging in Production:**

- Issue: Extensive console.log statements throughout the codebase for debugging purposes, not suitable for production
- Files: `electron-app/src/renderer/src/hooks/useOnboardingLogicApp.ts` (110+ debug logs), `electron-app/src/native-modules/native-linux/index.ts` (15+ logs), `server/src/services/categorization/categorizationService.ts` (multiple [Cache] logs)
- Impact: Performance overhead, potential information leakage in production builds
- Fix approach: Implement a proper logging framework (electron-log is already available) with log levels, or strip debug logs in production builds

**Fallback JWT Secret:**

- Issue: JWT verification uses `'fallback-secret'` when `AUTH_SECRET` env var is missing
- Files: `server/src/lib/authUtils.ts:11`
- Impact: Critical security vulnerability - allows token forgery if env var not set
- Fix approach: Throw error and refuse to start server if `AUTH_SECRET` is not set; remove fallback completely

**Large Complex Files:**

- Issue: Several files exceed reasonable complexity thresholds with multiple responsibilities
- Files:
  - `electron-app/src/renderer/src/components/CalendarWidget/DayTimeline/DayTimeline.tsx` (668 lines) - manages timeline rendering, drag/drop, resizing, modal state, suggestions
  - `server/src/routers/activeWindowEvents.ts` (641 lines) - handles 8+ different operations
  - `electron-app/src/main/ipc.ts` (575 lines) - 40+ IPC handlers
- Impact: Difficult to test, maintain, and extend; high risk of regression bugs
- Fix approach: Extract components/hooks for UI files; split router into separate files by concern; create dedicated handler modules

**Commented-Out Code Blocks:**

- Issue: Large blocks of commented code left in production files instead of being removed
- Files: `server/src/routers/activeWindowEvents.ts:44-64` (informative title generation code), `electron-app/src/main/ipc.ts:443-552` (Sentry integration)
- Impact: Clutters codebase, creates confusion about which code is active
- Fix approach: Remove commented code; use Git history if restoration needed

**Type Safety Issues:**

- Issue: Using `@ts-ignore` to bypass TypeScript errors
- Files: `server/src/lib/authUtils.ts:23,28,35,42` - adding custom properties to Error objects
- Impact: Reduced type safety, hidden runtime errors
- Fix approach: Define proper Error subclasses with typed properties

**TODOs in Production Code:**

- Issue: TODO comments indicating incomplete features or known issues
- Files:
  - `server/src/routers/activeWindowEvents.ts:39` - "bring back informative title"
  - `server/src/services/categorization/llm.ts:133` - "could add Retry Logic with Consistency Check"
  - `server/src/services/categorization/categorizationService.ts:89` - "could add 'unclear' here"
  - `server/src/routers/categoryRouter.ts:104` - field marked optional when it shouldn't be
- Impact: Unclear feature status, potential missed edge cases
- Fix approach: Convert TODOs to tracked issues or implement the missing functionality

## Known Issues

**Concurrent LLM API Call Overload:**

- Issue: When many active window events fire simultaneously, system makes 60-90 concurrent LLM calls
- Files: `server/src/routers/activeWindowEvents.ts:40-42` (commented explanation)
- Symptoms: API rate limiting, high latency, potential cost overruns
- Workaround: Feature disabled (commented out)

**OCR Timeout Without Retry:**

- Issue: OCR operations have 60s timeout but no retry logic on failure
- Files: `electron-app/src/native-modules/native-linux/screenshot/screenshotManager.ts:29,178-181`
- Symptoms: Failed OCR on busy systems, data loss
- Workaround: Returns undefined, no user notification

**Window State Inconsistency:**

- Issue: Window recreation logic has race conditions when main window is destroyed during operations
- Files: `electron-app/src/main/ipc.ts:354-373` (recategorize view handler)
- Symptoms: Windows may not properly focus or recreate
- Workaround: SetTimeout delays as safety net

## Security Considerations

**Command Injection Risk (Linux):**

- Risk: Using execFile with dynamic arguments from external sources
- Files: `electron-app/src/native-modules/native-linux/screenshot/screenshotManager.ts` (hyprctl, grim, tesseract), `electron-app/src/native-modules/native-linux/hyprland/windowTracker.ts:272`, `electron-app/src/native-modules/native-linux/permissions/dependencyChecker.ts:100,112,208,244`
- Current mitigation: execFile (not exec) prevents shell injection, but argument validation missing
- Recommendations: Add input validation/sanitization for all arguments passed to system commands

**Exposed S3 Configuration:**

- Risk: S3 bucket name and region exposed in package.json
- Files: `electron-app/package.json:72-78`
- Current mitigation: No public access to bucket assumed
- Recommendations: Move to environment variables

**Token Validation on Deletion:**

- Risk: deleteManual endpoint verifies token but doesn't validate user owns the resource being deleted
- Files: `server/src/routers/activeWindowEvents.ts:409-429`
- Current mitigation: MongoDB query includes userId in filter
- Recommendations: Add explicit ownership verification before deletion

**Hard-coded Timeouts:**

- Risk: Arbitrary timeout values (30s, 60s) without adaptive logic
- Files: `electron-app/src/main/ipc.ts:306` (30s categorization timeout), `electron-app/src/native-modules/native-linux/screenshot/screenshotManager.ts:29` (60s OCR timeout)
- Recommendations: Make timeouts configurable based on operation complexity

## Performance Bottlenecks

**Database Query Projections Missing:**

- Problem: Some queries don't limit fields, fetching unnecessary data
- Files: `server/src/routers/activeWindowEvents.ts:170-179` (excludes content but fetches everything else), categorizationService fetches full user document
- Cause: Missing select() clauses on Mongoose queries
- Improvement path: Add targeted projections to all queries, especially high-frequency ones

**LLM Retry Missing:**

- Problem: LLM categorization calls have no retry mechanism on transient failures
- Files: `server/src/services/categorization/llm.ts:133,182-185`
- Cause: Single attempt with catch that returns null
- Improvement path: Implement exponential backoff retry (3-5 attempts) for transient errors

**Event Aggregation Without Time Limits:**

- Problem: getManualEntryHistory aggregation doesn't have time window limits
- Files: `server/src/routers/activeWindowEvents.ts:337-406`
- Cause: No timestamp filter in aggregation pipeline
- Improvement path: Add date range filter to match query

**No Request Deduplication:**

- Problem: Multiple identical categorization requests can hit LLM simultaneously
- Files: `server/src/services/categorization/categorizationService.ts`
- Cause: No in-flight request deduplication
- Improvement path: Implement request deduplication with promise caching for identical categorization checks

## Fragile Areas

**Native Module Loading:**

- Files: `electron-app/src/main/nativeModule.ts:45-65`
- Why fragile: Platform detection and module loading with try/catch fallbacks that silently fail
- Safe modification: Add explicit error handling and graceful degradation paths
- Test coverage: Limited native module testing (only 2 test files for native-linux)

**Window Lifecycle Management:**

- Files: `electron-app/src/main/ipc.ts:35-75, 354-384`, `electron-app/src/main/windows.ts`
- Why fragile: Complex state management across main/floating windows with destroy checks scattered throughout
- Safe modification: Extract window state machine with clear lifecycle states
- Test coverage: No automated tests for window management

**Global Function References:**

- Files: `electron-app/src/main/ipc.ts:94-98, 104-108, 114-118`
- Why fragile: Relies on `global.startActiveWindowObserver` and `global.stopActiveWindowObserver` being set elsewhere
- Safe modification: Use proper dependency injection or event emitter pattern
- Test coverage: None for IPC handlers

**Category Matching Logic:**

- Files: `server/src/services/categorization/categorizationService.ts:100-116`
- Why fragile: Case-insensitive string matching for category names can fail with special characters
- Safe modification: Use category IDs instead of name matching
- Test coverage: Good (multiple test files for categorization)

**Notification Timeout Handling:**

- Files: `electron-app/src/main/ipc.ts:422-484`
- Why fragile: Complex timer management with potential memory leaks if notifications aren't properly cleaned up
- Safe modification: Implement notification manager class with automatic cleanup
- Test coverage: None

## Scaling Limits

**MongoDB Aggregation:**

- Current capacity: `allowDiskUse: true` enabled on aggregation queries
- Limit: Large date ranges or high-frequency users will hit memory/processing limits
- Scaling path: Add pagination, implement read replicas for analytics queries

**Screenshot Storage:**

- Current capacity: Local filesystem storage in `userData/screenshots`
- Limit: Disk space on user machines (no cleanup strategy visible)
- Scaling path: Implement retention policies, compress old screenshots, offer cloud storage

**LLM API Rate Limits:**

- Current capacity: Relies on provider rate limits
- Limit: Concurrent users could hit rate limits quickly
- Scaling path: Implement request queue with rate limiting, add caching layer for similar categorizations

## Dependencies at Risk

**@types/mongoose (Deprecated):**

- Risk: Package is deprecated; should use mongoose's built-in TypeScript types
- Files: `server/package.json:61`
- Impact: Type conflicts, missing new mongoose features
- Migration plan: Remove @types/mongoose, use mongoose's built-in types

**moment.js (Legacy):**

- Risk: Moment is in maintenance mode, large bundle size
- Files: Root `package.json:56`, used alongside date-fns (which is preferred)
- Impact: Bundle bloat, no new features
- Migration plan: Replace all moment usage with date-fns

**Mixed ESLint Versions:**

- Risk: Root uses ESLint 8.x, electron-app uses ESLint 9.x
- Files: Root `package.json:40`, `electron-app/package.json:243`
- Impact: Inconsistent linting rules, potential config conflicts
- Migration plan: Standardize on ESLint 9.x across workspaces

**Native Module Rebuild Complexity:**

- Risk: Native modules require platform-specific rebuilds
- Files: `electron-app/package.json:37-41`
- Impact: Build complexity, CI/CD fragility
- Migration plan: Document build process, add CI verification for native modules

## Missing Critical Features

**Rate Limiting:**

- Problem: No rate limiting on tRPC endpoints
- Blocks: Protection against abuse, cost control for LLM calls
- Risk: High - API could be easily overwhelmed

**Request Validation:**

- Problem: Some inputs lack strict validation (e.g., content field length limits)
- Blocks: Data integrity, database size control
- Risk: Medium - potential for oversized documents

**Error Reporting:**

- Problem: Sentry integration is commented out
- Files: `electron-app/src/main/ipc.ts:443-552`
- Blocks: Production error monitoring
- Risk: High - flying blind on production errors

**Data Retention Policy:**

- Problem: No automated cleanup of old activity events or screenshots
- Blocks: Compliance, storage costs
- Risk: Medium - indefinite data growth

## Test Coverage Gaps

**Window Management:**

- What's not tested: Main window creation, floating window lifecycle, IPC handlers
- Files: `electron-app/src/main/windows.ts`, `electron-app/src/main/ipc.ts`
- Risk: High - core functionality untested
- Priority: High

**Screenshot/OCR Integration:**

- What's not tested: Full screenshot capture and OCR pipeline
- Files: `electron-app/src/native-modules/native-linux/screenshot/screenshotManager.ts`
- Risk: Medium - tested in isolation but not integration
- Priority: Medium

**Authentication Flow:**

- What's not tested: Token refresh, version tracking, protocol handling
- Files: `server/src/lib/authUtils.ts`, `electron-app/src/main/protocol.ts`
- Risk: High - auth is critical path
- Priority: High

**Database Aggregations:**

- What's not tested: Complex aggregations in `activeWindowEvents.ts`
- Files: `server/src/routers/activeWindowEvents.ts:337-406`
- Risk: Medium - logic errors could produce wrong analytics
- Priority: Medium

---

_Concerns audit: 2026-02-19_

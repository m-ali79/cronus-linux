# OCR Optimizations Design

**Date:** 2026-02-02  
**Status:** Validated with user (brainstorming complete)

---

## 1. Goal

- Migrate Tesseract to tessdata_fast (with fallback to best).
- Increase OCR timeout to 60s.
- Add a configurable tracker stabilization period (default 10s): no events, no OCR, no server sends during that period.
- Skip OCR when the backend says the activity is already categorized; reuse previous content only if types require it.

---

## 2. Architecture Overview

- **Tesseract:** Use `TESSDATA_PREFIX` for fast; detect fast availability, fallback to default (best). Timeout 60s, same CLI options as today (`-l eng --psm 6 quiet`).
- **Stabilization:** Centralized tracking coordinator enforces a single configurable stabilization period for all watchers (Hyprland, browser, system). No per-watcher logic.
- **Skip OCR when categorized:** Backend decides via existing history logic. New endpoint returns whether activity is categorized and optional previous content. Client asks before OCR (native → main → renderer → tRPC → backend).
- **Type safety:** If types require OCR content and we skip OCR, use backend-returned previous content when available; otherwise send without content when optional.

---

## 3. Tesseract Fast Migration with Fallback

- **Detection:** Before OCR, check that `/usr/share/tessdata_fast/` exists and contains `eng.traineddata`. If yes, use fast; else use default (best).
- **Environment:** Set `TESSDATA_PREFIX` in `execFileAsync` options `env` only when using fast. Do not set for best.
- **Logging:** Log which dataset is used (e.g. `[OCR] Using tessdata_fast` or `[OCR] Using tessdata_best (fast not available)`).
- **Errors:** If fast is selected and tesseract fails, log and return undefined; do not auto-retry with best in the same run.
- **Location:** `electron-app/src/native-modules/native-linux/screenshot/screenshotManager.ts` (`performOCR`).

---

## 4. Centralized Tracking Coordinator

- **Role:** Single gatekeeper between all watchers and the main callback. Applies rules (stabilization, “skip OCR”) in one place.
- **Stabilization:** Configurable constant `TRACKER_STABILIZATION_PERIOD_MS` (default 10000). Record `trackerStartTime` when tracking starts. For any event from any watcher, if elapsed time &lt; period, drop the event (no callback, no OCR, no send).
- **Watcher integration:** Coordinator wraps the main callback. Watchers register with the coordinator; coordinator applies checks then forwards to original callback.
- **Benefits:** One place for tracking rules; easy to add more later; watchers stay focused on their own behavior.
- **Location:** `electron-app/src/native-modules/native-linux/index.ts` (or a dedicated coordinator module used by it).

---

## 5. Backend-Based “Skip OCR” Decision

- **No client cache.** Backend is source of truth using existing `checkActivityHistory`-style logic.
- **New endpoint:** e.g. `activeWindowEvents.checkCategorization`. Input: `{ token, ownerName, type, title, url }`. Output: `{ isCategorized: boolean, categoryId?, categoryReasoning?, llmSummary?, content? }`. When categorized, optionally return last event’s `content` for type fallback.
- **Flow:** Native (before OCR) → main → renderer (has token) → tRPC `checkCategorization` → backend runs history check, returns result. Main resolves “should run OCR?”: if categorized, skip OCR and use returned content if types require; else run OCR.
- **Backend:** New procedure that verifies token, calls existing history logic, returns isCategorization + optional content. Reuse `checkActivityHistory`; extend select to include `content` when returning for client reuse.

---

## 6. Categorization Check and Type Safety

- If **categorized and content optional:** skip OCR, send event without content.
- If **categorized and content required by types:** use backend-returned previous `content` when available; otherwise send without content (types allow optional).
- **Fail-open:** If `checkCategorization` fails (network/timeout/5xx) or token missing, run OCR and send event as today.

---

## 7. Error Handling and Edge Cases

- **Stabilization:** If `trackerStartTime` missing, treat as stabilized. Single configurable constant.
- **Tesseract:** If fast path missing, use default. On OCR failure, return no content; event still sent without OCR. No retry with best in same run.
- **Backend check:** On failure or missing token, run OCR (fail-open). If backend says categorized but no content and types require it, send without content.
- **Coordinator:** Watcher callback errors: log, do not break other watchers. Checks are best-effort; do not throw.

---

## 8. Testing

- **Backend:** Test new `checkCategorization` with existing/not-existing categorized events; assert `isCategorization` and optional content.
- **Tesseract:** Unit test with fast path missing → use default and no `TESSDATA_PREFIX`. Unit test with fast path present → set `TESSDATA_PREFIX` (mock fs/execFile as needed).
- **Coordinator:** Unit test stabilization (callback not called before period; called after). Unit test skip-OCR when backend returns categorized (mock “should run OCR?” provider).
- **Integration/Manual:** Start app; during first 10s no events/OCR; after 10s events and OCR when not categorized; when categorized, backend says so and client skips OCR, event still sent with or without reused content per types.
- **Verification:** Existing server and electron-app test suites remain green.

---

## 9. Files to Touch (Summary)

- `electron-app/src/native-modules/native-linux/screenshot/screenshotManager.ts` — OCR timeout, TESSDATA_PREFIX, fast/best detection.
- `electron-app/src/native-modules/native-linux/index.ts` — Coordinator, stabilization, integration with “should run OCR?” (and optionally a separate coordinator module).
- `electron-app/src/main/` — IPC for main ↔ renderer (checkCategorization request/response).
- `electron-app/src/renderer/` — Call tRPC `checkCategorization`, respond to main.
- `server/src/routers/activeWindowEvents.ts` — New `checkCategorization` procedure.
- `server/src/services/categorization/history.ts` (or equivalent) — Optional: return `content` when needed for client.

---

_Design validated in conversation. Next per brainstorming: commit this document, then ask “Ready to set up for implementation?” and proceed with using-git-worktrees and writing-plans._

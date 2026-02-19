# External Integrations

**Analysis Date:** 2026-02-19

## APIs & External Services

**AI/LLM Services:**

- **OpenRouter** - Primary AI provider for categorization
  - SDK: `@openrouter/ai-sdk-provider` 2.1.1
  - Endpoint: OpenRouter API (api.openrouter.ai)
  - Auth: `OPENROUTER_API_KEY` env var
  - Default model: `arcee-ai/trinity-mini:free`
  - Supports 300+ models with configurable provider options
  - File: `server/src/services/categorization/llmProvider.ts`

- **Google AI (Gemini)** - Fallback AI provider
  - SDK: `@ai-sdk/google` 3.0.17
  - Auth: `GOOGLE_GENERATIVE_AI_API_KEY` env var
  - Default model: `gemini-1.5-flash`
  - Configurable via `AI_PROVIDER` env var (`openrouter` | `google`)

**Payment Processing:**

- **Stripe** - Subscription and payment management
  - SDK: `stripe` 17.7.0
  - API Version: `2025-02-24.acacia`
  - Auth: `STRIPE_SECRET_KEY` env var
  - Webhook secret: `STRIPE_WEBHOOK_SECRET`
  - Price ID: `STRIPE_PRICE_ID`
  - File: `server/src/routers/payments.ts`, `server/src/index.ts` (webhooks)
  - Webhook endpoint: `POST /api/webhooks/stripe`
  - Events handled: `checkout.session.completed`, `customer.subscription.deleted`

**Email Marketing:**

- **Loops** - Transactional and marketing emails
  - SDK: `loops` 5.0.1
  - Auth: `LOOPS_API_KEY` env var
  - Usage: User onboarding, churn prevention emails
  - Files: `server/src/routers/auth.ts`, `server/src/scripts/churnPrevention.ts`

**Product Analytics:**

- **PostHog** - User behavior analytics
  - SDK: `posthog-js` 1.249.5 (client-side)
  - Host: `https://us.i.posthog.com`
  - Auth: `REACT_APP_PUBLIC_POSTHOG_KEY` env var
  - Files: `electron-app/src/renderer/src/hooks/useOnboardingCompletion.ts`, `useManualEntry.ts`

## Data Storage

**Databases:**

- **MongoDB** - Primary database
  - Type: Document database
  - Connection: `MONGODB_URI` env var (default: `mongodb://localhost:27017/whatdidyougetdonetoday`)
  - ODM: Mongoose 8.1.1
  - Models: `UserModel`, `ActiveWindowEventModel`, `CategoryModel`
  - Files: `server/src/models/`

**File Storage:**

- **AWS S3** - Screenshot storage
  - SDK: `@aws-sdk/client-s3` 3.504.0, `@aws-sdk/s3-request-presigner` 3.504.0
  - Usage: Screenshot uploads via pre-signed URLs
  - Note: S3 SDK present but server-side S3 implementation not found in current codebase
  - Client upload: `electron-app/src/renderer/src/lib/s3Uploader.ts`
  - Model field: `screenshotS3Url` in `ActiveWindowEvent`

**Caching:**

- None detected - No Redis or similar caching layer

## Authentication & Identity

**Auth Provider:**

- **Google OAuth 2.0** - Primary authentication method
  - SDK: `google-auth-library` 9.15.1
  - Client IDs: Separate for web (`GOOGLE_CLIENT_ID`) and desktop (`GOOGLE_CLIENT_ID` in electron-app)
  - Client Secret: `GOOGLE_CLIENT_SECRET`
  - Protocol handler: `cronus://` (custom protocol for Electron auth callback)
  - JWT tokens for session management (custom implementation)
  - Files: `server/src/routers/auth.ts`

**Token Management:**

- Custom JWT implementation
  - Secret: `AUTH_SECRET` env var
  - Library: `jsonwebtoken` 9.0.2
  - Token verification with version tracking for app updates
  - File: `server/src/lib/authUtils.ts`

## Monitoring & Observability

**Error Tracking:**

- None detected - No Sentry, Rollbar, or similar

**Logs:**

- **electron-log** 5.4.1 - Electron app logging
- Console logging throughout server
- **@zapier/secret-scrubber** - Log sanitization to remove sensitive values

**Analytics:**

- PostHog (mentioned above)

## CI/CD & Deployment

**Hosting:**

- **AWS S3** - Auto-update distribution
  - Bucket: `cronusnewupdates`
  - Region: `us-east-1`
  - Configured in `electron-app/package.json` build.publish
- **Render** (mentioned in CORS origins) - Possible server hosting

**CI Pipeline:**

- None detected - No GitHub Actions, Travis, etc. in repo

**Distribution:**

- **electron-builder** - App packaging
  - Platforms: macOS (ARM64, x64), Windows, Linux
  - macOS: DMG with notarization
  - Windows: NSIS
  - Linux: AppImage, pacman, tar.gz
  - Auto-updater: `electron-updater` 6.6.2

## Environment Configuration

**Required env vars:**
| Variable | Location | Purpose |
|----------|----------|---------|
| `MONGODB_URI` | server | Database connection |
| `AUTH_SECRET` | server | JWT signing |
| `GOOGLE_CLIENT_ID` | server, electron-app | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | server | OAuth client secret |
| `STRIPE_SECRET_KEY` | server | Stripe API access |
| `STRIPE_WEBHOOK_SECRET` | server | Stripe webhook verification |
| `STRIPE_PRICE_ID` | server | Subscription price ID |
| `OPENROUTER_API_KEY` | server | OpenRouter AI access |
| `GOOGLE_GENERATIVE_AI_API_KEY` | server | Google AI fallback |
| `LOOPS_API_KEY` | server | Email service |
| `REACT_APP_SERVER_URL` | electron-app | Backend URL |
| `REACT_APP_PUBLIC_POSTHOG_KEY` | electron-app | Analytics key |
| `REACT_APP_PUBLIC_POSTHOG_HOST` | electron-app | Analytics host |
| `APPLE_ID` | electron-app | Apple notarization |
| `APPLE_TEAM_ID` | electron-app | Apple team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | electron-app | Apple app password |

**Secrets location:**

- `.env` files (gitignored)
- Environment variables in production
- No detected secrets manager (no AWS Secrets Manager, Doppler, etc.)

## Webhooks & Callbacks

**Incoming:**

- **Stripe Webhooks** - Payment events
  - Endpoint: `POST /api/webhooks/stripe`
  - Events: `checkout.session.completed`, `customer.subscription.deleted`
  - Verification: Stripe signature header
  - File: `server/src/index.ts`

**Outgoing:**

- **Google Calendar API** - Calendar event retrieval
  - SDK: `googleapis` 150.0.1
  - Auth: OAuth2 with user tokens
  - File: `server/src/services/googleCalendar.ts`
  - Used in: `server/src/routers/calendar.ts`, `server/src/routers/suggestions.ts`

- **IP Geolocation** - EU detection for compliance
  - Endpoint: `http://ip-api.com/json/{ip}?fields=countryCode`
  - Usage: GDPR compliance check in auth flow
  - File: `server/src/routers/auth.ts`

## Third-Party Data

**External Data Sources:**

- **Google Calendar** - User calendar events
  - Read-only access for productivity analysis
  - Stored: Event summaries, times, attendees

**Browser Integration:**

- Native messaging host for browser extension (directory: `electron-app/native-host/`)
- Supported browsers: Chrome, Safari, Arc, Firefox, Brave, Helium (via `browser` field)

## Security Integrations

**Log Sanitization:**

- **@zapier/secret-scrubber** 1.1.2
  - Removes sensitive values from logs
  - Filters out emails specifically for client-side error reporting
  - File: `server/src/index.ts`

**macOS Security:**

- Apple notarization for macOS distribution
- Hardened runtime enabled
- Custom entitlements: `build/entitlements.mac.plist`

---

_Integration audit: 2026-02-19_

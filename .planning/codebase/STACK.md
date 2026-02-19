# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**

- TypeScript (ES2017+) - All source code across monorepo

**Secondary:**

- C++ (Node.js native addons) - Window tracking native modules (`electron-app/src/native-modules/native-windows/`)
- JavaScript - Configuration files (tailwind.config.js, postcss.config.js)

## Runtime

**Environment:**

- Node.js via Bun runtime
- Bun version: 1.2.5 (from `@types/bun`)

**Package Manager:**

- Bun (evidenced by `bun.lockb`, `bun --filter` commands)
- Lockfile: `bun.lockb` present

**Monorepo Structure:**

- Workspace-based monorepo with packages: `electron-app`, `server`, `shared`
- Cross-package references via `workspace:*` protocol

## Frameworks

**Core:**

- **Electron** 35.1.5 - Desktop application framework
  - Main process: Node.js/Bun environment
  - Renderer process: React 19.1.0
  - Preload scripts for secure IPC
- **Express** 4.18.2 - HTTP server framework (`server/src/index.ts`)
- **tRPC** 10.45.2 - Type-safe API layer between client and server
  - Server: `@trpc/server` with Express adapter
  - Client: `@trpc/client` + `@trpc/react-query`
- **React** 19.1.0 - UI framework
  - React DOM 19.1.0
  - React Router DOM 7.6.1 for navigation

**Database & ORM:**

- **Mongoose** 8.1.1 - MongoDB ODM (`server/src/models/`)
- MongoDB as primary database (via `MONGODB_URI` env var)

**Testing:**

- **Bun Test Runner** - Built-in test framework
  - Test files: `*.test.ts`, `*.spec.ts`
  - Memory server for MongoDB tests: `mongodb-memory-server` 10.1.4

**Build/Dev:**

- **Vite** 6.2.6 - Build tool (via electron-vite)
- **electron-vite** 3.1.0 - Vite plugin for Electron apps (`electron-app/electron.vite.config.ts`)
- **TypeScript** 5.8.3 - Type checking and compilation
- **electron-builder** 26.0.12 - App packaging and distribution
- **electron-rebuild** 3.2.9 - Native module rebuilding

**Styling:**

- **Tailwind CSS** 3.4.3 - Utility-first CSS (`electron-app/tailwind.config.js`)
- **PostCSS** 8.4.38 - CSS processing (`electron-app/postcss.config.js`)
- **Radix UI** - Headless UI components (`@radix-ui/react-*` packages)
- **Lucide React** - Icon library

## Key Dependencies

**Critical:**

- **Zod** 3.24.1 - Runtime type validation and schema definition
- **JSON Web Token** (jsonwebtoken) 9.0.2 - Authentication tokens
- **Google Auth Library** 9.15.1 - OAuth2 authentication
- **Stripe** 17.7.0 - Payment processing
- **AI SDK** (@ai-sdk/google 3.0.17) - Google AI integration
- **OpenRouter AI SDK Provider** 2.1.1 - Multi-model AI access
- **Loops** 5.0.1 - Email automation/marketing
- **PostHog** 1.249.5 - Product analytics

**Infrastructure:**

- **AWS SDK** v2 (2.1692.0) and v3 (@aws-sdk/client-s3, @aws-sdk/s3-request-presigner) - S3 storage
- **Mongoose** 8.1.1 - MongoDB ODM
- **CORS** 2.8.5 - Cross-origin resource sharing
- **dotenv** 17.2.1 - Environment variable loading

**UI Components:**

- **Framer Motion** 12.12.2 - Animations
- **Recharts** 3.0.2 - Data visualization
- **date-fns** 4.1.0 - Date manipulation
- **Dayjs** 1.11.13 - Lightweight date library
- **React Hook Form** with Zod resolvers - Form management

**Development Tools:**

- **ESLint** 9.24.0 (electron-app), 8.56.0 (root) - Linting
  - Config: `electron-app/eslint.config.mjs`, `.eslintrc` (root)
  - Plugins: TypeScript, React, React Hooks, React Refresh, Prettier
- **Prettier** 3.5.3 - Code formatting
  - Config: `.prettierrc` (single quotes, 100 print width, 2-space tabs)
- **@zapier/secret-scrubber** 1.1.2 - Log sanitization

## Configuration

**Environment:**

- Root: `.env` files not in repo (gitignored)
- Server: `server/.env`, `server/.env.example`
- Electron: `electron-app/.env.development`, `electron-app/.env.production`, `electron-app/.env.example`

**Key Configs Required:**

- `MONGODB_URI` - Database connection
- `AUTH_SECRET` - JWT signing
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - OAuth
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` - Payments
- `OPENROUTER_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` - AI features
- `LOOPS_API_KEY` - Email automation
- `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD` - macOS notarization

**Build:**

- TypeScript configs:
  - `electron-app/tsconfig.json`, `electron-app/tsconfig.node.json`, `electron-app/tsconfig.web.json`
  - `server/tsconfig.json` (composite project, references `shared`)
  - `shared/tsconfig.json` (composite, produces declarations)
- Vite config: `electron-app/electron.vite.config.ts`
  - Separate builds for main, preload, renderer processes
  - Aliases: `@renderer`, `src`

## Platform Requirements

**Development:**

- Bun runtime installed
- MongoDB instance (local or cloud)
- Node.js native build tools (for native modules)
- macOS (for iOS/macOS development features)

**Production:**

- MongoDB database
- Node.js/Bun server environment
- S3-compatible storage for screenshots
- Stripe account for payments
- Apple Developer account (for macOS distribution)
- AWS S3 bucket for auto-updates (`cronusnewupdates`, us-east-1)

**Deployment Targets:**

- Desktop: macOS (ARM64, x64), Windows, Linux (AppImage, pacman, tar.gz)
- Server: Node.js/Bun environment (can run on Render, AWS, etc.)
- Auto-updates via S3 + electron-updater

---

_Stack analysis: 2026-02-19_

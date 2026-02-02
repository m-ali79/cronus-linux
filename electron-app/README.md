# electron-app

An Electron application with React and TypeScript

![Cronus icon](./resources/icon.png)

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ bun install
```

### Development

```bash
$ bun run dev
```

### Build

```bash
# For macOS
$ bun run build:mac:open:signed

## Project Structure Overview

```

electron-app/
├── out/ # Build output (Main, Preload, Renderer JS files)
├── resources/ # Static assets (e.g., icons)
├── src/
│ ├── main/ # Main process source (Node.js environment)
│ │ └── index.ts
│ ├── preload/ # Preload script source
│ │ ├── index.ts
│ │ └── index.d.ts # Type definitions for preload API
│ ├── renderer/ # Renderer process source (React UI)
│ │ ├── src/
│ │ │ ├── App.tsx
│ │ │ ├── main.tsx # React entry point
│ │ │ ├── env.d.ts # Renderer environment types
│ │ │ └── components/ # UI components (example)
│ │ └── index.html # HTML entry for renderer
│ └── native-modules/ # Native Node.js addons
│ └── native-windows/ # Example native module
│ ├── macos/ # macOS specific native code
│ │ ├── activeWindowObserver.h
│ │ ├── activeWindowObserver.mm
│ │ └── nativeWindows.mm
│ ├── binding.gyp # node-gyp build configuration
│ ├── index.ts # TypeScript wrapper for native module
│ └── package.json # for the native module
├── .eslintrc.js (or .mjs, eslint.config.mjs) # ESLint configuration
├── .gitignore
├── package.json
├── tsconfig.json # Base TypeScript configuration (if present)
├── tsconfig.node.json # TypeScript config for main/preload
├── tsconfig.web.json # TypeScript config for renderer
└── README.md

## Electron Architecture Gotcha: webContents Lifecycle

**Important**: When implementing macOS-style window hiding (to keep tracking alive), be aware that `BrowserWindow` and `webContents` have **independent lifecycles**.

```typescript
// ❌ WRONG - Only checks if window exists
if (mainWindow && !mainWindow.isDestroyed()) {
  mainWindow.webContents.send('message', data) // Can crash with "Object has been destroyed"
}

// ✅ CORRECT - Checks both window AND renderer
if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
  mainWindow.webContents.send('message', data) // Safe
}
```

**Why this happens**: When you hide a window (instead of destroying it), Electron may destroy the `webContents` (renderer process) for memory management while keeping the `BrowserWindow` container alive. Always check both states before IPC communication.

This pattern is used throughout our codebase in:

- `src/main/ipc.ts` - All IPC handlers
- `src/main/index.ts` - Active window tracking
- `src/main/auto-updater.ts` - Update status messages

## Building the Electron App

The primary method for creating local builds is through `electron-builder`, which ensures that all packaging, code signing, and entitlements are handled correctly and consistently.

### Local Production Build (for Testing)

To create a full, signed production-ready build on your local machine (including a `.dmg` installer) without publishing it, run:

```bash
bun run build:mac:electron-builder
```

This command is the recommended way to create a local build for testing and verification. It builds, signs, and packages the application, producing a `.dmg` file in the `dist/` directory.

### Development Utility Scripts

**Full Installation Cleanup**

If you need to reset your local environment, you can use the cleanup script. This is useful when debugging permissions or first-launch issues.

```bash
bun run clean:cronus-installation
```

This script will:

- Delete `Cronus.app` from your `/Applications` folder.
- Reset macOS permissions (TCC) for Apple Events and Accessibility for the app.

### Environment Variables

The Electron app uses different environment variables for development and production builds. These are managed via `.env` files in the `electron-app` directory:

- **`.env.development`**: Used when running the app locally with `bun run dev`.
- **`.env.production`**: Used for packaged builds created with `electron-builder`.

These files are loaded at runtime by the main process (`src/main/index.ts`). Create these files from the example below and populate them with the necessary service keys.

### .env.example

```
# Example environment variables
GOOGLE_CLIENT_ID="your-google-client-id"
CLIENT_URL="your-client-url"
...
```

## Over-the-air (OTA) updates via S3

Cronus delivers automatic updates from the public S3 bucket `cronusnewupdates` (region `us-east-1`). Every packaged copy of the app checks this bucket on startup and whenever the user clicks _Settings → Check for Updates_.

### Release workflow

The release process involves two main steps: updating the version and running the release script.

1.  **Bump the version** in [electron-app/package.json](./package.json) (e.g. `"1.0.8" → "1.0.9"`).

2.  **Run the release script from the `electron-app` directory:**

    **Important:** The command below contains placeholder AWS credentials. Before running, you must replace `YOUR_AWS_ACCESS_KEY_ID` and `YOUR_AWS_SECRET_ACCESS_KEY` with valid credentials that have permission to publish to the S3 bucket.

    Copy and paste the entire command below into your terminal. It chains all the necessary steps to clean, prepare, and publish a new release for all architectures.

    ```bash
    bun run clean:cronus-installation && \
    export NODE_ENV=production && \
    cp -r ../node_modules/electron-updater node_modules/ && \
    cp -r ../node_modules/fs-extra node_modules/ && \
    cp -r ../node_modules/jsonfile node_modules/ && \
    cp -r ../node_modules/debug node_modules/ && \
    set -a && source .env.production && set +a && \
    AWS_REGION="us-east-1" \
    S3_BUCKET_NAME="cronusnewupdates" \
    AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET_ACCESS_KEY" \
    AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE=1 \
    bun run publish:with-links:all
    ```

    This command handles the entire release process:
    - Cleans any previous local installation.
    - Sets up the production environment and dependencies.
    - Builds the application.
    - Packages the `.dmg` and `.zip` files.
    - Publishes the new version and its `latest-mac.yml` file to S3.
    - Updates the `Cronus-latest-[arch].dmg` and `Cronus-latest-[arch].zip` files in S3 to point to the new version.

If you just need to create a local build for testing without uploading, use `bun run build:for-publish:arm64` or `bun run build:for-publish:x64`.

### Permanent Download Links

The release script automatically handles updating the permanent download links. You can find them at:

- **Latest ARM64 DMG:** `https://cronusnewupdates.s3.amazonaws.com/Cronus-latest-arm64.dmg`
- **Latest ARM64 ZIP:** `https://cronusnewupdates.s3.amazonaws.com/Cronus-latest-arm64.zip`
- **Latest Intel DMG:** `https://cronusnewupdates.s3.amazonaws.com/Cronus-latest-x64.dmg`
- **Latest Intel ZIP:** `https://cronusnewupdates.s3.amazonaws.com/Cronus-latest-x64.zip`

The website can use these fixed URLs and never needs updating - they will automatically serve the newest build.

### Troubleshooting quick reference

| Symptom                            | Likely fix                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `AccessControlListNotSupported`    | Enable ACLs on the bucket _or_ add `"acl": null` to the `publish` block in `package.json`.  |
| No toast after "Check for updates" | Ensure the installed build has a lower version than the one referenced in `latest-mac.yml`. |
| Still nothing happens              | Open DevTools → Console, look for `update-status` events to see errors or states.           |

### Common build issues

**Missing module errors during runtime:**
If you get "Cannot find module" errors (like `debug`, `electron-updater`, etc.), running the consolidated release script above should fix the issue by copying the required dependencies from the workspace root. This happens because electron-builder doesn't always properly resolve workspace dependencies.

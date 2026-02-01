# Cronus

**Understand where your time went and reduce distractions.**

![Cronus in action](./electron-app/resources/action.gif)

A modern AI-powered time tracking and productivity application.

## Features

- **Automatic Time Tracking**: Native window and app tracking across macOS, Windows, and Linux
- **AI-Powered Categorization**: Intelligent activity categorization and insights
- **Distraction Management**: Real-time distraction detection and prevention
- **Calendar Integration**: Seamless integration with Google Calendar and other services
- **Analytics**: Comprehensive dashboards and reporting

## Tech Stack

### Core Technologies

- 🏃 **Bun** - Fast JavaScript runtime and package manager
- 🔄 **Monorepo Structure** with workspaces (client, server, shared)
- ⚛️ **React** + **TypeScript** for the frontend
- 🎨 **Tailwind CSS** + **Shadcn UI** for styling
- 🔐 **tRPC** for type-safe API calls
- 💳 **Stripe** for payments
- 📊 **MongoDB** for database
- ⚡ **Next.js** for the marketing website

### Key Libraries

- **Craco** - Used for customizing Create React App configuration without ejecting
- **Lucide React** - Icon library
- **React Router** - Client-side routing
- **React Query** - Data fetching and caching
- **Zod** - Schema validation

## 📁 Project Structure

```
.
├── client/                 # React admin frontend
│   ├── src/               # Source code
│   ├── craco.config.js    # Craco configuration for CRA customization
│   └── package.json       # Frontend dependencies
├── nextjs-client/         # Next.js marketing website
│   ├── app/              # Next.js 13+ app directory
│   ├── components/       # Reusable components
│   ├── modules/          # Page-specific modules
│   └── public/           # Static assets
├── server/                # Backend server
│   ├── src/              # Source code
│   └── package.json      # Backend dependencies
├── shared/               # Shared types and utilities
│   ├── types.ts         # Shared TypeScript types
│   └── package.json     # Shared package configuration
└── electron-app/         # Electron desktop application
    ├── src/              # Source code (main, preload, renderer)
    └── package.json      # Electron app dependencies
```

## ��️ Getting Started

### Prerequisites

- Bun (latest version)
- MongoDB
- Stripe account (for payments)
- Google OAuth credentials

### Environment Variables

Contact the project maintainer to get the required environment variables. You'll need to set up:

- MongoDB connection string
- Stripe API keys
- Google OAuth credentials
- Other service-specific keys

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-username/whatdidyougetdonetoday-ai.git
cd whatdidyougetdonetoday-ai
```

2. **Install dependencies**

```bash
bun install
```

3. **Start the development servers**

For the React admin frontend:

```bash
cd client
bun dev
```

For the backend:

```bash
cd server
bun dev
```

### Running the Server and Electron App Together

To run both the backend server and the Electron application concurrently for development:

```bash
bun run dev:electron-server
```

## Monorepo Structure

This project uses a monorepo structure with four main packages:

### Next.js Client (`/nextjs-client`)

- Marketing website and landing pages
- Built with Next.js 13+ App Router
- Tailwind CSS and Shadcn UI components
- Blog system with markdown support
- SEO optimized

### Admin Client (`/client`)

- Built with Create React App + Craco
- Uses Tailwind CSS for styling
- Implements Shadcn UI components
- Handles all admin logic and UI

### Server (`/server`)

- Bun-based backend
- tRPC for type-safe API endpoints
- MongoDB integration with Mongoose
- Handles authentication and payments
- AI categorization services

### Shared (`/shared`)

- Contains shared TypeScript types
- Used by both client and server
- Ensures type safety across the stack

### Electron App (`/electron-app`)

- A desktop application built with Electron, React, and TypeScript
- Native system integration for automatic time tracking
- Cross-platform support (macOS, Windows, Linux)
- For more details, see the [Electron App README](./electron-app/README.md)

## Deployment

The application is set up as a monorepo with separate deployment targets:

- **Next.js Website**: Deploy the `nextjs-client` directory to Vercel or similar
- **Admin Client**: Deploy the `client` directory to a static hosting service
- **Backend**: Deploy the `server` directory to a Node.js hosting service
- **Desktop App**: Build and distribute via GitHub Releases or similar

## 📱 Building and Running the Electron App

The Electron app uses [Electron Builder](https://www.electron.build/) for packaging and distribution. For detailed instructions on building, code signing, and publishing new releases, please refer to the dedicated README in the Electron app directory:

[**➡️ Electron App Build and Release Guide (`electron-app/README.md`)**](./electron-app/README.md)

This guide covers:

- Development builds
- Production builds (signed `.app` and `.dmg`)
- Code signing setup
- Publishing releases with OTA updates to S3

## �� Debugging

### Viewing Logs on macOS

The native Objective-C modules use Apple's Unified Logging system (`os_log`). To view these logs for debugging purposes:

1. Open the **Console.app** on macOS.
2. Start the Cronus application.
3. In the search bar of the Console app, enter the following filter and press Enter:
   ```
   subsystem:com.cronus.app
   ```
   This will display all log messages generated by the native modules, which is essential for diagnosing issues related to window tracking and native code execution.

## Logos and Assets

- App Icon is in [electron-app/build/icon.png](electron-app/build/icon.png)
- Icon for Website is in [client/src/assets/icon.png](client/src/assets/icon.png)
- Icon for Electron App (runtime) is in [electron-app/resources/icon.png](electron-app/resources/icon.png)

## Contributing

This is an open source project! Contributions are welcome. Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

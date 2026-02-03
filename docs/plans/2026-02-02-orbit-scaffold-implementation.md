# Orbit Project Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete directory structure and basic configuration for the Orbit project, including frontend, backend, and shared code packages.

**Architecture:** Orbit is a self-contained monorepo using Bun workspaces to manage three sub-packages (web/server/shared). The frontend uses React + Vite 8, the backend uses Elysia + Bun, and the database uses SQLite + Drizzle ORM.

**Tech Stack:**

- Frontend: React 18, Vite 8, Tailwind CSS 4, tailwind-variants, react-router, lucide-react
- Backend: Elysia, Bun, TypeBox, Drizzle ORM, SQLite, PM2
- Shared: TypeScript, TypeBox

---

## Task 1: Create Orbit Root Directory and Basic Configuration

**Files:**

- Create: `apps/orbit/package.json`
- Create: `apps/orbit/tsconfig.json`
- Create: `apps/orbit/.gitignore`
- Create: `apps/orbit/.env.example`
- Create: `apps/orbit/README.md`

**Step 1: Create orbit root directory**

```bash
mkdir -p apps/orbit
```

**Step 2: Create workspace root package.json**

Write to `apps/orbit/package.json`:

```json
{
  "name": "@orbit/root",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["web", "server", "shared"],
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "dev:web": "bun run --filter @orbit/web dev",
    "dev:server": "bun run --filter @orbit/server dev",
    "build": "bun run --filter '*' build",
    "build:web": "bun run --filter @orbit/web build",
    "build:server": "bun run --filter @orbit/server build",
    "daemon:start": "cd server && pm2 start ecosystem.config.cjs",
    "daemon:start:dev": "cd server && pm2 start ecosystem.config.cjs --env development",
    "daemon:stop": "pm2 stop orbit-server",
    "daemon:restart": "pm2 restart orbit-server",
    "daemon:logs": "pm2 logs orbit-server",
    "daemon:status": "pm2 status orbit-server",
    "db:migrate": "bun run --filter @orbit/server db:migrate",
    "db:studio": "bun run --filter @orbit/server db:studio",
    "db:generate": "bun run --filter @orbit/server db:generate",
    "type-check": "bun run --filter '*' type-check",
    "lint": "bun run --filter '*' lint",
    "test": "bun run --filter '*' test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

**Step 3: Create basic tsconfig.json**

Write to `apps/orbit/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Step 4: Create .gitignore**

Write to `apps/orbit/.gitignore`:

```
# Dependencies
node_modules/
bun.lock

# Build outputs
dist/
build/
.vite/

# Database
*.db
*.db-shm
*.db-wal
data/*.db

# Logs
logs/
*.log

# Environment
.env
.env.local
.env.*.local

# PM2
.pm2/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db
```

**Step 5: Create .env.example**

Write to `apps/orbit/.env.example`:

```
# Server Configuration
NODE_ENV=development
PORT=3001

# Database
DATABASE_PATH=./data/orbit.dev.db

# API Configuration
API_BASE_URL=http://localhost:3001
```

**Step 6: Create README.md**

Write to `apps/orbit/README.md`:

```markdown
# Orbit

Personal AI assistant and agent workspace platform.

## Tech Stack

**Frontend**

- React 18+
- Vite 8
- Tailwind CSS 4
- react-router
- lucide-react

**Backend**

- Elysia
- Bun
- Drizzle ORM
- SQLite
- PM2

## Development

\`\`\`bash

# Install dependencies

bun install

# Start development environment

bun dev

# Start individually

bun dev:web # Frontend (http://localhost:3000)
bun dev:server # Backend (http://localhost:3001)
\`\`\`

## Database

\`\`\`bash
bun db:generate # Generate migration
bun db:migrate # Run migration
bun db:studio # Open Drizzle Studio
\`\`\`

## Deployment

\`\`\`bash
bun build
bun daemon:start
\`\`\`
```

**Step 7: Commit**

```bash
git add apps/orbit/
git commit -m "feat(orbit): initialize orbit workspace root"
```

---

## Task 2: Create Shared Package Structure and Configuration

**Files:**

- Create: `apps/orbit/shared/package.json`
- Create: `apps/orbit/shared/tsconfig.json`
- Create: `apps/orbit/shared/src/types/index.ts`
- Create: `apps/orbit/shared/src/types/models/index.ts`
- Create: `apps/orbit/shared/src/types/api/index.ts`
- Create: `apps/orbit/shared/src/schemas/index.ts`
- Create: `apps/orbit/shared/src/constants/index.ts`
- Create: `apps/orbit/shared/src/constants/routes.ts`
- Create: `apps/orbit/shared/src/constants/config.ts`
- Create: `apps/orbit/shared/src/utils/index.ts`
- Create: `apps/orbit/shared/src/index.ts`

**Step 1: Create directory structure**

```bash
mkdir -p apps/orbit/shared/src/{types/{models,api},schemas,constants,utils}
```

**Step 2: Create shared package.json**

Write to `apps/orbit/shared/package.json`:

```json
{
  "name": "@orbit/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./constants": "./src/constants/index.ts",
    "./utils": "./src/utils/index.ts"
  },
  "scripts": {
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@sinclair/typebox": "^0.32.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

**Step 3: Create shared tsconfig.json**

Write to `apps/orbit/shared/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create types entry files**

Write to `apps/orbit/shared/src/types/models/index.ts`:

```typescript
// Data models - to be implemented
export {}
```

Write to `apps/orbit/shared/src/types/api/index.ts`:

```typescript
// API request/response types - to be implemented
export {}
```

Write to `apps/orbit/shared/src/types/index.ts`:

```typescript
export * from './models/index.js'
export * from './api/index.js'
```

**Step 5: Create schemas entry file**

Write to `apps/orbit/shared/src/schemas/index.ts`:

```typescript
// TypeBox schemas - to be implemented
export {}
```

**Step 6: Create constants files**

Write to `apps/orbit/shared/src/constants/routes.ts`:

```typescript
/**
 * API route constants
 */
export const API_ROUTES = {
  BASE: '/api',
  HEALTH: '/health',
} as const
```

Write to `apps/orbit/shared/src/constants/config.ts`:

```typescript
/**
 * Configuration constants
 */
export const DEFAULT_PORT = 3001
export const DEFAULT_HOST = 'localhost'
```

Write to `apps/orbit/shared/src/constants/index.ts`:

```typescript
export * from './routes.js'
export * from './config.js'
```

**Step 7: Create utils entry file**

Write to `apps/orbit/shared/src/utils/index.ts`:

```typescript
// Pure utility functions - to be implemented
export {}
```

**Step 8: Create main entry file**

Write to `apps/orbit/shared/src/index.ts`:

```typescript
export * from './types/index.js'
export * from './schemas/index.js'
export * from './constants/index.js'
export * from './utils/index.js'
```

**Step 9: Verify type checking**

```bash
cd apps/orbit/shared
bun install
bun type-check
```

Expected: No error output

**Step 10: Commit**

```bash
git add apps/orbit/shared/
git commit -m "feat(orbit): create shared package structure"
```

---

## Task 3: Create Server Package Structure and Configuration

**Files:**

- Create: `apps/orbit/server/package.json`
- Create: `apps/orbit/server/tsconfig.json`
- Create: `apps/orbit/server/drizzle.config.ts`
- Create: `apps/orbit/server/ecosystem.config.cjs`
- Create: `apps/orbit/server/src/index.ts`
- Create: `apps/orbit/server/src/app.ts`
- Create: `apps/orbit/server/src/core/config/env.ts`
- Create: `apps/orbit/server/src/core/logger/index.ts`
- Create: `apps/orbit/server/src/core/db/index.ts`
- Create: `apps/orbit/server/src/core/db/client.ts`
- Create: `apps/orbit/server/src/plugins/cors.ts`
- Create: `apps/orbit/server/src/plugins/swagger.ts`
- Create: `apps/orbit/server/drizzle/schema/index.ts`
- Create: `apps/orbit/server/data/.gitkeep`
- Create: `apps/orbit/server/logs/.gitkeep`

**Step 1: Create directory structure**

```bash
mkdir -p apps/orbit/server/src/{core/{config,logger,db},plugins,modules}
mkdir -p apps/orbit/server/drizzle/{schema,migrations}
mkdir -p apps/orbit/server/{data,logs}
```

**Step 2: Create server package.json**

Write to `apps/orbit/server/package.json`:

```json
{
  "name": "@orbit/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun src/index.ts",
    "type-check": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@orbit/shared": "workspace:*",
    "elysia": "^1.1.29",
    "@elysiajs/cors": "^1.1.1",
    "@elysiajs/swagger": "^1.1.5",
    "drizzle-orm": "^0.36.4",
    "better-sqlite3": "^11.8.1"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/better-sqlite3": "^7.6.12",
    "drizzle-kit": "^0.28.1",
    "typescript": "^5"
  }
}
```

**Step 3: Create server tsconfig.json**

Write to `apps/orbit/server/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["bun-types"],
    "paths": {
      "@orbit/shared": ["../shared/src/index.ts"],
      "@orbit/shared/*": ["../shared/src/*"]
    }
  },
  "include": ["src/**/*", "drizzle/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create environment configuration**

Write to `apps/orbit/server/src/core/config/env.ts`:

```typescript
import { DEFAULT_PORT } from '@orbit/shared/constants'

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || String(DEFAULT_PORT), 10),
  DATABASE_PATH: process.env.DATABASE_PATH || './data/orbit.dev.db',
} as const

export const isDevelopment = env.NODE_ENV === 'development'
export const isProduction = env.NODE_ENV === 'production'
```

**Step 5: Create Logger**

Write to `apps/orbit/server/src/core/logger/index.ts`:

```typescript
type LogLevel = 'info' | 'warn' | 'error' | 'debug'

class Logger {
  private log(level: LogLevel, message: string, ...args: unknown[]) {
    const timestamp = new Date().toISOString()
    console[level](`[${timestamp}] [${level.toUpperCase()}]`, message, ...args)
  }

  info(message: string, ...args: unknown[]) {
    this.log('info', message, ...args)
  }

  warn(message: string, ...args: unknown[]) {
    this.log('warn', message, ...args)
  }

  error(message: string, ...args: unknown[]) {
    this.log('error', message, ...args)
  }

  debug(message: string, ...args: unknown[]) {
    this.log('debug', message, ...args)
  }
}

export const logger = new Logger()
```

**Step 6: Create database configuration**

Write to `apps/orbit/server/src/core/db/client.ts`:

```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { env } from '../config/env.js'
import * as schema from '../../../drizzle/schema/index.js'

const sqlite = new Database(env.DATABASE_PATH)
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite, { schema })
```

Write to `apps/orbit/server/src/core/db/index.ts`:

```typescript
export { db } from './client.js'
```

Write to `apps/orbit/server/drizzle/schema/index.ts`:

```typescript
// Database schema - to be implemented
export {}
```

**Step 7: Create Drizzle configuration**

Write to `apps/orbit/server/drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './drizzle/schema/*.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/orbit.dev.db',
  },
})
```

**Step 8: Create CORS plugin**

Write to `apps/orbit/server/src/plugins/cors.ts`:

```typescript
import { cors } from '@elysiajs/cors'
import { isDevelopment } from '../core/config/env.js'

export const corsPlugin = cors({
  origin: isDevelopment ? '*' : ['http://localhost:3000'],
  credentials: true,
})
```

**Step 9: Create Swagger plugin**

Write to `apps/orbit/server/src/plugins/swagger.ts`:

```typescript
import { swagger } from '@elysiajs/swagger'
import { isDevelopment } from '../core/config/env.js'

export const swaggerPlugin = isDevelopment
  ? swagger({
      documentation: {
        info: {
          title: 'Orbit API',
          version: '0.1.0',
          description: 'Orbit API Documentation',
        },
        tags: [{ name: 'Health', description: 'Health check endpoints' }],
      },
    })
  : null
```

**Step 10: Create Elysia App**

Write to `apps/orbit/server/src/app.ts`:

```typescript
import { Elysia } from 'elysia'
import { API_ROUTES } from '@orbit/shared/constants'
import { corsPlugin } from './plugins/cors.js'
import { swaggerPlugin } from './plugins/swagger.js'
import { logger } from './core/logger/index.js'

export const app = new Elysia()
  .use(corsPlugin)
  .use(swaggerPlugin ?? (() => {}))
  .get(API_ROUTES.HEALTH, () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })
  .onStart(() => {
    logger.info('Server started')
  })
  .onStop(() => {
    logger.info('Server stopped')
  })
```

**Step 11: Create service entry point**

Write to `apps/orbit/server/src/index.ts`:

```typescript
import { app } from './app.js'
import { env } from './core/config/env.js'
import { logger } from './core/logger/index.js'

app.listen(env.PORT)

logger.info(`🚀 Server running at http://localhost:${env.PORT}`)
logger.info(`📚 API docs at http://localhost:${env.PORT}/swagger`)
```

**Step 12: Create PM2 configuration**

Write to `apps/orbit/server/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'orbit-server',
      script: 'bun',
      args: 'run src/index.ts',
      cwd: __dirname,
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        DATABASE_PATH: './data/orbit.db',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: '3001',
        DATABASE_PATH: './data/orbit.dev.db',
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
}
```

**Step 13: Create .gitkeep files**

```bash
touch apps/orbit/server/data/.gitkeep
touch apps/orbit/server/logs/.gitkeep
```

**Step 14: Install dependencies and verify**

```bash
cd apps/orbit/server
bun install
bun type-check
```

Expected: No error output

**Step 15: Start server to verify**

```bash
bun dev
```

Expected:

- Output "🚀 Server running at http://localhost:3001"
- Can access http://localhost:3001/health
- Can access http://localhost:3001/swagger

Press Ctrl+C to stop the server

**Step 16: Commit**

```bash
git add apps/orbit/server/
git commit -m "feat(orbit): create server package with Elysia setup"
```

---

## Task 4: Create Web Package Structure and Configuration

**Files:**

- Create: `apps/orbit/web/package.json`
- Create: `apps/orbit/web/tsconfig.json`
- Create: `apps/orbit/web/tsconfig.app.json`
- Create: `apps/orbit/web/tsconfig.node.json`
- Create: `apps/orbit/web/vite.config.ts`
- Create: `apps/orbit/web/tailwind.config.ts`
- Create: `apps/orbit/web/postcss.config.js`
- Create: `apps/orbit/web/index.html`
- Create: `apps/orbit/web/src/main.tsx`
- Create: `apps/orbit/web/src/app/App.tsx`
- Create: `apps/orbit/web/src/app/routes/index.tsx`
- Create: `apps/orbit/web/src/shared/styles/index.css`
- Create: `apps/orbit/web/src/vite-env.d.ts`
- Create: `apps/orbit/web/public/.gitkeep`

**Step 1: Create directory structure**

```bash
mkdir -p apps/orbit/web/src/{app/{routes,providers},features/{chat,agents,sessions,sources},shared/{components,hooks,utils,styles}}
mkdir -p apps/orbit/web/public
```

**Step 2: Create web package.json**

Write to `apps/orbit/web/package.json`:

```json
{
  "name": "@orbit/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "@orbit/shared": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router": "^7.1.3",
    "lucide-react": "^0.468.0",
    "tailwind-variants": "^0.2.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5",
    "vite": "^6.0.7",
    "tailwindcss": "^4.0.0",
    "postcss": "^8.4.49",
    "@tailwindcss/vite": "^4.0.0"
  }
}
```

**Step 3: Create TypeScript configuration**

Write to `apps/orbit/web/tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

Write to `apps/orbit/web/tsconfig.app.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@orbit/shared": ["../shared/src/index.ts"],
      "@orbit/shared/*": ["../shared/src/*"]
    }
  },
  "include": ["src"]
}
```

Write to `apps/orbit/web/tsconfig.node.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 4: Create Vite configuration**

Write to `apps/orbit/web/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
```

**Step 5: Create Tailwind configuration**

Write to `apps/orbit/web/tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
} satisfies Config
```

Write to `apps/orbit/web/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
  },
}
```

**Step 6: Create global styles**

Write to `apps/orbit/web/src/shared/styles/index.css`:

```css
@import 'tailwindcss';
```

**Step 7: Create Vite environment type definitions**

Write to `apps/orbit/web/src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />
```

**Step 8: Create routes**

Write to `apps/orbit/web/src/app/routes/index.tsx`:

```tsx
import { createBrowserRouter } from 'react-router'

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Orbit</h1>
          <p className="mt-2 text-gray-600">Personal AI Assistant</p>
        </div>
      </div>
    ),
  },
])

export default router
```

**Step 9: Create App component**

Write to `apps/orbit/web/src/app/App.tsx`:

```tsx
import { RouterProvider } from 'react-router'
import router from './routes'

export function App() {
  return <RouterProvider router={router} />
}
```

**Step 10: Create application entry point**

Write to `apps/orbit/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './shared/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Step 11: Create HTML template**

Write to `apps/orbit/web/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Orbit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 12: Create .gitkeep**

```bash
touch apps/orbit/web/public/.gitkeep
```

**Step 13: Install dependencies and verify**

```bash
cd apps/orbit/web
bun install
bun type-check
```

Expected: No error output

**Step 14: Start development server to verify**

```bash
bun dev
```

Expected:

- Output "VITE v6.x.x ready in xxx ms"
- Output "Local: http://localhost:3000/"
- Visit http://localhost:3000 to see "Orbit" title

Press Ctrl+C to stop the server

**Step 15: Commit**

```bash
git add apps/orbit/web/
git commit -m "feat(orbit): create web package with React and Vite setup"
```

---

## Task 5: Create Feature Module Placeholders

**Files:**

- Create: `apps/orbit/web/src/features/chat/index.ts`
- Create: `apps/orbit/web/src/features/agents/index.ts`
- Create: `apps/orbit/web/src/features/sessions/index.ts`
- Create: `apps/orbit/web/src/features/sources/index.ts`
- Create: `apps/orbit/server/src/modules/ai/index.ts`
- Create: `apps/orbit/server/src/modules/agents/index.ts`
- Create: `apps/orbit/server/src/modules/chat/index.ts`
- Create: `apps/orbit/server/src/modules/channels/index.ts`
- Create: `apps/orbit/server/src/modules/sources/index.ts`
- Create: `apps/orbit/server/src/modules/sessions/index.ts`

**Step 1: Create frontend feature module placeholders**

```bash
echo "// Chat feature - to be implemented\nexport {};" > apps/orbit/web/src/features/chat/index.ts
echo "// Agents feature - to be implemented\nexport {};" > apps/orbit/web/src/features/agents/index.ts
echo "// Sessions feature - to be implemented\nexport {};" > apps/orbit/web/src/features/sessions/index.ts
echo "// Sources feature - to be implemented\nexport {};" > apps/orbit/web/src/features/sources/index.ts
```

**Step 2: Create backend feature module placeholders**

```bash
echo "// AI module - to be implemented\nexport {};" > apps/orbit/server/src/modules/ai/index.ts
echo "// Agents module - to be implemented\nexport {};" > apps/orbit/server/src/modules/agents/index.ts
echo "// Chat module - to be implemented\nexport {};" > apps/orbit/server/src/modules/chat/index.ts
echo "// Channels module - to be implemented\nexport {};" > apps/orbit/server/src/modules/channels/index.ts
echo "// Sources module - to be implemented\nexport {};" > apps/orbit/server/src/modules/sources/index.ts
echo "// Sessions module - to be implemented\nexport {};" > apps/orbit/server/src/modules/sessions/index.ts
```

**Step 3: Verify file creation**

```bash
ls -la apps/orbit/web/src/features/*/index.ts
ls -la apps/orbit/server/src/modules/*/index.ts
```

Expected: All placeholder files have been created

**Step 4: Commit**

```bash
git add apps/orbit/
git commit -m "feat(orbit): add feature module placeholders"
```

---

## Task 6: Verify Overall Workflow

**Step 1: Install all dependencies from root directory**

```bash
cd apps/orbit
bun install
```

Expected:

- Successfully install all workspace dependencies
- No error output

**Step 2: Run type checking**

```bash
bun type-check
```

Expected: Type checking passes for all packages

**Step 3: Start backend server**

In the first terminal:

```bash
bun dev:server
```

Expected: Server starts at http://localhost:3001

**Step 4: Start frontend development server**

In the second terminal:

```bash
cd apps/orbit
bun dev:web
```

Expected: Frontend starts at http://localhost:3000

**Step 5: Verify API proxy**

Visit:

- http://localhost:3000 - Frontend page
- http://localhost:3001/health - Backend health check
- http://localhost:3001/swagger - API documentation

Expected: All endpoints respond normally

**Step 6: Stop all services**

Press Ctrl+C to stop both terminal services

**Step 7: Test PM2 daemon**

```bash
cd apps/orbit
bun daemon:start:dev
```

Expected: PM2 successfully starts orbit-server

```bash
bun daemon:status
```

Expected: Shows orbit-server status as online

```bash
curl http://localhost:3001/health
```

Expected: Returns `{"status":"ok","timestamp":"..."}`

```bash
bun daemon:stop
```

Expected: Successfully stops the service

**Step 8: Build verification**

```bash
bun build
```

Expected:

- web build succeeds, generates dist directory
- server build succeeds, generates dist directory
- No error output

**Step 9: Final commit**

```bash
git add apps/orbit/
git commit -m "feat(orbit): verify complete workflow and build process"
```

---

## Completion Criteria

✅ All directory structures created according to design document
✅ All configuration files properly configured
✅ Shared package type checking passes
✅ Server can start and respond to health checks
✅ Web can start and display page
✅ API proxy works correctly
✅ PM2 daemon can start and stop normally
✅ Build process has no errors
✅ All changes committed to git

## Next Steps

After scaffold setup is complete, specific features can be implemented:

1. Define database schema (agents, sessions, messages)
2. Implement AI/LLM integration module
3. Implement chat functionality
4. Implement Agent management
5. Implement session management
6. Add tests

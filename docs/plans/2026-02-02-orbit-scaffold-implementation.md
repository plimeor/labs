# Orbit 项目骨架搭建实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 搭建 Orbit 项目的完整目录结构和基础配置，包括前端、后端和共享代码包。

**Architecture:** Orbit 是一个自包含的 monorepo，使用 Bun workspaces 管理三个子包（web/server/shared）。前端使用 React + Vite 8，后端使用 Elysia + Bun，数据库使用 SQLite + Drizzle ORM。

**Tech Stack:**
- Frontend: React 18, Vite 8, Tailwind CSS 4, tailwind-variants, react-router, lucide-react
- Backend: Elysia, Bun, TypeBox, Drizzle ORM, SQLite, PM2
- Shared: TypeScript, TypeBox

---

## Task 1: 创建 Orbit 根目录和基础配置

**Files:**
- Create: `apps/orbit/package.json`
- Create: `apps/orbit/tsconfig.json`
- Create: `apps/orbit/.gitignore`
- Create: `apps/orbit/.env.example`
- Create: `apps/orbit/README.md`

**Step 1: 创建 orbit 根目录**

```bash
mkdir -p apps/orbit
```

**Step 2: 创建 workspace root package.json**

在 `apps/orbit/package.json` 写入:

```json
{
  "name": "@orbit/root",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "web",
    "server",
    "shared"
  ],
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

**Step 3: 创建基础 tsconfig.json**

在 `apps/orbit/tsconfig.json` 写入:

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

**Step 4: 创建 .gitignore**

在 `apps/orbit/.gitignore` 写入:

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

**Step 5: 创建 .env.example**

在 `apps/orbit/.env.example` 写入:

```
# Server Configuration
NODE_ENV=development
PORT=3001

# Database
DATABASE_PATH=./data/orbit.dev.db

# API Configuration
API_BASE_URL=http://localhost:3001
```

**Step 6: 创建 README.md**

在 `apps/orbit/README.md` 写入:

```markdown
# Orbit

个人 AI 助手和 Agent 工作平台。

## 技术栈

**前端**
- React 18+
- Vite 8
- Tailwind CSS 4
- react-router
- lucide-react

**后端**
- Elysia
- Bun
- Drizzle ORM
- SQLite
- PM2

## 开发

\`\`\`bash
# 安装依赖
bun install

# 启动开发环境
bun dev

# 独立启动
bun dev:web      # 前端 (http://localhost:3000)
bun dev:server   # 后端 (http://localhost:3001)
\`\`\`

## 数据库

\`\`\`bash
bun db:generate  # 生成 migration
bun db:migrate   # 执行 migration
bun db:studio    # 打开 Drizzle Studio
\`\`\`

## 部署

\`\`\`bash
bun build
bun daemon:start
\`\`\`
```

**Step 7: 提交**

```bash
git add apps/orbit/
git commit -m "feat(orbit): initialize orbit workspace root"
```

---

## Task 2: 创建 Shared 包结构和配置

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

**Step 1: 创建目录结构**

```bash
mkdir -p apps/orbit/shared/src/{types/{models,api},schemas,constants,utils}
```

**Step 2: 创建 shared package.json**

在 `apps/orbit/shared/package.json` 写入:

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

**Step 3: 创建 shared tsconfig.json**

在 `apps/orbit/shared/tsconfig.json` 写入:

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

**Step 4: 创建 types 入口文件**

在 `apps/orbit/shared/src/types/models/index.ts` 写入:

```typescript
// Data models - to be implemented
export {};
```

在 `apps/orbit/shared/src/types/api/index.ts` 写入:

```typescript
// API request/response types - to be implemented
export {};
```

在 `apps/orbit/shared/src/types/index.ts` 写入:

```typescript
export * from './models/index.js';
export * from './api/index.js';
```

**Step 5: 创建 schemas 入口文件**

在 `apps/orbit/shared/src/schemas/index.ts` 写入:

```typescript
// TypeBox schemas - to be implemented
export {};
```

**Step 6: 创建 constants 文件**

在 `apps/orbit/shared/src/constants/routes.ts` 写入:

```typescript
/**
 * API route constants
 */
export const API_ROUTES = {
  BASE: '/api',
  HEALTH: '/health',
} as const;
```

在 `apps/orbit/shared/src/constants/config.ts` 写入:

```typescript
/**
 * Configuration constants
 */
export const DEFAULT_PORT = 3001;
export const DEFAULT_HOST = 'localhost';
```

在 `apps/orbit/shared/src/constants/index.ts` 写入:

```typescript
export * from './routes.js';
export * from './config.js';
```

**Step 7: 创建 utils 入口文件**

在 `apps/orbit/shared/src/utils/index.ts` 写入:

```typescript
// Pure utility functions - to be implemented
export {};
```

**Step 8: 创建主入口文件**

在 `apps/orbit/shared/src/index.ts` 写入:

```typescript
export * from './types/index.js';
export * from './schemas/index.js';
export * from './constants/index.js';
export * from './utils/index.js';
```

**Step 9: 验证类型检查**

```bash
cd apps/orbit/shared
bun install
bun type-check
```

Expected: 无错误输出

**Step 10: 提交**

```bash
git add apps/orbit/shared/
git commit -m "feat(orbit): create shared package structure"
```

---

## Task 3: 创建 Server 包结构和配置

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

**Step 1: 创建目录结构**

```bash
mkdir -p apps/orbit/server/src/{core/{config,logger,db},plugins,modules}
mkdir -p apps/orbit/server/drizzle/{schema,migrations}
mkdir -p apps/orbit/server/{data,logs}
```

**Step 2: 创建 server package.json**

在 `apps/orbit/server/package.json` 写入:

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

**Step 3: 创建 server tsconfig.json**

在 `apps/orbit/server/tsconfig.json` 写入:

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

**Step 4: 创建环境配置**

在 `apps/orbit/server/src/core/config/env.ts` 写入:

```typescript
import { DEFAULT_PORT } from '@orbit/shared/constants';

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || String(DEFAULT_PORT), 10),
  DATABASE_PATH: process.env.DATABASE_PATH || './data/orbit.dev.db',
} as const;

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
```

**Step 5: 创建 Logger**

在 `apps/orbit/server/src/core/logger/index.ts` 写入:

```typescript
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private log(level: LogLevel, message: string, ...args: unknown[]) {
    const timestamp = new Date().toISOString();
    console[level](`[${timestamp}] [${level.toUpperCase()}]`, message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]) {
    this.log('error', message, ...args);
  }

  debug(message: string, ...args: unknown[]) {
    this.log('debug', message, ...args);
  }
}

export const logger = new Logger();
```

**Step 6: 创建数据库配置**

在 `apps/orbit/server/src/core/db/client.ts` 写入:

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { env } from '../config/env.js';
import * as schema from '../../../drizzle/schema/index.js';

const sqlite = new Database(env.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
```

在 `apps/orbit/server/src/core/db/index.ts` 写入:

```typescript
export { db } from './client.js';
```

在 `apps/orbit/server/drizzle/schema/index.ts` 写入:

```typescript
// Database schema - to be implemented
export {};
```

**Step 7: 创建 Drizzle 配置**

在 `apps/orbit/server/drizzle.config.ts` 写入:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './drizzle/schema/*.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/orbit.dev.db',
  },
});
```

**Step 8: 创建 CORS 插件**

在 `apps/orbit/server/src/plugins/cors.ts` 写入:

```typescript
import { cors } from '@elysiajs/cors';
import { isDevelopment } from '../core/config/env.js';

export const corsPlugin = cors({
  origin: isDevelopment ? '*' : ['http://localhost:3000'],
  credentials: true,
});
```

**Step 9: 创建 Swagger 插件**

在 `apps/orbit/server/src/plugins/swagger.ts` 写入:

```typescript
import { swagger } from '@elysiajs/swagger';
import { isDevelopment } from '../core/config/env.js';

export const swaggerPlugin = isDevelopment
  ? swagger({
      documentation: {
        info: {
          title: 'Orbit API',
          version: '0.1.0',
          description: 'Orbit API Documentation',
        },
        tags: [
          { name: 'Health', description: 'Health check endpoints' },
        ],
      },
    })
  : null;
```

**Step 10: 创建 Elysia App**

在 `apps/orbit/server/src/app.ts` 写入:

```typescript
import { Elysia } from 'elysia';
import { API_ROUTES } from '@orbit/shared/constants';
import { corsPlugin } from './plugins/cors.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { logger } from './core/logger/index.js';

export const app = new Elysia()
  .use(corsPlugin)
  .use(swaggerPlugin ?? (() => {}))
  .get(API_ROUTES.HEALTH, () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  })
  .onStart(() => {
    logger.info('Server started');
  })
  .onStop(() => {
    logger.info('Server stopped');
  });
```

**Step 11: 创建服务入口**

在 `apps/orbit/server/src/index.ts` 写入:

```typescript
import { app } from './app.js';
import { env } from './core/config/env.js';
import { logger } from './core/logger/index.js';

app.listen(env.PORT);

logger.info(`🚀 Server running at http://localhost:${env.PORT}`);
logger.info(`📚 API docs at http://localhost:${env.PORT}/swagger`);
```

**Step 12: 创建 PM2 配置**

在 `apps/orbit/server/ecosystem.config.cjs` 写入:

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
};
```

**Step 13: 创建 .gitkeep 文件**

```bash
touch apps/orbit/server/data/.gitkeep
touch apps/orbit/server/logs/.gitkeep
```

**Step 14: 安装依赖并验证**

```bash
cd apps/orbit/server
bun install
bun type-check
```

Expected: 无错误输出

**Step 15: 启动服务器验证**

```bash
bun dev
```

Expected:
- 输出 "🚀 Server running at http://localhost:3001"
- 可以访问 http://localhost:3001/health
- 可以访问 http://localhost:3001/swagger

按 Ctrl+C 停止服务器

**Step 16: 提交**

```bash
git add apps/orbit/server/
git commit -m "feat(orbit): create server package with Elysia setup"
```

---

## Task 4: 创建 Web 包结构和配置

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

**Step 1: 创建目录结构**

```bash
mkdir -p apps/orbit/web/src/{app/{routes,providers},features/{chat,agents,sessions,sources},shared/{components,hooks,utils,styles}}
mkdir -p apps/orbit/web/public
```

**Step 2: 创建 web package.json**

在 `apps/orbit/web/package.json` 写入:

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

**Step 3: 创建 TypeScript 配置**

在 `apps/orbit/web/tsconfig.json` 写入:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

在 `apps/orbit/web/tsconfig.app.json` 写入:

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

在 `apps/orbit/web/tsconfig.node.json` 写入:

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

**Step 4: 创建 Vite 配置**

在 `apps/orbit/web/vite.config.ts` 写入:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

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
});
```

**Step 5: 创建 Tailwind 配置**

在 `apps/orbit/web/tailwind.config.ts` 写入:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
} satisfies Config;
```

在 `apps/orbit/web/postcss.config.js` 写入:

```javascript
export default {
  plugins: {
    tailwindcss: {},
  },
};
```

**Step 6: 创建全局样式**

在 `apps/orbit/web/src/shared/styles/index.css` 写入:

```css
@import "tailwindcss";
```

**Step 7: 创建 Vite 环境类型定义**

在 `apps/orbit/web/src/vite-env.d.ts` 写入:

```typescript
/// <reference types="vite/client" />
```

**Step 8: 创建路由**

在 `apps/orbit/web/src/app/routes/index.tsx` 写入:

```tsx
import { createBrowserRouter } from 'react-router';

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
]);

export default router;
```

**Step 9: 创建 App 组件**

在 `apps/orbit/web/src/app/App.tsx` 写入:

```tsx
import { RouterProvider } from 'react-router';
import router from './routes';

export function App() {
  return <RouterProvider router={router} />;
}
```

**Step 10: 创建应用入口**

在 `apps/orbit/web/src/main.tsx` 写入:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './shared/styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**Step 11: 创建 HTML 模板**

在 `apps/orbit/web/index.html` 写入:

```html
<!DOCTYPE html>
<html lang="zh-CN">
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

**Step 12: 创建 .gitkeep**

```bash
touch apps/orbit/web/public/.gitkeep
```

**Step 13: 安装依赖并验证**

```bash
cd apps/orbit/web
bun install
bun type-check
```

Expected: 无错误输出

**Step 14: 启动开发服务器验证**

```bash
bun dev
```

Expected:
- 输出 "VITE v6.x.x ready in xxx ms"
- 输出 "Local: http://localhost:3000/"
- 访问 http://localhost:3000 看到 "Orbit" 标题

按 Ctrl+C 停止服务器

**Step 15: 提交**

```bash
git add apps/orbit/web/
git commit -m "feat(orbit): create web package with React and Vite setup"
```

---

## Task 5: 创建功能模块占位符

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

**Step 1: 创建前端功能模块占位符**

```bash
echo "// Chat feature - to be implemented\nexport {};" > apps/orbit/web/src/features/chat/index.ts
echo "// Agents feature - to be implemented\nexport {};" > apps/orbit/web/src/features/agents/index.ts
echo "// Sessions feature - to be implemented\nexport {};" > apps/orbit/web/src/features/sessions/index.ts
echo "// Sources feature - to be implemented\nexport {};" > apps/orbit/web/src/features/sources/index.ts
```

**Step 2: 创建后端功能模块占位符**

```bash
echo "// AI module - to be implemented\nexport {};" > apps/orbit/server/src/modules/ai/index.ts
echo "// Agents module - to be implemented\nexport {};" > apps/orbit/server/src/modules/agents/index.ts
echo "// Chat module - to be implemented\nexport {};" > apps/orbit/server/src/modules/chat/index.ts
echo "// Channels module - to be implemented\nexport {};" > apps/orbit/server/src/modules/channels/index.ts
echo "// Sources module - to be implemented\nexport {};" > apps/orbit/server/src/modules/sources/index.ts
echo "// Sessions module - to be implemented\nexport {};" > apps/orbit/server/src/modules/sessions/index.ts
```

**Step 3: 验证文件创建**

```bash
ls -la apps/orbit/web/src/features/*/index.ts
ls -la apps/orbit/server/src/modules/*/index.ts
```

Expected: 所有占位符文件都已创建

**Step 4: 提交**

```bash
git add apps/orbit/
git commit -m "feat(orbit): add feature module placeholders"
```

---

## Task 6: 验证整体工作流

**Step 1: 从根目录安装所有依赖**

```bash
cd apps/orbit
bun install
```

Expected:
- 成功安装所有 workspace 的依赖
- 无错误输出

**Step 2: 运行类型检查**

```bash
bun type-check
```

Expected: 所有包的类型检查通过

**Step 3: 启动后端服务器**

在第一个终端:

```bash
bun dev:server
```

Expected: 服务器在 http://localhost:3001 启动

**Step 4: 启动前端开发服务器**

在第二个终端:

```bash
cd apps/orbit
bun dev:web
```

Expected: 前端在 http://localhost:3000 启动

**Step 5: 验证 API 代理**

访问:
- http://localhost:3000 - 前端页面
- http://localhost:3001/health - 后端健康检查
- http://localhost:3001/swagger - API 文档

Expected: 所有端点正常响应

**Step 6: 停止所有服务**

按 Ctrl+C 停止两个终端的服务

**Step 7: 测试 PM2 守护进程**

```bash
cd apps/orbit
bun daemon:start:dev
```

Expected: PM2 成功启动 orbit-server

```bash
bun daemon:status
```

Expected: 显示 orbit-server 状态为 online

```bash
curl http://localhost:3001/health
```

Expected: 返回 `{"status":"ok","timestamp":"..."}`

```bash
bun daemon:stop
```

Expected: 成功停止服务

**Step 8: 构建验证**

```bash
bun build
```

Expected:
- web 构建成功，生成 dist 目录
- server 构建成功，生成 dist 目录
- 无错误输出

**Step 9: 最终提交**

```bash
git add apps/orbit/
git commit -m "feat(orbit): verify complete workflow and build process"
```

---

## 完成标准

✅ 所有目录结构按设计文档创建
✅ 所有配置文件正确配置
✅ Shared 包类型检查通过
✅ Server 可以启动并响应健康检查
✅ Web 可以启动并显示页面
✅ API 代理工作正常
✅ PM2 守护进程可以正常启动和停止
✅ 构建流程无错误
✅ 所有更改已提交到 git

## 后续步骤

骨架搭建完成后，可以开始实现具体功能：
1. 定义数据库 schema（agents, sessions, messages）
2. 实现 AI/LLM 集成模块
3. 实现聊天功能
4. 实现 Agent 管理
5. 实现会话管理
6. 添加测试

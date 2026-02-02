# Orbit 项目目录结构设计

**日期**: 2026-02-02
**状态**: 已验证
**版本**: v1.0

## 项目概述

Orbit 是一个结合个人 AI 助手（参考 openclaw）和 agent 工作平台（参考 craft-agents-oss）功能的项目，采用前后端分离架构。

### 核心功能
- 个人 AI 助手能力（多渠道交互、语音支持等）
- Agent 工作平台（多任务、API/服务连接、会话共享等）
- 本地数据存储（SQLite）
- 文档导向的工作流

### 技术栈

**前端**
- React 18+
- Vite 8
- Tailwind CSS 4
- tailwind-variants
- react-router
- lucide-react

**后端**
- Elysia (Web framework)
- Bun (Runtime)
- TypeBox (Schema validation)
- Drizzle ORM (Database)
- SQLite (Database)
- PM2 (Process management)

## 整体架构

### Monorepo 组织原则

基于以下考虑：
1. Labs 是个人 monorepo，未来会有完全不同领域的项目
2. 不同项目可能使用不同技术栈
3. 遵循 YAGNI 原则，避免过早抽象

**决策**: Orbit 采用自包含结构，内部使用 Bun workspaces 管理子包。

### 顶层结构

```
labs/
├── apps/
│   ├── playground/
│   └── orbit/                    # Orbit 项目（自包含 monorepo）
│       ├── web/                  # React SPA
│       ├── server/               # Elysia 守护进程
│       ├── shared/               # 前后端共享代码
│       ├── package.json          # Workspace root
│       ├── tsconfig.json         # 基础配置
│       ├── .env.example
│       ├── .gitignore
│       └── README.md
├── packages/                     # 保留为空，待真正需要跨项目复用时使用
├── tools/
│   └── icloud-git-sync/
├── package.json                  # Labs root
└── ...
```

## Orbit 内部结构

### Web 前端

```
apps/orbit/web/
├── src/
│   ├── app/                      # 应用层
│   │   ├── routes/               # react-router 路由定义
│   │   ├── providers/            # Context providers
│   │   └── App.tsx               # 根组件
│   ├── features/                 # 功能模块（按业务领域）
│   │   ├── chat/                 # 聊天/对话功能
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── api/
│   │   ├── agents/               # Agent 管理
│   │   ├── sessions/             # 会话管理
│   │   └── sources/              # 数据源/连接管理
│   ├── shared/                   # 前端内部共享代码
│   │   ├── components/           # 通用 UI 组件
│   │   ├── hooks/                # 通用 React hooks
│   │   ├── utils/                # 工具函数
│   │   └── styles/               # 全局样式、Tailwind 配置
│   ├── main.tsx                  # 应用入口
│   └── vite-env.d.ts
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

**设计理由**:
- **Feature-based 结构**: 按业务功能组织而非技术层次，便于功能独立开发
- **features/** 目录对应核心业务能力（chat, agents, sessions, sources）
- **shared/** 存放前端内部可复用的 UI 组件和工具

**包名**: `@orbit/web`

### Server 后端

```
apps/orbit/server/
├── src/
│   ├── index.ts                  # 服务入口
│   ├── app.ts                    # Elysia app 配置
│   ├── modules/                  # 功能模块
│   │   ├── ai/                   # AI/LLM 集成
│   │   │   ├── providers/        # 不同 LLM provider
│   │   │   ├── chat.controller.ts
│   │   │   └── chat.service.ts
│   │   ├── agents/               # Agent 引擎
│   │   │   ├── agent.controller.ts
│   │   │   ├── agent.service.ts
│   │   │   └── registry.ts
│   │   ├── chat/                 # 聊天/对话
│   │   ├── channels/             # 多渠道支持（参考 openclaw）
│   │   ├── sources/              # 数据源/API 连接
│   │   └── sessions/             # 会话管理
│   ├── core/                     # 核心基础设施
│   │   ├── db/                   # 数据库连接、migrations
│   │   │   ├── index.ts
│   │   │   └── client.ts
│   │   ├── config/               # 配置管理
│   │   │   └── env.ts
│   │   └── logger/               # 日志
│   │       └── index.ts
│   └── plugins/                  # Elysia 插件
│       ├── cors.ts
│       └── swagger.ts
├── drizzle/                      # Drizzle ORM
│   ├── schema/                   # 数据库 schema
│   │   ├── agents.ts
│   │   ├── sessions.ts
│   │   ├── messages.ts
│   │   └── index.ts
│   └── migrations/               # 迁移文件
├── data/                         # SQLite 数据库文件
│   └── .gitkeep
├── logs/                         # PM2 日志
│   └── .gitkeep
├── ecosystem.config.cjs          # PM2 配置
├── drizzle.config.ts             # Drizzle 配置
├── tsconfig.json
└── package.json
```

**设计理由**:
- **modules/** 按业务领域组织，与前端 features 对应
- **core/** 存放基础设施代码（数据库、配置、日志）
- **Drizzle ORM**: 类型安全且轻量，适合 SQLite
- **PM2**: 守护进程管理，参考 icloud-git-sync 方案

**包名**: `@orbit/server`

### Shared 共享代码

```
apps/orbit/shared/
├── src/
│   ├── types/                    # TypeScript 类型定义
│   │   ├── api/                  # API 请求/响应类型
│   │   │   ├── chat.ts
│   │   │   ├── agent.ts
│   │   │   └── index.ts
│   │   ├── models/               # 数据模型
│   │   │   ├── agent.ts
│   │   │   ├── session.ts
│   │   │   ├── message.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── schemas/                  # TypeBox schema（运行时验证）
│   │   ├── agent.schema.ts
│   │   ├── session.schema.ts
│   │   └── index.ts
│   ├── constants/                # 常量定义
│   │   ├── routes.ts             # API 路由路径
│   │   ├── config.ts             # 配置常量
│   │   └── index.ts
│   └── utils/                    # 纯函数工具（前后端通用）
│       ├── validators.ts
│       ├── formatters.ts
│       └── index.ts
├── tsconfig.json
└── package.json
```

**设计理由**:
- **types/** 确保前后端类型一致，避免 API 契约不同步
- **schemas/** 使用 TypeBox 进行运行时验证（Elysia 内置）
- **constants/** 共享 API 路由、配置等常量
- **utils/** 只放纯函数，确保可在前后端环境运行

**约束**: 不放置 React 组件或 Node.js 特定代码

**包名**: `@orbit/shared`

## 配置文件

### Orbit Workspace Root

**package.json** (`apps/orbit/package.json`):

```json
{
  "name": "@orbit/root",
  "version": "0.1.0",
  "private": true,
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
  }
}
```

### PM2 配置

**ecosystem.config.cjs** (`apps/orbit/server/ecosystem.config.cjs`):

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

## 开发工作流

### 本地开发

1. **启动开发环境**:
   ```bash
   cd apps/orbit
   bun install
   bun dev  # 同时启动 web 和 server
   ```

2. **独立启动**:
   ```bash
   bun dev:web     # 只启动前端 (http://localhost:3000)
   bun dev:server  # 只启动后端 (http://localhost:3001)
   ```

3. **数据库操作**:
   ```bash
   bun db:generate  # 生成 migration
   bun db:migrate   # 执行 migration
   bun db:studio    # 打开 Drizzle Studio
   ```

### 生产部署

1. **构建**:
   ```bash
   bun build
   ```

2. **启动守护进程**:
   ```bash
   bun daemon:start       # 生产模式
   bun daemon:start:dev   # 开发模式
   ```

3. **进程管理**:
   ```bash
   bun daemon:stop      # 停止
   bun daemon:restart   # 重启
   bun daemon:logs      # 查看日志
   bun daemon:status    # 查看状态
   ```

### 访问地址

- **Web**: `http://localhost:3000`
- **API**: `http://localhost:3001`
- **API Docs**: `http://localhost:3001/swagger` (开发环境)

## 数据流

```
┌─────────────┐      HTTP API       ┌──────────────┐
│             │ ←─────────────────→ │              │
│  React SPA  │                     │ Elysia API   │
│  (Port 3000)│                     │ (Port 3001)  │
│             │                     │              │
└─────────────┘                     └──────┬───────┘
                                           │
      ┌────────────────────────────────────┘
      │
      ▼
┌─────────────┐
│   SQLite    │
│  Database   │
└─────────────┘
```

## 未来扩展

### 短期（本期不实现）
- ~~Cloudflare Tunnel~~（暂不实现）
- ~~Tauri 客户端（macOS/iOS）~~（暂不实现）

### 中期
- 如需要跨项目共享代码，可提取到 `packages/`:
  - `@labs/ui-components`: 通用 UI 组件
  - `@labs/utils`: 通用工具函数
  - `@labs/types`: 通用类型定义

### 长期
- 根据实际需要调整 monorepo 结构
- 考虑其他项目的技术栈和架构需求

## 设计原则总结

1. **YAGNI**: 避免过早抽象，只在真正需要时才提取共享代码
2. **自包含**: Orbit 尽可能独立，减少跨项目依赖
3. **类型安全**: 前后端通过 shared 包共享类型定义和 schema
4. **Feature-based**: 按业务功能而非技术层次组织代码
5. **渐进式**: 为未来扩展留有空间，但不过度设计

## 参考

- **openclaw**: 多渠道个人 AI 助手架构
- **craft-agents-oss**: Agent 工作平台的功能设计
- **icloud-git-sync**: PM2 守护进程配置方案

# Orbit Project Structure Design

**Date**: 2026-02-02
**Status**: Verified
**Version**: v1.0

## Project Overview

Orbit is a project combining personal AI assistant capabilities (referencing openclaw) and agent workspace platform features (referencing craft-agents-oss), using a frontend-backend separation architecture.

### Core Features

- Personal AI assistant capabilities (multi-channel interaction, voice support, etc.)
- Agent workspace platform (multi-tasking, API/service connections, session sharing, etc.)
- Local data storage (SQLite)
- Document-oriented workflow

### Tech Stack

**Frontend**

- React 18+
- Vite 8
- Tailwind CSS 4
- tailwind-variants
- react-router
- lucide-react

**Backend**

- Elysia (Web framework)
- Bun (Runtime)
- TypeBox (Schema validation)
- Drizzle ORM (Database)
- SQLite (Database)
- PM2 (Process management)

## Overall Architecture

### Monorepo Organization Principles

Based on the following considerations:

1. Labs is a personal monorepo that will have completely different domain projects in the future
2. Different projects may use different tech stacks
3. Follow YAGNI principle, avoid premature abstraction

**Decision**: Orbit uses a self-contained structure, internally using Bun workspaces to manage sub-packages.

### Top-level Structure

```
labs/
├── apps/
│   ├── playground/
│   └── orbit/                    # Orbit project (self-contained monorepo)
│       ├── web/                  # React SPA
│       ├── server/               # Elysia daemon
│       ├── shared/               # Frontend-backend shared code
│       ├── package.json          # Workspace root
│       ├── tsconfig.json         # Base configuration
│       ├── .env.example
│       ├── .gitignore
│       └── README.md
├── packages/                     # Reserved as empty, use when truly needed for cross-project reuse
├── tools/
│   └── icloud-git-sync/
├── package.json                  # Labs root
└── ...
```

## Orbit Internal Structure

### Web Frontend

```
apps/orbit/web/
├── src/
│   ├── app/                      # Application layer
│   │   ├── routes/               # react-router route definitions
│   │   ├── providers/            # Context providers
│   │   └── App.tsx               # Root component
│   ├── features/                 # Feature modules (by business domain)
│   │   ├── chat/                 # Chat/conversation functionality
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── api/
│   │   ├── agents/               # Agent management
│   │   ├── sessions/             # Session management
│   │   └── sources/              # Data source/connection management
│   ├── shared/                   # Frontend internal shared code
│   │   ├── components/           # Common UI components
│   │   ├── hooks/                # Common React hooks
│   │   ├── utils/                # Utility functions
│   │   └── styles/               # Global styles, Tailwind config
│   ├── main.tsx                  # Application entry point
│   └── vite-env.d.ts
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

**Design Rationale**:

- **Feature-based structure**: Organized by business functionality rather than technical layers, facilitating independent feature development
- **features/** directory corresponds to core business capabilities (chat, agents, sessions, sources)
- **shared/** stores frontend internal reusable UI components and tools

**Package name**: `@orbit/web`

### Server Backend

```
apps/orbit/server/
├── src/
│   ├── index.ts                  # Service entry point
│   ├── app.ts                    # Elysia app configuration
│   ├── modules/                  # Feature modules
│   │   ├── ai/                   # AI/LLM integration
│   │   │   ├── providers/        # Different LLM providers
│   │   │   ├── chat.controller.ts
│   │   │   └── chat.service.ts
│   │   ├── agents/               # Agent engine
│   │   │   ├── agent.controller.ts
│   │   │   ├── agent.service.ts
│   │   │   └── registry.ts
│   │   ├── chat/                 # Chat/conversation
│   │   ├── channels/             # Multi-channel support (referencing openclaw)
│   │   ├── sources/              # Data source/API connections
│   │   └── sessions/             # Session management
│   ├── core/                     # Core infrastructure
│   │   ├── db/                   # Database connections, migrations
│   │   │   ├── index.ts
│   │   │   └── client.ts
│   │   ├── config/               # Configuration management
│   │   │   └── env.ts
│   │   └── logger/               # Logging
│   │       └── index.ts
│   └── plugins/                  # Elysia plugins
│       ├── cors.ts
│       └── swagger.ts
├── drizzle/                      # Drizzle ORM
│   ├── schema/                   # Database schema
│   │   ├── agents.ts
│   │   ├── sessions.ts
│   │   ├── messages.ts
│   │   └── index.ts
│   └── migrations/               # Migration files
├── data/                         # SQLite database files
│   └── .gitkeep
├── logs/                         # PM2 logs
│   └── .gitkeep
├── ecosystem.config.cjs          # PM2 configuration
├── drizzle.config.ts             # Drizzle configuration
├── tsconfig.json
└── package.json
```

**Design Rationale**:

- **modules/** organized by business domain, corresponding to frontend features
- **core/** stores infrastructure code (database, configuration, logging)
- **Drizzle ORM**: Type-safe and lightweight, suitable for SQLite
- **PM2**: Daemon process management, referencing icloud-git-sync solution

**Package name**: `@orbit/server`

### Shared Code

```
apps/orbit/shared/
├── src/
│   ├── types/                    # TypeScript type definitions
│   │   ├── api/                  # API request/response types
│   │   │   ├── chat.ts
│   │   │   ├── agent.ts
│   │   │   └── index.ts
│   │   ├── models/               # Data models
│   │   │   ├── agent.ts
│   │   │   ├── session.ts
│   │   │   ├── message.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── schemas/                  # TypeBox schema (runtime validation)
│   │   ├── agent.schema.ts
│   │   ├── session.schema.ts
│   │   └── index.ts
│   ├── constants/                # Constant definitions
│   │   ├── routes.ts             # API route paths
│   │   ├── config.ts             # Configuration constants
│   │   └── index.ts
│   └── utils/                    # Pure function utilities (frontend-backend shared)
│       ├── validators.ts
│       ├── formatters.ts
│       └── index.ts
├── tsconfig.json
└── package.json
```

**Design Rationale**:

- **types/** ensures frontend-backend type consistency, avoiding API contract discrepancies
- **schemas/** uses TypeBox for runtime validation (built-in to Elysia)
- **constants/** shares API routes, configuration constants, etc.
- **utils/** only contains pure functions, ensuring they can run in both frontend and backend environments

**Constraints**: Does not contain React components or Node.js-specific code

**Package name**: `@orbit/shared`

## Configuration Files

### Orbit Workspace Root

**package.json** (`apps/orbit/package.json`):

```json
{
  "name": "@orbit/root",
  "version": "0.1.0",
  "private": true,
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
  }
}
```

### PM2 Configuration

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
}
```

## Development Workflow

### Local Development

1. **Start development environment**:

   ```bash
   cd apps/orbit
   bun install
   bun dev  # Start both web and server
   ```

2. **Start individually**:

   ```bash
   bun dev:web     # Start frontend only (http://localhost:3000)
   bun dev:server  # Start backend only (http://localhost:3001)
   ```

3. **Database operations**:
   ```bash
   bun db:generate  # Generate migration
   bun db:migrate   # Run migration
   bun db:studio    # Open Drizzle Studio
   ```

### Production Deployment

1. **Build**:

   ```bash
   bun build
   ```

2. **Start daemon**:

   ```bash
   bun daemon:start       # Production mode
   bun daemon:start:dev   # Development mode
   ```

3. **Process management**:
   ```bash
   bun daemon:stop      # Stop
   bun daemon:restart   # Restart
   bun daemon:logs      # View logs
   bun daemon:status    # View status
   ```

### Access URLs

- **Web**: `http://localhost:3000`
- **API**: `http://localhost:3001`
- **API Docs**: `http://localhost:3001/swagger` (development environment)

## Data Flow

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

## Future Extensions

### Short-term (Not implemented in this phase)

- ~~Cloudflare Tunnel~~ (Not implemented for now)
- ~~Tauri client (macOS/iOS)~~ (Not implemented for now)

### Medium-term

- If cross-project code sharing is needed, can extract to `packages/`:
  - `@labs/ui-components`: Common UI components
  - `@labs/utils`: Common utility functions
  - `@labs/types`: Common type definitions

### Long-term

- Adjust monorepo structure based on actual needs
- Consider tech stack and architectural requirements for other projects

## Design Principles Summary

1. **YAGNI**: Avoid premature abstraction, only extract shared code when truly needed
2. **Self-contained**: Orbit is as independent as possible, reducing cross-project dependencies
3. **Type safety**: Frontend and backend share type definitions and schemas through shared package
4. **Feature-based**: Organize code by business functionality rather than technical layers
5. **Progressive**: Leave room for future expansion, but don't over-engineer

## References

- **openclaw**: Multi-channel personal AI assistant architecture
- **craft-agents-oss**: Agent workspace platform feature design
- **icloud-git-sync**: PM2 daemon configuration solution

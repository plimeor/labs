# Orbit Full System Design

## Overview

Orbit is a personal AI assistant that runs continuously on your machine. It manages multiple agents, each with its own identity, workspace, tools, and memory. Users interact through a web client that connects to a local server.

## Architecture

```
┌─────────────────────────────┐     ┌──────────────────────────┐
│  Client (Web App)           │     │  Server (Bun + Elysia)   │
│  React + Vite + Tailwind    │────▶│  localhost:3001           │
│  localhost:3000              │ REST│                          │
│                             │◀────│  Agent SDK + MCP Servers  │
│                             │ SSE │  Filesystem Stores        │
│                             │     │  Scheduler                │
└─────────────────────────────┘     └──────────────────────────┘
```

- **Server**: Always-on daemon. Manages agent lifecycle, scheduling, inter-agent messaging. REST API + SSE for real-time streaming.
- **Client**: Web app (Vite + React). Three-panel layout. Connects to local server.

## Agent & Session Model

An **Agent** is a configuration entity. A **Session** is the execution unit.

```
Agent (config, identity)
├── System Prompt (IDENTITY.md, AGENTS.md, etc.)
├── Workspace Path (directory or git repo)
├── MCP Sources (external tool servers)
├── Knowledge Files (reference docs)
├── Permission Level (safe / ask / allow-all)
├── Memory (QMD - shared across all sessions)
├── Inbox (shared, with claim mechanism)
└── Sessions (multiple, concurrent, isolated)
    ├── Session A → own conversation history, own Claude SDK instance
    ├── Session B → own conversation history, own Claude SDK instance
    └── Session C → ...
```

### Multi-Session Isolation

The same agent can run multiple sessions concurrently. Each session has fully isolated conversation context.

- **Per-session**: conversation history, Claude SDK instance, claimed inbox messages
- **Agent-level (shared)**: identity/config, workspace, MCP sources, memory, inbox queue

**AgentPool** is keyed by `agentName:sessionId`. Each session gets its own `OrbitAgent` instance in the LRU cache.

### Inbox Claim Mechanism

Inbox is agent-level. To prevent duplicate processing across concurrent sessions:

1. Message arrives in agent's inbox (`pending/`)
2. Session A reads pending inbox, **claims** the message (writes `claimedBy: sessionId`)
3. Session B reads pending inbox, sees the message is claimed, skips it
4. Session A processes the message, moves it to `archive/`

Memory (QMD) is additive knowledge with no conflict on concurrent reads/writes.

### Workspace Isolation

When an agent works on a git repo, it creates a **git worktree** per task for isolation. The user reviews changes and can stage/commit from the UI.

## Server Architecture

### Module Structure

```
server/src/
├── core/
│   ├── env.ts
│   └── config/
├── stores/                          # Filesystem JSON stores
│   ├── agent.store.ts               # Agent CRUD (config/identity)
│   ├── session.store.ts             # Session CRUD + message history
│   ├── task.store.ts                # Scheduled task definitions + runs
│   └── inbox.store.ts               # Inbox with claim mechanism
├── modules/
│   ├── agent/
│   │   ├── orbit-agent.ts           # Claude SDK wrapper (per session)
│   │   ├── agent-pool.ts            # LRU cache keyed by agentName:sessionId
│   │   ├── permissions.ts
│   │   ├── source-builder.ts        # MCP source loader
│   │   └── services/
│   │       ├── context.service.ts   # System prompt composition
│   │       ├── memory.service.ts    # QMD memory (agent-level)
│   │       └── workspace.service.ts # Workspace + git worktree management
│   ├── chat/
│   │   └── chat.controller.ts       # SSE streaming + REST endpoints
│   ├── mcp/
│   │   ├── orbit-tools.mcp.ts       # schedule_task, send_to_agent
│   │   └── memory-tools.mcp.ts      # add_memory, search_memory
│   └── scheduler/
│       └── scheduler.service.ts     # Poll + execute (new session per run)
```

### Key Changes from Current State

1. **AgentPool** - rekey from `agentName` to `agentName:sessionId`
2. **InboxStore** - add `claimedBy` field and atomic claim operation
3. **WorkspaceService** - add git worktree create/list/delete operations
4. **Chat controller** - support multiple concurrent SSE streams per agent (one per session)
5. **SessionStore** - support listing sessions per agent, creating sessions independently of chat
6. **Scheduler** - always create a new session per task execution

## Server API

### Agents

```
GET    /api/agents                         # List all agents
POST   /api/agents                         # Create agent
GET    /api/agents/:name                   # Get agent config
PUT    /api/agents/:name                   # Update agent config
DELETE /api/agents/:name                   # Delete agent
```

### Sessions

```
GET    /api/agents/:name/sessions          # List sessions for an agent
POST   /api/agents/:name/sessions          # Create new session (returns sessionId)
GET    /api/agents/:name/sessions/:id      # Get session details + message history
DELETE /api/agents/:name/sessions/:id      # Delete session
```

### Chat

```
POST   /api/chat                           # SSE streaming (body: { agentName, sessionId, message })
```

### Inbox

```
GET    /api/agents/:name/inbox             # List inbox messages (pending + claimed status)
GET    /api/agents/:name/inbox/:msgId      # Get single message
DELETE /api/agents/:name/inbox/:msgId      # Archive/delete message
```

### Scheduled Tasks

```
GET    /api/tasks                           # List all tasks across agents
GET    /api/agents/:name/tasks             # List tasks for an agent
POST   /api/agents/:name/tasks             # Create task (cron/interval/once, prompt)
PUT    /api/agents/:name/tasks/:id         # Update task (pause/resume/edit)
DELETE /api/agents/:name/tasks/:id         # Delete task
GET    /api/agents/:name/tasks/:id/runs    # List execution history
```

## Client Architecture

### Tech Stack

- React 18 + React Router
- Vite 6 (dev server on port 3000, proxies `/api` to localhost:3001)
- Tailwind CSS 4
- Zustand for client state management

### Layout

```
┌──────────────┬──────────────────────┬──────────────┐
│   Sidebar    │      Center          │  Right Panel │
│   (240px)    │    (flexible)        │   (360px)    │
│              │                      │              │
│  Inbox       │  Chat View           │  File Changes│
│  Tasks       │  or Inbox View       │  (diff view) │
│  Agents      │  or Task Mgmt View   │              │
│  ─────────── │  or Agent Config     │              │
│  Sessions    │                      │              │
│   session1   │                      │              │
│   session2   │                      │              │
│   ...        │                      │              │
└──────────────┴──────────────────────┴──────────────┘
```

### Sidebar

Top section (navigation):
- **Inbox** - messages from agents to user. Badge count for unread.
- **Tasks** - scheduled tasks across all agents.
- **Agents** - agent list + "New Agent" button.

Divider.

Bottom section (sessions):
- **Sessions** - flat list across all agents, sorted by last activity. Each item shows session title/preview + agent name label + timestamp.

### Center Panel Views

**Inbox View**
- List of messages from agents to the user
- Each message: agent name, timestamp, content (markdown)
- Mark as read / archive actions

**Session Chat View**
- Top bar: session title (editable), agent name badge
- Message stream: user messages (right), agent messages (left), markdown rendered
- Tool call results as collapsible blocks
- Input area at bottom: text input + send button

**Task Management View**
- List of all scheduled tasks across agents
- Columns: task name, agent, schedule, status (active/paused), last run, next run
- Create task: pick agent, write prompt, set schedule
- Actions: pause, resume, delete, view run history

**Agent Config View** (two-column, inspired by OpenAI agent builder)
- Left: system prompt editor (large textarea, markdown)
- Right: configuration panels
  - **MCP Sources** - list + add/remove external tool servers
  - **Knowledge** - list + add/remove reference files
  - **Settings** - workspace path, permission level
- Top bar: agent name, delete button

### Right Panel

- File changes for the active session's agent workspace
- File tree with change indicators (added/modified/deleted)
- Click file to show inline diff
- Collapsible, auto-hides when viewing Inbox or Tasks

### Client State (Zustand)

```
stores/
├── inbox.store.ts       # Inbox messages, unread count
├── session.store.ts     # Session list, active session, messages
├── task.store.ts        # Scheduled tasks list
├── agent.store.ts       # Agent list, agent configs
└── ui.store.ts          # Active view, sidebar selection, right panel visibility
```

### Data Flow

**Chat:**
1. User selects session in sidebar → center panel switches to chat view
2. Client fetches history via `GET /api/agents/:name/sessions/:id`
3. User types message → `POST /api/chat` with `{ agentName, sessionId, message }`
4. Server returns SSE stream → Client renders tokens incrementally
5. On stream complete → message appended to local store

**Inbox:**
1. Client polls `GET /api/agents/:name/inbox` periodically
2. New messages update badge count
3. User clicks Inbox → center panel shows message list

**Agent config:**
1. User clicks agent in sidebar → center panel shows config editor
2. Edit prompt, workspace, MCP sources, knowledge, permissions
3. Save → `PUT /api/agents/:name`

## Filesystem Structure

```
~/.config/orbit/agents/<agentName>/
├── agent.json              # Agent metadata + config
├── workspace/              # Default working directory
├── memory/                 # QMD memory files
├── sessions/
│   ├── <sessionId>.json    # Conversation history
│   └── ...
├── tasks/
│   ├── <taskId>.json       # Task definition
│   └── runs/
│       └── <runId>.json    # Execution record
├── inbox/
│   ├── pending/            # Unread messages (with claimedBy field)
│   └── archive/            # Processed messages
├── sources/                # External MCP server configs
├── knowledge/              # Reference files
├── IDENTITY.md
├── AGENTS.md
├── TOOLS.md
└── MEMORY.md
```

## System Lifecycle

**Server:**
- Background process on user's machine (port 3001)
- Scheduler polls every 30 seconds for due tasks
- Each scheduled task execution creates a fresh session
- All state persists as JSON files under `~/.config/orbit/`
- No external database, no cloud dependency

**Client:**
- Web app served by Vite dev server (port 3000) or built static files
- Connects to `http://localhost:3001`
- If server is not running, show connection status with retry

**Agent lifecycle:**
1. User creates agent via Client (config view)
2. User creates a session for that agent
3. Chat messages route through Server → Agent SDK → Claude API
4. Each session gets its own OrbitAgent instance (cached by `agentName:sessionId`)
5. Idle sessions evicted from AgentPool via LRU; history preserved in SessionStore
6. Scheduled tasks create fresh sessions, execute, session saved to history

## Out of Scope (v1)

- Mobile client
- Git operations UI in right panel
- Thread concept for grouping sessions
- Multi-user / auth (single user, local only)
- Cloud sync
- Tauri / native desktop shell (web app for MVP)

# Orbit Server

Orbit is a multi-agent system where AI agents run with isolated workspaces and communicate through inbox messages and scheduled tasks. Each agent supports multiple concurrent sessions with full isolation.

## Architecture

### Core Components

**Filesystem Stores** (`src/stores/`)

All state is stored as JSON files on the filesystem (no database). Each store manages a subdirectory under the agent's workspace:

- `AgentStore` - Agent registry (`agents/<name>/agent.json`)
- `TaskStore` - Scheduled tasks and run history (`agents/<name>/tasks/`)
- `InboxStore` - Agent-to-agent messages with claim mechanism (`agents/<name>/inbox/`)
- `SessionStore` - Chat sessions with CRUD + message history (`agents/<name>/sessions/`)

**OrbitAgent** (`src/modules/agent/orbit-agent.ts`)

Wraps the `@anthropic-ai/claude-agent-sdk` to run Claude with:

- Session-scoped instances: each `OrbitAgent` is bound to a `(name, sessionId)` pair
- Inbox claiming: atomically claims unclaimed messages for its session to prevent duplicate processing
- SDK session resume: persists and reloads `sdkSessionId` from the session store
- Composed system prompts (identity, tools, inbox context)
- In-process MCP servers (orbit-tools, memory-tools)
- External MCP sources from `sources/` directory
- Async generator streaming (`chat()` yields `SDKMessage`)

**AgentPool** (`src/modules/agent/agent-pool.ts`)

Manages OrbitAgent instances with LRU eviction. Agents are keyed by composite `agentName:sessionId`, so each session gets its own isolated `OrbitAgent` instance with separate SDK state.

- `get(name, sessionId)` - returns or creates an agent for the composite key
- `release(name, sessionId)` - aborts and removes a specific agent+session
- `startEviction(ttlMs)` - evicts agents not accessed within TTL (default 10 min)

**MCP Servers** (`src/modules/mcp/`)

In-process MCP servers providing tools to agents:

- `orbit-tools.mcp` - schedule_task, send_to_agent, list_tasks, pause/resume/cancel task
- `memory-tools.mcp` - QMD-based semantic memory (add, search, list collections)

**Permission System** (`src/modules/agent/permissions.ts`)

Three modes: `safe` (read-only tools), `ask` (interactive approval), `allow-all` (unrestricted). MCP tools (orbit-tools, memory-tools) are always allowed.

**Source Builder** (`src/modules/agent/source-builder.ts`)

Reads `sources/<name>/config.json` files to discover external MCP servers (stdio or HTTP/SSE transport) and adds them to the agent's MCP server list.

**Scheduler** (`src/modules/scheduler/`)

Polls filesystem-based TaskStore every 30 seconds for due tasks. Creates a fresh session for each task execution, ensuring isolated context. Executes agents via AgentPool with composite key, records run results, and calculates next run time (cron/interval).

### Multi-Session Model

Each chat interaction or task execution operates within a session:

1. **Session creation**: `POST /api/agents/:name/sessions` or auto-created on first chat
2. **Session reuse**: `POST /api/chat` with `sessionId` reuses the existing session and its SDK state
3. **Pool isolation**: `AgentPool` keys by `agentName:sessionId`, so different sessions get separate `OrbitAgent` instances
4. **Inbox claiming**: When an agent starts a chat, it atomically claims unclaimed inbox messages for its session via `claimMessage()`, preventing duplicate processing across concurrent sessions
5. **Scheduler sessions**: Each task execution creates a fresh session for isolation

### Inbox Claiming

The `InboxStore` supports atomic claiming to prevent duplicate message processing:

- `claimMessage(agentName, msgId, sessionId)` - atomically claims an unclaimed message (returns `false` if already claimed)
- `getPendingUnclaimed(agentName)` - returns only messages without a `claimedBy` field
- Messages have `claimedBy` (session ID) and `claimedAt` (timestamp) fields

### Git Worktree Operations

`workspace.service.ts` provides git worktree management for task isolation:

- `createWorktree(agentName, taskId, branch?, basePath?)` - creates a new git worktree under `.worktrees/`
- `deleteWorktree(agentName, taskId, basePath?)` - removes a worktree
- `listWorktrees(agentName, basePath?)` - lists all worktrees for an agent

### Communication Patterns

**Agent to Agent** (via InboxStore)

- Agent A calls `send_to_agent(targetAgent, message)` tool
- Message saved to target agent's `inbox/pending/`
- Target agent claims and reads pending messages on next session

**Agent to User** (via SSE streaming)

- `POST /api/chat` returns SSE stream
- Events: `system`, `assistant`, `tool_use`, `result`, `error`

**Scheduled Execution**

- Scheduler finds due tasks, creates fresh session, runs agent with task prompt
- Messages stored in the session, results recorded to `tasks/runs/` directory

## File Structure

```
apps/orbit/server/
├── src/
│   ├── modules/
│   │   ├── agent/              # Agent module (execution + services)
│   │   │   ├── orbit-agent.ts      # Session-aware agent SDK wrapper
│   │   │   ├── agent-pool.ts       # LRU agent cache (keyed by name:sessionId)
│   │   │   ├── permissions.ts      # Permission hook
│   │   │   ├── source-builder.ts   # External MCP discovery
│   │   │   ├── index.ts            # Barrel export
│   │   │   └── services/
│   │   │       ├── context.service.ts   # System prompt composition
│   │   │       ├── memory.service.ts    # Daily memory read/write
│   │   │       ├── workspace.service.ts # Workspace + git worktree ops
│   │   │       └── qmd.service.ts       # QMD semantic search
│   │   ├── mcp/                # In-process MCP servers
│   │   │   ├── orbit-tools.mcp.ts  # Orbit tools MCP server
│   │   │   ├── memory-tools.mcp.ts # Memory tools MCP server
│   │   │   └── index.ts            # Barrel export
│   │   ├── chat/               # Controllers (chat, sessions, inbox, tasks, agents)
│   │   ├── scheduler/          # Filesystem-based scheduler
│   │   └── plugins/            # CORS, Swagger
│   ├── stores/
│   │   ├── agent.store.ts      # Agent CRUD (filesystem)
│   │   ├── task.store.ts       # Task CRUD + due task finder
│   │   ├── inbox.store.ts      # Inbox CRUD + claim mechanism
│   │   ├── session.store.ts    # Session CRUD + message history
│   │   └── index.ts            # Barrel export
│   ├── core/                   # Config, env
│   ├── __tests__/              # Unit + integration tests
│   ├── app.ts                  # Main app setup
│   └── index.ts                # Entry point
└── templates/                  # Agent prompt templates
```

### Agent Workspace Structure

```
~/.config/orbit/agents/<name>/
├── agent.json          # Agent metadata
├── workspace/          # Agent working directory
│   └── .worktrees/     # Git worktrees for task isolation
├── memory/             # Daily memory logs
├── sessions/           # Chat session files
├── tasks/              # Scheduled task definitions
│   └── runs/           # Task execution records
├── inbox/
│   ├── pending/        # Unread messages (with claimedBy field)
│   └── archive/        # Read messages
├── sources/            # External MCP server configs
├── .claude/skills/     # Claude skill definitions
├── IDENTITY.md         # Agent identity
├── AGENTS.md           # Operating protocol
├── TOOLS.md            # Tool documentation
└── MEMORY.md           # Long-term memory
```

## API Endpoints

**Chat**

- `POST /api/chat` - SSE streaming chat with agent (supports `sessionId` for reuse)
- `POST /api/chat/sync` - Synchronous chat (legacy)
- `GET /api/chat/history/:sessionId` - Get session messages

**Agents**

- `GET /api/agents` - List agents
- `POST /api/agents` - Create agent
- `GET /api/agents/:name` - Get agent details
- `PUT /api/agents/:name` - Update agent config
- `DELETE /api/agents/:name` - Delete agent

**Sessions**

- `POST /api/agents/:name/sessions` - Create session
- `GET /api/agents/:name/sessions` - List sessions
- `GET /api/agents/:name/sessions/:id` - Get session with messages
- `PUT /api/agents/:name/sessions/:id` - Update session (e.g., title)
- `DELETE /api/agents/:name/sessions/:id` - Delete session

**Inbox**

- `GET /api/agents/:name/inbox` - List pending messages
- `DELETE /api/agents/:name/inbox/:msgId` - Archive message

**Tasks**

- `GET /api/tasks` - List all tasks across agents
- `GET /api/agents/:name/tasks` - List tasks for agent
- `POST /api/agents/:name/tasks` - Create task
- `PUT /api/agents/:name/tasks/:id` - Update task
- `DELETE /api/agents/:name/tasks/:id` - Delete task

**Health**

- `GET /api/health` - Server status

## Running the Server

```bash
# Development
bun run dev

# Production
bun run start

# Testing
bun run test           # Run tests
bun run test:watch     # Run tests in watch mode
bun run test:coverage  # Run tests with coverage

# Type checking
bun run type-check
```

## Development Notes

### Testing Architecture

**Test Isolation**: Tests use `ORBIT_CONFIG_PATH` environment variable to point to temporary directories, avoiding interference with production data.

**Mock Strategy**: Only mock external services:

- Mocked: `@anthropic-ai/claude-agent-sdk` (external LLM), QMD service (external CLI)
- Real: All internal code (stores, agent pool, workspace, scheduler)

**Test Structure**: Tests are in `src/__tests__/` mirroring the source layout:

- `modules/agent/` - OrbitAgent, AgentPool, permissions, source-builder, workspace tests
- `modules/mcp/` - MCP server tests
- `modules/chat/` - Chat controller tests
- `stores/` - Store unit tests (inbox claim, session CRUD, task CRUD)
- `integration/` - Smoke tests

### Adding New Tools

1. Add tool definition in `src/modules/mcp/orbit-tools.mcp.ts`
2. Implement handler in the same file
3. Update `templates/TOOLS.md` documentation
4. Add tests in `src/__tests__/modules/mcp/`

### Adding External MCP Sources

Create `sources/<name>/config.json` in the agent workspace:

```json
{
  "type": "mcp",
  "transport": "stdio",
  "command": "node",
  "args": ["path/to/server.js"]
}
```

Or for HTTP/SSE transport:

```json
{
  "type": "mcp",
  "transport": "http",
  "url": "http://localhost:3001/mcp"
}
```

### Key Dependencies

- `@anthropic-ai/claude-agent-sdk` - Agent SDK for running Claude
- `elysia` - HTTP framework
- `cron-parser` - Cron expression parsing for scheduler
- `zod` - Schema validation

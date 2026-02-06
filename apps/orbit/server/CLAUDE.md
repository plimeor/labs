# Orbit Server

Orbit is a multi-agent system where AI agents run with isolated workspaces and communicate through inbox messages and scheduled tasks.

## Architecture

### Core Components

**Filesystem Stores** (`src/stores/`)

All state is stored as JSON files on the filesystem (no database). Each store manages a subdirectory under the agent's workspace:

- `AgentStore` - Agent registry (`agents/<name>/agent.json`)
- `TaskStore` - Scheduled tasks and run history (`agents/<name>/tasks/`)
- `InboxStore` - Agent-to-agent messages (`agents/<name>/inbox/`)
- `SessionStore` - Chat sessions and message history (`agents/<name>/sessions/`)

**OrbitAgent** (`src/agent/orbit-agent.ts`)

Wraps the `@anthropic-ai/claude-agent-sdk` to run Claude with:

- Composed system prompts (identity, tools, inbox context)
- In-process MCP servers (orbit-tools, memory-tools)
- External MCP sources from `sources/` directory
- Session resume via SDK session ID
- Async generator streaming (`chat()` yields `SDKMessage`)

**AgentPool** (`src/agent/agent-pool.ts`)

Manages OrbitAgent instances with LRU eviction. Agents are created on first use and cached for reuse across chat and scheduler calls.

**MCP Servers** (`src/mcp/`)

In-process MCP servers providing tools to agents:

- `orbit-tools.mcp` - schedule_task, send_to_agent, list_tasks, pause/resume/cancel task
- `memory-tools.mcp` - QMD-based semantic memory (add, search, list collections)

**Permission System** (`src/agent/permissions.ts`)

Three modes: `safe` (read-only tools), `ask` (interactive approval), `allow-all` (unrestricted). MCP tools (orbit-tools, memory-tools) are always allowed.

**Source Builder** (`src/agent/source-builder.ts`)

Reads `sources/<name>/config.json` files to discover external MCP servers (stdio or HTTP/SSE transport) and adds them to the agent's MCP server list.

**Scheduler** (`src/modules/scheduler/`)

Polls filesystem-based TaskStore every 30 seconds for due tasks. Executes agents via AgentPool, records run results, and calculates next run time (cron/interval).

### Communication Patterns

**Agent to Agent** (via InboxStore)

- Agent A calls `send_to_agent(targetAgent, message)` tool
- Message saved to target agent's `inbox/pending/`
- Target agent reads pending messages on next session

**Agent to User** (via SSE streaming)

- `POST /api/chat` returns SSE stream
- Events: `system`, `assistant`, `tool_use`, `result`, `error`

**Scheduled Execution**

- Scheduler finds due tasks, runs agent with task prompt
- Results recorded to `tasks/runs/` directory

## File Structure

```
apps/orbit/server/
├── src/
│   ├── stores/
│   │   ├── agent.store.ts      # Agent CRUD (filesystem)
│   │   ├── task.store.ts       # Task CRUD + due task finder
│   │   ├── inbox.store.ts      # Inbox message CRUD
│   │   ├── session.store.ts    # Session + message CRUD
│   │   └── index.ts            # Barrel export
│   ├── agent/
│   │   ├── orbit-agent.ts      # Agent SDK wrapper
│   │   ├── agent-pool.ts       # LRU agent cache
│   │   ├── permissions.ts      # Permission hook
│   │   ├── source-builder.ts   # External MCP discovery
│   │   └── index.ts            # Barrel export
│   ├── mcp/
│   │   ├── orbit-tools.mcp.ts  # Orbit tools MCP server
│   │   └── memory-tools.mcp.ts # Memory tools MCP server
│   ├── modules/
│   │   ├── agents/services/    # Workspace, context, memory, QMD
│   │   ├── chat/               # SSE chat controller + agents API
│   │   ├── scheduler/          # Filesystem-based scheduler
│   │   └── plugins/            # CORS, Swagger
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
├── memory/             # Daily memory logs
├── sessions/           # Chat session files
├── tasks/              # Scheduled task definitions
│   └── runs/           # Task execution records
├── inbox/
│   ├── pending/        # Unread messages
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

- `POST /api/chat` - SSE streaming chat with agent
- `POST /api/chat/sync` - Synchronous chat (legacy)
- `GET /api/chat/history/:sessionId` - Get session messages

**Agents**

- `GET /api/agents` - List agents
- `POST /api/agents` - Create agent
- `GET /api/agents/:name` - Get agent details
- `DELETE /api/agents/:name` - Delete agent

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

- `stores/` - Store unit tests
- `mcp/` - MCP server tests
- `agent/` - OrbitAgent, permissions, source-builder tests
- `controllers/` - Chat controller tests
- `integration/` - Smoke tests

### Adding New Tools

1. Add tool definition in `src/mcp/orbit-tools.mcp.ts`
2. Implement handler in the same file
3. Update `templates/TOOLS.md` documentation
4. Add tests in `src/__tests__/mcp/`

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

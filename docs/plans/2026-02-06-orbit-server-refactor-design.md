# Orbit Server Refactor Design

Date: 2026-02-06

## Context

Orbit's server architecture has fundamental design flaws compared to craft-agents-oss. This document captures the defects and refactoring plan to adopt the Claude Agent SDK, filesystem-based storage, permission system, MCP source system, and native skill support.

## Defect Analysis

### Critical

| #   | Defect                                           | Current                                               | Target                                                       |
| --- | ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Hand-rolled agentic loop using raw Anthropic SDK | `runtime.service.ts` while loop with Messages API     | Agent SDK `query()` with built-in agent loop                 |
| 2   | No session resume — every call is stateless      | `executeAgent()` creates fresh conversation each time | `sdkSessionId` + `resume` option for conversation continuity |
| 8   | No event streaming — returns final string only   | `Promise<string>` response                            | `AsyncGenerator<SDKMessage>` via SSE to clients              |

### High

| #   | Defect                         | Current                                                           | Target                                                         |
| --- | ------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| 4   | Static global tool definitions | `orbitToolDefinitions` module-level constant shared by all agents | Per-agent `Options.mcpServers` built dynamically at query time |
| 5   | No MCP source system           | Only 6 built-in orbit tools + 2 memory tools                      | Source system: MCP (HTTP/SSE/stdio) + API wrapping             |
| 6   | No permission system           | All tool calls execute without interception                       | `PreToolUse` hook with safe/ask/allow-all modes                |
| 11  | No execution observability     | Scheduler runs are black-box                                      | SDKMessage stream with tool call tracking and token usage      |
| 12  | No skills management           | None                                                              | Agent SDK native skills via `settingSources`                   |

### Medium

| #   | Defect                         | Current                                        | Target                                               |
| --- | ------------------------------ | ---------------------------------------------- | ---------------------------------------------------- |
| 3   | Hardcoded model and max_tokens | `claude-sonnet-4-20250514` / `8192` in runtime | Per-agent and per-session model/thinkingLevel config |
| 9   | Over-reliance on SQLite        | 6 tables, Drizzle ORM dependency               | Filesystem-based storage (JSON/JSONL)                |
| 10  | No credential management       | None                                           | Encrypted credential storage per source              |

### Low

| #   | Defect                                | Current                                  | Target                          |
| --- | ------------------------------------- | ---------------------------------------- | ------------------------------- |
| 7   | Tool handler string matching dispatch | `toolName === 'search_memory'` hardcoded | SDK auto-routes via MCP servers |

## Architecture Overview

### Hybrid Approach

- **HTTP server layer (Elysia)** remains as unified entry point: REST API, SSE streaming, scheduler coordination, inter-agent routing
- **Each agent's runtime becomes self-contained**: independent OrbitAgent instance with its own Agent SDK session, MCP sources, permission mode, tool set, model config

### Directory Structure

```
~/.claude/
├── skills/                              # Global skills (SDK native discovery)
│   └── {skill-name}/
│       └── SKILL.md

~/.config/orbit/
├── config.toml                          # Global config (QMD, defaults)
├── permissions.json                     # Global permission defaults
├── agents/
│   └── {agentName}/
│       ├── agent.json                   # Agent metadata (name, status, model, permissionMode)
│       ├── IDENTITY.md                  # Agent identity
│       ├── SOUL.md                      # Personality (optional)
│       ├── USER.md                      # User info (optional)
│       ├── AGENTS.md                    # Operating protocol
│       ├── MEMORY.md                    # Long-term memory
│       ├── .claude/
│       │   └── skills/                  # Agent-level skills (SDK native discovery)
│       │       └── {skill-name}/
│       │           └── SKILL.md
│       ├── memory/
│       │   └── 2026-02-06.md            # Daily memory
│       ├── sessions/
│       │   └── {sessionId}/
│       │       ├── session.json         # Session metadata (sdkSessionId, model, permissionMode)
│       │       └── messages.jsonl       # Message log (line 1 = header, lines 2+ = messages)
│       ├── inbox/
│       │   ├── pending/
│       │   │   └── {msgId}.json         # Pending messages from other agents
│       │   └── archive/
│       │       └── {msgId}.json         # Archived messages
│       ├── tasks/
│       │   ├── {taskId}.json            # Task definition + state
│       │   └── runs/
│       │       └── {runId}.json         # Task execution records
│       ├── sources/
│       │   └── {slug}/
│       │       ├── config.json          # Source config (type, transport, auth)
│       │       ├── credential.enc       # Encrypted credential
│       │       └── guide.md             # Usage guide (injected into system prompt)
│       └── workspace/                   # Agent working directory
```

## Refactoring Plan

### Phase 1: Foundation — Storage + SDK Switch

**Goal:** Replace SQLite/Drizzle with filesystem, replace raw Anthropic SDK with Agent SDK.

#### 1.1 Filesystem Storage Layer

Create a lightweight storage service for each data type:

- `AgentStore` — CRUD on `agents/{name}/agent.json`, workspace discovery via directory scan
- `SessionStore` — Session metadata in `session.json`, messages in `messages.jsonl` (append-only)
- `TaskStore` — Task definitions in `tasks/{id}.json`, runs in `tasks/runs/{id}.json`
- `InboxStore` — Messages as individual JSON files in `inbox/pending/` and `inbox/archive/`

Remove: `drizzle/` directory, all schema files, migrations, `@drizzle-kit`, `drizzle-orm` dependencies, `core/db.ts`

#### 1.2 Agent SDK Integration

Replace `runtime.service.ts` with Agent SDK `query()`:

```typescript
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'

// Returns SDK message stream instead of string
async function* executeAgent(params): AsyncGenerator<SDKMessage> {
  const options: Options = {
    model: agent.config.model,
    cwd: agentWorkspacePath,
    settingSources: ['user', 'project'], // Load global + agent skills
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: composeOrbitContext(agent), // Memory, inbox, session metadata
    },
    tools: { type: 'preset', preset: 'claude_code' },
    mcpServers: buildMcpServers(agent), // Orbit tools + sources
    resume: session.sdkSessionId, // Session continuity
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    hooks: {
      PreToolUse: [{ hooks: [permissionHook] }],
    },
  }

  const q = query({ prompt, options })
  for await (const message of q) {
    yield message
  }
}
```

Remove: `@anthropic-ai/sdk` dependency, hand-rolled agentic loop

### Phase 2: OrbitAgent Class + SSE Streaming

**Goal:** Replace stateless function calls with per-agent runtime instances, add event streaming.

#### 2.1 OrbitAgent Class

```typescript
class OrbitAgent {
  readonly name: string
  private config: AgentConfig // From agent.json
  private sessionId?: string // SDK session ID for resume

  constructor(name: string, config: AgentConfig)

  async *chat(prompt: string, opts: ChatOptions): AsyncGenerator<SDKMessage>

  private buildOptions(sessionType: SessionType): Options
  private buildMcpServers(): Record<string, McpServerConfig>

  abort(): void
}
```

#### 2.2 Agent Pool

```typescript
class AgentPool {
  private agents: Map<string, OrbitAgent> = new Map()
  private lastAccess: Map<string, number> = new Map()

  async get(name: string): Promise<OrbitAgent> // Get or create
  release(name: string): void // Remove from pool
  startEviction(ttlMs: number): void // Periodic cleanup
}
```

#### 2.3 SSE Streaming

`POST /api/chat` becomes an SSE endpoint:

```
Client → POST /api/chat { agentName, message, sessionId? }
Server → SSE stream:
  data: { type: "system", session_id: "...", tools: [...] }
  data: { type: "assistant", message: { content: [...] } }
  data: { type: "user", message: { content: [{ type: "tool_result", ... }] } }
  data: { type: "result", subtype: "success", result: "...", usage: {...} }
```

### Phase 3: Permission System + MCP Sources

**Goal:** Add permission control and external tool integration.

#### 3.1 Permission System

Three modes via `PreToolUse` hook:

- **safe** — Read-only: allow Read/Glob/Grep/WebFetch/WebSearch, block writes and shell mutations
- **ask** — Dangerous operations emit `permission_request` event via SSE, wait for client approval
- **allow-all** — Everything allowed

Special case: cron tasks with `ask` mode degrade to `safe` (no human to approve).

Permission config at three levels:

- Global: `~/.config/orbit/permissions.json`
- Agent: `agents/{name}/permissions.json`
- Session: `session.json` `permissionMode` field

#### 3.2 MCP Source System

Each agent can connect to external MCP servers and APIs:

```
agents/{name}/sources/{slug}/
├── config.json      # { type: "mcp"|"api", transport: "http"|"sse"|"stdio", ... }
├── credential.enc   # Encrypted auth credential
└── guide.md         # Usage documentation
```

Sources are built into `Options.mcpServers` at query time:

```typescript
private buildMcpServers(): Record<string, McpServerConfig> {
  return {
    'orbit-tools': orbitToolsServer,       // schedule_task, send_to_agent, etc.
    'memory-tools': memoryToolsServer,     // search_memory, get_memory (if QMD available)
    ...buildSourceServers(this.name),      // External MCP/API sources
  }
}
```

#### 3.3 Credential Management

Encrypted credential storage per source using AES-256-GCM:

- Key derivation from machine-specific secret
- Store as `credential.enc` in source directory
- Support OAuth token refresh for Google/Slack/Microsoft

### Phase 4: Skills + Scheduler Rewrite

**Goal:** Native skill support, filesystem-based scheduler.

#### 4.1 Skills (SDK Native)

No custom implementation needed. SDK handles everything via `settingSources`:

- **Global skills**: `~/.claude/skills/` — loaded via `settingSources: ['user']`
- **Agent skills**: `{workspace}/.claude/skills/` — loaded via `settingSources: ['project']` with `cwd` set to agent workspace
- **Dynamic updates**: SDK re-discovers skills on each `query()` call
- **Skill invocation**: SDK provides built-in `Skill` tool, agent calls it naturally
- **Skill inheritance**: Agent inherits global skills automatically, can extend with agent-specific ones

#### 4.2 Scheduler Rewrite

Replace SQLite polling with filesystem scanning:

```typescript
async function findDueTasks(): Promise<DueTask[]> {
  const agentDirs = await listAgentDirs()
  const dueTasks: DueTask[] = []

  for (const agentDir of agentDirs) {
    const taskFiles = await glob(`${agentDir}/tasks/*.json`)
    for (const file of taskFiles) {
      const task = JSON.parse(await readFile(file))
      if (task.status === 'active' && new Date(task.nextRun) <= new Date()) {
        dueTasks.push({ agentName: basename(agentDir), task, filePath: file })
      }
    }
  }
  return dueTasks
}
```

Scheduler executes via agent pool:

```typescript
async function executeDueTask(dueTask: DueTask): Promise<void> {
  const agent = await agentPool.get(dueTask.agentName)
  const runId = generateId()
  const startedAt = new Date()

  try {
    let result = ''
    for await (const message of agent.chat(dueTask.task.prompt, {
      sessionType: dueTask.task.contextMode === 'isolated' ? 'cron' : 'chat',
    })) {
      if (message.type === 'result') result = message.result
    }

    await writeTaskRun(dueTask, runId, { status: 'success', result, startedAt })
  } catch (error) {
    await writeTaskRun(dueTask, runId, { status: 'error', error, startedAt })
  }

  await updateTaskNextRun(dueTask)
}
```

Poll interval: 30 seconds. Scan all `agents/*/tasks/*.json`.

### Phase 5: Orbit Tools as MCP Server

**Goal:** Convert built-in orbit tools to an in-process MCP server.

Replace `orbit-tools.ts` static definitions with `createSdkMcpServer()`:

```typescript
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

function createOrbitMcpServer(agentName: string, agentId: string) {
  return createSdkMcpServer({
    name: 'orbit-tools',
    version: '1.0.0',
    tools: [
      tool(
        'schedule_task',
        'Schedule a recurring or one-time task',
        {
          prompt: z.string(),
          scheduleType: z.enum(['cron', 'interval', 'once']),
          scheduleValue: z.string(),
          contextMode: z.enum(['isolated', 'main']).default('isolated'),
          name: z.string().optional(),
        },
        async args => {
          // handler
        },
      ),

      tool(
        'send_to_agent',
        'Send a message to another agent',
        {
          targetAgent: z.string(),
          message: z.string(),
          messageType: z.enum(['request', 'response']).default('request'),
        },
        async args => {
          // handler
        },
      ),

      // list_tasks, pause_task, resume_task, cancel_task...
    ],
  })
}
```

Similarly for memory tools. SDK auto-routes tool calls — no more string matching dispatch.

## Migration Strategy

### Incremental Approach

Each phase is independently deployable and testable:

1. **Phase 1** — Storage + SDK switch. Breaking change: database migration (export SQLite → JSON files). All existing tests need rewrite.
2. **Phase 2** — OrbitAgent + SSE. Breaking change: chat API response format (JSON → SSE stream). Client must adapt.
3. **Phase 3** — Permissions + sources. Additive: new capabilities, no breaking changes.
4. **Phase 4** — Skills + scheduler rewrite. Internal: scheduler behavior unchanged from client perspective.
5. **Phase 5** — Orbit tools as MCP. Internal: tool behavior unchanged, just cleaner implementation.

### What Gets Deleted

- `drizzle/` — All schema files and migrations
- `core/db.ts` — SQLite connection
- `@anthropic-ai/sdk` — Raw Anthropic SDK
- `drizzle-orm`, `drizzle-kit` — ORM dependencies
- Hand-rolled agentic loop in `runtime.service.ts`
- Static `orbitToolDefinitions` and string-matching dispatch
- `bunfig.toml` preload database setup for tests

### What Gets Added

- `@anthropic-ai/claude-agent-sdk` — Agent SDK
- Filesystem storage services (AgentStore, SessionStore, TaskStore, InboxStore)
- `OrbitAgent` class with SDK integration
- `AgentPool` for instance management
- SSE streaming endpoint
- Permission system (PreToolUse hook + config files)
- MCP source system (SourceBuilder + credential manager)
- In-process MCP servers (orbit-tools, memory-tools)

## Dependencies

### Remove

- `@anthropic-ai/sdk`
- `drizzle-orm`
- `drizzle-kit`

### Add

- `@anthropic-ai/claude-agent-sdk`
- `zod` (for MCP tool schemas, if not already present)

### Keep

- `elysia` (HTTP framework)
- `cron-parser` (scheduler)
- `@plimeor-labs/logger` (logging)

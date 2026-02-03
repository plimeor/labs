# Orbit Agent System Design

**Date**: 2026-02-03
**Status**: Design Complete
**Version**: v1.0

## Overview

Orbit is a personal AI assistant platform combining openclaw's complete workspace system with modern Agent SDK.

### Core Features

- **Complete Workspace System**: AGENTS.md, SOUL.md, IDENTITY.md, USER.md, HEARTBEAT.md, BOOTSTRAP.md
- **Memory Management**: Daily logs + long-term memory
- **Agent SDK Execution**: Using `@anthropic-ai/claude-agent-sdk`
- **Self-scheduling**: Agents can configure their own scheduled tasks
- **Multi-agent Coordination**: Asynchronous message communication between agents
- **SQLite IPC**: Simple database as IPC mechanism
- **Web Chat UI**: Chat-only interface

### Tech Stack

- **Agent Execution**: `@anthropic-ai/claude-agent-sdk`
- **Backend**: Elysia + Bun
- **Database**: SQLite + Drizzle ORM
- **Frontend**: React + Vite (minimal chat UI)
- **Scheduling**: Simple polling mechanism (30 seconds)

---

## Architecture Design

### Overall Architecture

```
┌─────────────────────────────────────────┐
│   Elysia Server (single process)        │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Chat API                        │   │
│  │  - POST /api/chat               │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Agent Runtime                   │   │
│  │  - executeAgent()               │   │
│  │  - composeSystemPrompt()        │   │
│  │  - Agent SDK query()            │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ MCP Server                      │   │
│  │  - schedule_task                │   │
│  │  - send_to_agent                │   │
│  │  - list_tasks                   │   │
│  │  - pause/resume/cancel_task     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Scheduler Service               │   │
│  │  - Poll SQLite every 30s        │   │
│  │  - Execute due tasks            │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ SQLite Database                 │   │
│  │  - scheduled_tasks              │   │
│  │  - agent_inbox                  │   │
│  │  - agents                       │   │
│  │  - sessions                     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│   Agent Workspace (file system)         │
│                                         │
│  ~/.config/orbit/agents/<agent-name>/   │
│  ├── AGENTS.md                          │
│  ├── SOUL.md                            │
│  ├── IDENTITY.md                        │
│  ├── USER.md                            │
│  ├── HEARTBEAT.md                       │
│  ├── BOOTSTRAP.md                       │
│  ├── TOOLS.md                           │
│  ├── memory/                            │
│  │   ├── long-term.md                   │
│  │   └── daily/                         │
│  │       ├── 2026-02-01.md              │
│  │       └── 2026-02-02.md              │
│  └── workspace/                         │
└─────────────────────────────────────────┘
```

---

## Agent Workspace System

### Directory Structure

```
~/.config/orbit/agents/<agent-name>/
├── AGENTS.md              # Operating guide, loaded every session
├── SOUL.md                # Personality, tone, boundaries
├── IDENTITY.md            # Agent metadata (name, traits)
├── USER.md                # Learned information about user
├── HEARTBEAT.md           # Periodic heartbeat checklist
├── BOOTSTRAP.md           # First-run ritual (deleted after completion)
├── TOOLS.md               # Available tools documentation
├── memory/
│   ├── long-term.md       # Long-term memory
│   └── daily/
│       ├── 2026-02-01.md  # Daily logs
│       ├── 2026-02-02.md
│       └── 2026-02-03.md
└── workspace/             # Agent working directory
    └── (files created by agent)
```

### File Purposes

| File                | Purpose                                     | Update Method                   |
| ------------------- | ------------------------------------------- | ------------------------------- |
| AGENTS.md           | Operating protocol, memory management rules | Static template                 |
| SOUL.md             | Personality traits, communication style     | Static template                 |
| IDENTITY.md         | Agent identity (filled in during bootstrap) | Created by agent on first run   |
| USER.md             | User information                            | Updated by agent learning       |
| HEARTBEAT.md        | Periodic check tasks                        | Static template                 |
| BOOTSTRAP.md        | First-time setup wizard                     | Deleted after completion        |
| TOOLS.md            | Tool usage instructions                     | Static template                 |
| memory/long-term.md | Important facts                             | Updated by agent curation       |
| memory/daily/\*.md  | Daily activity logs                         | Written by agent at session end |

---

## System Prompt Composition

### Loading Flow

```typescript
async function composeSystemPrompt(
  agentName: string,
  sessionType: 'chat' | 'heartbeat' | 'cron',
): Promise<string> {
  const workspacePath = `~/.config/orbit/agents/${agentName}/`

  // 1. Load core personality files (always)
  const agents = await readFile(`${workspacePath}/AGENTS.md`)
  const soul = await readFile(`${workspacePath}/SOUL.md`)
  const identity = await readFile(`${workspacePath}/IDENTITY.md`)
  const user = await readFile(`${workspacePath}/USER.md`)
  const tools = await readFile(`${workspacePath}/TOOLS.md`)

  // 2. Load recent memory (today + yesterday)
  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const memoryToday = await readFile(`${workspacePath}/memory/daily/${today}.md`)
  const memoryYesterday = await readFile(`${workspacePath}/memory/daily/${yesterday}.md`)
  const longTerm = await readFile(`${workspacePath}/memory/long-term.md`)

  // 3. Compose system prompt
  return `
${identity}

${soul}

${user}

${agents}

${tools}

## Memory

### Long-term Memory
${longTerm}

### Recent Activity

**Yesterday (${yesterday}):**
${memoryYesterday}

**Today (${today}):**
${memoryToday}
  `.trim()
}
```

### File Truncation Rules

- Each file maximum 20,000 characters
- If exceeding limit: retain 70% head + 20% tail
- Missing files: skip, no error

---

## Agent SDK Integration

### Execution Flow

```typescript
export async function executeAgent(params: {
  agentName: string
  prompt: string
  sessionType: 'chat' | 'heartbeat' | 'cron'
  sessionId?: string
}): Promise<{ result: string; newSessionId: string }> {
  const workspacePath = `~/.config/orbit/agents/${params.agentName}/workspace`

  // 1. Check inbox (inter-agent messages)
  const inbox = await checkInbox(params.agentName)

  // 2. Compose system prompt
  let systemPrompt = await composeSystemPrompt(params.agentName, params.sessionType)

  // 3. Add inbox messages to system prompt
  if (inbox.length > 0) {
    systemPrompt += `\n\n## Inbox\n\nYou have ${inbox.length} messages:\n`
    inbox.forEach(msg => {
      systemPrompt += `- From ${msg.fromAgent}: ${msg.message}\n`
    })
  }

  // 4. Create MCP server
  const orbitMcp = createOrbitMcp(params.agentName)

  // 5. Execute Agent SDK
  let result = ''
  let newSessionId = ''

  for await (const message of query({
    prompt: params.prompt,
    options: {
      cwd: workspacePath,
      resume: params.sessionId,
      systemPrompt: systemPrompt,
      allowedTools: [
        'Bash',
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'WebSearch',
        'WebFetch',
        'mcp__orbit__*',
      ],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        orbit: orbitMcp,
      },
    },
  })) {
    if (message.type === 'system' && message.subtype === 'init') {
      newSessionId = message.session_id
    }

    if ('result' in message && message.result) {
      result = message.result as string
    }
  }

  // 6. Mark inbox as read
  if (inbox.length > 0) {
    await markInboxRead(inbox.map(m => m.id))
  }

  // 7. Write to today's memory
  await appendDailyMemory(params.agentName, {
    sessionType: params.sessionType,
    prompt: params.prompt,
    result: result,
    timestamp: new Date(),
  })

  return { result, newSessionId }
}
```

---

## MCP Tools (Agent Capabilities)

### Tool List

| Tool            | Description                   | Purpose                  |
| --------------- | ----------------------------- | ------------------------ |
| `send_to_agent` | Send message to another agent | Multi-agent coordination |
| `schedule_task` | Schedule a timed task         | Self-configuration       |
| `list_tasks`    | List all tasks                | View scheduling status   |
| `pause_task`    | Pause a task                  | Task management          |
| `resume_task`   | Resume a task                 | Task management          |
| `cancel_task`   | Cancel a task                 | Task management          |

### schedule_task Implementation

```typescript
tool(
  'schedule_task',
  `Schedule a recurring or one-time task.

CONTEXT MODE:
• "isolated": Fresh session (include all context in prompt)
• "main": Main session with chat history

SCHEDULE TYPE:
• "cron": Cron expression (e.g., "0 9 * * *")
• "interval": Milliseconds (e.g., "3600000")
• "once": ISO timestamp (e.g., "2026-02-03T15:30:00Z")`,
  {
    prompt: z.string(),
    scheduleType: z.enum(['cron', 'interval', 'once']),
    scheduleValue: z.string(),
    contextMode: z.enum(['isolated', 'main']).default('isolated'),
    name: z.string().optional(),
  },
  async args => {
    // Calculate next_run
    let nextRun: Date | null = null

    if (args.scheduleType === 'cron') {
      const interval = CronExpression.parse(args.scheduleValue)
      nextRun = interval.next().toDate()
    } else if (args.scheduleType === 'interval') {
      const ms = parseInt(args.scheduleValue, 10)
      nextRun = new Date(Date.now() + ms)
    } else if (args.scheduleType === 'once') {
      nextRun = new Date(args.scheduleValue)
    }

    // Insert directly into SQLite
    const result = await db.insert(scheduledTasks).values({
      agentName: currentAgent,
      name: args.name,
      prompt: args.prompt,
      scheduleType: args.scheduleType,
      scheduleValue: args.scheduleValue,
      contextMode: args.contextMode,
      status: 'active',
      nextRun,
      createdAt: new Date(),
    })

    return {
      content: [
        {
          type: 'text',
          text: `Task scheduled (ID: ${result.lastInsertRowid}). Next run: ${nextRun?.toISOString()}`,
        },
      ],
    }
  },
)
```

---

## SQLite IPC Design

### Core Table Schema

```sql
-- Scheduled tasks
CREATE TABLE scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  name TEXT,
  prompt TEXT NOT NULL,
  schedule_type TEXT NOT NULL,      -- 'cron', 'interval', 'once'
  schedule_value TEXT NOT NULL,
  context_mode TEXT DEFAULT 'isolated',
  status TEXT DEFAULT 'active',     -- 'active', 'paused', 'completed'
  next_run TIMESTAMP,
  last_run TIMESTAMP,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_next_run ON scheduled_tasks(next_run);
CREATE INDEX idx_status ON scheduled_tasks(status);

-- Inter-agent messages
CREATE TABLE agent_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'message',
  status TEXT DEFAULT 'pending',    -- 'pending', 'read', 'archived'
  created_at TIMESTAMP NOT NULL,
  read_at TIMESTAMP
);

-- Agent metadata
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  status TEXT DEFAULT 'active',
  workspace_path TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  last_active_at TIMESTAMP
);

-- Chat sessions
CREATE TABLE chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  session_id TEXT NOT NULL,         -- Claude session ID
  user_id TEXT,
  started_at TIMESTAMP NOT NULL,
  last_message_at TIMESTAMP,
  message_count INTEGER DEFAULT 0
);

-- Message history
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  role TEXT NOT NULL,               -- 'user', 'assistant'
  content TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL
);
```

### IPC Communication Flow

**Agent → Server (schedule task):**

```
Agent executes → MCP tool: schedule_task() → INSERT INTO scheduled_tasks
```

**Agent → Agent (message):**

```
Agent A → MCP tool: send_to_agent() → INSERT INTO agent_inbox
Agent B starts → SELECT FROM agent_inbox WHERE to_agent='B'
```

**Server → Agent (execute task):**

```
Scheduler tick() → SELECT FROM scheduled_tasks WHERE next_run <= now()
→ executeAgent() → update next_run
```

---

## Scheduler Implementation

### Simple Polling Mechanism

```typescript
export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null
  private readonly pollInterval = 30000 // 30 seconds

  start() {
    this.intervalId = setInterval(() => this.tick(), this.pollInterval)
    this.tick() // Execute immediately once
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
  }

  private async tick() {
    // Find due tasks
    const dueTasks = await db
      .select()
      .from(scheduledTasks)
      .where(and(lte(scheduledTasks.nextRun, new Date()), eq(scheduledTasks.status, 'active')))

    // Execute each task
    for (const task of dueTasks) {
      await this.runTask(task)
    }
  }

  private async runTask(task: ScheduledTask) {
    try {
      // Execute agent
      await executeAgent({
        agentName: task.agentName,
        prompt: task.prompt,
        sessionType: task.contextMode === 'main' ? 'chat' : 'cron',
        sessionId: task.contextMode === 'main' ? undefined : `cron-${task.id}`,
      })

      // Calculate next run
      const nextRun = this.calculateNextRun(task)

      // Update task
      await db
        .update(scheduledTasks)
        .set({
          lastRun: new Date(),
          nextRun,
          status: nextRun ? 'active' : 'completed',
        })
        .where(eq(scheduledTasks.id, task.id))
    } catch (error) {
      console.error(`Task ${task.id} failed:`, error)
    }
  }

  private calculateNextRun(task: ScheduledTask): Date | null {
    if (task.scheduleType === 'cron') {
      const interval = CronExpression.parse(task.scheduleValue)
      return interval.next().toDate()
    } else if (task.scheduleType === 'interval') {
      const ms = parseInt(task.scheduleValue, 10)
      return new Date(Date.now() + ms)
    }
    return null // once task
  }
}
```

---

## Complete Execution Flows

### Scenario 1: Web Chat

```
1. User inputs message in Web UI
   ↓
2. POST /api/chat { agentName: "main", message: "..." }
   ↓
3. executeAgent()
   ↓
4. Load workspace files → compose system prompt
   ↓
5. Check inbox (if there are messages)
   ↓
6. Call Agent SDK query()
   ↓
7. Agent executes, may call MCP tools
   ↓
8. Return result
   ↓
9. Write to today's memory
   ↓
10. Return to Web UI
```

### Scenario 2: Agent Self-scheduling

```
1. User: "Send me yesterday's summary every morning at 9am"
   ↓
2. Agent understands intent
   ↓
3. Agent calls MCP tool: schedule_task({
     prompt: "Review yesterday's memory and send summary",
     schedule_type: "cron",
     schedule_value: "0 9 * * *",
     context_mode: "isolated"
   })
   ↓
4. MCP tool executes: INSERT INTO scheduled_tasks
   ↓
5. Returns: "Task scheduled (ID: 123), next run: 2026-02-04T09:00:00Z"
   ↓
6. Agent replies to user: "OK, I'll send yesterday's summary every morning at 9am"
```

### Scenario 3: Scheduled Task Execution

```
1. Scheduler ticks every 30 seconds
   ↓
2. SELECT * FROM scheduled_tasks
   WHERE next_run <= now() AND status = 'active'
   ↓
3. (Next day 9:00) Finds due task
   ↓
4. executeAgent({
     agentName: "main",
     prompt: "Review yesterday's memory and send summary",
     sessionType: "cron"
   })
   ↓
5. Agent reads yesterday's memory
   ↓
6. Agent generates summary
   ↓
7. Agent calls MCP tool: send_message("Yesterday's summary: ...")
   ↓
8. Message sent to Web UI
   ↓
9. Update task: next_run = "2026-02-05T09:00:00Z"
```

### Scenario 4: Multi-agent Coordination

```
1. Agent A is running
   ↓
2. Agent A calls MCP tool: send_to_agent({
     targetAgent: "agent-b",
     message: "Please help me analyze this data"
   })
   ↓
3. INSERT INTO agent_inbox (from='agent-a', to='agent-b', ...)
   ↓
4. (Later) Agent B starts
   ↓
5. executeAgent('agent-b', ...)
   ↓
6. SELECT FROM agent_inbox WHERE to_agent='agent-b' AND status='pending'
   ↓
7. Finds Agent A's message
   ↓
8. Message added to system prompt: "## Inbox\n- From agent-a: Please help me analyze this data"
   ↓
9. Agent B processes and replies
   ↓
10. Mark message as read: UPDATE agent_inbox SET status='read'
```

---

## Project Directory Structure

```
apps/orbit/
├── web/                                # React frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   └── App.tsx
│   │   ├── features/
│   │   │   └── chat/                   # Chat interface
│   │   │       ├── components/
│   │   │       └── api/
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── server/
│   ├── src/
│   │   ├── index.ts                    # Server entry
│   │   ├── app.ts                      # Elysia app
│   │   ├── modules/
│   │   │   ├── agents/
│   │   │   │   ├── agent.service.ts    # CRUD
│   │   │   │   ├── agent.runtime.ts    # SDK execution
│   │   │   │   ├── context.service.ts  # System prompt
│   │   │   │   ├── memory.service.ts   # Memory read/write
│   │   │   │   └── tools/
│   │   │   │       └── orbit-mcp.ts    # MCP tools
│   │   │   ├── scheduler/
│   │   │   │   └── scheduler.service.ts
│   │   │   └── chat/
│   │   │       └── chat.controller.ts
│   │   ├── core/
│   │   │   ├── db/
│   │   │   │   ├── index.ts
│   │   │   │   └── client.ts
│   │   │   ├── config/
│   │   │   │   └── env.ts
│   │   │   └── logger/
│   │   │       └── index.ts
│   │   └── plugins/
│   │       ├── cors.ts
│   │       └── swagger.ts
│   ├── drizzle/
│   │   ├── schema/
│   │   │   ├── agents.ts
│   │   │   ├── tasks.ts
│   │   │   ├── inbox.ts
│   │   │   ├── sessions.ts
│   │   │   └── index.ts
│   │   └── migrations/
│   ├── templates/                      # Workspace templates
│   │   ├── AGENTS.md
│   │   ├── SOUL.md
│   │   ├── IDENTITY.md
│   │   ├── USER.md
│   │   ├── HEARTBEAT.md
│   │   ├── BOOTSTRAP.md
│   │   └── TOOLS.md
│   ├── package.json
│   └── drizzle.config.ts
│
├── shared/                             # Type sharing
│   ├── src/
│   │   ├── types/
│   │   └── schemas/
│   └── package.json
│
└── package.json                        # Workspace root

~/.config/orbit/
├── agents/
│   └── <agent-name>/
│       ├── AGENTS.md
│       ├── SOUL.md
│       ├── IDENTITY.md
│       ├── USER.md
│       ├── HEARTBEAT.md
│       ├── BOOTSTRAP.md
│       ├── TOOLS.md
│       ├── memory/
│       │   ├── long-term.md
│       │   └── daily/
│       │       ├── 2026-02-01.md
│       │       └── 2026-02-02.md
│       └── workspace/
└── data/
    └── orbit.db                        # SQLite database
```

---

## Design Principles

1. **YAGNI**: Avoid over-engineering, only implement necessary features
2. **Simple IPC**: Direct SQLite insertion, no complex queues
3. **Workspace Completeness**: Preserve openclaw's complete workspace system
4. **Agent SDK Native**: Fully leverage Agent SDK capabilities
5. **Self-configuration**: Agents configure their own behavior through MCP tools
6. **Multi-agent**: SQLite inbox implements asynchronous messaging
7. **Chat-only UI**: Initially only chat interface, other management by agents

---

## References

- **openclaw**: https://github.com/openclaw/openclaw
- **nanoclaw**: https://github.com/gavrielc/nanoclaw
- **Claude Agent SDK**: https://github.com/anthropics/anthropic-sdk-typescript
- **Elysia**: https://elysiajs.com
- **Drizzle ORM**: https://orm.drizzle.team

---

## Next Steps

1. ✅ Design complete
2. ⏳ Create project structure
3. ⏳ Implement database schema
4. ⏳ Implement agent runtime
5. ⏳ Implement MCP tools
6. ⏳ Implement scheduler
7. ⏳ Implement chat API
8. ⏳ Test complete flow

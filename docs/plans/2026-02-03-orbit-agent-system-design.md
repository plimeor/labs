# Orbit Agent System Design

**日期**: 2026-02-03
**状态**: 设计完成
**版本**: v1.0

## 概述

Orbit 是一个结合 openclaw 完整 workspace 系统和现代 Agent SDK 的个人 AI 助手平台。

### 核心特性

- **完整 Workspace 系统**: AGENTS.md, SOUL.md, IDENTITY.md, USER.md, HEARTBEAT.md, BOOTSTRAP.md
- **Memory 管理**: 每日日志 + 长期记忆
- **Agent SDK 执行**: 使用 `@anthropic-ai/claude-agent-sdk`
- **自我调度**: Agent 可以配置自己的定时任务
- **Multi-agent 协调**: Agent 间异步消息通信
- **SQLite IPC**: 简单的数据库作为 IPC 机制
- **Web Chat UI**: Chat-only 界面

### 技术栈

- **Agent 执行**: `@anthropic-ai/claude-agent-sdk`
- **后端**: Elysia + Bun
- **数据库**: SQLite + Drizzle ORM
- **前端**: React + Vite (minimal chat UI)
- **调度**: 简单轮询机制（30秒）

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────┐
│   Elysia Server (单进程)                 │
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
│  │  - 每 30 秒轮询 SQLite          │   │
│  │  - 执行到期任务                  │   │
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
│   Agent Workspace (文件系统)             │
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

## Agent Workspace 系统

### 目录结构

```
~/.config/orbit/agents/<agent-name>/
├── AGENTS.md              # 操作指南，每次会话加载
├── SOUL.md                # 个性、语气、边界
├── IDENTITY.md            # Agent 元数据（名字、特征）
├── USER.md                # 关于用户的学习信息
├── HEARTBEAT.md           # 定期心跳检查清单
├── BOOTSTRAP.md           # 首次运行仪式（完成后删除）
├── TOOLS.md               # 可用工具文档
├── memory/
│   ├── long-term.md       # 长期记忆
│   └── daily/
│       ├── 2026-02-01.md  # 每日日志
│       ├── 2026-02-02.md
│       └── 2026-02-03.md
└── workspace/             # Agent 工作目录
    └── (agent 创建的文件)
```

### 文件用途

| 文件 | 用途 | 更新方式 |
|------|------|---------|
| AGENTS.md | 操作协议、memory 管理规则 | 静态模板 |
| SOUL.md | 个性特征、沟通风格 | 静态模板 |
| IDENTITY.md | Agent 身份（bootstrap 时填写） | Agent 首次运行时创建 |
| USER.md | 用户信息 | Agent 学习更新 |
| HEARTBEAT.md | 定期检查任务 | 静态模板 |
| BOOTSTRAP.md | 首次设置向导 | 完成后删除 |
| TOOLS.md | 工具使用说明 | 静态模板 |
| memory/long-term.md | 重要事实 | Agent 整理更新 |
| memory/daily/*.md | 每日活动日志 | Agent 会话结束时写入 |

---

## System Prompt 组合

### 加载流程

```typescript
async function composeSystemPrompt(
  agentName: string,
  sessionType: 'chat' | 'heartbeat' | 'cron'
): Promise<string> {
  const workspacePath = `~/.config/orbit/agents/${agentName}/`;

  // 1. 加载核心个性文件（总是）
  const agents = await readFile(`${workspacePath}/AGENTS.md`);
  const soul = await readFile(`${workspacePath}/SOUL.md`);
  const identity = await readFile(`${workspacePath}/IDENTITY.md`);
  const user = await readFile(`${workspacePath}/USER.md`);
  const tools = await readFile(`${workspacePath}/TOOLS.md`);

  // 2. 加载最近 memory（今天 + 昨天）
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const memoryToday = await readFile(`${workspacePath}/memory/daily/${today}.md`);
  const memoryYesterday = await readFile(`${workspacePath}/memory/daily/${yesterday}.md`);
  const longTerm = await readFile(`${workspacePath}/memory/long-term.md`);

  // 3. 组合 system prompt
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
  `.trim();
}
```

### 文件截断规则

- 每个文件最大 20,000 字符
- 超过限制：保留 70% 头部 + 20% 尾部
- 缺失文件：跳过，不报错

---

## Agent SDK 集成

### 执行流程

```typescript
export async function executeAgent(params: {
  agentName: string;
  prompt: string;
  sessionType: 'chat' | 'heartbeat' | 'cron';
  sessionId?: string;
}): Promise<{ result: string; newSessionId: string }> {

  const workspacePath = `~/.config/orbit/agents/${params.agentName}/workspace`;

  // 1. 检查 inbox（agent 间消息）
  const inbox = await checkInbox(params.agentName);

  // 2. 组合 system prompt
  let systemPrompt = await composeSystemPrompt(params.agentName, params.sessionType);

  // 3. 添加 inbox 消息到 system prompt
  if (inbox.length > 0) {
    systemPrompt += `\n\n## Inbox\n\nYou have ${inbox.length} messages:\n`;
    inbox.forEach(msg => {
      systemPrompt += `- From ${msg.fromAgent}: ${msg.message}\n`;
    });
  }

  // 4. 创建 MCP server
  const orbitMcp = createOrbitMcp(params.agentName);

  // 5. 执行 Agent SDK
  let result = '';
  let newSessionId = '';

  for await (const message of query({
    prompt: params.prompt,
    options: {
      cwd: workspacePath,
      resume: params.sessionId,
      systemPrompt: systemPrompt,
      allowedTools: [
        'Bash',
        'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebSearch', 'WebFetch',
        'mcp__orbit__*'
      ],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        orbit: orbitMcp
      }
    }
  })) {

    if (message.type === 'system' && message.subtype === 'init') {
      newSessionId = message.session_id;
    }

    if ('result' in message && message.result) {
      result = message.result as string;
    }
  }

  // 6. 标记 inbox 已读
  if (inbox.length > 0) {
    await markInboxRead(inbox.map(m => m.id));
  }

  // 7. 写入今日 memory
  await appendDailyMemory(params.agentName, {
    sessionType: params.sessionType,
    prompt: params.prompt,
    result: result,
    timestamp: new Date()
  });

  return { result, newSessionId };
}
```

---

## MCP Tools (Agent 能力)

### Tool 列表

| Tool | 描述 | 用途 |
|------|------|------|
| `send_to_agent` | 发送消息给另一个 agent | Multi-agent 协调 |
| `schedule_task` | 调度定时任务 | Self-configuration |
| `list_tasks` | 列出所有任务 | 查看调度状态 |
| `pause_task` | 暂停任务 | 任务管理 |
| `resume_task` | 恢复任务 | 任务管理 |
| `cancel_task` | 取消任务 | 任务管理 |

### schedule_task 实现

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
    name: z.string().optional()
  },
  async (args) => {
    // 计算 next_run
    let nextRun: Date | null = null;

    if (args.scheduleType === 'cron') {
      const interval = CronExpression.parse(args.scheduleValue);
      nextRun = interval.next().toDate();
    } else if (args.scheduleType === 'interval') {
      const ms = parseInt(args.scheduleValue, 10);
      nextRun = new Date(Date.now() + ms);
    } else if (args.scheduleType === 'once') {
      nextRun = new Date(args.scheduleValue);
    }

    // 直接插入 SQLite
    const result = await db.insert(scheduledTasks).values({
      agentName: currentAgent,
      name: args.name,
      prompt: args.prompt,
      scheduleType: args.scheduleType,
      scheduleValue: args.scheduleValue,
      contextMode: args.contextMode,
      status: 'active',
      nextRun,
      createdAt: new Date()
    });

    return {
      content: [{
        type: 'text',
        text: `Task scheduled (ID: ${result.lastInsertRowid}). Next run: ${nextRun?.toISOString()}`
      }]
    };
  }
)
```

---

## SQLite IPC 设计

### 核心表 Schema

```sql
-- 定时任务
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

-- Agent 间消息
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

-- Agent 元数据
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  status TEXT DEFAULT 'active',
  workspace_path TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  last_active_at TIMESTAMP
);

-- 会话记录
CREATE TABLE chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  session_id TEXT NOT NULL,         -- Claude session ID
  user_id TEXT,
  started_at TIMESTAMP NOT NULL,
  last_message_at TIMESTAMP,
  message_count INTEGER DEFAULT 0
);

-- 消息历史
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  role TEXT NOT NULL,               -- 'user', 'assistant'
  content TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL
);
```

### IPC 通信流程

**Agent → Server (调度任务):**
```
Agent 执行 → MCP tool: schedule_task() → INSERT INTO scheduled_tasks
```

**Agent → Agent (消息):**
```
Agent A → MCP tool: send_to_agent() → INSERT INTO agent_inbox
Agent B 启动 → SELECT FROM agent_inbox WHERE to_agent='B'
```

**Server → Agent (执行任务):**
```
Scheduler tick() → SELECT FROM scheduled_tasks WHERE next_run <= now()
→ executeAgent() → 更新 next_run
```

---

## Scheduler 实现

### 简单轮询机制

```typescript
export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly pollInterval = 30000; // 30 秒

  start() {
    this.intervalId = setInterval(() => this.tick(), this.pollInterval);
    this.tick(); // 立即执行一次
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async tick() {
    // 查找到期任务
    const dueTasks = await db.select()
      .from(scheduledTasks)
      .where(and(
        lte(scheduledTasks.nextRun, new Date()),
        eq(scheduledTasks.status, 'active')
      ));

    // 执行每个任务
    for (const task of dueTasks) {
      await this.runTask(task);
    }
  }

  private async runTask(task: ScheduledTask) {
    try {
      // 执行 agent
      await executeAgent({
        agentName: task.agentName,
        prompt: task.prompt,
        sessionType: task.contextMode === 'main' ? 'chat' : 'cron',
        sessionId: task.contextMode === 'main' ? undefined : `cron-${task.id}`
      });

      // 计算下次运行
      const nextRun = this.calculateNextRun(task);

      // 更新任务
      await db.update(scheduledTasks)
        .set({
          lastRun: new Date(),
          nextRun,
          status: nextRun ? 'active' : 'completed'
        })
        .where(eq(scheduledTasks.id, task.id));

    } catch (error) {
      console.error(`Task ${task.id} failed:`, error);
    }
  }

  private calculateNextRun(task: ScheduledTask): Date | null {
    if (task.scheduleType === 'cron') {
      const interval = CronExpression.parse(task.scheduleValue);
      return interval.next().toDate();
    } else if (task.scheduleType === 'interval') {
      const ms = parseInt(task.scheduleValue, 10);
      return new Date(Date.now() + ms);
    }
    return null; // once 任务
  }
}
```

---

## 完整执行流程

### 场景 1: Web Chat

```
1. 用户在 Web UI 输入消息
   ↓
2. POST /api/chat { agentName: "main", message: "..." }
   ↓
3. executeAgent()
   ↓
4. 加载 workspace 文件 → 组合 system prompt
   ↓
5. 检查 inbox（如有消息）
   ↓
6. 调用 Agent SDK query()
   ↓
7. Agent 执行，可能调用 MCP tools
   ↓
8. 返回结果
   ↓
9. 写入今日 memory
   ↓
10. 返回给 Web UI
```

### 场景 2: Agent 自我调度

```
1. 用户: "每天早上 9 点给我发送昨日总结"
   ↓
2. Agent 理解意图
   ↓
3. Agent 调用 MCP tool: schedule_task({
     prompt: "Review yesterday's memory and send summary",
     schedule_type: "cron",
     schedule_value: "0 9 * * *",
     context_mode: "isolated"
   })
   ↓
4. MCP tool 执行: INSERT INTO scheduled_tasks
   ↓
5. 返回: "Task scheduled (ID: 123), next run: 2026-02-04T09:00:00Z"
   ↓
6. Agent 回复用户: "好的，我会每天早上 9 点发送昨日总结"
```

### 场景 3: 定时任务执行

```
1. Scheduler 每 30 秒 tick()
   ↓
2. SELECT * FROM scheduled_tasks
   WHERE next_run <= now() AND status = 'active'
   ↓
3. （次日 9:00）发现到期任务
   ↓
4. executeAgent({
     agentName: "main",
     prompt: "Review yesterday's memory and send summary",
     sessionType: "cron"
   })
   ↓
5. Agent 读取昨日 memory
   ↓
6. Agent 生成总结
   ↓
7. Agent 调用 MCP tool: send_message("昨日总结: ...")
   ↓
8. 消息发送到 Web UI
   ↓
9. 更新任务: next_run = "2026-02-05T09:00:00Z"
```

### 场景 4: Multi-agent 协调

```
1. Agent A 运行中
   ↓
2. Agent A 调用 MCP tool: send_to_agent({
     targetAgent: "agent-b",
     message: "请帮我分析这个数据"
   })
   ↓
3. INSERT INTO agent_inbox (from='agent-a', to='agent-b', ...)
   ↓
4. （稍后）Agent B 启动
   ↓
5. executeAgent('agent-b', ...)
   ↓
6. SELECT FROM agent_inbox WHERE to_agent='agent-b' AND status='pending'
   ↓
7. 发现 Agent A 的消息
   ↓
8. 消息添加到 system prompt: "## Inbox\n- From agent-a: 请帮我分析这个数据"
   ↓
9. Agent B 处理并回复
   ↓
10. 标记消息已读: UPDATE agent_inbox SET status='read'
```

---

## 项目目录结构

```
apps/orbit/
├── web/                                # React 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   └── App.tsx
│   │   ├── features/
│   │   │   └── chat/                   # Chat 界面
│   │   │       ├── components/
│   │   │       └── api/
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── server/
│   ├── src/
│   │   ├── index.ts                    # Server 入口
│   │   ├── app.ts                      # Elysia app
│   │   ├── modules/
│   │   │   ├── agents/
│   │   │   │   ├── agent.service.ts    # CRUD
│   │   │   │   ├── agent.runtime.ts    # SDK 执行
│   │   │   │   ├── context.service.ts  # System prompt
│   │   │   │   ├── memory.service.ts   # Memory 读写
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
├── shared/                             # 类型共享
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
    └── orbit.db                        # SQLite 数据库
```

---

## 设计原则

1. **YAGNI**: 避免过度设计，只实现必要功能
2. **简单 IPC**: 直接 SQLite 插入，无复杂队列
3. **Workspace 完整性**: 保留 openclaw 的完整 workspace 系统
4. **Agent SDK 原生**: 充分利用 Agent SDK 能力
5. **自我配置**: Agent 通过 MCP tools 配置自己的行为
6. **Multi-agent**: SQLite inbox 实现异步消息
7. **Chat-only UI**: 初期只做聊天界面，其他由 agent 管理

---

## 参考资料

- **openclaw**: https://github.com/openclaw/openclaw
- **nanoclaw**: https://github.com/gavrielc/nanoclaw
- **Claude Agent SDK**: https://github.com/anthropics/anthropic-sdk-typescript
- **Elysia**: https://elysiajs.com
- **Drizzle ORM**: https://orm.drizzle.team

---

## 下一步

1. ✅ 设计完成
2. ⏳ 创建项目结构
3. ⏳ 实现 database schema
4. ⏳ 实现 agent runtime
5. ⏳ 实现 MCP tools
6. ⏳ 实现 scheduler
7. ⏳ 实现 chat API
8. ⏳ 测试完整流程

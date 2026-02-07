# Orbit Server Multi-Session Refactoring - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the Orbit server to support multi-session agent isolation, inbox claiming, git worktrees, and a complete REST API — informed by patterns from craft-agent-oss and openclaw.

**Architecture:** Agent = config entity, Session = execution unit. Each session gets its own OrbitAgent instance (keyed `agentName:sessionId`) with isolated SDK state, inbox claims, and conversation history. The scheduler creates fresh sessions per task. All new REST endpoints follow the design doc spec.

**Tech Stack:** Bun, Elysia, `@anthropic-ai/claude-agent-sdk`, filesystem JSON stores, JSONL messages, `cron-parser`, `zod`

---

## Reference Patterns Adopted

**From craft-agent-oss:**
- SDK session resume via `sdkSessionId` capture and re-pass
- Async generator event stream (`chat()` yields events)
- Permission mode hooks via PreToolUse callback
- JSONL message storage (already in Orbit)

**From openclaw:**
- Cron service with proper isolated sessions per execution
- Session metadata with `title` for UI display
- Atomic file operations (write-to-temp-then-rename)

---

## Task 1: InboxStore — Add `claimedBy` Field and Atomic Claim

**Files:**
- Modify: `apps/orbit/server/src/stores/inbox.store.ts`
- Test: `apps/orbit/server/src/__tests__/stores/inbox.store.test.ts`

### Step 1: Write the failing tests

```typescript
// In inbox.store.test.ts — add new describe blocks

describe('claim', () => {
  it('should claim an unclaimed message for a session', async () => {
    const msg = await store.send({
      fromAgent: 'bot-a', toAgent: 'bot-b',
      message: 'Hello', messageType: 'request',
    })

    const claimed = await store.claim('bot-b', msg.id, 'session-1')
    expect(claimed).toBe(true)

    const pending = await store.getPending('bot-b')
    expect(pending[0]!.claimedBy).toBe('session-1')
  })

  it('should reject claiming an already-claimed message', async () => {
    const msg = await store.send({
      fromAgent: 'bot-a', toAgent: 'bot-b',
      message: 'Hello', messageType: 'request',
    })

    await store.claim('bot-b', msg.id, 'session-1')
    const secondClaim = await store.claim('bot-b', msg.id, 'session-2')
    expect(secondClaim).toBe(false)
  })
})

describe('getUnclaimed', () => {
  it('should return only unclaimed pending messages', async () => {
    const msg1 = await store.send({
      fromAgent: 'bot-a', toAgent: 'bot-b',
      message: 'Msg 1', messageType: 'request',
    })
    await store.send({
      fromAgent: 'bot-a', toAgent: 'bot-b',
      message: 'Msg 2', messageType: 'request',
    })

    await store.claim('bot-b', msg1.id, 'session-1')

    const unclaimed = await store.getUnclaimed('bot-b')
    expect(unclaimed.length).toBe(1)
    expect(unclaimed[0]!.message).toBe('Msg 2')
  })
})
```

### Step 2: Run tests to verify they fail

```bash
cd apps/orbit/server && bun test src/__tests__/stores/inbox.store.test.ts
```
Expected: FAIL — `store.claim` and `store.getUnclaimed` do not exist.

### Step 3: Implement claim mechanism

Update `inbox.store.ts`:

```typescript
export interface InboxMessage {
  id: string
  fromAgent: string
  toAgent: string
  message: string
  messageType: 'request' | 'response'
  requestId?: string
  status: 'pending' | 'read' | 'archived'
  claimedBy?: string       // sessionId that claimed this message
  claimedAt?: string       // ISO timestamp of claim
  createdAt: string
  readAt: string | null
}

// New method: atomic claim (read-check-write)
async claim(agentName: string, messageId: string, sessionId: string): Promise<boolean> {
  const filePath = join(this.pendingDir(agentName), `${messageId}.json`)
  if (!existsSync(filePath)) return false

  const content = await readFile(filePath, 'utf-8')
  const msg = JSON.parse(content) as InboxMessage

  if (msg.claimedBy) return false  // Already claimed

  msg.claimedBy = sessionId
  msg.claimedAt = new Date().toISOString()

  // Atomic write: temp file then rename
  const tmpPath = `${filePath}.tmp`
  await writeFile(tmpPath, JSON.stringify(msg, null, 2))
  await rename(tmpPath, filePath)
  return true
}

// New method: get only unclaimed messages
async getUnclaimed(agentName: string): Promise<InboxMessage[]> {
  const all = await this.getPending(agentName)
  return all.filter(m => !m.claimedBy)
}
```

Add `import { rename } from 'fs/promises'` to imports.

### Step 4: Run tests to verify they pass

```bash
cd apps/orbit/server && bun test src/__tests__/stores/inbox.store.test.ts
```
Expected: PASS

### Step 5: Commit

```bash
git add apps/orbit/server/src/stores/inbox.store.ts apps/orbit/server/src/__tests__/stores/inbox.store.test.ts
git commit -m "feat(orbit): add inbox claim mechanism with claimedBy field"
```

---

## Task 2: SessionStore — Add `delete`, `update`, and `title` field

**Files:**
- Modify: `apps/orbit/server/src/stores/session.store.ts`
- Test: `apps/orbit/server/src/__tests__/stores/session.store.test.ts`

### Step 1: Write the failing tests

```typescript
describe('delete', () => {
  it('should delete a session directory', async () => {
    const session = await store.create(agentName, {})
    await store.delete(agentName, session.id)

    const result = await store.get(agentName, session.id)
    expect(result).toBeUndefined()
  })
})

describe('update', () => {
  it('should update session metadata fields', async () => {
    const session = await store.create(agentName, {})
    await store.update(agentName, session.id, {
      title: 'My Chat',
      sdkSessionId: 'sdk-456',
    })

    const updated = await store.get(agentName, session.id)
    expect(updated!.title).toBe('My Chat')
    expect(updated!.sdkSessionId).toBe('sdk-456')
  })
})
```

### Step 2: Run tests — expect FAIL

### Step 3: Implement

Update `SessionMetadata` interface:

```typescript
export interface SessionMetadata {
  id: string
  title?: string           // User-visible session title
  sdkSessionId?: string
  model?: string
  permissionMode?: string
  createdAt: string
  lastMessageAt: string | null
  messageCount: number
}
```

Add methods:

```typescript
async update(agentName: string, sessionId: string, updates: Partial<SessionMetadata>): Promise<SessionMetadata> {
  const session = await this.get(agentName, sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  const updated = { ...session, ...updates }
  await writeFile(this.sessionJsonPath(agentName, sessionId), JSON.stringify(updated, null, 2))
  return updated
}

async delete(agentName: string, sessionId: string): Promise<void> {
  const dir = this.sessionDir(agentName, sessionId)
  if (!existsSync(dir)) throw new Error(`Session not found: ${sessionId}`)
  await rm(dir, { recursive: true })
}
```

Add `import { rm } from 'fs/promises'` to imports.

### Step 4: Run tests — expect PASS

### Step 5: Commit

```bash
git add apps/orbit/server/src/stores/session.store.ts apps/orbit/server/src/__tests__/stores/session.store.test.ts
git commit -m "feat(orbit): add session delete, update, and title field"
```

---

## Task 3: AgentPool — Rekey to `agentName:sessionId`

**Files:**
- Modify: `apps/orbit/server/src/modules/agent/agent-pool.ts`
- Test: `apps/orbit/server/src/__tests__/modules/agent/agent-pool.test.ts` (create)

### Step 1: Write the failing tests

```typescript
import { describe, it, expect, beforeEach } from 'bun:test'
import { AgentPool } from '@/modules/agent/agent-pool'

// Mock deps
const mockDeps = {
  basePath: '/tmp/test',
  agentStore: {} as any,
  taskStore: {} as any,
  inboxStore: {} as any,
  sessionStore: {} as any,
}

describe('AgentPool', () => {
  let pool: AgentPool

  beforeEach(() => {
    pool = new AgentPool(mockDeps)
  })

  it('should create separate instances for same agent with different sessions', async () => {
    const a1 = await pool.get('bot', 'session-1')
    const a2 = await pool.get('bot', 'session-2')

    expect(a1).not.toBe(a2)
    expect(pool.size()).toBe(2)
  })

  it('should return same instance for same agent+session', async () => {
    const a1 = await pool.get('bot', 'session-1')
    const a2 = await pool.get('bot', 'session-1')

    expect(a1).toBe(a2)
    expect(pool.size()).toBe(1)
  })

  it('should release by agent+session key', async () => {
    await pool.get('bot', 'session-1')
    await pool.get('bot', 'session-2')

    pool.release('bot', 'session-1')
    expect(pool.size()).toBe(1)
    expect(pool.has('bot', 'session-2')).toBe(true)
  })

  it('should release all sessions for an agent', async () => {
    await pool.get('bot', 's1')
    await pool.get('bot', 's2')
    await pool.get('other', 's3')

    pool.releaseAgent('bot')
    expect(pool.size()).toBe(1)
  })
})
```

### Step 2: Run tests — expect FAIL

### Step 3: Rewrite AgentPool

```typescript
import { OrbitAgent, type OrbitAgentDeps } from './orbit-agent'

export class AgentPool {
  private agents: Map<string, OrbitAgent> = new Map()
  private lastAccess: Map<string, number> = new Map()
  private evictionTimer?: ReturnType<typeof setInterval>
  private deps: OrbitAgentDeps

  constructor(deps: OrbitAgentDeps) {
    this.deps = deps
  }

  private key(agentName: string, sessionId: string): string {
    return `${agentName}:${sessionId}`
  }

  async get(agentName: string, sessionId: string): Promise<OrbitAgent> {
    const k = this.key(agentName, sessionId)
    let agent = this.agents.get(k)
    if (!agent) {
      agent = new OrbitAgent(agentName, sessionId, this.deps)
      this.agents.set(k, agent)
    }
    this.lastAccess.set(k, Date.now())
    return agent
  }

  release(agentName: string, sessionId: string): void {
    const k = this.key(agentName, sessionId)
    const agent = this.agents.get(k)
    if (agent) {
      agent.abort()
      this.agents.delete(k)
      this.lastAccess.delete(k)
    }
  }

  releaseAgent(agentName: string): void {
    const prefix = `${agentName}:`
    for (const [k, agent] of this.agents.entries()) {
      if (k.startsWith(prefix)) {
        agent.abort()
        this.agents.delete(k)
        this.lastAccess.delete(k)
      }
    }
  }

  startEviction(ttlMs: number = 10 * 60 * 1000): void {
    this.evictionTimer = setInterval(() => {
      const now = Date.now()
      for (const [k, lastAccess] of this.lastAccess.entries()) {
        if (now - lastAccess > ttlMs) {
          const agent = this.agents.get(k)
          if (agent) agent.abort()
          this.agents.delete(k)
          this.lastAccess.delete(k)
        }
      }
    }, ttlMs / 2)
  }

  stopEviction(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer)
      this.evictionTimer = undefined
    }
  }

  has(agentName: string, sessionId: string): boolean {
    return this.agents.has(this.key(agentName, sessionId))
  }

  size(): number {
    return this.agents.size
  }
}
```

### Step 4: Run tests — expect PASS

### Step 5: Commit

```bash
git add apps/orbit/server/src/modules/agent/agent-pool.ts apps/orbit/server/src/__tests__/modules/agent/agent-pool.test.ts
git commit -m "refactor(orbit): rekey AgentPool to agentName:sessionId"
```

---

## Task 4: OrbitAgent — Session-Aware with SDK Resume and Inbox Claiming

**Files:**
- Modify: `apps/orbit/server/src/modules/agent/orbit-agent.ts`
- Test: `apps/orbit/server/src/__tests__/modules/agent/orbit-agent.test.ts`

### Step 1: Write the failing tests

Add tests for:
- Constructor accepts `sessionId`
- `chat()` loads `sdkSessionId` from SessionStore on first call
- `chat()` saves updated `sdkSessionId` back to SessionStore after SDK returns it
- `chat()` claims inbox messages atomically for this session
- `chat()` only processes claimed (not all pending) messages

### Step 2: Run tests — expect FAIL

### Step 3: Rewrite OrbitAgent

```typescript
export class OrbitAgent {
  readonly name: string
  readonly sessionId: string
  private deps: OrbitAgentDeps
  private sdkSessionId?: string
  private abortController?: AbortController

  constructor(name: string, sessionId: string, deps: OrbitAgentDeps) {
    this.name = name
    this.sessionId = sessionId
    this.deps = deps
  }

  async buildMcpServers() {
    // Same as before — unchanged
  }

  async *chat(prompt: string, opts: ChatOptions): AsyncGenerator<SDKMessage> {
    const { sessionType } = opts

    // Load SDK session ID from store for resume (if not already loaded)
    if (!this.sdkSessionId) {
      const session = await this.deps.sessionStore.get(this.name, this.sessionId)
      this.sdkSessionId = session?.sdkSessionId
    }

    // Claim inbox messages atomically for this session
    const unclaimed = await this.deps.inboxStore.getUnclaimed(this.name)
    const claimed: InboxMessage[] = []
    for (const msg of unclaimed) {
      const ok = await this.deps.inboxStore.claim(this.name, msg.id, this.sessionId)
      if (ok) claimed.push(msg)
    }

    const inboxMessages = claimed.map(m => ({
      id: m.id,
      fromAgent: m.fromAgent,
      message: m.message,
    }))

    const systemPrompt = await composeSystemPrompt(this.name, sessionType, inboxMessages)
    const agentWorkspacePath = this.deps.agentStore.getWorkingDir(this.name)
    const mcpServers = await this.buildMcpServers()

    this.abortController = new AbortController()

    const options = {
      model: opts.model || 'claude-sonnet-4-5-20250929',
      cwd: agentWorkspacePath,
      systemPrompt: {
        type: 'preset' as const,
        preset: 'claude_code' as const,
        append: systemPrompt,
      },
      tools: { type: 'preset' as const, preset: 'claude_code' as const },
      mcpServers,
      resume: this.sdkSessionId,
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: 50,
      abortController: this.abortController,
    }

    let result = ''

    try {
      const q = query({ prompt, options })

      for await (const message of q) {
        if (message.type === 'system') {
          const newSdkSessionId = (message as any).sessionId as string | undefined
          if (newSdkSessionId && newSdkSessionId !== this.sdkSessionId) {
            this.sdkSessionId = newSdkSessionId
            // Persist SDK session ID for future resume
            await this.deps.sessionStore.update(this.name, this.sessionId, {
              sdkSessionId: newSdkSessionId,
            })
          }
        }

        if (message.type === 'result') {
          result = ((message as any).result as string) ?? ''
        }

        yield message
      }
    } finally {
      // Archive claimed inbox messages
      if (claimed.length > 0) {
        await this.deps.inboxStore.markRead(this.name, claimed.map(m => m.id))
      }

      await this.deps.agentStore.updateLastActive(this.name)

      await appendDailyMemory(this.name, {
        sessionType,
        prompt,
        result,
        timestamp: new Date(),
      })

      if (qmd.isQmdAvailable()) {
        qmd.updateIndex(this.name).catch(err => {
          logger.warn(`Failed to update QMD index for agent ${this.name}`, { error: err })
        })
      }
    }
  }

  abort(): void {
    this.abortController?.abort()
  }
}
```

Key changes:
- Constructor takes `sessionId`
- `sdkSessionId` loaded from SessionStore on first chat
- `sdkSessionId` saved back to SessionStore when SDK returns new one
- Inbox: uses `getUnclaimed()` + `claim()` instead of `getPending()`
- Context service InboxMessage interface updated (id becomes `string`, not `number`)

### Step 4: Run tests — expect PASS

### Step 5: Commit

```bash
git add apps/orbit/server/src/modules/agent/orbit-agent.ts apps/orbit/server/src/__tests__/modules/agent/orbit-agent.test.ts
git commit -m "refactor(orbit): session-aware OrbitAgent with SDK resume and inbox claiming"
```

---

## Task 5: ContextService — Fix InboxMessage Type Mismatch

**Files:**
- Modify: `apps/orbit/server/src/modules/agent/services/context.service.ts`

### Step 1: Write the failing test

Test that `composeSystemPrompt` accepts inbox messages with `string` ids.

### Step 2: Run test — expect FAIL

### Step 3: Fix the type

```typescript
// Change InboxMessage.id from number to string
export interface InboxMessage {
  id: string         // was: number
  fromAgent: string
  message: string
}
```

### Step 4: Run tests — expect PASS

### Step 5: Commit

```bash
git add apps/orbit/server/src/modules/agent/services/context.service.ts
git commit -m "fix(orbit): change InboxMessage.id type from number to string"
```

---

## Task 6: WorkspaceService — Add Git Worktree Operations

**Files:**
- Modify: `apps/orbit/server/src/modules/agent/services/workspace.service.ts`
- Test: `apps/orbit/server/src/__tests__/modules/agent/services/workspace.service.test.ts` (create)

### Step 1: Write the failing tests

```typescript
describe('git worktree operations', () => {
  it('createWorktree should create a git worktree directory', async () => {
    // Setup: init a git repo in workspace dir
    const agentName = 'worktree-test'
    const workingDir = getAgentWorkingDir(agentName)
    await mkdir(workingDir, { recursive: true })
    await $`git -C ${workingDir} init && git -C ${workingDir} commit --allow-empty -m "init"`

    const wtPath = await createWorktree(agentName, 'task-1', 'feature/task-1')
    expect(existsSync(wtPath)).toBe(true)
  })

  it('listWorktrees should list active worktrees', async () => {
    // After creating one, list should contain it
    const trees = await listWorktrees(agentName)
    expect(trees.length).toBe(1)
    expect(trees[0]!.taskId).toBe('task-1')
  })

  it('deleteWorktree should remove the worktree', async () => {
    await deleteWorktree(agentName, 'task-1')
    const trees = await listWorktrees(agentName)
    expect(trees.length).toBe(0)
  })
})
```

### Step 2: Run tests — expect FAIL

### Step 3: Implement git worktree functions

```typescript
const WORKTREES_DIR = '.worktrees'

export function getWorktreesDir(agentName: string): string {
  return join(getAgentWorkingDir(agentName), WORKTREES_DIR)
}

export function getWorktreePath(agentName: string, taskId: string): string {
  return join(getWorktreesDir(agentName), taskId)
}

export async function createWorktree(
  agentName: string,
  taskId: string,
  branch?: string,
): Promise<string> {
  const workingDir = getAgentWorkingDir(agentName)
  const wtPath = getWorktreePath(agentName, taskId)

  await mkdir(join(workingDir, WORKTREES_DIR), { recursive: true })

  const branchArg = branch ? ['-b', branch] : []
  const proc = Bun.spawn(
    ['git', 'worktree', 'add', ...branchArg, wtPath],
    { cwd: workingDir, stdout: 'pipe', stderr: 'pipe' },
  )
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`git worktree add failed: ${stderr}`)
  }

  return wtPath
}

export async function deleteWorktree(agentName: string, taskId: string): Promise<void> {
  const workingDir = getAgentWorkingDir(agentName)
  const wtPath = getWorktreePath(agentName, taskId)

  const proc = Bun.spawn(
    ['git', 'worktree', 'remove', '--force', wtPath],
    { cwd: workingDir, stdout: 'pipe', stderr: 'pipe' },
  )
  await proc.exited
}

export async function listWorktrees(
  agentName: string,
): Promise<Array<{ taskId: string; path: string; branch?: string }>> {
  const wtDir = getWorktreesDir(agentName)
  if (!existsSync(wtDir)) return []

  const entries = await readdir(wtDir, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory())
    .map(e => ({
      taskId: e.name,
      path: join(wtDir, e.name),
    }))
}
```

### Step 4: Run tests — expect PASS

### Step 5: Commit

```bash
git add apps/orbit/server/src/modules/agent/services/workspace.service.ts apps/orbit/server/src/__tests__/modules/agent/services/workspace.service.test.ts
git commit -m "feat(orbit): add git worktree operations to workspace service"
```

---

## Task 7: SchedulerService — Create New Session Per Task

**Files:**
- Modify: `apps/orbit/server/src/modules/scheduler/scheduler.service.ts`
- Test: update existing scheduler tests if any, or create

### Step 1: Write the failing tests

```typescript
it('should create a new session for each task execution', async () => {
  // Mock sessionStore.create to track calls
  // Run scheduler.tick() with a due task
  // Verify sessionStore.create was called
  // Verify agentPool.get was called with agentName + sessionId
})
```

### Step 2: Run tests — expect FAIL

### Step 3: Rewrite `runTask`

```typescript
export interface SchedulerDeps {
  taskStore: TaskStore
  sessionStore: SessionStore   // NEW: add SessionStore
  agentPool: AgentPool
}

private async runTask(agentName: string, task: TaskData): Promise<void> {
  logger.info(`Executing task ${task.id}`, { agentName, name: task.name })
  const startedAt = new Date()

  // Create fresh session for this task execution
  const session = await this.deps.sessionStore.create(agentName, {})

  try {
    const agent = await this.deps.agentPool.get(agentName, session.id)

    let result = ''
    for await (const message of agent.chat(task.prompt, {
      sessionType: task.contextMode === 'main' ? 'chat' : 'cron',
      model: undefined,
    })) {
      if (message.type === 'result') {
        result = ((message as any).result as string) ?? ''
      }
    }

    // Store messages in session
    await this.deps.sessionStore.appendMessage(agentName, session.id, {
      role: 'user', content: task.prompt,
    })
    await this.deps.sessionStore.appendMessage(agentName, session.id, {
      role: 'assistant', content: result,
    })

    // Write run record with sessionId
    await this.deps.taskStore.writeRun(agentName, {
      taskId: task.id,
      status: 'success',
      result,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
    })

    const nextRun = this.calculateNextRun(task)
    await this.deps.taskStore.update(agentName, task.id, {
      lastRun: new Date().toISOString(),
      nextRun,
      status: nextRun ? 'active' : 'completed',
    })
  } catch (error) {
    logger.error(`Task ${task.id} failed`, { error })
    await this.deps.taskStore.writeRun(agentName, {
      taskId: task.id,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
    })
  } finally {
    // Release session-specific agent from pool
    this.deps.agentPool.release(agentName, session.id)
  }
}
```

### Step 4: Run tests — expect PASS

### Step 5: Commit

```bash
git add apps/orbit/server/src/modules/scheduler/scheduler.service.ts
git commit -m "refactor(orbit): scheduler creates fresh session per task execution"
```

---

## Task 8: Chat Controller — Multi-Session SSE + Session Reuse

**Files:**
- Modify: `apps/orbit/server/src/modules/chat/chat.controller.ts`
- Test: `apps/orbit/server/src/__tests__/modules/chat/chat.controller.test.ts`

### Step 1: Write the failing tests

Test that:
- When `sessionId` is provided, that session is reused (no new session created)
- When `sessionId` is omitted, a new session is created
- Agent pool is called with `agentName:sessionId` composite key
- Multiple concurrent SSE streams to same agent work independently

### Step 2: Run tests — expect FAIL

### Step 3: Rewrite SSE chat endpoint

```typescript
.post(
  '/',
  async ({ body, set }) => {
    const { agentName, message, model } = body
    let { sessionId } = body

    await agentStore.ensure(agentName)

    // Reuse existing session or create new one
    let session: SessionMetadata
    if (sessionId) {
      const existing = await sessionStore.get(agentName, sessionId)
      if (!existing) {
        set.status = 404
        return { error: `Session not found: ${sessionId}` }
      }
      session = existing
    } else {
      session = await sessionStore.create(agentName, {})
      sessionId = session.id
    }

    // Get session-specific agent instance
    const agent = await agentPool.get(agentName, sessionId)

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        function sendEvent(type: string, data: unknown) {
          const payload = JSON.stringify({ type, ...(data as Record<string, unknown>) })
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
        }

        try {
          sendEvent('system', { sessionId })

          let resultText = ''
          for await (const msg of agent.chat(message, {
            sessionType: 'chat',
            model,
          })) {
            sendEvent(msg.type, msg)

            if (msg.type === 'result') {
              resultText = ((msg as any).result as string) ?? ''
            }
          }

          // Store messages in session
          await sessionStore.appendMessage(agentName, sessionId!, {
            role: 'user', content: message,
          })
          await sessionStore.appendMessage(agentName, sessionId!, {
            role: 'assistant', content: resultText,
          })
        } catch (error) {
          logger.error('Chat stream error', { error, agentName })
          sendEvent('error', {
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        } finally {
          controller.close()
        }
      },
    })

    set.headers['Content-Type'] = 'text/event-stream'
    set.headers['Cache-Control'] = 'no-cache'
    set.headers['Connection'] = 'keep-alive'

    return stream
  },
  {
    body: t.Object({
      agentName: t.String(),
      message: t.String(),
      sessionId: t.Optional(t.String()),
      model: t.Optional(t.String()),
    }),
  },
)
```

### Step 4: Run tests — expect PASS

### Step 5: Commit

```bash
git add apps/orbit/server/src/modules/chat/chat.controller.ts apps/orbit/server/src/__tests__/modules/chat/chat.controller.test.ts
git commit -m "refactor(orbit): multi-session SSE with session reuse and composite pool key"
```

---

## Task 9: REST API — Sessions, Inbox, Tasks, Agent Update Endpoints

**Files:**
- Modify: `apps/orbit/server/src/modules/chat/chat.controller.ts`
- Modify: `apps/orbit/server/src/app.ts`

This is the largest task — adding all missing REST endpoints from the design doc.

### Step 1: Write tests for all new endpoints

Tests for:
- `PUT /api/agents/:name` — update agent config
- `GET /api/agents/:name/sessions` — list sessions
- `POST /api/agents/:name/sessions` — create session
- `GET /api/agents/:name/sessions/:id` — get session + messages
- `DELETE /api/agents/:name/sessions/:id` — delete session
- `GET /api/agents/:name/inbox` — list inbox
- `GET /api/agents/:name/inbox/:msgId` — get message
- `DELETE /api/agents/:name/inbox/:msgId` — archive message
- `GET /api/tasks` — list all tasks
- `GET /api/agents/:name/tasks` — list agent tasks
- `POST /api/agents/:name/tasks` — create task
- `PUT /api/agents/:name/tasks/:id` — update task
- `DELETE /api/agents/:name/tasks/:id` — delete task
- `GET /api/agents/:name/tasks/:id/runs` — list runs

### Step 2: Run tests — expect FAIL

### Step 3: Implement controllers

**Split `chat.controller.ts` into separate controllers:**

Create `apps/orbit/server/src/modules/chat/sessions.controller.ts`:

```typescript
export function createSessionsController(deps: {
  sessionStore: SessionStore
  agentStore: AgentStore
}) {
  const { sessionStore, agentStore } = deps

  return new Elysia({ prefix: '/api/agents' })
    .get('/:name/sessions', async ({ params }) => {
      const sessions = await sessionStore.listByAgent(params.name)
      return { sessions }
    }, { params: t.Object({ name: t.String() }) })

    .post('/:name/sessions', async ({ params, body }) => {
      await agentStore.ensure(params.name)
      const session = await sessionStore.create(params.name, body ?? {})
      return { session }
    }, {
      params: t.Object({ name: t.String() }),
      body: t.Optional(t.Object({
        model: t.Optional(t.String()),
        permissionMode: t.Optional(t.String()),
      })),
    })

    .get('/:name/sessions/:id', async ({ params }) => {
      const session = await sessionStore.get(params.name, params.id)
      if (!session) return { error: 'Session not found' }
      const messages = await sessionStore.getMessages(params.name, params.id)
      return { session, messages }
    }, { params: t.Object({ name: t.String(), id: t.String() }) })

    .delete('/:name/sessions/:id', async ({ params }) => {
      await sessionStore.delete(params.name, params.id)
      return { success: true }
    }, { params: t.Object({ name: t.String(), id: t.String() }) })
}
```

Create `apps/orbit/server/src/modules/chat/inbox.controller.ts`:

```typescript
export function createInboxController(deps: {
  inboxStore: InboxStore
}) {
  const { inboxStore } = deps

  return new Elysia({ prefix: '/api/agents' })
    .get('/:name/inbox', async ({ params }) => {
      const messages = await inboxStore.getPending(params.name)
      return { messages }
    }, { params: t.Object({ name: t.String() }) })

    .get('/:name/inbox/:msgId', async ({ params }) => {
      const messages = await inboxStore.getPending(params.name)
      const msg = messages.find(m => m.id === params.msgId)
      if (!msg) return { error: 'Message not found' }
      return { message: msg }
    }, { params: t.Object({ name: t.String(), msgId: t.String() }) })

    .delete('/:name/inbox/:msgId', async ({ params }) => {
      await inboxStore.markRead(params.name, [params.msgId])
      return { success: true }
    }, { params: t.Object({ name: t.String(), msgId: t.String() }) })
}
```

Create `apps/orbit/server/src/modules/chat/tasks.controller.ts`:

```typescript
export function createTasksController(deps: {
  taskStore: TaskStore
  agentStore: AgentStore
}) {
  const { taskStore, agentStore } = deps

  return new Elysia()
    // Cross-agent task listing
    .get('/api/tasks', async () => {
      const agents = await agentStore.list()
      const allTasks = await Promise.all(
        agents.map(a => taskStore.listByAgent(a.name)),
      )
      return { tasks: allTasks.flat() }
    })

    // Per-agent task endpoints
    .group('/api/agents/:name/tasks', app =>
      app
        .get('/', async ({ params }) => {
          const tasks = await taskStore.listByAgent(params.name)
          return { tasks }
        }, { params: t.Object({ name: t.String() }) })

        .post('/', async ({ params, body }) => {
          const task = await taskStore.create(params.name, body)
          return { task }
        }, {
          params: t.Object({ name: t.String() }),
          body: t.Object({
            prompt: t.String(),
            scheduleType: t.Union([t.Literal('cron'), t.Literal('interval'), t.Literal('once')]),
            scheduleValue: t.String(),
            contextMode: t.Union([t.Literal('isolated'), t.Literal('main')]),
            name: t.Optional(t.String()),
          }),
        })

        .put('/:id', async ({ params, body }) => {
          const task = await taskStore.update(params.name, params.id, body)
          return { task }
        }, {
          params: t.Object({ name: t.String(), id: t.String() }),
          body: t.Partial(t.Object({
            status: t.Union([t.Literal('active'), t.Literal('paused')]),
            prompt: t.String(),
            scheduleValue: t.String(),
            name: t.String(),
          })),
        })

        .delete('/:id', async ({ params }) => {
          await taskStore.delete(params.name, params.id)
          return { success: true }
        }, { params: t.Object({ name: t.String(), id: t.String() }) })

        .get('/:id/runs', async ({ params }) => {
          // TaskStore needs a listRuns method
          const runs = await taskStore.listRuns(params.name, params.id)
          return { runs }
        }, { params: t.Object({ name: t.String(), id: t.String() }) })
    )
}
```

**Update agents controller** to add `PUT /api/agents/:name`:

```typescript
.put(
  '/:name',
  async ({ params, body }) => {
    const agent = await agentStore.update(params.name, body)
    return { agent }
  },
  {
    params: t.Object({ name: t.String() }),
    body: t.Partial(t.Object({
      model: t.Optional(t.String()),
      permissionMode: t.Optional(t.Union([
        t.Literal('safe'), t.Literal('ask'), t.Literal('allow-all'),
      ])),
      status: t.Optional(t.Union([t.Literal('active'), t.Literal('inactive')])),
    })),
  },
)
```

**Add `listRuns` to TaskStore:**

```typescript
async listRuns(agentName: string, taskId: string): Promise<TaskRunData[]> {
  const dir = this.runsDir(agentName)
  if (!existsSync(dir)) return []

  const files = await readdir(dir)
  const runs = await Promise.all(
    files
      .filter(f => f.endsWith('.json'))
      .map(async f => {
        const content = await readFile(join(dir, f), 'utf-8')
        return JSON.parse(content) as TaskRunData
      }),
  )

  return runs
    .filter(r => r.taskId === taskId)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
}
```

### Step 4: Update `app.ts` to register all controllers

```typescript
import { createSessionsController } from '@/modules/chat/sessions.controller'
import { createInboxController } from '@/modules/chat/inbox.controller'
import { createTasksController } from '@/modules/chat/tasks.controller'

const sessionsController = createSessionsController({ sessionStore, agentStore })
const inboxController = createInboxController({ inboxStore })
const tasksController = createTasksController({ taskStore, agentStore })

export const app = (swaggerPlugin ? baseApp.use(swaggerPlugin) : baseApp)
  .use(chatController)
  .use(agentsController)
  .use(sessionsController)
  .use(inboxController)
  .use(tasksController)
  .get(API_ROUTES.HEALTH, () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  // ... onStart/onStop unchanged
```

### Step 5: Run all tests — expect PASS

### Step 6: Commit

```bash
git add apps/orbit/server/src/modules/chat/ apps/orbit/server/src/stores/task.store.ts apps/orbit/server/src/app.ts
git commit -m "feat(orbit): add REST endpoints for sessions, inbox, tasks, and agent update"
```

---

## Task 10: Remove Legacy Endpoints + Clean Up

**Files:**
- Modify: `apps/orbit/server/src/modules/chat/chat.controller.ts`

### Step 1: Remove dead code

- Remove `POST /api/chat/sync` (legacy non-streaming)
- Remove `GET /api/chat/history/:sessionId` (replaced by `GET /api/agents/:name/sessions/:id`)
- Fix zod import inconsistency in `memory-tools.mcp.ts`: change `from 'zod/v4'` to `from 'zod'`

### Step 2: Run full test suite

```bash
cd apps/orbit/server && bun test
```

### Step 3: Commit

```bash
git add apps/orbit/server/src/modules/chat/chat.controller.ts apps/orbit/server/src/modules/mcp/memory-tools.mcp.ts
git commit -m "chore(orbit): remove legacy endpoints and fix zod import"
```

---

## Task 11: Wire Up Permission Hook (Currently Dead Code)

**Files:**
- Modify: `apps/orbit/server/src/modules/agent/orbit-agent.ts`

### Step 1: Write test

Test that `safe` mode agent blocks `Write` tool calls.

### Step 2: Implement

In `OrbitAgent.chat()`, read the agent's `permissionMode` from `AgentMetadata` and use `createPermissionHook` for the SDK's `hooks.preToolUse`:

```typescript
const agentMeta = await this.deps.agentStore.get(this.name)
const permissionMode = agentMeta?.permissionMode ?? 'allow-all'

const options = {
  // ...existing options...
  permissionMode: permissionMode === 'allow-all' ? 'bypassPermissions' : 'default',
  hooks: permissionMode !== 'allow-all' ? {
    preToolUse: createPermissionHook(permissionMode as PermissionMode),
  } : undefined,
}
```

Remove hardcoded `permissionMode: 'bypassPermissions'` — now it reads from agent config.

### Step 3: Run tests — expect PASS

### Step 4: Commit

```bash
git add apps/orbit/server/src/modules/agent/orbit-agent.ts
git commit -m "feat(orbit): wire up permission hook from agent config"
```

---

## Task 12: Update App Startup + SessionStore in Scheduler

**Files:**
- Modify: `apps/orbit/server/src/app.ts`

### Step 1: Pass `sessionStore` to scheduler

```typescript
const scheduler = createSchedulerService({ taskStore, sessionStore, agentPool })
```

### Step 2: Run full test suite

```bash
cd apps/orbit/server && bun test
```

### Step 3: Commit

```bash
git add apps/orbit/server/src/app.ts
git commit -m "fix(orbit): pass sessionStore to scheduler for per-task session creation"
```

---

## Task 13: Update All Tests + Integration Smoke Test

**Files:**
- Modify all test files that reference old signatures

### Step 1: Update tests

- Update `orbit-agent.test.ts` for new constructor `(name, sessionId, deps)`
- Update `chat.controller.test.ts` for `agentPool.get(name, sessionId)`
- Update any scheduler tests for new `SchedulerDeps`
- Update MCP server tests if needed

### Step 2: Run full test suite

```bash
cd apps/orbit/server && bun test
```

All tests must pass.

### Step 3: Commit

```bash
git add apps/orbit/server/src/__tests__/
git commit -m "test(orbit): update all tests for multi-session refactoring"
```

---

## Task 14: Update CLAUDE.md + Server Docs

**Files:**
- Modify: `apps/orbit/server/CLAUDE.md`

### Step 1: Update documentation

Reflect the new API endpoints, multi-session model, inbox claiming, and git worktrees in the server CLAUDE.md.

### Step 2: Commit

```bash
git add apps/orbit/server/CLAUDE.md
git commit -m "docs(orbit): update CLAUDE.md for multi-session architecture"
```

---

## Verification

After all tasks complete, verify end-to-end:

```bash
# 1. Run full test suite
cd apps/orbit/server && bun test

# 2. Type check
bun run type-check

# 3. Start dev server
bun run dev

# 4. Manual API verification:

# Create agent
curl -X POST http://localhost:3001/api/agents -H 'Content-Type: application/json' \
  -d '{"name": "test-bot"}'

# Create session
curl -X POST http://localhost:3001/api/agents/test-bot/sessions

# Chat with session reuse
curl -X POST http://localhost:3001/api/chat -H 'Content-Type: application/json' \
  -d '{"agentName": "test-bot", "sessionId": "<from above>", "message": "hello"}'

# List sessions
curl http://localhost:3001/api/agents/test-bot/sessions

# Get session with messages
curl http://localhost:3001/api/agents/test-bot/sessions/<id>

# Check inbox
curl http://localhost:3001/api/agents/test-bot/inbox

# Create task
curl -X POST http://localhost:3001/api/agents/test-bot/tasks -H 'Content-Type: application/json' \
  -d '{"prompt": "Check status", "scheduleType": "interval", "scheduleValue": "60000", "contextMode": "isolated"}'

# List all tasks
curl http://localhost:3001/api/tasks
```

---

## Summary of Changes

| File | Change Type | Description |
|------|------------|-------------|
| `stores/inbox.store.ts` | Modify | Add `claimedBy`, `claim()`, `getUnclaimed()` |
| `stores/session.store.ts` | Modify | Add `delete()`, `update()`, `title` field |
| `stores/task.store.ts` | Modify | Add `listRuns()` |
| `modules/agent/agent-pool.ts` | Rewrite | Composite key `agentName:sessionId`, `releaseAgent()` |
| `modules/agent/orbit-agent.ts` | Rewrite | Session-aware, SDK resume, inbox claiming |
| `modules/agent/permissions.ts` | No change | Already correct |
| `modules/agent/source-builder.ts` | No change | Already correct |
| `modules/agent/services/context.service.ts` | Modify | Fix `InboxMessage.id` type |
| `modules/agent/services/memory.service.ts` | No change | Already correct |
| `modules/agent/services/workspace.service.ts` | Modify | Add git worktree operations |
| `modules/agent/services/qmd.service.ts` | No change | Already correct |
| `modules/chat/chat.controller.ts` | Rewrite | Session reuse, composite pool key, remove legacy |
| `modules/chat/sessions.controller.ts` | Create | Sessions CRUD endpoints |
| `modules/chat/inbox.controller.ts` | Create | Inbox REST endpoints |
| `modules/chat/tasks.controller.ts` | Create | Tasks REST endpoints |
| `modules/mcp/orbit-tools.mcp.ts` | No change | Already correct |
| `modules/mcp/memory-tools.mcp.ts` | Modify | Fix zod import |
| `modules/scheduler/scheduler.service.ts` | Rewrite | Create session per task, composite pool key |
| `app.ts` | Modify | Register new controllers, pass sessionStore to scheduler |

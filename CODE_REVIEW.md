# Code Review: MCP Tools & HTTP Interface Implementation

## Overview

Review scope covers MCP tool definitions, HTTP controllers, data stores, agent execution,
scheduler, shared package, and frontend API client.

**Key files reviewed:**

- `server/src/modules/mcp/orbit-tools.mcp.ts`
- `server/src/modules/mcp/memory-tools.mcp.ts`
- `server/src/modules/chat/chat.controller.ts`
- `server/src/stores/*.ts`
- `server/src/modules/agent/orbit-agent.ts`
- `server/src/modules/scheduler/scheduler.service.ts`
- `shared/src/**`
- `web/src/lib/api.ts`

---

## 1. Duplicated Code

### 1.1 `calculateNextRun` duplicated across MCP and Scheduler [Severity: High]

**Locations:**

- `orbit-tools.mcp.ts:13-29`
- `scheduler.service.ts:141-159`

Two near-identical implementations with subtle differences:

- MCP uses `isNaN(ms)`, scheduler uses `Number.isNaN(ms)`
- MCP handles `once` schedule type, scheduler does **not**
- Scheduler has logging, MCP does not

**Fix:** Extract to a shared utility (e.g. `utils/schedule.ts`). Unify `Number.isNaN`,
handle `once` in both, accept optional logger.

### 1.2 Session resolution logic duplicated [Severity: Medium]

**Locations:**

- `chat.controller.ts:28-40` (SSE endpoint)
- `chat.controller.ts:96-109` (sync endpoint)

Identical "find or create session" pattern repeated.

**Fix:** Extract `resolveOrCreateSession(agentStore, sessionStore, agentName, sessionId?)`.

### 1.3 Result extraction pattern repeated 4 times [Severity: Medium]

```ts
if (msg.type === 'result') {
  const resultMsg = msg as unknown as { result?: string }
  result = resultMsg.result ?? ''
}
```

**Locations:**

- `chat.controller.ts:57-60`
- `chat.controller.ts:119-122`
- `orbit-agent.ts:128-131`
- `scheduler.service.ts:91-94`

**Fix:** Create a type guard or helper: `extractResultText(msg: SDKMessage): string | undefined`.

### 1.4 Message persistence pattern repeated [Severity: Medium]

`appendMessage(user) + appendMessage(assistant)` combo appears in:

- `chat.controller.ts:64-71`
- `chat.controller.ts:125-132`
- `scheduler.service.ts:98-105`

**Fix:** Add `sessionStore.appendConversation(agentName, sessionId, userContent, assistantContent)`.

### 1.5 `generateId()` duplicated in three stores [Severity: Low]

Same implementation in `task.store.ts:44-46`, `inbox.store.ts:27-29`, `session.store.ts:29-31`.

**Fix:** Extract to `shared/src/utils/id.ts`.

### 1.6 Frontend type definitions duplicate server types [Severity: Medium]

`web/src/lib/api.ts:4-49` manually defines `Agent`, `Session`, `ChatMessage`, `InboxMessage`,
`Task` interfaces that overlap with server store types but with inconsistencies
(e.g. `Task.name` is `string` on frontend, `string | null` on backend).

**Fix:** Define canonical types in `shared/src/types/models/index.ts` and import from both sides.

---

## 2. Incomplete Implementations

### 2.1 HTTP task creation missing `nextRun` calculation [Severity: Critical]

**Location:** `chat.controller.ts:349-365`

`POST /api/agents/:name/tasks` calls `taskStore.create()` but never calculates `nextRun`.
The MCP `schedule_task` tool does calculate it. Tasks created via HTTP API will have
`nextRun: null` and will **never be executed** by the scheduler (which filters on
`task.nextRun && new Date(task.nextRun) <= now`).

**Fix:** Calculate `nextRun` after creation and update the task, mirroring the MCP tool logic.

### 2.2 Shared package is entirely placeholder [Severity: Medium]

All of these are empty stubs:

- `shared/src/schemas/index.ts` — `// TypeBox schemas - to be implemented`
- `shared/src/types/models/index.ts` — `// Data models - to be implemented`
- `shared/src/types/api/index.ts` — `// API request/response types - to be implemented`
- `shared/src/utils/index.ts` — `// Pure utility functions - to be implemented`

**Fix:** Migrate store interfaces and controller body schemas into the shared package.

### 2.3 Route constants underutilized [Severity: Low]

`shared/src/constants/routes.ts` only defines `BASE` and `HEALTH`. All other routes
are hardcoded strings in controllers.

**Fix:** Define all API routes in `API_ROUTES` and reference them from controllers.

### 2.4 Session creation ignores `title` parameter [Severity: Low]

`createSessionsController` POST body accepts `title` (`chat.controller.ts:252`),
but `CreateSessionParams` (`session.store.ts:23-27`) lacks a `title` field.
The value is silently dropped.

**Fix:** Add `title?: string` to `CreateSessionParams` and persist it in metadata.

### 2.5 `description` field discarded during agent creation [Severity: Low]

`CreateAgentParams` accepts `description`, and the HTTP body schema accepts it too
(`chat.controller.ts:195`), but `AgentMetadata` has no `description` field. The value
is never stored.

**Fix:** Add `description?: string` to `AgentMetadata` and set it in `create()`.

### 2.6 MCP `schedule_task` uses two-step write [Severity: Low]

**Location:** `orbit-tools.mcp.ts:65-73`

Calls `taskStore.create()` then immediately `taskStore.update()` to set `nextRun`.
Two disk I/O operations with a brief inconsistency window.

**Fix:** Accept `nextRun` in `CreateTaskParams` or set it inside `create()`.

---

## 3. Bugs and Logic Errors

### 3.1 `InboxMessage` ID type mismatch causes data corruption [Severity: Critical]

**Locations:**

- `inbox.store.ts` — `InboxMessage.id: string` (format: `1738000000-abc123`)
- `context.service.ts:36` — `InboxMessage.id: number`
- `orbit-agent.ts:78` — `Number.parseInt(msg.id, 10) || 0`

The parseInt call on IDs like `"1738000000-abc123"` extracts only the timestamp prefix,
losing the random suffix. All inbox message IDs in the system prompt context are
effectively wrong numbers.

**Fix:** Unify `InboxMessage` interface with `id: string` everywhere. Remove the parseInt.

### 3.2 Zod version inconsistency [Severity: Medium]

- `orbit-tools.mcp.ts:3` — `import { z } from 'zod'`
- `memory-tools.mcp.ts:2` — `import { z } from 'zod/v4'`

Zod v3 and v4 have API differences. Mixing versions may cause runtime incompatibilities.

**Fix:** Use a single consistent import across all MCP files.

### 3.3 `/api/chat/history/:sessionId` scans all agents [Severity: Medium]

**Location:** `chat.controller.ts:147-174`

Iterates every agent to find which one owns a session ID. O(N) complexity over agents.
If two agents happen to have a colliding session ID, returns the wrong data.

**Fix:** Change endpoint to `/api/agents/:name/sessions/:id/messages` with explicit agent.
Or maintain a sessionId → agentName index.

### 3.4 HTTP endpoints return 200 for not-found errors [Severity: Medium]

Several endpoints return `{ error: 'Not found' }` with HTTP 200:

- `GET /api/agents/:name` → `chat.controller.ts:203`
- `GET /api/agents/:name/sessions/:id` → `chat.controller.ts:272`
- `POST /api/chat/sync` → `chat.controller.ts:105`

The SSE endpoint (`chat.controller.ts:35-36`) correctly sets `set.status = 404`.

**Fix:** Use `set.status = 404` consistently, or use Elysia's `error()` helper.

### 3.5 HTTP task update does not recalculate `nextRun` [Severity: Medium]

**Location:** `chat.controller.ts:366-380`

`PUT /api/agents/:name/tasks/:id` accepts status changes (e.g. `paused` → `active`),
but does not recalculate `nextRun`. The MCP `resume_task` tool does recalculate it.

**Fix:** When status changes to `active`, recalculate `nextRun` using the shared utility.

---

## 4. Security Issues

### 4.1 Agent name path traversal vulnerability [Severity: Critical]

All stores build file paths with `join(basePath, 'agents', agentName, ...)`.
The `agentName` is never validated. An attacker could send `../../etc` as the agent name
to read/write arbitrary files on the filesystem.

**Affected:** `AgentStore`, `TaskStore`, `InboxStore`, `SessionStore`.

**Fix:** Validate agentName at the controller layer: `/^[a-zA-Z0-9_-]+$/`.
Optionally add a sanitize check in store constructors as defense-in-depth.

### 4.2 `scheduleValue` not validated in HTTP endpoint [Severity: Low]

`POST /api/agents/:name/tasks` accepts arbitrary `scheduleValue` strings without
validation. Invalid cron expressions or negative intervals get stored but never execute.

**Fix:** Call `calculateNextRun()` during creation; return 400 if it fails.

---

## 5. Concurrency and Data Consistency

### 5.1 Inbox `claimMessage` race condition [Severity: Medium]

**Location:** `inbox.store.ts:83-96`

Performs read → check `claimedBy` → write, which is not atomic on the filesystem.
Under concurrent access (multiple sessions starting simultaneously), the same message
could be double-claimed.

**Fix:** Use file locking (`proper-lockfile`) or atomic rename to implement claiming.

### 5.2 `appendMessage` metadata update race [Severity: Low]

**Location:** `session.store.ts:83-97`

The JSONL append is safe, but the subsequent read-modify-write of `session.json`
to increment `messageCount` is not atomic. Concurrent writes could cause count drift.

**Fix:** Acceptable risk for single-writer sessions. Add locking if multi-writer support
is needed in the future.

---

## 6. Architecture and Code Style

### 6.1 `TasksController` prefix inconsistency [Severity: Low]

**Location:** `chat.controller.ts:334`

Other controllers use `new Elysia({ prefix: '/api/agents' })`, but `createTasksController`
uses `new Elysia()` with no prefix and full paths (`/api/tasks`, `/api/agents/:name/tasks`).

**Fix:** Split into two controllers, or use Elysia's `group()` for mixed prefixes.

### 6.2 `orbit-agent.ts` finally block re-queries inbox N times [Severity: Medium]

**Location:** `orbit-agent.ts:136-147`

For each unclaimed message, calls `getPending()` again (full directory scan).
Complexity: O(N × M) where N = unclaimed messages, M = pending messages.

**Fix:** Use the `claimedMessages` array already built earlier (line 73-83) to get the IDs.
No re-querying needed.

### 6.3 `DELETE /inbox/:msgId` semantic mismatch [Severity: Low]

`chat.controller.ts:319-328` — DELETE calls `markRead` which archives the message
rather than deleting it. REST semantics suggest permanent removal.

**Fix:** Change to `POST /:name/inbox/:msgId/archive` or
`PATCH /:name/inbox/:msgId { status: 'archived' }`.

### 6.4 Unresolved FIXME comment [Severity: Low]

`session.store.ts:17` — `// FIXME 改成 enum 枚举` regarding `role: 'user' | 'assistant'`.

---

## Priority Summary

| Priority | # | Issue | Suggested Action |
|:--------:|:-:|:------|:-----------------|
| P0 | 2.1 | HTTP task create missing nextRun | Calculate nextRun on creation |
| P0 | 4.1 | Agent name path traversal | Validate agentName format |
| P0 | 3.1 | InboxMessage ID type mismatch | Unify to string, remove parseInt |
| P1 | 1.1 | calculateNextRun duplicated | Extract shared utility |
| P1 | 3.2 | Zod version inconsistency | Unify import |
| P1 | 3.4 | Missing HTTP status codes | Set proper status codes |
| P1 | 2.2 | Shared package empty | Migrate types to shared |
| P1 | 1.6 | Frontend types duplicated | Import from shared |
| P1 | 3.5 | Task update no nextRun recalc | Recalculate on status→active |
| P2 | 1.2 | Session resolution duplicated | Extract helper function |
| P2 | 1.3 | Result extraction duplicated | Extract helper function |
| P2 | 1.4 | Message persistence duplicated | Add store method |
| P2 | 1.5 | generateId duplicated | Extract to shared utils |
| P2 | 3.3 | History endpoint full scan | Use explicit agent in route |
| P2 | 5.1 | Inbox claim race condition | Use file locking |
| P2 | 6.2 | Finally block re-queries inbox | Use existing ID list |
| P3 | 2.3 | Route constants unused | Define and reference |
| P3 | 2.4 | Session create ignores title | Extend CreateSessionParams |
| P3 | 2.5 | Description field discarded | Extend AgentMetadata |
| P3 | 2.6 | Two-step write in schedule_task | Accept nextRun in create |
| P3 | 4.2 | scheduleValue not validated | Validate on creation |
| P3 | 6.1 | TasksController prefix style | Split or unify |
| P3 | 6.3 | DELETE inbox semantic mismatch | Change to archive endpoint |
| P3 | 6.4 | FIXME comment unresolved | Implement enum |

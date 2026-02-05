# Orbit Server

Orbit is a multi-agent system where AI agents run with isolated workspaces and communicate through inbox messages and scheduled tasks.

## Architecture

### Core Components

**Database (SQLite + Drizzle ORM)**

- `agents`: Agent registry with unique names and workspace paths
- `chat_sessions`: Conversation sessions linking agents to users
- `messages`: Chat history with role (user/assistant) and content
- `scheduled_tasks`: Cron/interval/once tasks with next run time
- `task_runs`: Execution history (status, result, error, duration)
- `agent_inbox`: Request/response messages between agents
- `user_inbox`: Notification messages from agents to users

**Scheduler**

- Polls every 30 seconds for due tasks
- Executes agents with task prompts
- Calculates next run time (cron/interval) or marks completed (once)
- Records execution results to `task_runs`

**Agent Runtime**

- Each agent runs in isolated workspace directory
- Session types: `chat` (interactive), `cron` (scheduled), `heartbeat` (periodic)
- Tools available: schedule_task, send_to_agent, list_tasks, pause/resume/cancel task

### Communication Patterns

**Agent ↔ Agent** (via `agent_inbox`)

- Request: Agent A sends request to Agent B
- Response: Agent B replies with `requestId` linking to original request
- Status: pending → read → archived

**Agent → User** (via `user_inbox`)

- One-way notifications from agents
- Priority levels: low, normal, high
- Status: unread → read → archived

**Agent ↔ User** (via `chat_sessions` + `messages`)

- Interactive conversations
- Messages stored with role and content
- Session tracks message count and last activity

## Data Flow

### Task Execution

1. Scheduler finds due task in `scheduled_tasks`
2. Runtime executes agent with task prompt
3. Agent runs with tools (schedule_task, send_to_agent, etc.)
4. Result recorded to `task_runs` (status, result, error, duration)
5. Task updated with next run time or marked completed

### Agent-to-Agent Communication

1. Agent A calls `send_to_agent(targetAgent, message, 'request')`
2. Message inserted into `agent_inbox` with `messageType='request'`
3. Agent B reads inbox on next session
4. Agent B responds with `messageType='response'` and `requestId`

### Agent-to-User Notification

1. Agent calls `send_notification(userId, message, priority)`
2. Message inserted into `user_inbox`
3. User sees notification in UI

## File Structure

```
apps/orbit/server/
├── drizzle/
│   ├── schema/
│   │   ├── agents.ts       # Agent registry
│   │   ├── sessions.ts     # Chat sessions + messages
│   │   ├── tasks.ts        # Scheduled tasks + runs
│   │   └── inbox.ts        # Agent + user inboxes
│   └── migrations/         # Database migrations
├── src/
│   ├── core/
│   │   ├── config/         # Environment configuration
│   │   ├── db/             # Database client
│   │   └── logger/         # Logging utilities
│   ├── modules/
│   │   ├── agents/
│   │   │   ├── services/   # Agent runtime, workspace, inbox
│   │   │   └── tools/      # Orbit tools (schedule_task, etc.)
│   │   ├── chat/           # Chat API endpoints
│   │   └── scheduler/      # Task scheduler service
│   ├── plugins/            # Elysia plugins (CORS, Swagger)
│   └── app.ts              # Main app setup
└── templates/              # Agent prompt templates
    ├── AGENTS.md           # Agent operating protocol
    ├── IDENTITY.md         # Agent personality template
    ├── TOOLS.md            # Tool documentation
    ├── HEARTBEAT.md        # Periodic tasks
    └── BOOTSTRAP.md        # Initial setup
```

## Database Schema Notes

### Indexes

**Performance indexes:**

- `scheduled_tasks.nextRunIdx`: Find due tasks quickly
- `scheduled_tasks.statusIdx`: Filter by active/paused/completed
- `agent_inbox.toAgentIdx`: Get agent's inbox messages
- `user_inbox.toUserIdx`: Get user's notifications

### Status Fields

**Task status:**

- `active`: Running on schedule
- `paused`: Temporarily disabled
- `completed`: One-time task finished

**Inbox status:**

- `pending/unread`: Not yet read
- `read`: Read but kept in inbox
- `archived`: Processed and hidden

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

# Database
bun run db:generate  # Generate migration
bun run db:migrate   # Apply migration
bun run db:studio    # Open Drizzle Studio
```

## API Endpoints

**Chat**

- `POST /api/chat` - Send message to agent
- `GET /api/chat/sessions` - List sessions
- `GET /api/chat/sessions/:id/messages` - Get messages

**Agents**

- `GET /api/agents` - List agents
- `POST /api/agents` - Create agent
- `GET /api/agents/:name` - Get agent details

**Health**

- `GET /api/health` - Server status

## Development Notes

### Testing Architecture

**Test Isolation**: Tests use environment variables to isolate from production:

- `DATABASE_PATH`: Points to test database (auto-created in preload)
- `ORBIT_CONFIG_PATH`: Points to test workspace directories

**Mock Strategy**: Only mock external services, use real implementations for internal code:

- ✅ Mocked: Anthropic SDK (external LLM), QMD service (external CLI)
- ❌ Real: All internal services (agent, inbox, runtime, scheduler, workspace)

**Test Infrastructure**:

- `bunfig.toml`: Configures Bun test runner with preload script
- `preload.ts`: Sets up test database using drizzle-kit/api before tests run
- `test-db.ts`: Database cleanup helpers for test isolation
- `mocks/`: Mock implementations for external dependencies

### Adding New Tools

1. Add tool definition to `orbitToolDefinitions` in `orbit-tools.ts`
2. Add handler to `handlers` object
3. Update `OrbitToolHandler` interface
4. Document in `templates/TOOLS.md`

### Schema Changes

1. Modify schema file in `drizzle/schema/`
2. Run `bun run db:generate` to create migration
3. Run `bun run db:migrate` to apply migration
4. Update TypeScript types exported from schema

### Agent Templates

Templates in `templates/` are injected into agent system prompts. Keep them concise and action-oriented. Use active voice and specific language.

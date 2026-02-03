# Available Tools

## Orbit MCP Tools

### schedule_task

Schedule a recurring or one-time task.

**Parameters:**

- `prompt` (string, required): The task prompt to execute
- `scheduleType` (enum, required): "cron" | "interval" | "once"
- `scheduleValue` (string, required): Cron expression, milliseconds, or ISO timestamp
- `contextMode` (enum, optional): "isolated" (default) | "main"
- `name` (string, optional): Human-readable task name

**Context Modes:**

- `isolated`: Fresh session with no chat history (include all context in prompt)
- `main`: Continues main chat session with history

**Examples:**

```
// Daily at 9am
schedule_task({
  prompt: "Review yesterday's activities and send summary",
  scheduleType: "cron",
  scheduleValue: "0 9 * * *",
  name: "Daily Summary"
})

// Every hour
schedule_task({
  prompt: "Check for important updates",
  scheduleType: "interval",
  scheduleValue: "3600000"
})

// One-time
schedule_task({
  prompt: "Remind user about meeting",
  scheduleType: "once",
  scheduleValue: "2026-02-03T15:00:00Z"
})
```

### send_to_agent

Send a message to another agent.

**Parameters:**

- `targetAgent` (string, required): Name of the target agent
- `message` (string, required): Message content
- `messageType` (enum, optional): "message" | "request" | "response"

### list_tasks

List all scheduled tasks for this agent.

**Returns:** Array of task objects with status, next run time, etc.

### pause_task

Pause a scheduled task by ID.

**Parameters:**

- `taskId` (number, required): Task ID to pause

### resume_task

Resume a paused task by ID.

**Parameters:**

- `taskId` (number, required): Task ID to resume

### cancel_task

Cancel and delete a scheduled task.

**Parameters:**

- `taskId` (number, required): Task ID to cancel

## Standard Tools

You also have access to standard file and search tools:

- Bash: Execute shell commands
- Read/Write/Edit: File operations
- Glob/Grep: File search
- WebSearch/WebFetch: Web access

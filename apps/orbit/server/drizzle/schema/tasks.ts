import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const scheduledTasks = sqliteTable(
  'scheduled_tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentId: integer('agent_id').notNull(),
    name: text('name'),
    prompt: text('prompt').notNull(),
    scheduleType: text('schedule_type', {
      enum: ['cron', 'interval', 'once']
    }).notNull(),
    scheduleValue: text('schedule_value').notNull(),
    contextMode: text('context_mode', { enum: ['isolated', 'main'] })
      .notNull()
      .default('isolated'),
    status: text('status', { enum: ['active', 'paused', 'completed'] })
      .notNull()
      .default('active'),
    nextRun: integer('next_run', { mode: 'timestamp' }),
    lastRun: integer('last_run', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  table => ({
    agentIdx: index('idx_task_agent').on(table.agentId),
    nextRunIdx: index('idx_next_run').on(table.nextRun),
    statusIdx: index('idx_status').on(table.status)
  })
)

export const taskRuns = sqliteTable(
  'task_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id').notNull(),
    status: text('status', { enum: ['success', 'error'] }).notNull(),
    result: text('result'),
    error: text('error'),
    durationMs: integer('duration_ms'),
    startedAt: integer('started_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer('completed_at', { mode: 'timestamp' })
  },
  table => ({
    taskIdx: index('idx_run_task').on(table.taskId),
    startedIdx: index('idx_run_started').on(table.startedAt)
  })
)

export type ScheduledTask = typeof scheduledTasks.$inferSelect
export type NewScheduledTask = typeof scheduledTasks.$inferInsert
export type TaskRun = typeof taskRuns.$inferSelect
export type NewTaskRun = typeof taskRuns.$inferInsert

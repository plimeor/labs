import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const agentInbox = sqliteTable(
  'agent_inbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromAgentId: integer('from_agent_id').notNull(),
    toAgentId: integer('to_agent_id').notNull(),
    message: text('message').notNull(),
    messageType: text('message_type', { enum: ['request', 'response'] })
      .notNull()
      .default('request'),
    requestId: text('request_id'),
    status: text('status', { enum: ['pending', 'read', 'archived'] })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    readAt: integer('read_at', { mode: 'timestamp' })
  },
  table => ({
    toAgentIdx: index('idx_to_agent').on(table.toAgentId),
    statusIdx: index('idx_inbox_status').on(table.status)
  })
)

export const userInbox = sqliteTable(
  'user_inbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromAgentId: integer('from_agent_id').notNull(),
    toUserId: text('to_user_id').notNull(),
    title: text('title'),
    message: text('message').notNull(),
    priority: text('priority', { enum: ['low', 'normal', 'high'] })
      .notNull()
      .default('normal'),
    status: text('status', { enum: ['unread', 'read', 'archived'] })
      .notNull()
      .default('unread'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    readAt: integer('read_at', { mode: 'timestamp' })
  },
  table => ({
    toUserIdx: index('idx_to_user').on(table.toUserId),
    statusIdx: index('idx_user_inbox_status').on(table.status),
    priorityIdx: index('idx_priority').on(table.priority)
  })
)

export type AgentInboxMessage = typeof agentInbox.$inferSelect
export type NewAgentInboxMessage = typeof agentInbox.$inferInsert
export type UserInboxMessage = typeof userInbox.$inferSelect
export type NewUserInboxMessage = typeof userInbox.$inferInsert

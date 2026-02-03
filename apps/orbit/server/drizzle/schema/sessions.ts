import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentId: integer('agent_id').notNull(),
    sessionId: text('session_id').notNull(),
    userId: text('user_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
    messageCount: integer('message_count').notNull().default(0),
  },
  table => ({
    agentIdx: index('idx_session_agent').on(table.agentId),
    sessionIdx: index('idx_session_id').on(table.sessionId),
  }),
)

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id').notNull(),
    agentId: integer('agent_id').notNull(),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    timestamp: integer('timestamp', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  table => ({
    sessionIdx: index('idx_message_session').on(table.sessionId),
  }),
)

export type ChatSession = typeof chatSessions.$inferSelect
export type NewChatSession = typeof chatSessions.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert

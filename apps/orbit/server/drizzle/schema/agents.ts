import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  status: text('status', { enum: ['active', 'inactive'] })
    .notNull()
    .default('active'),
  workspacePath: text('workspace_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
})

export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert

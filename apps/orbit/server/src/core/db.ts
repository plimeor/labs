import { Database } from 'bun:sqlite'

import * as schema from '@db'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import { env } from './env'

const sqlite = new Database(env.DATABASE_PATH)
sqlite.exec('PRAGMA journal_mode = WAL;')

export const db = drizzle(sqlite, { schema })

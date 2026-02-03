import { Database } from 'bun:sqlite'

import { drizzle } from 'drizzle-orm/bun-sqlite'

import * as schema from '../../../drizzle/schema'
import { env } from '../config/env'

const sqlite = new Database(env.DATABASE_PATH)
sqlite.exec('PRAGMA journal_mode = WAL;')

export const db = drizzle(sqlite, { schema })

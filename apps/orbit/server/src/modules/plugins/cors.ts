import { cors } from '@elysiajs/cors'

import { isDevelopment } from '../core/env.js'

export const corsPlugin = cors({
  origin: isDevelopment ? '*' : ['http://localhost:3000'],
  credentials: true,
})

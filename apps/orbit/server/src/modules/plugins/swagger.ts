import { swagger } from '@elysiajs/swagger'

import { isDevelopment } from '@/core/env'

export const swaggerPlugin = isDevelopment
  ? swagger({
      documentation: {
        info: {
          title: 'Orbit API',
          version: '0.1.0',
          description: 'Orbit API Documentation'
        },
        tags: [{ name: 'Health', description: 'Health check endpoints' }]
      }
    })
  : undefined

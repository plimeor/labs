import { Elysia } from 'elysia';
import { API_ROUTES } from '@orbit/shared/constants';
import { corsPlugin } from './plugins/cors.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { logger } from './core/logger/index.js';

const baseApp = new Elysia().use(corsPlugin);

export const app = (swaggerPlugin ? baseApp.use(swaggerPlugin) : baseApp)
  .get(API_ROUTES.HEALTH, () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  })
  .onStart(() => {
    logger.info('Server started');
  })
  .onStop(() => {
    logger.info('Server stopped');
  });

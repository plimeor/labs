import { app } from './app.js';
import { env } from './core/config/env.js';
import { logger } from './core/logger/index.js';

app.listen(env.PORT);

logger.info(`🚀 Server running at http://localhost:${env.PORT}`);
logger.info(`📚 API docs at http://localhost:${env.PORT}/swagger`);

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { initFirebase } from './config/firebase.js';
import { ensureUploadDir } from './config/paths.js';
import { prisma } from './config/prisma.js';

async function bootstrap() {
  ensureUploadDir();
  initFirebase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Azan backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    });
    // Force-exit if not closed in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Failed to bootstrap');
  process.exit(1);
});

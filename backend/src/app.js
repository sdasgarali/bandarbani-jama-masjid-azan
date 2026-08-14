import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'If-None-Match',
        'X-Device-Id',
        'X-Device-Secret',
      ],
      exposedHeaders: ['ETag'],
    })
  );

  if (!env.isTest) {
    app.use(pinoHttp({ logger }));
  }

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;

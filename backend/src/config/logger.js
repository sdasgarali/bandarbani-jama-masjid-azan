import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.isTest ? 'silent' : env.isProd ? 'info' : 'debug',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;

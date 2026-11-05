import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { authRouter } from './routes/auth.js';
import { devicesRouter } from './routes/devices.js';
import { alertsRouter } from './routes/alerts.js';
import { ticketsRouter } from './routes/tickets.js';
import { dashboardRouter } from './routes/dashboard.js';
import { usersRouter } from './routes/users.js';
import { kbRouter } from './routes/kb.js';
import { aiRouter } from './routes/ai.js';
import { authenticate } from './middleware/auth.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ts: Date.now() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', authenticate);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/kb', kbRouter);
  app.use('/api/ai', aiRouter);

  app.use((_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: '接口不存在' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? '参数错误' });
      return;
    }
    logger.error('api', '未捕获异常', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务内部错误' });
  });

  return app;
}

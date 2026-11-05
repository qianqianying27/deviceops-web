import { Router } from 'express';
import { z } from 'zod';
import { db, sqlite } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireRole } from '../middleware/auth.js';
import { broadcast } from '../realtime/hub.js';

export const alertsRouter = Router();

const listQuery = z.object({
  status: z.enum(['open', 'ack', 'resolved']).optional(),
  level: z.enum(['warning', 'critical']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

alertsRouter.get('/', (req, res) => {
  const { status, level, page, pageSize } = listQuery.parse(req.query);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (level) {
    conditions.push('level = ?');
    params.push(level);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const items = sqlite
    .prepare(`SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  const total = (
    sqlite.prepare(`SELECT COUNT(1) AS c FROM alerts ${where}`).get(...params) as { c: number } | undefined
  )?.c ?? 0;
  res.json({ items, page, pageSize, total });
});

alertsRouter.post('/:id/ack', requireRole('admin', 'operator'), (req, res) => {
  const changed = sqlite
    .prepare("UPDATE alerts SET status = 'ack', ack_by = ?, ack_at = ? WHERE id = ? AND status = 'open'")
    .run(req.user!.username, Date.now(), req.params.id).changes;
  if (!changed) {
    res.status(409).json({ code: 'ALERT_NOT_ACKABLE', message: '警告不存在或已处理' });
    return;
  }
  broadcast('alert_update', { id: req.params.id, status: 'ack' });
  res.json({ id: req.params.id, status: 'ack' });
});

alertsRouter.post('/:id/resolve', requireRole('admin', 'operator'), (req, res) => {
  const changed = sqlite
    .prepare("UPDATE alerts SET status = 'resolved', ack_by = COALESCE(ack_by, ?), ack_at = ? WHERE id = ?")
    .run(req.user!.username, Date.now(), req.params.id).changes;
  if (!changed) {
    res.status(404).json({ code: 'ALERT_NOT_FOUND', message: '警告不存在' });
    return;
  }
  broadcast('alert_update', { id: req.params.id, status: 'resolved' });
  res.json({ id: req.params.id, status: 'resolved' });
});

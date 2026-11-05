import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { requireRole } from '../middleware/auth.js';

export const ticketsRouter = Router();

ticketsRouter.get('/', (req, res) => {
  const status = z.enum(['open', 'processing', 'done']).optional().parse(req.query.status);
  const items = status
    ? db.select().from(schema.tickets).where(eq(schema.tickets.status, status)).orderBy(desc(schema.tickets.createdAt)).all()
    : db.select().from(schema.tickets).orderBy(desc(schema.tickets.createdAt)).all();
  res.json({ items });
});

const createSchema = z.object({
  sn: z.string().regex(/^SNS-\d{3}$/, '设备编号格式应为 SNS-xxx'),
  title: z.string().min(4).max(60),
  summary: z.string().min(4).max(500),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

ticketsRouter.post('/', requireRole('admin', 'operator'), (req, res) => {
  const body = createSchema.parse(req.body);
  const device = db.select().from(schema.devices).where(eq(schema.devices.sn, body.sn)).get();
  if (!device) {
    res.status(404).json({ code: 'DEVICE_NOT_FOUND', message: '设备不存在' });
    return;
  }
  const id = `TK-${String(Date.now()).slice(-6)}`;
  db.insert(schema.tickets)
    .values({
      id,
      sn: body.sn,
      title: body.title,
      summary: body.summary,
      priority: body.priority,
      status: 'open',
      createdBy: req.user!.username,
      createdAt: Date.now(),
    })
    .run();
  res.status(201).json({ id });
});

const patchSchema = z.object({ status: z.enum(['open', 'processing', 'done']) });

ticketsRouter.patch('/:id', requireRole('admin', 'operator'), (req, res) => {
  const { status } = patchSchema.parse(req.body);
  const changed = db
    .update(schema.tickets)
    .set({ status })
    .where(eq(schema.tickets.id, req.params.id))
    .run().changes;
  if (!changed) {
    res.status(404).json({ code: 'TICKET_NOT_FOUND', message: '工单不存在' });
    return;
  }
  res.json({ id: req.params.id, status });
});

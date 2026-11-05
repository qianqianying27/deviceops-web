import { Router } from 'express';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { requireRole } from '../middleware/auth.js';

export const usersRouter = Router();

usersRouter.get('/', requireRole('admin'), (_req, res) => {
  const rows = db
    .select({ id: schema.users.id, username: schema.users.username, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .all();
  res.json({ items: rows });
});

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { authenticate, signToken, type Role } from '../middleware/auth.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名').max(32),
  password: z.string().min(6, '密码至少 6 位').max(64),
});

authRouter.post('/login', (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  const user = db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    res.status(401).json({ code: 'BAD_CREDENTIALS', message: '用户名或密码错误' });
    return;
  }
  const payload = { id: user.id, username: user.username, name: user.name, role: user.role as Role };
  res.json({ token: signToken(payload), user: payload });
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { searchKnowledge } from '../ai/kb.js';

export const kbRouter = Router();

kbRouter.get('/docs', (_req, res) => {
  const items = db.select({ id: schema.kbDocs.id, title: schema.kbDocs.title }).from(schema.kbDocs).all();
  res.json({ items });
});

const searchSchema = z.object({
  query: z.string().min(2, '查询至少 2 个字').max(200),
  topK: z.number().int().min(1).max(10).default(3),
});

kbRouter.post('/search', (req, res) => {
  const { query, topK } = searchSchema.parse(req.body);
  res.json({ items: searchKnowledge(query, topK) });
});

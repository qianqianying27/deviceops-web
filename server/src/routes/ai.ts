import { Router } from 'express';
import { z } from 'zod';
import { runAgent } from '../ai/agent.js';

export const aiRouter = Router();

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

aiRouter.post('/chat', async (req, res) => {
  const { messages } = chatSchema.parse(req.body);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    for await (const event of runAgent(messages, { user: { username: req.user!.username, role: req.user!.role } })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch {
    res.write(`data: ${JSON.stringify({ type: 'delta', content: '助手暂时不可用，请稍后重试。' })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

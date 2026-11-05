import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { verifyToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

let wss: WebSocketServer | null = null;

export function attachRealtime(server: Server, path = '/ws'): void {
  wss = new WebSocketServer({ server, path });

  wss.on('connection', (socket, req) => {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const token = url.searchParams.get('token') ?? '';
      const user = verifyToken(token);
      (socket as WebSocket & { user?: unknown }).user = user;
      socket.send(JSON.stringify({ type: 'ready', data: { user: user.name } }));
    } catch {
      socket.close(4401, 'unauthorized');
      return;
    }

    const ping = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }, 30_000);
    socket.on('close', () => clearInterval(ping));
    socket.on('error', () => socket.terminate());
  });

  logger.info('ws', `实时通道已挂载 ${path}`);
}

export function broadcast(type: string, data: unknown): void {
  if (!wss) return;
  const payload = JSON.stringify({ type, data });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

export function closeRealtime(): void {
  wss?.close();
  wss = null;
}

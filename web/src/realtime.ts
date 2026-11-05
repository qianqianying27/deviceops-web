import { getToken } from './api';

type Handler = (data: unknown) => void;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private timer: number | null = null;
  private closedByUser = false;

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    const token = getToken();
    if (!token) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = new WebSocket(`${protocol}://${location.host}/ws?token=${encodeURIComponent(token)}`);

    this.socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as { type: string; data: unknown };
        this.handlers.get(payload.type)?.forEach((cb) => cb(payload.data));
      } catch {
        /* 忽略非 JSON 心跳帧 */
      }
    };

    this.socket.onclose = () => {
      this.socket = null;
      if (!this.closedByUser) {
        this.timer = window.setTimeout(() => this.connect(), 3000);
      }
    };
    this.socket.onerror = () => this.socket?.close();
  }

  on(type: string, handler: Handler): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(type, set);
    return () => set.delete(handler);
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.timer) window.clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }
}

export const realtime = new RealtimeClient();

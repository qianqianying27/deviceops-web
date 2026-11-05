export interface ApiError extends Error {
  status?: number;
  code?: string;
}

const TOKEN_KEY = 'deviceops.token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `请求失败（${res.status}）`;
    let code = '';
    try {
      const body = (await res.json()) as { message?: string; code?: string };
      message = body.message ?? message;
      code = body.code ?? '';
    } catch {
      /* 保持默认错误信息 */
    }
    const err = new Error(message) as ApiError;
    err.status = res.status;
    err.code = code;
    throw err;
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};

export interface DeviceStateInfo {
  sn: string;
  name: string;
  line: string;
  model: string;
  firmware: string;
  state: 'offline' | 'online' | 'testing' | 'fault' | 'maintenance';
  lastSeen: number;
  latest: {
    temp: number;
    humi: number;
    accel: number;
    gyro: number;
    quality: number;
    ts: number;
  } | null;
}

export interface AlertItem {
  id: string;
  sn: string;
  level: 'warning' | 'critical';
  rule: string;
  message: string;
  status: 'open' | 'ack' | 'resolved';
  created_at: number;
  ack_by?: string;
}

export interface DashboardStats {
  total: number;
  byState: Record<string, number>;
  onlineRate: number;
  openAlerts: number;
  criticalAlerts: number;
  telemetry24h: number;
  openTickets: number;
  alertTrend: { hourAgo: number; value: number }[];
  generatedAt: number;
}

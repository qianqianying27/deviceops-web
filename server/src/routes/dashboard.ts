import { Router } from 'express';
import { sqlite } from '../db/index.js';
import { dashboardCache } from '../utils/cache.js';

export const dashboardRouter = Router();

/** 看板聚合结果缓存 5 秒，避免多端轮询把统计 SQL 打满。 */
dashboardRouter.get('/stats', (_req, res) => {
  const cached = dashboardCache.get('stats');
  if (cached) {
    res.json(cached);
    return;
  }

  const states = sqlite.prepare('SELECT state, COUNT(1) AS value FROM devices GROUP BY state').all() as {
    state: string;
    value: number;
  }[];
  const byState = Object.fromEntries(states.map((s) => [s.state, s.value]));
  const total = states.reduce((sum, s) => sum + s.value, 0);

  const openAlerts = (
    sqlite.prepare("SELECT COUNT(1) AS c FROM alerts WHERE status != 'resolved'").get() as { c: number }
  )?.c ?? 0;
  const criticalAlerts = (
    sqlite.prepare("SELECT COUNT(1) AS c FROM alerts WHERE status != 'resolved' AND level = 'critical'").get() as { c: number }
  )?.c ?? 0;
  const telemetry24h = (
    sqlite.prepare('SELECT COUNT(1) AS c FROM telemetry WHERE ts > ?').get(Date.now() - 86_400_000) as { c: number }
  )?.c ?? 0;
  const openTickets = (
    sqlite.prepare("SELECT COUNT(1) AS c FROM tickets WHERE status != 'done'").get() as { c: number }
  )?.c ?? 0;

  const alertTrend = sqlite
    .prepare(
      `SELECT CAST((? - created_at) / 3600000 AS INTEGER) AS hourAgo, COUNT(1) AS value
       FROM alerts WHERE created_at > ? GROUP BY hourAgo ORDER BY hourAgo DESC`,
    )
    .all(Date.now(), Date.now() - 12 * 3_600_000) as { hourAgo: number; value: number }[];

  const payload = {
    total,
    byState,
    onlineRate: total ? Number((((byState.online ?? 0) + (byState.testing ?? 0)) / total * 100).toFixed(1)) : 0,
    openAlerts,
    criticalAlerts,
    telemetry24h,
    openTickets,
    alertTrend,
    generatedAt: Date.now(),
  };
  dashboardCache.set('stats', payload);
  res.json(payload);
});

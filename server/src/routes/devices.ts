import { Router } from 'express';
import { and, asc, count, eq, like, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, sqlite } from '../db/index.js';
import * as schema from '../db/schema.js';
import { requireRole } from '../middleware/auth.js';
import { latestTelemetry, dashboardCache } from '../utils/cache.js';
import { assertTransition, isDeviceState, type DeviceState } from '../device/stateMachine.js';
import { publishCommand } from '../device/publisher.js';
import { deviceStateHistory } from '../device/ingest.js';
import { broadcast } from '../realtime/hub.js';

export const devicesRouter = Router();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  state: z.string().optional(),
  keyword: z.string().max(32).optional(),
});

devicesRouter.get('/', (req, res) => {
  const { page, pageSize, state, keyword } = listQuery.parse(req.query);
  const filters = [];
  if (state) filters.push(eq(schema.devices.state, state));
  if (keyword) {
    filters.push(or(like(schema.devices.sn, `%${keyword}%`), like(schema.devices.name, `%${keyword}%`)));
  }
  const where = filters.length ? and(...filters) : undefined;

  const items = db
    .select()
    .from(schema.devices)
    .where(where)
    .orderBy(asc(schema.devices.sn))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
    .map((d) => ({ ...d, latest: latestTelemetry.get(d.sn) ?? null }));

  const total = db.select({ value: count() }).from(schema.devices).where(where).get()?.value ?? 0;
  res.json({ items, page, pageSize, total });
});

devicesRouter.get('/:sn', (req, res) => {
  const sn = req.params.sn;
  const device = db.select().from(schema.devices).where(eq(schema.devices.sn, sn)).get();
  if (!device) {
    res.status(404).json({ code: 'DEVICE_NOT_FOUND', message: `设备 ${sn} 不存在` });
    return;
  }
  const recent = sqlite
    .prepare('SELECT * FROM telemetry WHERE sn = ? ORDER BY ts DESC LIMIT 120')
    .all(sn)
    .reverse();
  const openAlerts = sqlite
    .prepare("SELECT * FROM alerts WHERE sn = ? AND status != 'resolved' ORDER BY created_at DESC LIMIT 5")
    .all(sn);
  res.json({
    device,
    latest: latestTelemetry.get(sn) ?? null,
    telemetry: recent,
    alerts: openAlerts,
    stateHistory: deviceStateHistory(sn),
  });
});

const telemetryQuery = z.object({
  minutes: z.coerce.number().int().min(1).max(360).default(30),
});

devicesRouter.get('/:sn/telemetry', (req, res) => {
  const { minutes } = telemetryQuery.parse(req.query);
  const since = Date.now() - minutes * 60 * 1000;
  const rows = sqlite
    .prepare('SELECT ts, temp, humi, accel_x, accel_y, accel_z, quality FROM telemetry WHERE sn = ? AND ts >= ? ORDER BY ts ASC')
    .all(req.params.sn, since);
  res.json({ sn: req.params.sn, minutes, items: rows });
});

const commandSchema = z.object({
  cmd: z.enum(['get_id', 'read_once', 'set_mode', 'calibrate']),
  params: z.record(z.number()).default({}),
});

devicesRouter.post('/:sn/command', requireRole('admin', 'operator'), (req, res) => {
  const body = commandSchema.parse(req.body);
  const device = db.select().from(schema.devices).where(eq(schema.devices.sn, req.params.sn)).get();
  if (!device) {
    res.status(404).json({ code: 'DEVICE_NOT_FOUND', message: '设备不存在' });
    return;
  }
  const reqId = publishCommand(req.params.sn, body.cmd, body.params);
  res.json({ reqId, accepted: true });
});

const stateSchema = z.object({
  state: z.string(),
  reason: z.string().max(120).default('人工调整'),
});

devicesRouter.post('/:sn/state', requireRole('admin'), (req, res) => {
  const { state, reason } = stateSchema.parse(req.body);
  if (!isDeviceState(state)) {
    res.status(400).json({ code: 'BAD_STATE', message: '未知设备状态' });
    return;
  }
  const device = db.select().from(schema.devices).where(eq(schema.devices.sn, req.params.sn)).get();
  if (!device) {
    res.status(404).json({ code: 'DEVICE_NOT_FOUND', message: '设备不存在' });
    return;
  }
  try {
    assertTransition(device.state as DeviceState, state);
  } catch (err) {
    res.status(409).json({ code: 'ILLEGAL_TRANSITION', message: (err as Error).message });
    return;
  }
  db.update(schema.devices).set({ state }).where(eq(schema.devices.sn, req.params.sn)).run();
  sqlite
    .prepare('INSERT INTO state_log (sn, from_state, to_state, reason, created_at) VALUES (?,?,?,?,?)')
    .run(req.params.sn, device.state, state, reason, Date.now());
  dashboardCache.delete('stats');
  broadcast('state', { sn: req.params.sn, from: device.state, to: state, reason });
  res.json({ sn: req.params.sn, state });
});

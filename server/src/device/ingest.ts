import mqtt from 'mqtt';
import { and, eq, lt } from 'drizzle-orm';
import { db, now, sqlite } from '../db/index.js';
import * as schema from './../db/schema.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { broadcast } from '../realtime/hub.js';
import { evaluateRules, type TelemetrySample } from './rules.js';
import { assertTransition, isDeviceState, type DeviceState } from './stateMachine.js';
import { latestTelemetry } from '../utils/cache.js';

const insertTelemetry = sqlite.prepare(`
INSERT INTO telemetry (sn, ts, temp, humi, accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, quality)
VALUES (@sn, @ts, @temp, @humi, @ax, @ay, @az, @gx, @gy, @gz, @quality)
`);

const insertAlert = sqlite.prepare(`
INSERT INTO alerts (id, sn, level, rule, message, status, created_at)
VALUES (@id, @sn, @level, @rule, @message, 'open', @createdAt)
`);

function findDevice(sn: string) {
  return db.select().from(schema.devices).where(eq(schema.devices.sn, sn)).get();
}

function updateDeviceState(sn: string, to: DeviceState, reason: string): void {
  const device = findDevice(sn);
  if (!device) return;
  const from = device.state as DeviceState;
  if (!isDeviceState(from) || from === to) return;
  if (!isDeviceState(to)) return;
  try {
    assertTransition(from, to);
  } catch (err) {
    logger.warn('state', (err as Error).message);
    return;
  }
  db.update(schema.devices).set({ state: to }).where(eq(schema.devices.sn, sn)).run();
  sqlite
    .prepare('INSERT INTO state_log (sn, from_state, to_state, reason, created_at) VALUES (?,?,?,?,?)')
    .run(sn, from, to, reason, Date.now());
  broadcast('state', { sn, from, to, reason });
}

function raiseAlert(sample: TelemetrySample, rule: string, level: string, message: string): void {
  const existing = db
    .select({ id: schema.alerts.id })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.sn, sample.sn), eq(schema.alerts.rule, rule), eq(schema.alerts.status, 'open')))
    .get();
  if (existing) return;

  const id = `AL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  insertAlert.run({ id, sn: sample.sn, level, rule, message, createdAt: Date.now() });
  broadcast('alert', { id, sn: sample.sn, level, rule, message, status: 'open', createdAt: Date.now() });
  logger.warn('alert', `${sample.sn} ${rule} ${message}`);
}

function handleTelemetry(sample: TelemetrySample): void {
  insertTelemetry.run({
    sn: sample.sn,
    ts: sample.ts,
    temp: sample.temp,
    humi: sample.humi,
    ax: sample.accel[0],
    ay: sample.accel[1],
    az: sample.accel[2],
    gx: sample.gyro[0],
    gy: sample.gyro[1],
    gz: sample.gyro[2],
    quality: sample.quality,
  });

  const device = findDevice(sample.sn);
  if (!device) return;

  db.update(schema.devices)
    .set({ lastSeen: sample.ts })
    .where(eq(schema.devices.sn, sample.sn))
    .run();

  if (device.state === 'offline') {
    updateDeviceState(sample.sn, 'online', '遥测数据到达');
  }

  latestTelemetry.set(sample.sn, {
    temp: sample.temp,
    humi: sample.humi,
    accel: Math.sqrt(sample.accel[0] ** 2 + sample.accel[1] ** 2 + sample.accel[2] ** 2),
    gyro: Math.sqrt(sample.gyro[0] ** 2 + sample.gyro[1] ** 2 + sample.gyro[2] ** 2),
    quality: sample.quality,
    ts: sample.ts,
  });

  broadcast('telemetry', sample);

  for (const violation of evaluateRules(sample)) {
    raiseAlert(sample, violation.rule, violation.level, violation.message);
    if (violation.level === 'critical') {
      updateDeviceState(sample.sn, 'fault', violation.message);
    }
  }
}

function handleState(payload: { sn: string; status?: string }): void {
  if (!payload?.sn) return;
  if (payload.status === 'offline') {
    updateDeviceState(payload.sn, 'offline', '设备主动下线（LWT）');
    raiseAlert(
      { sn: payload.sn, temp: 0, humi: 0, accel: [0, 0, 0], gyro: [0, 0, 0], quality: 0, ts: Date.now() },
      'DEVICE_OFFLINE',
      'critical',
      '设备断开连接，产线数据中断',
    );
    latestTelemetry.delete(payload.sn);
  } else if (payload.status === 'online') {
    updateDeviceState(payload.sn, 'online', '设备上线');
  }
}

function startOfflineSweep(): NodeJS.Timeout {
  return setInterval(() => {
    const stale = Date.now() - 25_000;
    const rows = db.select().from(schema.devices).all();
    for (const row of rows) {
      if (row.lastSeen === 0) continue;
      if (row.state === 'offline' || row.state === 'maintenance') continue;
      if (row.lastSeen < stale) {
        updateDeviceState(row.sn, 'offline', '超过 25 秒无遥测');
        raiseAlert(
          { sn: row.sn, temp: 0, humi: 0, accel: [0, 0, 0], gyro: [0, 0, 0], quality: 0, ts: Date.now() },
          'DEVICE_TIMEOUT',
          'critical',
          '设备心跳超时，判定离线',
        );
        latestTelemetry.delete(row.sn);
      }
    }
  }, 10_000);
}

function startTelemetryPrune(): NodeJS.Timeout {
  return setInterval(() => {
    const cutoff = now() - 6 * 60 * 60 * 1000;
    const result = db.delete(schema.telemetry).where(lt(schema.telemetry.ts, cutoff)).run();
    if (result.changes) logger.info('prune', `清理历史遥测 ${result.changes} 行`);
  }, 10 * 60 * 1000);
}

export function startIngest(): { client: mqtt.MqttClient; stop: () => void } {
  const client = mqtt.connect(config.mqttUrl, {
    clientId: 'deviceops-ingest',
    reconnectPeriod: 2000,
    clean: true,
  });

  client.on('connect', () => {
    client.subscribe(['data/+', 'state/+'], (err) => {
      if (err) logger.error('mqtt', '订阅失败', err.message);
      else logger.info('mqtt', '入站订阅成功：data/+ state/+');
    });
  });

  client.on('message', (topic, buf) => {
    try {
      const payload = JSON.parse(buf.toString()) as Record<string, unknown>;
      if (topic.startsWith('data/')) {
        handleTelemetry(payload as unknown as TelemetrySample);
      } else if (topic.startsWith('state/')) {
        handleState(payload as { sn: string; status?: string });
      }
    } catch (err) {
      logger.warn('mqtt', `消息解析失败 ${topic}`, (err as Error).message);
    }
  });

  const sweep = startOfflineSweep();
  const prune = startTelemetryPrune();

  return {
    client,
    stop: () => {
      clearInterval(sweep);
      clearInterval(prune);
      client.end(true);
    },
  };
}

export function countTelemetryToday(): number {
  const row = sqlite
    .prepare('SELECT COUNT(1) AS c FROM telemetry WHERE ts > ?')
    .get(now() - 24 * 60 * 60 * 1000) as { c: number } | undefined;
  return row?.c ?? 0;
}

export function deviceStateHistory(sn: string, limit = 10) {
  return sqlite
    .prepare('SELECT from_state AS from, to_state AS to, reason, created_at AS createdAt FROM state_log WHERE sn = ? ORDER BY id DESC LIMIT ?')
    .all(sn, limit) as { from: string; to: string; reason: string; createdAt: number }[];
}

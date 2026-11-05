import mqtt from 'mqtt';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface Profile {
  temp: number;
  humi: number;
  trend: number;
  vibrationSpike: boolean;
  silence: boolean;
}

const PROFILES: Record<string, Profile> = {
  // 正常温控节点
  'SNS-002': { temp: 36, humi: 56, trend: 0, vibrationSpike: false, silence: false },
  // 温度持续爬升，用于演示警告 → 严重 → 故障状态迁移
  'SNS-005': { temp: 42, humi: 45, trend: 0.55, vibrationSpike: false, silence: false },
  // 周期性振动尖峰，用于演示振动警告
  'SNS-008': { temp: 33, humi: 62, trend: 0, vibrationSpike: true, silence: false },
  // 周期性静默，用于演示心跳超时离线警告
  'SNS-011': { temp: 31, humi: 58, trend: 0, vibrationSpike: false, silence: true },
};

function noise(scale: number): number {
  return (Math.random() - 0.5) * 2 * scale;
}

/**
 * 模拟产线设备：复用 factory-tester 的遥测字段与 Topic 约定（data/{sn} / state/{sn} / cmd/{sn}），
 * 但用 MQTT 承载，便于同一套入站逻辑对接真实网关。
 */
export function startSimulator(): { stop: () => void } {
  const rows = db.select().from(schema.devices).all();
  if (rows.length === 0) return { stop: () => undefined };

  const client = mqtt.connect(config.mqttUrl, {
    clientId: 'deviceops-simulator',
    reconnectPeriod: 2000,
  });

  const seq: Record<string, number> = {};
  const cycle: Record<string, number> = {};
  const offset: Record<string, number> = {};
  const mode: Record<string, 'stream' | 'silent'> = {};

  client.on('connect', () => {
    for (const row of rows) {
      seq[row.sn] = 0;
      cycle[row.sn] = 0;
      offset[row.sn] = 0;
      mode[row.sn] = 'stream';
      client.publish(`state/${row.sn}`, JSON.stringify({ sn: row.sn, status: 'online', ts: Date.now() }), {
        retain: true,
      });
    }
    logger.info('sim', `模拟设备上线 ${rows.length} 台`);
    client.subscribe('cmd/+');
    client.subscribe('cmd/broadcast');
  });

  client.on('message', (topic, buf) => {
    try {
      const req = JSON.parse(buf.toString()) as { req_id?: string; cmd?: string; params?: Record<string, number> };
      const sn = topic.startsWith('cmd/broadcast') ? 'broadcast' : topic.split('/')[1];
      if (!sn) return;

      if (req.cmd === 'set_mode' && sn !== 'broadcast') {
        mode[sn] = Number(req.params?.mode ?? 0) === 1 ? 'silent' : 'stream';
      }
      if (req.cmd === 'calibrate' && sn !== 'broadcast') {
        offset[sn] = Number(req.params?.temp_offset ?? 0);
      }
      if (req.cmd === 'read_once' && sn !== 'broadcast') {
        emit(sn);
      }

      const targets = sn === 'broadcast' ? rows.map((r) => r.sn) : [sn];
      for (const target of targets) {
        client.publish(
          `resp/${target}`,
          JSON.stringify({
            req_id: req.req_id ?? '',
            sn: target,
            code: 0,
            msg: 'ok',
            data: { cmd: req.cmd, mode: mode[target] ?? 'stream' },
          }),
        );
      }
    } catch (err) {
      logger.warn('sim', '指令解析失败', (err as Error).message);
    }
  });

  function emit(sn: string): void {
    const profile = PROFILES[sn] ?? PROFILES['SNS-002'];
    const i = (cycle[sn] = (cycle[sn] ?? 0) + 1);
    seq[sn] = (seq[sn] ?? 0) + 1;

    if (mode[sn] === 'silent') return;
    // 静默窗口：每 90 个周期静默 20 个周期（约 40 秒），触发心跳超时警告
    if (profile.silence && i % 90 >= 70) return;

    const temp = Math.min(120, profile.temp + profile.trend * (i % 60) + offset[sn] + noise(0.6));
    const humi = Math.max(20, Math.min(99, profile.humi + noise(2.5)));
    const spike = profile.vibrationSpike && i % 60 < 3;
    const accel: [number, number, number] = [
      0.02 + noise(0.02) + (spike ? 0.9 : 0),
      -1 + noise(0.05) + (spike ? 0.6 : 0),
      0.01 + noise(0.02),
    ];
    const gyro: [number, number, number] = [noise(1.2), noise(1.2), noise(1.2)];
    const quality = spike ? 55 : 88 + Math.round(noise(6));

    client.publish(
      `data/${sn}`,
      JSON.stringify({
        sn,
        temp: Number(temp.toFixed(2)),
        humi: Number(humi.toFixed(2)),
        accel: accel.map((v) => Number(v.toFixed(3))),
        gyro: gyro.map((v) => Number(v.toFixed(2))),
        quality,
        seq: seq[sn],
        ts: Date.now(),
      }),
      { qos: 1 },
    );
  }

  const timer = setInterval(() => {
    for (const row of rows) emit(row.sn);
  }, 2000);

  return {
    stop: () => {
      clearInterval(timer);
      client.end(true);
    },
  };
}

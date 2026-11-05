import mqtt from 'mqtt';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let client: mqtt.MqttClient | null = null;

export function initPublisher(url = config.mqttUrl): void {
  client = mqtt.connect(url, { clientId: `deviceops-api-${crypto.randomBytes(3).toString('hex')}` });
  client.on('connect', () => logger.info('mqtt', '指令发布通道已连接'));
}

export function publishCommand(sn: string, cmd: string, params: Record<string, unknown>): string {
  const reqId = crypto.randomUUID();
  client?.publish(
    `cmd/${sn}`,
    JSON.stringify({ req_id: reqId, cmd, params, ts: Date.now() }),
    { qos: 1 },
  );
  return reqId;
}

export function closePublisher(): void {
  client?.end(true);
  client = null;
}

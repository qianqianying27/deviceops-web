import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, now, sqlite } from './index.js';
import * as schema from './schema.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const DEMO_PASSWORD = 'demo1234';

const DEVICE_SEED = [
  { sn: 'SNS-002', name: '注塑机温控节点', line: '二车间 A 线', model: 'IMM-260', firmware: 'v1.4.2' },
  { sn: 'SNS-005', name: '空压机振动节点', line: '动力站', model: 'AC-75', firmware: 'v1.3.8' },
  { sn: 'SNS-008', name: '轴承温度节点', line: '一车间 B 线', model: 'BRG-40', firmware: 'v1.4.2' },
  { sn: 'SNS-011', name: '传送带姿态节点', line: '三车间 C 线', model: 'IMU-6', firmware: 'v1.5.0' },
];

function seedUsers(): void {
  const count = db.select({ id: schema.users.id }).from(schema.users).all().length;
  if (count > 0) return;
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 8);
  const rows = [
    { id: 1, username: 'admin', name: '系统管理员', role: 'admin' },
    { id: 2, username: 'operator', name: '运维工程师', role: 'operator' },
    { id: 3, username: 'viewer', name: '产线访客', role: 'viewer' },
  ];
  db.insert(schema.users)
    .values(rows.map((r) => ({ ...r, passwordHash: hash, createdAt: now() })))
    .run();
  logger.info('seed', `初始化 ${rows.length} 个账号（统一密码 ${DEMO_PASSWORD}）`);
}

function seedDevices(): void {
  const count = db.select({ sn: schema.devices.sn }).from(schema.devices).all().length;
  if (count > 0) return;
  db.insert(schema.devices)
    .values(
      DEVICE_SEED.map((d) => ({
        ...d,
        state: 'offline',
        lastSeen: 0,
        createdAt: now(),
      })),
    )
    .run();
  logger.info('seed', `初始化 ${DEVICE_SEED.length} 台设备档案`);
}

function seedKnowledgeBase(): void {
  const count = db.select({ id: schema.kbDocs.id }).from(schema.kbDocs).all().length;
  if (count > 0) return;
  const dir = path.resolve(config.kbDir);
  if (!fs.existsSync(dir)) {
    logger.warn('seed', `知识库目录不存在：${dir}`);
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const title = content.split('\n')[0].replace(/^#\s*/, '').trim();
    const id = file.replace(/\.md$/, '');
    db.insert(schema.kbDocs)
      .values({ id, title, content, tags: file.replace(/\.md$/, '') })
      .run();
  }
  logger.info('seed', `知识库入库 ${files.length} 篇文档`);
}

function seedTicket(): void {
  const exists = db.select({ id: schema.tickets.id }).from(schema.tickets).where(eq(schema.tickets.status, 'open')).all();
  if (exists.length > 0) return;
  db.insert(schema.tickets)
    .values({
      id: 'TK-1001',
      sn: 'SNS-005',
      title: '空压机排气温度偏高排查',
      summary: '排气温度连续 10 分钟高于 100℃，按规程先检查冷却风扇与油位。',
      priority: 'high',
      status: 'open',
      createdBy: '系统',
      createdAt: now() - 30 * 60 * 1000,
    })
    .run();
}

export function seedDatabase(): void {
  seedUsers();
  seedDevices();
  seedKnowledgeBase();
  seedTicket();
}

export function resetDemoData(): void {
  sqlite.exec('DELETE FROM telemetry; DELETE FROM alerts;');
}

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import * as schema from './schema.js';

const file = path.resolve(config.dbFile);
fs.mkdirSync(path.dirname(file), { recursive: true });

export const sqlite = new Database(file);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

/**
 * 表结构以 DDL 为准（真实项目里会换成迁移工具），索引覆盖高频查询：
 * 遥测按 (sn, ts) 走覆盖索引倒序取最近窗口；警告按状态与时间分页。
 */
sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','operator','viewer')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  sn TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  line TEXT NOT NULL,
  model TEXT NOT NULL,
  firmware TEXT NOT NULL,
  state TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sn TEXT NOT NULL,
  ts INTEGER NOT NULL,
  temp REAL NOT NULL,
  humi REAL NOT NULL,
  accel_x REAL NOT NULL,
  accel_y REAL NOT NULL,
  accel_z REAL NOT NULL,
  gyro_x REAL NOT NULL,
  gyro_y REAL NOT NULL,
  gyro_z REAL NOT NULL,
  quality INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_sn_ts ON telemetry (sn, ts DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  sn TEXT NOT NULL,
  level TEXT NOT NULL,
  rule TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ack_by TEXT,
  ack_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_status_created ON alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_sn_created ON alerts (sn, created_at DESC);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  sn TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_sn_created ON tickets (sn, created_at DESC);

CREATE TABLE IF NOT EXISTS kb_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS state_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sn TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_state_log_sn ON state_log (sn, created_at DESC);
`);

export const db = drizzle(sqlite, { schema });
export const now = () => Date.now();

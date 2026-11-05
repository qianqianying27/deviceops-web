import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const devices = sqliteTable('devices', {
  sn: text('sn').primaryKey(),
  name: text('name').notNull(),
  line: text('line').notNull(),
  model: text('model').notNull(),
  firmware: text('firmware').notNull(),
  state: text('state').notNull(),
  lastSeen: integer('last_seen').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const telemetry = sqliteTable('telemetry', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sn: text('sn').notNull(),
  ts: integer('ts').notNull(),
  temp: real('temp').notNull(),
  humi: real('humi').notNull(),
  accelX: real('accel_x').notNull(),
  accelY: real('accel_y').notNull(),
  accelZ: real('accel_z').notNull(),
  gyroX: real('gyro_x').notNull(),
  gyroY: real('gyro_y').notNull(),
  gyroZ: real('gyro_z').notNull(),
  quality: integer('quality').notNull(),
});

export const alerts = sqliteTable('alerts', {
  id: text('id').primaryKey(),
  sn: text('sn').notNull(),
  level: text('level').notNull(),
  rule: text('rule').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
  ackBy: text('ack_by'),
  ackAt: integer('ack_at'),
});

export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(),
  sn: text('sn').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  priority: text('priority').notNull(),
  status: text('status').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const kbDocs = sqliteTable('kb_docs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags').notNull(),
});

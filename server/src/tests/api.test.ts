import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';

process.env.DB_FILE = path.join('data', 'test-deviceops.db');
process.env.KB_DIR = path.join('data', 'kb');

let app: Express;
let adminToken = '';
let viewerToken = '';
let sqliteModule: { sqlite: { close: () => void } } | null = null;

beforeAll(async () => {
  const dbFile = path.resolve(process.env.DB_FILE!);
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const dbMod = await import('../db/index.js');
  sqliteModule = dbMod;
  const { seedDatabase } = await import('../db/seed.js');
  const { createApp } = await import('../app.js');
  seedDatabase();
  app = createApp();

  const admin = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'demo1234' });
  adminToken = admin.body.token;
  const viewer = await request(app).post('/api/auth/login').send({ username: 'viewer', password: 'demo1234' });
  viewerToken = viewer.body.token;
});

afterAll(() => {
  sqliteModule?.sqlite.close();
});

describe('HTTP 接口', () => {
  it('健康检查', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('错误密码返回 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong-pass' });
    expect(res.status).toBe(401);
  });

  it('设备列表带分页与最新遥测字段', async () => {
    const res = await request(app).get('/api/devices?page=1&pageSize=2').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(4);
  });

  it('参数不合法时返回 400 与可读提示', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sn: 'BAD-SN', title: 'x', summary: 'y' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('RBAC：只读角色访问成员列表被拒绝', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('RBAC：只读角色不能下发指令', async () => {
    const res = await request(app)
      .post('/api/devices/SNS-002/command')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ cmd: 'read_once', params: {} });
    expect(res.status).toBe(403);
  });

  it('非法状态迁移返回 409', async () => {
    const res = await request(app)
      .post('/api/devices/SNS-002/state')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ state: 'maintenance' });
    expect(res.status).toBe(409);
  });
});

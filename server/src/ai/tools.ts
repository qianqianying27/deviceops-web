import { db, sqlite } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { latestTelemetry } from '../utils/cache.js';
import { searchKnowledge } from '../ai/kb.js';

export interface ToolContext {
  user: { username: string; role: string };
}

type ToolResult = { tool: string; summary: string; payload: unknown };

const TOOL_DEFS = [
  { type: 'function', function: { name: 'get_device_status', description: '查询设备在线状态与最新遥测', parameters: { type: 'object', properties: { sn: { type: 'string', description: '设备编号，如 SNS-005' } }, required: [] } } },
  { type: 'function', function: { name: 'list_alerts', description: '查询警告列表', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'ack', 'resolved'] }, limit: { type: 'number' } }, required: [] } } },
  { type: 'function', function: { name: 'get_telemetry_stats', description: '统计设备最近一段时间的温度与湿度', parameters: { type: 'object', properties: { sn: { type: 'string' }, minutes: { type: 'number' } }, required: ['sn'] } } },
  { type: 'function', function: { name: 'search_knowledge_base', description: '检索设备维护手册与故障代码表', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'create_ticket', description: '创建维修工单', parameters: { type: 'object', properties: { sn: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['sn', 'title', 'summary'] } } },
] as const;

export function toolDefinitions() {
  return TOOL_DEFS;
}

export function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  switch (name) {
    case 'get_device_status':
      return getDeviceStatus(args, ctx);
    case 'list_alerts':
      return listAlerts(args);
    case 'get_telemetry_stats':
      return telemetryStats(args);
    case 'search_knowledge_base':
      return searchKb(args);
    case 'create_ticket':
      return createTicket(args, ctx);
    default:
      return { tool: name, summary: `未知工具：${name}`, payload: null };
  }
}

function getDeviceStatus(args: Record<string, unknown>, _ctx: ToolContext): ToolResult {
  const sn = typeof args.sn === 'string' ? args.sn : '';
  const rows = sn
    ? db.select().from(schema.devices).where(eq(schema.devices.sn, sn)).all()
    : db.select().from(schema.devices).all();
  if (rows.length === 0) {
    return { tool: 'get_device_status', summary: `未找到设备 ${sn}`, payload: [] };
  }
  const data = rows.map((d) => ({
    ...d,
    latest: latestTelemetry.get(d.sn) ?? null,
    onlineFor: d.lastSeen ? Math.round((Date.now() - d.lastSeen) / 1000) : null,
  }));
  const brief = data
    .map((d) => `${d.sn}（${d.name}）状态 ${d.state}${d.latest ? `，温度 ${d.latest.temp.toFixed(1)}℃、湿度 ${d.latest.humi.toFixed(1)}%` : '，暂无遥测'}`)
    .join('；');
  return { tool: 'get_device_status', summary: brief, payload: data };
}

function listAlerts(args: Record<string, unknown>): ToolResult {
  const status = typeof args.status === 'string' ? args.status : 'open';
  const limit = Math.min(Number(args.limit ?? 5), 20);
  const rows = sqlite
    .prepare('SELECT id, sn, level, rule, message, status, created_at FROM alerts WHERE status = ? ORDER BY created_at DESC LIMIT ?')
    .all(status, limit) as { id: string; sn: string; level: string; rule: string; message: string }[];
  if (rows.length === 0) return { tool: 'list_alerts', summary: `当前没有状态为 ${status} 的警告`, payload: [] };
  return {
    tool: 'list_alerts',
    summary: rows.map((r) => `[${r.level}] ${r.sn} ${r.message}`).join('；'),
    payload: rows,
  };
}

function telemetryStats(args: Record<string, unknown>): ToolResult {
  const sn = String(args.sn ?? '');
  const minutes = Math.min(Math.max(Number(args.minutes ?? 30), 5), 360);
  const since = Date.now() - minutes * 60 * 1000;
  const row = sqlite
    .prepare(
      `SELECT COUNT(1) AS n,
              ROUND(AVG(temp),2) AS avgTemp, ROUND(MIN(temp),2) AS minTemp, ROUND(MAX(temp),2) AS maxTemp,
              ROUND(AVG(humi),2) AS avgHumi, ROUND(MAX(humi),2) AS maxHumi
       FROM telemetry WHERE sn = ? AND ts >= ?`,
    )
    .get(sn, since) as Record<string, number> | undefined;
  if (!row || row.n === 0) {
    return { tool: 'get_telemetry_stats', summary: `${sn} 最近 ${minutes} 分钟没有遥测数据`, payload: null };
  }
  const summary = `${sn} 最近 ${minutes} 分钟共 ${row.n} 条遥测：温度均值 ${row.avgTemp}℃（${row.minTemp}~${row.maxTemp}℃），湿度均值 ${row.avgHumi}%（峰值 ${row.maxHumi}%）`;
  return { tool: 'get_telemetry_stats', summary, payload: { sn, minutes, ...row } };
}

function searchKb(args: Record<string, unknown>): ToolResult {
  const query = String(args.query ?? '');
  const hits = searchKnowledge(query, 3);
  if (hits.length === 0) return { tool: 'search_knowledge_base', summary: '知识库中未找到相关内容。', payload: [] };
  return {
    tool: 'search_knowledge_base',
    summary: hits.map((h) => `《${h.title}》：${h.snippet}`).join('；'),
    payload: hits,
  };
}

function createTicket(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  if (!['admin', 'operator'].includes(ctx.user.role)) {
    return { tool: 'create_ticket', summary: '当前账号为只读角色，无法创建工单。', payload: null };
  }
  const sn = String(args.sn ?? '');
  const device = db.select().from(schema.devices).where(eq(schema.devices.sn, sn)).get();
  if (!device) return { tool: 'create_ticket', summary: `设备 ${sn} 不存在，未创建工单。`, payload: null };

  const id = `TK-${String(Date.now()).slice(-6)}`;
  db.insert(schema.tickets)
    .values({
      id,
      sn,
      title: String(args.title ?? '设备异常处理'),
      summary: String(args.summary ?? ''),
      priority: String(args.priority ?? 'medium'),
      status: 'open',
      createdBy: ctx.user.username,
      createdAt: Date.now(),
    })
    .run();
  return { tool: 'create_ticket', summary: `已创建工单 ${id}（${sn}）`, payload: { id, sn } };
}

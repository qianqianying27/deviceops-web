# 设备云眼 · 工业设备远程运维平台

把「上位机设备遥测」搬上 Web 的全栈项目：Vue 3 + TypeScript 前端、Node.js + TypeScript 后端、MQTT 设备链路、WebSocket 实时推送、AI Agent 工具调用与知识库问答。

> 项目定位：面向 Web 全栈岗位的可演示作品。设备协议与警告规则来自作者的上位机项目 `factory-tester`，知识库与检索思路来自 `mfg-kb-rag`，这里用 Web 全栈的方式重新组织。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3、TypeScript、Vite、Pinia、Vue Router、ECharts、原生 WebSocket |
| 后端 | Node.js 22、TypeScript、Express、Zod、JWT + RBAC |
| 数据 | SQLite（Drizzle ORM，可替换 PostgreSQL）、索引/分页/事务、进程内 TTL 缓存 |
| 设备链路 | 内置 Aedes MQTT Broker、设备模拟器、显式设备状态机、警告规则去重 |
| AI | OpenAI 兼容 LLM（可选）、Function Calling 工具、BM25 中文检索、SSE 流式输出 |
| 工程化 | Vitest + Supertest、GitHub Actions、Docker Compose、Nginx 反向代理 |

## 架构

```
设备模拟器 ──MQTT──> 内置 Broker(1883) ──订阅──> 入站层
                                          │ 解析样本 / 落库 / 规则判定 / 状态机
                                          ▼
                                    SQLite + TTL 缓存
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
                  REST API(Express)                   WebSocket(/ws)
                        │                                   │
                        └──────────── Vue 3 前端 ◄───────────┘
                                          │
                                          ▼
                               AI Agent（工具调用 + 知识库）
```

一条命令即可启动：内置 Broker → 4 台模拟设备 → 入库/警告 → API + 实时推送 → 前端。

## 快速开始

```bash
npm install
npm run dev          # API :3000，前端 :5173
```

- 打开 http://127.0.0.1:5173
- 演示账号：`admin` / `operator` / `viewer`，密码均为 `demo1234`
- 关闭模拟设备：`SIMULATE=0`；接入真实 Broker：设置 `MQTT_URL`

可选接入真实大模型（不配置则走内置确定性 Agent，仍可完整演示）：

```bash
# server/.env
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=deepseek-chat
```

其它命令：`npm test`（18 个用例）、`npm run typecheck`、`npm run build`、`docker compose up --build`（前端 :8080）。

## 功能

- **实时看板**：设备总数/在线率/未处理警告/24H 遥测入库量；警告按小时聚合；设备卡片实时刷新
- **设备详情**：30 分钟温度/湿度双曲线（ECharts）、指令下发（立即采集 / 静默 / 恢复推流 / 校准）、状态迁移记录、当前警告
- **警告中心**：按状态与级别筛选、确认、解决，WebSocket 推送自动刷新
- **AI 运维助手**：SSE 流式回答，先调工具再出结论，附带手册出处
- **成员与权限**：JWT + 路由级 RBAC，只读角色无法下发指令或处理警告（后端强制校验）

### AI Agent 工具

| 工具 | 作用 |
|---|---|
| `get_device_status` | 设备在线状态 + 最新遥测 |
| `get_telemetry_stats` | 最近 N 分钟温度/湿度的均值、极值、样本数 |
| `list_alerts` | 按状态拉取警告 |
| `search_knowledge_base` | BM25 中文检索手册/故障代码，命中率低于阈值明确拒答 |
| `create_ticket` | 创建维修工单（受角色约束） |

示例：提问「SNS-005 最近温度怎么样，怎么处理？」，Agent 先调 `get_telemetry_stats` 给出数据，再调 `search_knowledge_base` 命中《注塑机 IMM-260 操作与维护》，最后给出处置步骤。

## 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 登录，返回 JWT |
| GET | `/api/dashboard/stats` | 看板聚合（缓存 5s） |
| GET | `/api/devices?page&pageSize&state&keyword` | 设备分页 + 最新遥测 |
| GET | `/api/devices/:sn` | 详情、曲线、警告、状态历史 |
| POST | `/api/devices/:sn/command` | 下发 MQTT 指令（admin/operator） |
| POST | `/api/devices/:sn/state` | 状态迁移（admin，非法迁移 409） |
| GET | `/api/alerts?status&level` | 警告列表 |
| POST | `/api/alerts/:id/ack`、`/resolve` | 警告闭环 |
| POST | `/api/tickets` | 创建工单 |
| POST | `/api/kb/search` | 知识库检索 |
| POST | `/api/ai/chat` | SSE 流式 Agent 对话 |

## 工程实现要点（面试可讲）

1. **设备状态机**：`offline/online/testing/fault/maintenance` 迁移规则集中定义，接口层与遥测接入层共用；非法迁移返回 409 并写 `state_log`，避免“测试中的设备被心跳打回”。
2. **警告去重**：同设备同规则仅保留一条未处理警告，避免 2 秒采样把警告表打爆；离线判定用「25 秒心跳超时」扫描而不是依赖 LWT 单一路径。
3. **实时链路**：入站解析与业务处理分离，MQTT 回调里只做落库/判定/广播；WebSocket 连接用 JWT 鉴权，心跳清理死连接。
4. **AI 落地**：工具调用 + 参数校验 + 角色约束（只读角色不能建单）；LLM 不可用时降级为确定性 Agent，保证演示与测试不依赖外部服务。
5. **检索质量**：中文按单字+双字切分做 BM25，增加查询覆盖率阈值，覆盖率过低直接拒答而不是硬凑答案。
6. **工程化**：Zod 统一参数校验；Drizzle ORM + `(sn, ts)` 索引支撑曲线查询；看板聚合 5s TTL 缓存；18 个单测/接口测试覆盖状态机、规则、检索与 RBAC；CI 做 typecheck + test + build。

## 简历写法（可直接用）

> **设备云眼 · 工业设备远程运维平台**（独立开发，Vue 3 + TypeScript / Node.js）
> - 前端基于 Vue 3 + TS + Vite + Pinia 实现登录、实时看板、设备曲线、警告中心与 AI 助手，ECharts 展示 30 分钟温湿度双轴曲线；WebSocket 增量更新，避免轮询。
> - 后端用 Node.js + Express + Drizzle ORM 分层实现认证、RBAC、设备、警告、工单与看板接口；Zod 校验 + 统一错误中间件；SQLite 建 `(sn, ts)` 索引与分页查询，看板聚合缓存 5s。
> - 自建 Aedes MQTT Broker 与 4 台模拟设备，打通「遥测 → 入库 → 规则 → 状态机 → 推送」链路；同规则警告去重，非法状态迁移返回 409。
> - 实现 Function Calling 运维 Agent（设备状态/遥测统计/警告/知识库/建工单五个工具），SSE 流式输出；无模型 Key 时降级为确定性 Agent，保证离线可演示。
> - 18 个 Vitest/Supertest 用例覆盖状态机、警告规则、BM25 检索与权限边界；GitHub Actions 跑 typecheck/test/build，Docker Compose + Nginx 一键部署。

## 已知边界

- SQLite 单机存储，生产应换 PostgreSQL 并把缓存换 Redis（接口已按可替换设计）。
- 未实现刷新令牌、审计日志与多租户；SSO 未接入。
- 设备侧是模拟器，真机协议需按网关文档适配（Topic 约定沿用 `data/{sn}`、`cmd/{sn}`）。
- AI 检索是 BM25，未做 embedding 混合检索（可参考作者 `mfg-kb-rag` 的混合检索方案补上）。

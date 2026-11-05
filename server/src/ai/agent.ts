import { callLlm, type ChatMessage } from './llm.js';
import { runTool, toolDefinitions, type ToolContext } from './tools.js';
import { searchKnowledge } from './kb.js';

export type AgentEvent =
  | { type: 'tool'; name: string; summary: string }
  | { type: 'delta'; content: string }
  | { type: 'done'; content: string };

const SYSTEM_PROMPT = `你是工业设备运维助手。回答必须基于工具返回的数据，不要编造设备状态或参数。
回答结构：先给结论，再列依据（设备编号 / 时间窗口 / 手册章节），最后给一条可执行建议。
知识库检索不到时，明确说“知识库中未找到相关内容”。`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function* runAgent(history: ChatMessage[], ctx: ToolContext): AsyncGenerator<AgentEvent> {
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';

  const real = await callLlm([{ role: 'system', content: SYSTEM_PROMPT }, ...history], toolsForApi());
  if (real) {
    yield* realLlmFlow(real, history, ctx, lastUser);
    return;
  }
  yield* mockFlow(lastUser, ctx);
}

async function* realLlmFlow(
  first: { content: string; toolCall?: { name: string; args: Record<string, unknown> } },
  history: ChatMessage[],
  ctx: ToolContext,
  lastUser: string,
): AsyncGenerator<AgentEvent> {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
  let step = 0;
  let answer = first.content;

  while (first.toolCall && step < 3) {
    const { name, args } = first.toolCall;
    const result = runTool(name, args, ctx);
    yield { type: 'tool', name, summary: result.summary };
    messages.push({ role: 'assistant', content: '' });
    messages.push({ role: 'tool', content: result.summary, tool_call_id: name });
    const next = await callLlm(messages, toolsForApi());
    answer = next?.content ?? result.summary;
    step += 1;
    if (!next?.toolCall) break;
    first.toolCall = next.toolCall;
  }

  if (!answer.trim()) answer = `关于“${lastUser}”，我暂时没有查到可用数据。`;
  yield* streamText(answer);
}

async function* mockFlow(question: string, ctx: ToolContext): AsyncGenerator<AgentEvent> {
  const sn = question.match(/SNS-\d{3}/i)?.[0]?.toUpperCase() ?? '';
  const has = (re: RegExp) => re.test(question);
  const steps: { name: string; args: Record<string, unknown> }[] = [];

  if (has(/建(单|工单)|报修|开单/)) {
    steps.push({ name: 'create_ticket', args: { sn: sn || 'SNS-005', title: '设备异常处理', summary: question, priority: 'high' } });
  } else if (has(/警告|报警|待处理|异常列表|有哪些问题/)) {
    steps.push({ name: 'list_alerts', args: { status: 'open', limit: 5 } });
  } else if (has(/温度|湿度|趋势|曲线|统计|多少度/)) {
    steps.push({ name: 'get_telemetry_stats', args: { sn: sn || 'SNS-005', minutes: 30 } });
  } else if (has(/状态|在线|离线|在不在|运行/)) {
    steps.push({ name: 'get_device_status', args: sn ? { sn } : {} });
  } else {
    steps.push({ name: 'search_knowledge_base', args: { query: question } });
  }

  const summaries: string[] = [];
  for (const step of steps) {
    const result = runTool(step.name, step.args, ctx);
    yield { type: 'tool', name: step.name, summary: result.summary };
    summaries.push(result.summary);
  }

  // 处理类问题再补一次知识库，形成“先看现场数据，再给处置规程”的工作流
  if (!steps.some((s) => s.name === 'search_knowledge_base') && has(/怎么|如何|处理|解决|规程|手册|代码|原因/)) {
    const result = runTool('search_knowledge_base', { query: question }, ctx);
    yield { type: 'tool', name: 'search_knowledge_base', summary: result.summary };
    summaries.push(result.summary);
  }

  const hits = searchKnowledge(question, 1);
  const basis = hits.length ? `\n\n依据：《${hits[0]!.title}》` : '\n\n依据：知识库中未找到相关条目，以上仅基于实时数据。';
  const advice = steps[0]?.name === 'create_ticket' ? '建议：工单已登记，请联系当班维护人员确认备件。' : '建议：先按规程做断电/泄压等安全操作，再执行上面的处置步骤。';
  const answer = `我查到的信息如下：\n${summaries.map((s) => `- ${s}`).join('\n')}${basis}\n\n${advice}`;

  yield* streamText(answer);
}

async function* streamText(text: string): AsyncGenerator<AgentEvent> {
  for (let i = 0; i < text.length; i += 3) {
    yield { type: 'delta', content: text.slice(i, i + 3) };
    await delay(18);
  }
  yield { type: 'done', content: text };
}

function toolsForApi() {
  return toolDefinitions().map((t) => ({ ...t }));
}

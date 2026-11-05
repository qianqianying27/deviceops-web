import { config, llmEnabled } from '../config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface LlmResponse {
  content: string;
  toolCall?: { name: string; args: Record<string, unknown> };
}

/**
 * 兼容 OpenAI 协议的 LLM 客户端（vLLM / DeepSeek / 通义均可）。
 * 没配置 Key 时返回 null，由 Agent 走确定性 Mock 分支，保证项目离线可演示。
 */
export async function callLlm(messages: ChatMessage[], tools: unknown[]): Promise<LlmResponse | null> {
  if (!llmEnabled) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        temperature: 0.2,
        messages,
        tools,
        tool_choice: 'auto',
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string; tool_calls?: { function: { name: string; arguments: string } }[] } }[];
    };
    const msg = json.choices?.[0]?.message;
    const call = msg?.tool_calls?.[0];
    return {
      content: msg?.content ?? '',
      toolCall: call
        ? { name: call.function.name, args: safeJson(call.function.arguments) }
        : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

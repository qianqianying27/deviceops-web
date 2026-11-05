<script setup lang="ts">
import { onMounted, nextTick, ref } from 'vue';
import { getToken } from '../api';

interface ChatItem {
  role: 'user' | 'assistant';
  content: string;
  tools: string[];
  streaming?: boolean;
}

const messages = ref<ChatItem[]>([]);
const input = ref('');
const busy = ref(false);
const error = ref('');
const scroller = ref<HTMLDivElement | null>(null);

const suggestions = [
  '现在有哪些未处理警告？',
  'SNS-005 最近温度怎么样，应该怎么处理？',
  'E-102 报警是什么原因？',
  '帮我给 SNS-008 建一个振动排查工单',
];

async function scrollToBottom() {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' });
}

async function send(text?: string) {
  const question = (text ?? input.value).trim();
  if (!question || busy.value) return;
  input.value = '';
  error.value = '';
  messages.value.push({ role: 'user', content: question, tools: [] });
  const reply: ChatItem = { role: 'assistant', content: '', tools: [], streaming: true };
  messages.value.push(reply);
  busy.value = true;
  await scrollToBottom();

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({
        messages: messages.value
          .filter((m) => !m.streaming && m.content)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok || !res.body) throw new Error(`请求失败（${res.status}）`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        const event = JSON.parse(payload) as { type: string; content?: string; name?: string; summary?: string };
        if (event.type === 'delta' && event.content) reply.content += event.content;
        if (event.type === 'tool' && event.name) reply.tools.push(`${event.name}：${event.summary ?? ''}`);
        if (event.type === 'done' && event.content) reply.content = event.content;
      }
      await scrollToBottom();
    }
  } catch (err) {
    error.value = (err as Error).message;
    if (!reply.content) messages.value.pop();
  } finally {
    reply.streaming = false;
    busy.value = false;
    await scrollToBottom();
  }
}

onMounted(() => {
  messages.value.push({
    role: 'assistant',
    content: '你好，我是设备运维助手。可以问我设备状态、实时遥测、警告清单，或者查维护手册与故障代码，也能直接建工单。',
    tools: [],
  });
});
</script>

<template>
  <div class="grid cols-3" style="align-items: start; grid-template-columns: 2fr 1fr">
    <div class="card">
      <div ref="scroller" class="chat" style="height: 460px; overflow-y: auto; padding-right: 6px">
        <template v-for="(m, idx) in messages" :key="idx">
          <div v-if="m.tools.length" class="tool-chip">
            <div v-for="(t, i) in m.tools" :key="i" style="margin: 2px 0">⚙ {{ t }}</div>
          </div>
          <div class="bubble" :class="m.role === 'user' ? 'user' : 'bot'">
            {{ m.content || (m.streaming ? '思考中…' : '') }}
          </div>
        </template>
      </div>

      <p v-if="error" class="error-text" style="margin-top: 12px">{{ error }}</p>

      <form class="row" style="margin-top: 14px" @submit.prevent="send()">
        <input v-model="input" class="input" placeholder="例如：SNS-005 温度超标，怎么处理？" :disabled="busy" />
        <button class="btn primary" type="submit" :disabled="busy || !input.trim()">
          {{ busy ? '回答中…' : '发送' }}
        </button>
      </form>
    </div>

    <div class="grid" style="gap: 16px">
      <div class="card">
        <div style="font-weight: 600; margin-bottom: 10px">可以试试</div>
        <div class="grid" style="gap: 8px">
          <button v-for="s in suggestions" :key="s" class="btn ghost small" style="text-align: left" @click="send(s)">
            {{ s }}
          </button>
        </div>
      </div>

      <div class="card">
        <div style="font-weight: 600; margin-bottom: 10px">助手能力</div>
        <div class="muted" style="font-size: 12px; line-height: 1.9">
          · get_device_status 查设备状态<br />
          · get_telemetry_stats 聚合温度/湿度<br />
          · list_alerts 拉取未处理警告<br />
          · search_knowledge_base 检索手册<br />
          · create_ticket 创建维修工单<br />
          <span style="color: var(--cyan)">未配置 LLM Key 时走内置确定性 Agent，保证离线可演示。</span>
        </div>
      </div>
    </div>
  </div>
</template>

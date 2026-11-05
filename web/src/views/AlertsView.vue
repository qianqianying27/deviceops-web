<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type AlertItem } from '../api';
import { realtime } from '../realtime';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const items = ref<AlertItem[]>([]);
const total = ref(0);
const status = ref<'open' | 'ack' | 'resolved'>('open');
const level = ref<'' | 'warning' | 'critical'>('');
const notice = ref('');
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const query = `status=${status.value}${level.value ? `&level=${level.value}` : ''}&pageSize=30`;
    const res = await api.get<{ items: AlertItem[]; total: number }>(`/alerts?${query}`);
    items.value = res.items;
    total.value = res.total;
  } catch (err) {
    notice.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

async function act(id: string, action: 'ack' | 'resolve') {
  try {
    await api.post(`/alerts/${id}/${action}`);
    notice.value = action === 'ack' ? '已确认警告' : '已标记处理完成';
    await load();
  } catch (err) {
    notice.value = (err as Error).message;
  }
}

const statusLabel: Record<string, string> = { open: '未处理', ack: '已确认', resolved: '已解决' };

onMounted(() => {
  void load();
  realtime.on('alert', () => void load());
});
</script>

<template>
  <div class="card" style="margin-bottom: 16px">
    <div class="spread">
      <div class="row">
        <select v-model="status" class="input" style="width: 140px" @change="load">
          <option value="open">未处理</option>
          <option value="ack">已确认</option>
          <option value="resolved">已解决</option>
        </select>
        <select v-model="level" class="input" style="width: 140px" @change="load">
          <option value="">全部级别</option>
          <option value="critical">严重</option>
          <option value="warning">警告</option>
        </select>
        <button class="btn small ghost" :disabled="loading" @click="load">刷新</button>
      </div>
      <span class="muted" style="font-size: 12px">共 {{ total }} 条 · 实时推送自动刷新</span>
    </div>
    <p v-if="notice" class="muted" style="font-size: 12px; margin: 10px 0 0">{{ notice }}</p>
  </div>

  <div class="card">
    <table class="table">
      <thead>
        <tr>
          <th>时间</th>
          <th>设备</th>
          <th>级别</th>
          <th>规则</th>
          <th>描述</th>
          <th>状态</th>
          <th v-if="auth.canOperate">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in items" :key="a.id">
          <td class="mono" style="font-size: 12px">{{ new Date(a.created_at).toLocaleString('zh-CN', { hour12: false }) }}</td>
          <td class="mono">{{ a.sn }}</td>
          <td>
            <span class="role-tag" :style="{ color: a.level === 'critical' ? 'var(--red)' : 'var(--amber)' }">
              {{ a.level === 'critical' ? '严重' : '警告' }}
            </span>
          </td>
          <td class="mono" style="font-size: 12px">{{ a.rule }}</td>
          <td>{{ a.message }}</td>
          <td>{{ statusLabel[a.status] }}</td>
          <td v-if="auth.canOperate">
            <div class="row" style="gap: 6px">
              <button v-if="a.status === 'open'" class="btn small" @click="act(a.id, 'ack')">确认</button>
              <button v-if="a.status !== 'resolved'" class="btn small" @click="act(a.id, 'resolve')">解决</button>
            </div>
          </td>
        </tr>
        <tr v-if="!items.length">
          <td colspan="7" class="empty">当前筛选条件下没有警告</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

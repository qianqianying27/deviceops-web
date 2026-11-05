<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { realtime } from '../realtime';
import { useAuthStore } from '../stores/auth';
import StateBadge from '../components/StateBadge.vue';
import TelemetryChart from '../components/TelemetryChart.vue';

interface TelemetryRow {
  ts: number;
  temp: number;
  humi: number;
}

interface DeviceDetail {
  device: {
    sn: string;
    name: string;
    line: string;
    model: string;
    firmware: string;
    state: string;
    lastSeen: number;
  };
  latest: { temp: number; humi: number; accel: number; quality: number; ts: number } | null;
  telemetry: TelemetryRow[];
  alerts: { id: string; level: string; message: string; status: string; created_at: number }[];
  stateHistory: { from: string; to: string; reason: string; createdAt: number }[];
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const sn = String(route.params.sn);
const detail = ref<DeviceDetail | null>(null);
const error = ref('');
const notice = ref('');
const busy = ref('');
const targetState = ref('online');

const points = computed<TelemetryRow[]>(() => detail.value?.telemetry ?? []);

async function load() {
  try {
    detail.value = await api.get<DeviceDetail>(`/devices/${sn}`);
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function command(cmd: string, params: Record<string, number>) {
  busy.value = cmd;
  notice.value = '';
  try {
    const res = await api.post<{ reqId: string }>(`/devices/${sn}/command`, { cmd, params });
    notice.value = `指令 ${cmd} 已下发（req_id ${res.reqId.slice(0, 8)}）`;
  } catch (err) {
    notice.value = (err as Error).message;
  } finally {
    busy.value = '';
  }
}

async function changeState() {
  busy.value = 'state';
  try {
    await api.post(`/devices/${sn}/state`, { state: targetState.value, reason: '人工调整' });
    notice.value = `设备状态已切换为 ${targetState.value}`;
    await load();
  } catch (err) {
    notice.value = (err as Error).message;
  } finally {
    busy.value = '';
  }
}

onMounted(async () => {
  await load();
  realtime.connect();
  realtime.on('telemetry', (payload) => {
    const sample = payload as TelemetryRow & { sn: string; quality: number };
    if (sample.sn !== sn || !detail.value) return;
    detail.value.telemetry.push({ ts: sample.ts, temp: sample.temp, humi: sample.humi });
    if (detail.value.telemetry.length > 180) detail.value.telemetry.shift();
    detail.value.latest = {
      temp: sample.temp,
      humi: sample.humi,
      accel: detail.value.latest?.accel ?? 0,
      quality: sample.quality,
      ts: sample.ts,
    };
  });
  realtime.on('state', (payload) => {
    const data = payload as { sn: string };
    if (data.sn === sn) void load();
  });
});
</script>

<template>
  <div class="spread" style="margin-bottom: 16px">
    <div class="row">
      <button class="btn small ghost" @click="router.push('/')">← 返回总览</button>
      <span class="mono muted">{{ sn }}</span>
    </div>
    <span v-if="notice" class="role-tag">{{ notice }}</span>
  </div>

  <div v-if="error" class="card empty">{{ error }}</div>

  <template v-else-if="detail">
    <div class="card" style="margin-bottom: 16px">
      <div class="spread">
        <div>
          <div class="row" style="gap: 12px">
            <h3 style="margin: 0">{{ detail.device.name }}</h3>
            <StateBadge :state="detail.device.state" />
          </div>
          <div class="device-meta">
            {{ detail.device.line }} · 型号 {{ detail.device.model }} · 固件 {{ detail.device.firmware }} ·
            最后心跳 {{ new Date(detail.device.lastSeen).toLocaleTimeString('zh-CN', { hour12: false }) }}
          </div>
        </div>
        <div class="metric" style="margin-top: 0">
          <div>
            <span>温度</span>
            <b>{{ detail.latest ? `${detail.latest.temp.toFixed(1)}℃` : '—' }}</b>
          </div>
          <div>
            <span>湿度</span>
            <b>{{ detail.latest ? `${detail.latest.humi.toFixed(1)}%` : '—' }}</b>
          </div>
          <div>
            <span>信号质量</span>
            <b>{{ detail.latest?.quality ?? '—' }}</b>
          </div>
        </div>
      </div>

      <div class="row" style="margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line)">
        <button class="btn small" :disabled="!!busy || !auth.canOperate" @click="command('read_once', {})">
          立即采集 read_once
        </button>
        <button class="btn small" :disabled="!!busy || !auth.canOperate" @click="command('set_mode', { mode: 1 })">
          静默模式
        </button>
        <button class="btn small" :disabled="!!busy || !auth.canOperate" @click="command('set_mode', { mode: 0 })">
          恢复推流
        </button>
        <button class="btn small" :disabled="!!busy || !auth.canOperate" @click="command('calibrate', { temp_offset: 1.5 })">
          校准 +1.5℃
        </button>
        <template v-if="auth.isAdmin">
          <span class="muted" style="margin-left: auto; font-size: 12px">管理员状态迁移</span>
          <select v-model="targetState" class="input" style="width: 130px">
            <option value="online">online</option>
            <option value="testing">testing</option>
            <option value="maintenance">maintenance</option>
            <option value="fault">fault</option>
            <option value="offline">offline</option>
          </select>
          <button class="btn small" :disabled="busy === 'state'" @click="changeState">应用</button>
        </template>
      </div>
      <p v-if="!auth.canOperate" class="muted" style="font-size: 12px; margin: 10px 0 0">
        只读角色无法下发指令与处理警告（权限边界在后端强制校验）。
      </p>
    </div>

    <div class="grid cols-3" style="align-items: start">
      <div class="card" style="grid-column: span 2">
        <div class="spread" style="margin-bottom: 8px">
          <div style="font-weight: 600">遥测曲线（最近 30 分钟）</div>
          <span class="muted" style="font-size: 12px">{{ points.length }} 个采样点</span>
        </div>
        <TelemetryChart :points="points" height="300px" />
      </div>

      <div class="grid" style="gap: 16px">
        <div class="card">
          <div style="font-weight: 600; margin-bottom: 10px">当前警告</div>
          <div v-if="!detail.alerts.length" class="empty" style="padding: 12px 0">暂无未处理警告</div>
          <div v-for="a in detail.alerts" :key="a.id" style="padding: 8px 0; border-bottom: 1px solid rgba(34,52,79,0.6)">
            <div class="row" style="gap: 8px">
              <span class="role-tag" :style="{ color: a.level === 'critical' ? 'var(--red)' : 'var(--amber)' }">
                {{ a.level === 'critical' ? '严重' : '警告' }}
              </span>
              <span style="font-size: 12px">{{ a.status }}</span>
            </div>
            <div style="font-size: 12.5px; margin-top: 4px">{{ a.message }}</div>
          </div>
        </div>

        <div class="card">
          <div style="font-weight: 600; margin-bottom: 10px">状态迁移记录</div>
          <div v-if="!detail.stateHistory.length" class="empty" style="padding: 12px 0">暂无记录</div>
          <div v-for="(h, idx) in detail.stateHistory" :key="idx" style="font-size: 12px; padding: 6px 0; border-bottom: 1px solid rgba(34,52,79,0.5)">
            <div class="mono">{{ h.from }} → {{ h.to }}</div>
            <div class="muted">{{ h.reason }} · {{ new Date(h.createdAt).toLocaleTimeString('zh-CN', { hour12: false }) }}</div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

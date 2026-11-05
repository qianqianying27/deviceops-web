<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, type DashboardStats, type DeviceStateInfo } from '../api';
import { realtime } from '../realtime';
import StatCard from '../components/StatCard.vue';
import StateBadge from '../components/StateBadge.vue';

const stats = ref<DashboardStats | null>(null);
const devices = ref<DeviceStateInfo[]>([]);
const error = ref('');
const updatedAt = ref('');
let refreshTimer: number | null = null;

const trendMax = computed(() => Math.max(1, ...(stats.value?.alertTrend.map((t) => t.value) ?? [1])));

async function load() {
  try {
    const [s, d] = await Promise.all([
      api.get<DashboardStats>('/dashboard/stats'),
      api.get<{ items: DeviceStateInfo[] }>('/devices?pageSize=50'),
    ]);
    stats.value = s;
    devices.value = d.items;
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void load();
  }, 2500);
}

onMounted(async () => {
  await load();
  realtime.connect();
  realtime.on('telemetry', (payload) => {
    const sample = payload as { sn: string; temp: number; humi: number; quality: number; ts: number };
    const target = devices.value.find((d) => d.sn === sample.sn);
    if (target) {
      target.latest = {
        temp: sample.temp,
        humi: sample.humi,
        accel: target.latest?.accel ?? 0,
        gyro: target.latest?.gyro ?? 0,
        quality: sample.quality,
        ts: sample.ts,
      };
      target.lastSeen = sample.ts;
    }
    scheduleRefresh();
  });
  realtime.on('state', () => scheduleRefresh());
  realtime.on('alert', () => scheduleRefresh());
});
</script>

<template>
  <div class="grid cols-4" style="margin-bottom: 16px">
    <StatCard label="设备总数" :value="stats?.total ?? 0" hint="接入 4 条产线节点" tone="cyan" />
    <StatCard label="在线率" :value="`${stats?.onlineRate ?? 0}%`" hint="含测试中设备" tone="green" />
    <StatCard label="未处理警告" :value="stats?.openAlerts ?? 0" :hint="`其中严重 ${stats?.criticalAlerts ?? 0} 条`" tone="amber" />
    <StatCard label="24H 遥测入库" :value="stats?.telemetry24h ?? 0" hint="条采样记录" tone="cyan" />
  </div>

  <div class="grid cols-3" style="align-items: start">
    <div class="card" style="grid-column: span 2">
      <div class="spread" style="margin-bottom: 14px">
        <div>
          <div style="font-weight: 600">设备实时状态</div>
          <div class="page-sub">点击卡片进入详情，可下发指令与查看曲线</div>
        </div>
        <span class="muted" style="font-size: 12px">更新于 {{ updatedAt }}</span>
      </div>

      <div v-if="error" class="empty">{{ error }}</div>
      <div v-else class="grid cols-2">
        <RouterLink v-for="d in devices" :key="d.sn" :to="`/devices/${d.sn}`" class="card device-card">
          <div class="spread">
            <div>
              <div style="font-weight: 600">{{ d.name }}</div>
              <div class="device-meta mono">{{ d.sn }} · {{ d.line }}</div>
            </div>
            <StateBadge :state="d.state" />
          </div>
          <div class="metric">
            <div>
              <span>温度</span>
              <b>{{ d.latest ? `${d.latest.temp.toFixed(1)}℃` : '—' }}</b>
            </div>
            <div>
              <span>湿度</span>
              <b>{{ d.latest ? `${d.latest.humi.toFixed(1)}%` : '—' }}</b>
            </div>
            <div>
              <span>信号</span>
              <b>{{ d.latest ? d.latest.quality : '—' }}</b>
            </div>
          </div>
        </RouterLink>
      </div>
    </div>

    <div class="card">
      <div style="font-weight: 600; margin-bottom: 4px">近 12 小时警告分布</div>
      <div class="page-sub" style="margin-bottom: 18px">按发生小时聚合，便于判断集中风险时段</div>

      <div v-if="stats?.alertTrend.length" style="display: flex; gap: 8px; align-items: flex-end; height: 160px">
        <div v-for="bar in [...stats.alertTrend].reverse()" :key="bar.hourAgo" style="flex: 1; text-align: center">
          <div
            :style="{
              height: `${Math.max(6, (bar.value / trendMax) * 130)}px`,
              background: 'linear-gradient(180deg, rgba(56,225,255,0.9), rgba(79,139,255,0.35))',
              borderRadius: '6px 6px 2px 2px',
            }"
          />
          <div class="muted" style="font-size: 10px; margin-top: 6px">{{ bar.hourAgo }}h 前</div>
          <div style="font-size: 11px">{{ bar.value }}</div>
        </div>
      </div>
      <div v-else class="empty">暂无警告数据</div>

      <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line)">
        <div class="spread" style="margin-bottom: 8px">
          <span class="muted">未关闭工单</span>
          <b>{{ stats?.openTickets ?? 0 }}</b>
        </div>
        <div class="spread">
          <span class="muted">设备状态分布</span>
          <span class="mono muted" style="font-size: 12px">
            {{ Object.entries(stats?.byState ?? {}).map(([k, v]) => `${k}:${v}`).join(' / ') || '—' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

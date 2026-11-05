<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { realtime } from './realtime';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const isLogin = computed(() => route.path === '/login');
const roleLabel = computed(() => ({ admin: '管理员', operator: '运维', viewer: '只读' })[auth.user?.role ?? 'viewer']);

const navs = [
  { path: '/', label: '总览看板', icon: '◈' },
  { path: '/alerts', label: '警告中心', icon: '◉' },
  { path: '/assistant', label: 'AI 运维助手', icon: '✦' },
  { path: '/users', label: '成员与权限', icon: '⚉' },
];

function logout() {
  realtime.disconnect();
  auth.logout();
  router.push('/login');
}

onMounted(() => {
  if (auth.isLoggedIn) realtime.connect();
});
onUnmounted(() => realtime.disconnect());
</script>

<template>
  <div v-if="isLogin" class="login-wrap">
    <RouterView />
  </div>

  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">EQ</div>
        <div>
          设备云眼
          <small>EquipmentOps Platform</small>
        </div>
      </div>

      <nav class="nav">
        <RouterLink v-for="item in navs" :key="item.path" :to="item.path" active-class="active">
          <span>{{ item.icon }}</span>{{ item.label }}
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        Vue 3 + TypeScript / Node.js<br />
        MQTT 实时链路 · AI Agent 工具调用
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <h2 class="page-title">
            {{ { '/': '设备总览', '/alerts': '警告中心', '/assistant': 'AI 运维助手', '/users': '成员与权限' }[route.path] ?? '设备详情' }}
          </h2>
          <p class="page-sub">工业设备远程监控 · 状态机 · 警告闭环 · 知识库问答</p>
        </div>
        <div class="user-chip">
          <div class="avatar">{{ auth.user?.name?.slice(0, 1) ?? 'U' }}</div>
          <div>
            <div>{{ auth.user?.name ?? '未登录' }}</div>
            <div class="muted" style="font-size: 11px">{{ auth.user?.username }}</div>
          </div>
          <span class="role-tag">{{ roleLabel }}</span>
          <button class="btn small ghost" @click="logout">退出</button>
        </div>
      </header>

      <RouterView />
    </main>
  </div>
</template>

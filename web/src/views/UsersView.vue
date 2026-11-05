<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';

interface UserRow {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
}

const items = ref<UserRow[]>([]);
const error = ref('');
const roleLabel: Record<string, string> = { admin: '管理员', operator: '运维工程师', viewer: '只读访客' };
const roleScope: Record<string, string> = {
  admin: '全部权限：状态迁移 / 指令下发 / 工单 / 成员查看',
  operator: '指令下发、警告确认与工单处理，不可修改设备状态',
  viewer: '只读：看板、曲线、警告列表与 AI 问答',
};

onMounted(async () => {
  try {
    const res = await api.get<{ items: UserRow[] }>('/users');
    items.value = res.items;
  } catch (err) {
    error.value = (err as Error).message;
  }
});
</script>

<template>
  <div class="card">
    <div class="spread" style="margin-bottom: 14px">
      <div>
        <div style="font-weight: 600">成员与角色</div>
        <div class="page-sub">JWT 鉴权 + 路由级 RBAC，越权请求由后端返回 403</div>
      </div>
    </div>

    <div v-if="error" class="empty">{{ error }}（该页面仅管理员可见）</div>
    <table v-else class="table">
      <thead>
        <tr>
          <th>账号</th>
          <th>姓名</th>
          <th>角色</th>
          <th>权限范围</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in items" :key="u.id">
          <td class="mono">{{ u.username }}</td>
          <td>{{ u.name }}</td>
          <td><span class="role-tag">{{ roleLabel[u.role] }}</span></td>
          <td class="muted" style="font-size: 12.5px">{{ roleScope[u.role] }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

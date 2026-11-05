<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const username = ref('admin');
const password = ref('demo1234');

async function submit() {
  await auth.login(username.value.trim(), password.value.trim());
  if (auth.isLoggedIn) router.push('/');
}

function fill(name: string) {
  username.value = name;
  password.value = 'demo1234';
}
</script>

<template>
  <div class="card login-card">
    <h1>设备云眼</h1>
    <p class="page-sub" style="margin-bottom: 18px">工业设备远程运维平台 · 演示环境</p>

    <form @submit.prevent="submit">
      <label class="field">
        <span>账号</span>
        <input v-model="username" class="input" autocomplete="username" placeholder="admin / operator / viewer" />
      </label>
      <label class="field">
        <span>密码</span>
        <input v-model="password" class="input" type="password" autocomplete="current-password" placeholder="demo1234" />
      </label>

      <p v-if="auth.error" class="error-text">{{ auth.error }}</p>

      <button class="btn primary" type="submit" style="width: 100%" :disabled="auth.loading">
        {{ auth.loading ? '登录中…' : '进入控制台' }}
      </button>
    </form>

    <div class="row" style="margin-top: 14px">
      <span class="muted" style="font-size: 12px">演示账号：</span>
      <button class="btn small ghost" @click="fill('admin')">admin</button>
      <button class="btn small ghost" @click="fill('operator')">operator</button>
      <button class="btn small ghost" @click="fill('viewer')">viewer</button>
    </div>
  </div>
</template>

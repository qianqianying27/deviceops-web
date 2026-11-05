<script setup lang="ts">
const props = defineProps<{ state: string }>();

const map: Record<string, string> = {
  online: '在线',
  testing: '测试中',
  offline: '离线',
  fault: '故障',
  maintenance: '维护中',
};
</script>

<template>
  <span class="badge" :class="props.state">{{ map[props.state] ?? props.state }}</span>
</template>

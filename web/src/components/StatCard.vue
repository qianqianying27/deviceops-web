<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'cyan' | 'green' | 'amber' | 'red';
}>();
</script>

<template>
  <div class="card">
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value" :style="{ color: tone ? `var(--${tone})` : undefined }">{{ value }}</div>
    <div class="stat-hint">{{ hint ?? '' }}</div>
  </div>
</template>

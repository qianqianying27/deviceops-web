<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';

interface Point {
  ts: number;
  temp: number;
  humi: number;
}

const props = defineProps<{ points: Point[]; height?: string }>();
const el = ref<HTMLDivElement | null>(null);
let chart: ECharts | null = null;

function render() {
  if (!chart) return;
  const times = props.points.map((p) => new Date(p.ts).toLocaleTimeString('zh-CN', { hour12: false }));
  chart.setOption({
    backgroundColor: 'transparent',
    grid: { left: 44, right: 44, top: 36, bottom: 28 },
    tooltip: { trigger: 'axis', backgroundColor: '#111d31', borderColor: '#22344f', textStyle: { color: '#e6edf7' } },
    legend: { textStyle: { color: '#8ba0bd' }, top: 0 },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#22344f' } },
      axisLabel: { color: '#8ba0bd', fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value',
        name: '温度 ℃',
        axisLabel: { color: '#8ba0bd', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(34,52,79,0.6)' } },
      },
      {
        type: 'value',
        name: '湿度 %',
        axisLabel: { color: '#8ba0bd', fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: props.points.map((p) => p.temp),
        lineStyle: { width: 2, color: '#38e1ff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(56,225,255,0.22)' },
            { offset: 1, color: 'rgba(56,225,255,0)' },
          ]),
        },
      },
      {
        name: '湿度',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        data: props.points.map((p) => p.humi),
        lineStyle: { width: 2, color: '#4f8bff', type: 'dashed' },
      },
    ],
  });
}

function resize() {
  chart?.resize();
}

onMounted(() => {
  if (!el.value) return;
  chart = echarts.init(el.value);
  render();
  window.addEventListener('resize', resize);
});

watch(() => props.points, render, { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="el" class="chart" :style="{ height: height ?? '260px' }" />
</template>

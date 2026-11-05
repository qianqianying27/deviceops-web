import { describe, expect, it } from 'vitest';
import { evaluateRules, type TelemetrySample } from '../device/rules.js';

const base: TelemetrySample = {
  sn: 'SNS-002',
  temp: 36,
  humi: 55,
  accel: [0, -1, 0],
  gyro: [0, 0, 0],
  quality: 90,
  ts: 0,
};

describe('警告规则', () => {
  it('正常样本不产生警告', () => {
    expect(evaluateRules(base)).toHaveLength(0);
  });

  it('温度超过警告阈值命中 warning，超过严重阈值命中 critical', () => {
    expect(evaluateRules({ ...base, temp: 48 })[0]?.level).toBe('warning');
    expect(evaluateRules({ ...base, temp: 60 })[0]).toMatchObject({ rule: 'TEMP_CRITICAL', level: 'critical' });
  });

  it('湿度与振动、信号质量规则可叠加', () => {
    const violations = evaluateRules({ ...base, humi: 92, accel: [1.3, 0.2, 0], quality: 50 });
    expect(violations.map((v) => v.rule)).toEqual(['HUMI_HIGH', 'VIBRATION_HIGH', 'SIGNAL_WEAK']);
  });
});

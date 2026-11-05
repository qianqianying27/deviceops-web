export interface TelemetrySample {
  sn: string;
  temp: number;
  humi: number;
  accel: [number, number, number];
  gyro: [number, number, number];
  quality: number;
  ts: number;
}

export type Severity = 'warning' | 'critical';

export interface Violation {
  rule: string;
  level: Severity;
  message: string;
}

/**
 * 警告规则保持为纯函数：输入一条遥测，输出命中的规则，方便单测与后续配置化。
 * 阈值全部来自业务规程（温度 > 45℃ 警告、> 55℃ 严重、湿度 > 85%RH 警告）。
 */
export function evaluateRules(sample: TelemetrySample): Violation[] {
  const out: Violation[] = [];

  if (sample.temp > 55) {
    out.push({ rule: 'TEMP_CRITICAL', level: 'critical', message: `温度 ${sample.temp.toFixed(1)}℃ 超过 55℃ 严重阈值` });
  } else if (sample.temp > 45) {
    out.push({ rule: 'TEMP_HIGH', level: 'warning', message: `温度 ${sample.temp.toFixed(1)}℃ 超过 45℃ 警告阈值` });
  }

  if (sample.humi > 85) {
    out.push({ rule: 'HUMI_HIGH', level: 'warning', message: `湿度 ${sample.humi.toFixed(1)}%RH 超过 85% 上限` });
  }

  const accelNorm = Math.sqrt(sample.accel[0] ** 2 + sample.accel[1] ** 2 + sample.accel[2] ** 2);
  if (accelNorm > 1.2) {
    out.push({ rule: 'VIBRATION_HIGH', level: 'warning', message: `振动合成值 ${accelNorm.toFixed(2)}g 超过 1.2g 上限` });
  }

  if (sample.quality < 60) {
    out.push({ rule: 'SIGNAL_WEAK', level: 'warning', message: `信号质量 ${sample.quality} 低于 60，数据可能失真` });
  }

  return out;
}

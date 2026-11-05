export type DeviceState = 'offline' | 'online' | 'testing' | 'fault' | 'maintenance';

export const TERMINAL_STATES: DeviceState[] = ['offline', 'online', 'testing', 'fault', 'maintenance'];

/**
 * 显式状态机：合法迁移集中在一处定义，接口层与遥测接入层复用同一份规则，
 * 避免“设备在测试中却被离线心跳打回”这类隐式 bug。
 */
const TRANSITIONS: Record<DeviceState, DeviceState[]> = {
  offline: ['online'],
  online: ['testing', 'fault', 'maintenance', 'offline'],
  testing: ['online', 'fault', 'offline'],
  fault: ['maintenance', 'online', 'offline'],
  maintenance: ['online', 'offline'],
};

export const STATE_LABEL: Record<DeviceState, string> = {
  offline: '离线',
  online: '在线',
  testing: '测试中',
  fault: '故障',
  maintenance: '维护中',
};

export function canTransition(from: DeviceState, to: DeviceState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: DeviceState, to: DeviceState): void {
  if (!canTransition(from, to)) {
    throw new Error(`非法状态迁移：${STATE_LABEL[from]} → ${STATE_LABEL[to]}`);
  }
}

export function isDeviceState(value: string): value is DeviceState {
  return (TERMINAL_STATES as string[]).includes(value);
}

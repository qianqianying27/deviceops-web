import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isDeviceState } from '../device/stateMachine.js';

describe('设备状态机', () => {
  it('在线设备可以进入测试、故障、维护', () => {
    expect(canTransition('online', 'testing')).toBe(true);
    expect(canTransition('online', 'fault')).toBe(true);
    expect(canTransition('online', 'maintenance')).toBe(true);
  });

  it('离线设备只能先上线，禁止直接跳维护', () => {
    expect(canTransition('offline', 'online')).toBe(true);
    expect(canTransition('offline', 'maintenance')).toBe(false);
  });

  it('测试中的设备不允许被心跳直接改回在线以外的中间态', () => {
    expect(canTransition('testing', 'fault')).toBe(true);
    expect(canTransition('testing', 'maintenance')).toBe(false);
  });

  it('非法迁移抛出可读错误', () => {
    expect(() => assertTransition('offline', 'fault')).toThrowError(/非法状态迁移/);
  });

  it('状态枚举校验', () => {
    expect(isDeviceState('maintenance')).toBe(true);
    expect(isDeviceState('unknown')).toBe(false);
  });
});

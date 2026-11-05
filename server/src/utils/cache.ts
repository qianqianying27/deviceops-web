type Entry<T> = { value: T; expireAt: number };

/** 进程内 TTL 缓存：用于看板聚合与设备最新快照，接口与 Redis 版保持一致，便于替换。 */
export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(private readonly defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expireAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expireAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

export const latestTelemetry = new Map<string, Record<string, number>>();
export const dashboardCache = new TtlCache<unknown>(5_000);

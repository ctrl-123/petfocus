/**
 * 键值存储：schema 无关的持久化通道。
 *
 * 为什么单独一条通道：
 * 设备身份（ID + 签名密钥）必须在**任何业务 schema 迁移之前**就能读到，
 * 否则一次糟糕的迁移会把用户身份一起搞坏。参见 ADR-010 与 5.3.3。
 *
 * 值用结构化克隆保存（IndexedDB 原生支持 CryptoKey），因此**不要**在这里做 JSON 序列化。
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/** 内存实现：测试与降级用（隐私模式下 IndexedDB 不可用时） */
export function createMemoryKeyValueStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    get<T>(key: string): Promise<T | undefined> {
      return Promise.resolve(map.get(key) as T | undefined);
    },
    set<T>(key: string, value: T): Promise<void> {
      map.set(key, value);
      return Promise.resolve();
    },
    delete(key: string): Promise<void> {
      map.delete(key);
      return Promise.resolve();
    },
    clear(): Promise<void> {
      map.clear();
      return Promise.resolve();
    },
  };
}

/** 设备身份相关的存储键（集中定义，避免各处拼字符串） */
export const KV_KEYS = {
  DEVICE_ID: 'device.id',
  /** 签名密钥（不可导出 CryptoKey） */
  DEVICE_SIGNING_KEY: 'device.signingKey',
  /** 是否已在服务端登记 */
  DEVICE_REGISTERED: 'device.registered',
  /** 上次成功结算的时间，用于 UI 显示「上次同步」 */
  LAST_SETTLE_AT: 'settle.lastAt',
  /** 上次导出数据的时间，用于 NFR-2.4 的温和提醒 */
  LAST_EXPORT_AT: 'data.lastExportAt',
  /** 数据库 schema 版本（导出/导入时校验用） */
  SCHEMA_VERSION: 'data.schemaVersion',
} as const;

export type KvKey = (typeof KV_KEYS)[keyof typeof KV_KEYS];

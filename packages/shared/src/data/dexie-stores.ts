/**
 * Dexie 支撑的持久化实现：设备身份存储 + 键值存储。
 *
 * 关键点：CryptoKey 走 rawKv 表（结构化克隆，不序列化）。
 * 见 ADR-010：密钥必须**不可导出**，所以绝不能 JSON 化（那样存不下，也失去意义）。
 */
import type {
  CoinLedgerRecord,
  FinanceEntryRecord,
  FitnessRecordRow,
  InventoryRecord,
  MealEntryRecord,
  OutboxRecord,
  PetFocusDb,
  QuotaLedgerRecord,
  SessionRecord,
  TaskRecord,
} from './db.ts';
import type { DeviceIdentity, DeviceIdentityStorage } from './device-identity.ts';
import { KV_KEYS, type KeyValueStore } from './kv-store.ts';
import type {
  CoinLedgerRepository,
  FinanceRepository,
  FitnessRepository,
  KvRepository,
  MealRepository,
  OutboxRepository,
  PetRepository,
  QuotaLedgerRepository,
  Repositories,
  Repository,
  SessionRepository,
  SettingsRepository,
  TaskRepository,
} from './repositories.ts';
import { dayKeyOf } from '../calendar.ts';

/** 索引粗筛用的窗口：两天，足以覆盖 04:00 边界带来的偏移 */
const DAY_MS = 86_400_000;

/** 设备身份在 kv/rawKv 中的键 */
const IDENTITY_KEY = 'device.identity';

interface StoredIdentityMeta {
  deviceId: string;
  createdAt: number;
  registered: boolean;
}

/**
 * 设备身份存储：
 * - 可序列化部分（ID/时间戳/登记状态）存 kv 表
 * - 不可导出的 CryptoKey 存 rawKv 表（结构化克隆）
 * 二者分开存，是为了让「迁移业务 schema」与「保住设备身份」互不影响。
 */
export function createDexieDeviceStorage(db: PetFocusDb): DeviceIdentityStorage {
  return {
    async load(): Promise<DeviceIdentity | undefined> {
      const meta = await db.kv.get(IDENTITY_KEY);
      if (!meta) return undefined;
      let parsed: StoredIdentityMeta;
      try {
        parsed = JSON.parse(meta.valueJson) as StoredIdentityMeta;
      } catch {
        return undefined;
      }
      const raw = await db.rawKv.get(IDENTITY_KEY);
      if (!raw || raw.value === undefined || raw.value === null) return undefined;
      return {
        deviceId: parsed.deviceId,
        createdAt: parsed.createdAt,
        registered: parsed.registered,
        signingKey: raw.value,
      };
    },

    async save(identity: DeviceIdentity): Promise<void> {
      const meta: StoredIdentityMeta = {
        deviceId: identity.deviceId,
        createdAt: identity.createdAt,
        registered: identity.registered,
      };
      await db.transaction('rw', db.kv, db.rawKv, async () => {
        await db.kv.put({ key: IDENTITY_KEY, valueJson: JSON.stringify(meta) });
        await db.rawKv.put({ key: IDENTITY_KEY, value: identity.signingKey });
      });
    },

    async clear(): Promise<void> {
      await db.transaction('rw', db.kv, db.rawKv, async () => {
        await db.kv.delete(IDENTITY_KEY);
        await db.rawKv.delete(IDENTITY_KEY);
      });
    },
  };
}

/** JSON 键值存储实现（用于普通偏好与时间戳，例如上次导出时间） */
export function createDexieKeyValueStore(db: PetFocusDb): KeyValueStore {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const row = await db.kv.get(key);
      if (!row) return undefined;
      try {
        return JSON.parse(row.valueJson) as T;
      } catch {
        return undefined;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      await db.kv.put({ key, valueJson: JSON.stringify(value) });
    },
    async delete(key: string): Promise<void> {
      await db.kv.delete(key);
    },
    async clear(): Promise<void> {
      await db.kv.clear();
    },
  };
}

/** 便捷读取：上次导出时间（NFR-2.4 的导出提醒用） */
export async function getLastExportAt(kv: KeyValueStore): Promise<number | undefined> {
  return kv.get<number>(KV_KEYS.LAST_EXPORT_AT);
}

/** 便捷写入：记录一次导出 */
export async function markExported(kv: KeyValueStore, now: number): Promise<void> {
  await kv.set(KV_KEYS.LAST_EXPORT_AT, now);
}

/** 距上次导出多少天；从未导出返回 undefined */
export function daysSinceExport(lastExportAt: number | undefined, now: number): number | undefined {
  if (lastExportAt === undefined || !Number.isFinite(lastExportAt)) return undefined;
  const MS_PER_DAY = 86_400_000;
  return Math.floor(Math.max(0, now - lastExportAt) / MS_PER_DAY);
}

/** 是否需要提醒导出（默认超过 14 天） */
export const EXPORT_REMINDER_DAYS = 14;

export function shouldRemindExport(lastExportAt: number | undefined, now: number): boolean {
  const days = daysSinceExport(lastExportAt, now);
  if (days === undefined) return true; // 从未导出过 → 该提醒
  return days >= EXPORT_REMINDER_DAYS;
}

// ─────────────────────────────────────────────────────────────
// 仓储的 Dexie 实现
// ─────────────────────────────────────────────────────────────

/** 通用表包装：与内存实现保持完全一致的行为语义 */
function tableRepository<T extends { id: string }>(table: {
  get(key: string): Promise<T | undefined>;
  put(value: T): Promise<string>;
  bulkPut(values: readonly T[]): Promise<unknown>;
  delete(key: string): Promise<void>;
  toArray(): Promise<T[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}): Repository<T> {
  return {
    get: (key) => table.get(key),
    put: async (value) => {
      await table.put(value);
    },
    bulkPut: async (values) => {
      if (values.length > 0) await table.bulkPut(values);
    },
    delete: (key) => table.delete(key),
    all: () => table.toArray(),
    count: () => table.count(),
    clear: () => table.clear(),
  };
}

/**
 * 用 Dexie 装配全部仓储。
 * 注意：这里的每个 `byDay` 都必须与内存实现给出相同结果，
 * 否则「降级模式」下的统计会和正常模式不一致。
 */
export function createDexieRepositories(db: PetFocusDb): Repositories {
  const tasks: TaskRepository = {
    ...tableRepository<TaskRecord>(db.tasks),
    byDay: (dayKey) => db.tasks.where('dayKey').equals(dayKey).toArray(),
    byStatus: (status) => db.tasks.where('status').equals(status).toArray(),
  };

  const sessions: SessionRepository = {
    ...tableRepository<SessionRecord>(db.sessions),
    byDay: async (dayKey) => {
      // startedAtWall 是毫秒时间戳，用区间查询命中索引，避免全表扫描
      const start = new Date(`${dayKey}T00:00:00`).getTime();
      const rows = await db.sessions.where('startedAtWall').between(start, start + 2 * DAY_MS).toArray();
      // 归属日仍以 calendar 的 04:00 规则为准（索引区间只是粗筛）
      return rows.filter((r) => dayKeyOf(r.startedAtWall) === dayKey);
    },
    byKind: (kind) => db.sessions.where('kind').equals(kind).toArray(),
    findUnsettled: async () => {
      const candidates = await db.sessions
        .where('status')
        .anyOf('SCHEDULED', 'RUNNING', 'PAUSED', 'AWAITING_SETTLEMENT')
        .toArray();
      return candidates.sort((a, b) => b.startedAtWall - a.startedAtWall)[0];
    },
  };

  const coinLedger: CoinLedgerRepository = {
    ...tableRepository<CoinLedgerRecord>(db.coinLedger),
    byDay: (dayKey) => db.coinLedger.where('dayKey').equals(dayKey).toArray(),
    earnedOnDay: async (dayKey) => {
      const rows = await db.coinLedger.where('dayKey').equals(dayKey).toArray();
      return rows
        .filter((r) => r.kind !== 'DEMO' && r.amount > 0)
        .reduce((sum, r) => sum + r.amount, 0);
    },
    balance: async () => {
      const rows = await db.coinLedger.toArray();
      return Math.max(0, rows.reduce((sum, r) => sum + r.amount, 0));
    },
    byRef: (refId) => db.coinLedger.where('refId').equals(refId).toArray(),
  };

  const quotaLedger: QuotaLedgerRepository = {
    ...tableRepository<QuotaLedgerRecord>(db.quotaLedger),
    query: (scope, periodKey) =>
      db.quotaLedger.where('[scope+periodKey]').equals([scope, periodKey]).toArray(),
    allEntries: () => db.quotaLedger.toArray(),
    bySession: (sessionId) => db.quotaLedger.where('sessionId').equals(sessionId).toArray(),
  };

  const pet: PetRepository = {
    get: () => db.pet.get('singleton'),
    put: async (value) => {
      await db.pet.put(value);
    },
    clear: () => db.pet.clear(),
  };

  const meals: MealRepository = {
    ...tableRepository<MealEntryRecord>(db.mealEntries),
    byDay: (dayKey) => db.mealEntries.where('dayKey').equals(dayKey).toArray(),
  };

  const finance: FinanceRepository = {
    ...tableRepository<FinanceEntryRecord>(db.financeEntries),
    byDay: (dayKey) => db.financeEntries.where('dayKey').equals(dayKey).toArray(),
    categories: () => db.financeCategories.orderBy('order').toArray(),
    putCategory: async (value) => {
      await db.financeCategories.put(value);
    },
    budgets: () => db.financeBudgets.toArray(),
    putBudget: async (value) => {
      await db.financeBudgets.put(value);
    },
  };

  const fitness: FitnessRepository = {
    ...tableRepository<FitnessRecordRow>(db.fitnessRecords),
    checkins: () => db.fitnessCheckins.toArray(),
    putCheckin: async (value) => {
      await db.fitnessCheckins.put(value);
    },
    byDay: (dayKey) => db.fitnessRecords.where('dayKey').equals(dayKey).toArray(),
  };

  const outbox: OutboxRepository = {
    ...tableRepository<OutboxRecord>(db.outbox),
    due: async (now, limit) => {
      const rows = await db.outbox.where('nextRetryAt').belowOrEqual(now).toArray();
      return rows
        .filter((r) => r.status === 'PENDING' || r.status === 'FAILED' || r.status === 'IN_FLIGHT')
        .sort((a, b) => a.nextRetryAt - b.nextRetryAt)
        .slice(0, limit);
    },
  };

  const kv: KvRepository = {
    get: (key) => db.kv.get(key),
    set: async (key, valueJson) => {
      await db.kv.put({ key, valueJson });
    },
    delete: (key) => db.kv.delete(key),
    all: () => db.kv.toArray(),
    clear: () => db.kv.clear(),
  };

  const settings: SettingsRepository = {
    get: () => db.settings.get('singleton'),
    put: async (value) => {
      await db.settings.put(value);
    },
    clear: () => db.settings.clear(),
  };

  return {
    tasks,
    sessions,
    coinLedger,
    quotaLedger,
    pet,
    meals,
    finance,
    fitness,
    inventory: tableRepository<InventoryRecord>(db.inventory),
    outbox,
    kv,
    settings,
    async clearAll() {
      await db.transaction(
        'rw',
        [
          db.tasks,
          db.sessions,
          db.coinLedger,
          db.quotaLedger,
          db.pet,
          db.mealEntries,
          db.financeEntries,
          db.financeCategories,
          db.financeBudgets,
          db.fitnessRecords,
          db.fitnessCheckins,
          db.inventory,
          db.settings,
        ],
        async () => {
          await Promise.all([
            db.tasks.clear(),
            db.sessions.clear(),
            db.coinLedger.clear(),
            db.quotaLedger.clear(),
            db.pet.clear(),
            db.mealEntries.clear(),
            db.financeEntries.clear(),
            db.financeCategories.clear(),
            db.financeBudgets.clear(),
            db.fitnessRecords.clear(),
            db.fitnessCheckins.clear(),
            db.inventory.clear(),
            db.settings.clear(),
          ]);
          // 刻意不清 db.kv：设备身份与「上次导出时间」不属于业务数据（详见 ADR-010）
        },
      );
    },
  };
}

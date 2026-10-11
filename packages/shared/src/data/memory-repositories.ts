/**
 * 仓储的内存实现。
 *
 * 两个用途：
 * 1. **测试**：领域/用例测试零 IO、可确定性复现。
 * 2. **降级**：IndexedDB 不可用时（隐私模式、存储配额耗尽）整体切换，
 *    数据仅存活于本次会话。UI **必须**明确告知用户，不能静默假装已保存。
 */
import type {
  CoinLedgerRecord,
  FinanceBudgetRecord,
  FinanceCategoryRecord,
  FinanceEntryRecord,
  FitnessCheckinRecord,
  FitnessRecordRow,
  InventoryRecord,
  KvRecord,
  MealEntryRecord,
  OutboxRecord,
  PetRecord,
  QuotaLedgerRecord,
  SessionRecord,
  SettingsRecord,
  TaskRecord,
} from './db.ts';
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

/** 通用内存表：用 Map 保住插入顺序，读取时再按需排序 */
function memoryTable<T, K extends string | number = string>(
  keyOf: (value: T) => K,
): Repository<T, K> & { snapshot(): Map<K, T> } {
  const map = new Map<K, T>();
  return {
    get: (key) => Promise.resolve(map.get(key)),
    put: (value) => {
      map.set(keyOf(value), value);
      return Promise.resolve();
    },
    bulkPut: (values) => {
      for (const v of values) map.set(keyOf(v), v);
      return Promise.resolve();
    },
    delete: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
    all: () => Promise.resolve([...map.values()]),
    count: () => Promise.resolve(map.size),
    clear: () => {
      map.clear();
      return Promise.resolve();
    },
    snapshot: () => new Map(map),
  };
}

const byString = <T extends { id: string }>(value: T): string => value.id;

export function createMemoryRepositories(): Repositories {
  const taskTable = memoryTable<TaskRecord>(byString);
  const sessionTable = memoryTable<SessionRecord>(byString);
  const coinTable = memoryTable<CoinLedgerRecord>(byString);
  const quotaTable = memoryTable<QuotaLedgerRecord>(byString);
  const petTable = memoryTable<PetRecord>(byString);
  const mealTable = memoryTable<MealEntryRecord>(byString);
  const financeTable = memoryTable<FinanceEntryRecord>(byString);
  const categoryTable = memoryTable<FinanceCategoryRecord>(byString);
  const budgetTable = memoryTable<FinanceBudgetRecord>(byString);
  const fitnessTable = memoryTable<FitnessRecordRow>(byString);
  const checkinTable = memoryTable<FitnessCheckinRecord>(byString);
  const inventoryTable = memoryTable<InventoryRecord>(byString);
  const outboxTable = memoryTable<OutboxRecord>(byString);
  const kvTable = memoryTable<KvRecord>((v) => v.key);
  const settingsTable = memoryTable<SettingsRecord>(byString);

  const tasks: TaskRepository = {
    ...taskTable,
    byDay: (dayKey) => taskTable.all().then((rows) => rows.filter((r) => r.dayKey === dayKey)),
    byStatus: (status) => taskTable.all().then((rows) => rows.filter((r) => r.status === status)),
  };

  const sessions: SessionRepository = {
    ...sessionTable,
    byDay: (dayKey) =>
      sessionTable.all().then((rows) => rows.filter((r) => dayKeyOf(r.startedAtWall) === dayKey)),
    byKind: (kind) => sessionTable.all().then((rows) => rows.filter((r) => r.kind === kind)),
    findUnsettled: () =>
      sessionTable.all().then((rows) =>
        rows
          .filter((r) => r.status === 'RUNNING' || r.status === 'PAUSED' || r.status === 'AWAITING_SETTLEMENT' || r.status === 'SCHEDULED')
          .sort((a, b) => b.startedAtWall - a.startedAtWall)[0],
      ),
  };

  const coinLedger: CoinLedgerRepository = {
    ...coinTable,
    byDay: (dayKey) => coinTable.all().then((rows) => rows.filter((r) => r.dayKey === dayKey)),
    earnedOnDay: (dayKey) =>
      coinTable.all().then((rows) =>
        rows
          .filter((r) => r.dayKey === dayKey && r.kind !== 'DEMO' && r.amount > 0)
          .reduce((sum, r) => sum + r.amount, 0),
      ),
    balance: () =>
      coinTable.all().then((rows) =>
        // 不变量 INV-4：余额不得为负；即便数据异常也夹到 0
        Math.max(0, rows.reduce((sum, r) => sum + r.amount, 0)),
      ),
    byRef: (refId) => coinTable.all().then((rows) => rows.filter((r) => r.refId === refId)),
  };

  const quotaLedger: QuotaLedgerRepository = {
    ...quotaTable,
    query: (scope, periodKey) =>
      quotaTable.all().then((rows) => rows.filter((r) => r.scope === scope && r.periodKey === periodKey)),
    allEntries: () => quotaTable.all(),
    bySession: (sessionId) => quotaTable.all().then((rows) => rows.filter((r) => r.sessionId === sessionId)),
  };

  const pet: PetRepository = {
    get: () => petTable.get('singleton'),
    put: (value) => petTable.put(value),
    clear: () => petTable.clear(),
  };

  const meals: MealRepository = {
    ...mealTable,
    byDay: (dayKey) => mealTable.all().then((rows) => rows.filter((r) => r.dayKey === dayKey)),
  };

  const finance: FinanceRepository = {
    ...financeTable,
    byDay: (dayKey) => financeTable.all().then((rows) => rows.filter((r) => r.dayKey === dayKey)),
    categories: () => categoryTable.all(),
    putCategory: (value) => categoryTable.put(value),
    budgets: () => budgetTable.all(),
    putBudget: (value) => budgetTable.put(value),
  };

  const fitness: FitnessRepository = {
    ...fitnessTable,
    checkins: () => checkinTable.all(),
    putCheckin: (value) => checkinTable.put(value),
    byDay: (dayKey) => fitnessTable.all().then((rows) => rows.filter((r) => r.dayKey === dayKey)),
  };

  const outbox: OutboxRepository = {
    ...outboxTable,
    due: (now, limit) =>
      outboxTable
        .all()
        .then((rows) =>
          rows
            .filter((r) => (r.status === 'PENDING' || r.status === 'FAILED') && r.nextRetryAt <= now)
            .sort((a, b) => a.nextRetryAt - b.nextRetryAt)
            .slice(0, limit),
        ),
  };

  const kv: KvRepository = {
    get: (key) => kvTable.get(key),
    set: (key, valueJson) => kvTable.put({ key, valueJson }),
    delete: (key) => kvTable.delete(key),
    all: () => kvTable.all(),
    clear: () => kvTable.clear(),
  };

  const settings: SettingsRepository = {
    get: () => settingsTable.get('singleton'),
    put: (value) => settingsTable.put(value),
    clear: () => settingsTable.clear(),
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
    inventory: inventoryTable,
    outbox,
    kv,
    settings,
    async clearAll() {
      for (const t of [
        taskTable,
        sessionTable,
        coinTable,
        quotaTable,
        petTable,
        mealTable,
        financeTable,
        categoryTable,
        budgetTable,
        fitnessTable,
        checkinTable,
        inventoryTable,
        outboxTable,
        settingsTable,
      ]) {
        await t.clear();
      }
      // 刻意不清 kv：设备身份与「上次导出时间」不属于业务数据，
      // 清掉会让用户的配额/金币账本在服务端失联（详见 ADR-010）。
    },
  };
}

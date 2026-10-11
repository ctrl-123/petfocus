/**
 * Dexie 数据库：**业务数据的唯一归宿**（ADR-010：数据只存本机，不上云）。
 *
 * 表定义见技术设计 4.3。三条铁律：
 * 1. 这里只存本机数据——没有任何表会同步到服务端。
 * 2. 版本号严格递增，每次变更都要写 upgrade() 并有迁移测试（AGENTS.md 第 6 节）。
 * 3. 演示数据用**独立的数据库实例**（dbName 后缀 -demo），物理隔离，绝不混入真实数据。
 */
/**
 * Dexie 导入说明（排查过，别再"优化"成子路径）：
 *
 * 表面上 Dexie 4.4.6 的 `package.json` 没有 `types` 字段、`exports['.']` 指向
 * `import-wrapper.mjs`，像是类型解析有问题。但经过 `--traceResolution` 与最小复现验证：
 * 该目录下存在官方提供的 **`import-wrapper.d.mts`**（内容为
 * `export * from './dist/dexie.js'; export { default } from './dist/dexie.js'`），
 * NodeNext 会解析到它，因此 `import Dexie from 'dexie'` 的类型**完全正常**。
 *
 * 之前踩的坑是自作聪明去引 `node_modules/.pnpm/.../dist/dexie.d.ts` 深层相对路径做垫片，
 * 那会把类型退化成「模块命名空间对象」（TS2507），反而更糟。
 *
 * 结论：就用 `from 'dexie'`，别改。
 */
import Dexie, { type Table } from 'dexie';

import type {
  CoinEntryKind,
  EquipSlot,
  ExitKind,
  FinanceType,
  MealSlot,
  Nutrients,
  NutritionSource,
  PetMood,
  PortionUnit,
  Priority,
  QuotaEntryKind,
  QuotaScope,
  SessionKind,
  SessionStatus,
  SkipReason,
  TaskStatus,
  ViolationSource,
} from '../types.ts';

/** 当前 schema 版本（导出文件里会写入它，导入时校验） */
export const SCHEMA_VERSION = 1;

/** 真实数据与演示数据使用两个库，避免演示数据污染真实账本 */
export const DB_NAME = 'petfocus';
export const DEMO_DB_NAME = 'petfocus-demo';

// ─────────────────────────────────────────────────────────────
// 持久化记录（IndexedDB 行结构）
// ─────────────────────────────────────────────────────────────

export interface TaskRecord {
  id: string;
  dayKey: string;
  title: string;
  note?: string;
  startAt: number;
  plannedMs: number;
  priority: Priority;
  status: TaskStatus;
  completedAt?: number;
  deferredTo?: number;
  skipReason?: SkipReason;
  carriedFromTaskId?: string;
  linkedSessionIds: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ViolationRecord {
  startedAt: number;
  endedAt?: number;
  durationMs: number;
  source: ViolationSource;
  detail?: string;
}

export interface PauseIntervalRecord {
  from: number;
  to?: number;
}

export interface SessionRecord {
  id: string;
  kind: SessionKind;
  status: SessionStatus;
  taskId?: string;
  title: string;
  plannedMs: number;
  /** 单调时钟基准（计时用） */
  startedAtMonotonic: number;
  /** 墙钟（展示与偏差检测用） */
  startedAtWall: number;
  endedAt?: number;
  pausedIntervals: PauseIntervalRecord[];
  violations: ViolationRecord[];
  effectiveMs: number;
  clockSkewMs?: number;
  exitKind: ExitKind;
  skipReason?: SkipReason;
  rewardCoin: number;
  /** 服务端确认时间；undefined 表示尚未结算（离线/待确认） */
  settledAtServer?: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface QuotaLedgerRecord {
  id: string;
  scope: QuotaScope;
  kind: QuotaEntryKind;
  periodKey: string;
  amount?: number;
  sessionId?: string;
  reason?: SkipReason | 'BREACH';
  /** 服务端权威时间；0 表示本地乐观记录待确认 */
  serverTime: number;
  confirmed: boolean;
}

export interface CoinLedgerRecord {
  id: string;
  kind: CoinEntryKind;
  amount: number;
  balanceAfter: number;
  refId?: string;
  breakdown?: Record<string, number>;
  dayKey: string;
  serverTime: number;
  confirmed: boolean;
  note?: string;
}

export interface PetRecord {
  id: 'singleton';
  name: string;
  level: number;
  exp: number;
  mood: number;
  satiety: number;
  energy: number;
  wiltingUntil?: number;
  mood0?: PetMood;
  moodCache?: PetMood;
  equipped: Partial<Record<EquipSlot, string | null>>;
  outfits: Array<Partial<Record<EquipSlot, string | null>>>;
  lastTickAt: number;
  interactedCount: number;
  completedTasks: number;
  updatedAt: number;
}

export interface InventoryRecord {
  id: string;
  itemId: string;
  quantity: number;
  acquiredAt: number;
}

export interface FitnessCheckinRecord {
  id: string;
  dayKey: string;
  checkedAt: number;
  note?: string;
  streakAtTime: number;
}

export interface FitnessRecordRow {
  id: string;
  dayKey: string;
  itemName: string;
  unit: 'REPS' | 'SETS' | 'MINUTES' | 'KM';
  value: number;
  sets?: number;
  note?: string;
  recordedAt: number;
}

export interface MealEntryRecord {
  id: string;
  dayKey: string;
  slot: MealSlot;
  foodName: string;
  normalizedName: string;
  portionValue: number;
  portionUnit: PortionUnit;
  nutrients: Nutrients;
  source: NutritionSource;
  confidence?: number;
  aiModel?: string;
  recordedAt: number;
}

export interface FinanceCategoryRecord {
  id: string;
  name: string;
  icon: string;
  type: FinanceType;
  isBuiltin: boolean;
  order: number;
}

export interface FinanceEntryRecord {
  id: string;
  dayKey: string;
  type: FinanceType;
  /** 整数「分」，避免浮点误差（AGENTS.md 3.1） */
  amountCents: number;
  categoryId: string;
  note?: string;
  paymentMethod?: string;
  occurredAt: number;
}

export interface FinanceBudgetRecord {
  id: string;
  monthKey: string;
  totalLimitCents: number;
  categoryLimits: Record<string, number>;
}

export interface SettingsRecord {
  id: 'singleton';
  json: string;
  updatedAt: number;
}

/** 结算队列：只承载四类出网请求（技术设计 5.3.2） */
export type OutboxKind = 'SETTLE' | 'CONSUME_QUOTA' | 'CLAIM_GRANT' | 'AI_NUTRITION';

export interface OutboxRecord {
  id: string;
  kind: OutboxKind;
  payloadJson: string;
  status: 'PENDING' | 'IN_FLIGHT' | 'FAILED' | 'DEAD';
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
  createdAt: number;
}

/** 普通 KV：只放可 JSON 序列化的值 */
export interface KvRecord {
  key: string;
  valueJson: string;
}

/** 二进制/不可序列化 KV：CryptoKey 经结构化克隆存放（见 device-store） */
export interface RawKvRecord {
  key: string;
  value: unknown;
}

// ─────────────────────────────────────────────────────────────
// 数据库
// ─────────────────────────────────────────────────────────────

export class PetFocusDb extends Dexie {
  tasks!: Table<TaskRecord, string>;
  sessions!: Table<SessionRecord, string>;
  quotaLedger!: Table<QuotaLedgerRecord, string>;
  coinLedger!: Table<CoinLedgerRecord, string>;
  pet!: Table<PetRecord, string>;
  inventory!: Table<InventoryRecord, string>;
  fitnessCheckins!: Table<FitnessCheckinRecord, string>;
  fitnessRecords!: Table<FitnessRecordRow, string>;
  mealEntries!: Table<MealEntryRecord, string>;
  financeEntries!: Table<FinanceEntryRecord, string>;
  financeCategories!: Table<FinanceCategoryRecord, string>;
  financeBudgets!: Table<FinanceBudgetRecord, string>;
  settings!: Table<SettingsRecord, string>;
  outbox!: Table<OutboxRecord, string>;
  aiCache!: Table<{ key: string; payloadJson: string; createdAt: number }, string>;
  kv!: Table<KvRecord, string>;
  rawKv!: Table<RawKvRecord, string>;

  constructor(name: string = DB_NAME) {
    super(name);

    // ── v1：初始 schema ─────────────────────────────────────
    this.version(1).stores({
      // 索引说明：'&' 唯一，'[a+b]' 复合索引
      tasks: 'id, dayKey, startAt, status, [dayKey+status], deletedAt',
      sessions: 'id, kind, status, startedAtWall, [kind+startedAtWall], settledAtServer',
      quotaLedger: 'id, scope, periodKey, [scope+periodKey], confirmed, sessionId',
      coinLedger: 'id, kind, dayKey, serverTime, [dayKey+kind], confirmed, refId',
      pet: 'id',
      inventory: 'id, itemId',
      fitnessCheckins: 'id, dayKey, checkedAt',
      fitnessRecords: 'id, dayKey, [dayKey+itemName]',
      mealEntries: 'id, dayKey, [dayKey+slot], normalizedName',
      financeEntries: 'id, dayKey, categoryId, [dayKey+type], occurredAt',
      financeCategories: 'id, type, order',
      financeBudgets: 'id, monthKey',
      settings: 'id',
      outbox: 'id, kind, status, [status+nextRetryAt], nextRetryAt',
      aiCache: 'key, createdAt',
      kv: 'key',
      rawKv: 'key',
    });
  }
}

/** 打开数据库（幂等）；失败时抛出可读错误，由上层决定是否降级到内存仓储 */
export async function openDb(name: string = DB_NAME): Promise<PetFocusDb> {
  const db = new PetFocusDb(name);
  try {
    await db.open();
    return db;
  } catch (err) {
    db.close();
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`打开本地数据库失败（${name}）：${message}`);
  }
}

/** 删除数据库：仅用于「用户主动清空数据」与测试 */
export async function deleteDb(name: string = DB_NAME): Promise<void> {
  await Dexie.delete(name);
}

/**
 * 关闭数据库。
 *
 * 为什么要包一层：Dexie 4 的类型声明在当前 tsconfig（verbatimModuleSyntax +
 * NodeNext 解析）下未能暴露 `close()`，直接调用会报 TS2339，但运行时是存在的。
 * 与其在调用处反复 @ts-expect-error，不如在这里收敛成一个带类型的出口。
 */
export function closeDb(db: PetFocusDb): void {
  const maybe = db as unknown as { close?: () => void };
  if (typeof maybe.close === 'function') maybe.close();
}

/** 数据库是否可用（隐私模式/禁用 IndexedDB 时为 false） */
export async function isDbAvailable(name: string = `${DB_NAME}-probe`): Promise<boolean> {
  try {
    const db = new PetFocusDb(name);
    await db.open();
    db.close();
    await Dexie.delete(name);
    return true;
  } catch {
    return false;
  }
}

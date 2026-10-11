/**
 * 仓储接口：数据访问的唯一门面。
 *
 * 为什么要有这层抽象：
 * 1. 上层（features/usecases）只依赖接口，不直接碰 Dexie。
 * 2. 领域测试用内存实现，零 IO、可确定性复现。
 * 3. 隐私模式/IndexedDB 不可用时，可整体降级为内存实现（数据仅存活于本次会话），
 *    并由 UI 明确告知用户「本次使用不会保存」——绝不静默丢数据。
 *
 * 所有实现都必须保证：**只写本机，不出网**（ADR-010）。
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

/** 通用仓储：各实体共用同一套 CRUD 语义 */
export interface Repository<T, K = string> {
  get(key: K): Promise<T | undefined>;
  put(value: T): Promise<void>;
  bulkPut(values: ReadonlyArray<T>): Promise<void>;
  delete(key: K): Promise<void>;
  all(): Promise<T[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

/** 待办仓储（含按日查询） */
export interface TaskRepository extends Repository<TaskRecord> {
  byDay(dayKey: string): Promise<TaskRecord[]>;
  /** 跨天未完成的待办（用于 E15 的边界处理） */
  byStatus(status: TaskRecord['status']): Promise<TaskRecord[]>;
}

/** 会话仓储 */
export interface SessionRepository extends Repository<SessionRecord> {
  byDay(dayKey: string): Promise<SessionRecord[]>;
  byKind(kind: SessionRecord['kind']): Promise<SessionRecord[]>;
  /** 当前未结算的会话：用于冷启动恢复（技术设计 5.1.4） */
  findUnsettled(): Promise<SessionRecord | undefined>;
}

/** 金币账本仓储（追加型） */
export interface CoinLedgerRepository extends Repository<CoinLedgerRecord> {
  byDay(dayKey: string): Promise<CoinLedgerRecord[]>;
  /** 当日已产出金币，用于日上限判断 */
  earnedOnDay(dayKey: string): Promise<number>;
  /** 余额 = 所有金额之和；不变量：≥ 0 */
  balance(): Promise<number>;
  byRef(refId: string): Promise<CoinLedgerRecord[]>;
}

/** 配额账本仓储（追加型） */
export interface QuotaLedgerRepository extends Repository<QuotaLedgerRecord> {
  query(scope: QuotaLedgerRecord['scope'], periodKey: string): Promise<QuotaLedgerRecord[]>;
  allEntries(): Promise<QuotaLedgerRecord[]>;
  bySession(sessionId: string): Promise<QuotaLedgerRecord[]>;
}

/** 宠物仓储（单例） */
export interface PetRepository {
  get(): Promise<PetRecord | undefined>;
  put(value: PetRecord): Promise<void>;
  clear(): Promise<void>;
}

/** 饮食仓储 */
export interface MealRepository extends Repository<MealEntryRecord> {
  byDay(dayKey: string): Promise<MealEntryRecord[]>;
}

/** 记账仓储 */
export interface FinanceRepository extends Repository<FinanceEntryRecord> {
  byDay(dayKey: string): Promise<FinanceEntryRecord[]>;
  categories(): Promise<FinanceCategoryRecord[]>;
  putCategory(value: FinanceCategoryRecord): Promise<void>;
  budgets(): Promise<FinanceBudgetRecord[]>;
  putBudget(value: FinanceBudgetRecord): Promise<void>;
}

/** 健身仓储 */
export interface FitnessRepository extends Repository<FitnessRecordRow> {
  checkins(): Promise<FitnessCheckinRecord[]>;
  putCheckin(value: FitnessCheckinRecord): Promise<void>;
  byDay(dayKey: string): Promise<FitnessRecordRow[]>;
}

/** 结算队列仓储 */
export interface OutboxRepository extends Repository<OutboxRecord> {
  /** 取出到期的待处理项（按 nextRetryAt 升序） */
  due(now: number, limit: number): Promise<OutboxRecord[]>;
}

/** 键值仓储（原样存储，不做 JSON 转换由实现决定） */
export interface KvRepository {
  get(key: string): Promise<KvRecord | undefined>;
  set(key: string, valueJson: string): Promise<void>;
  delete(key: string): Promise<void>;
  all(): Promise<KvRecord[]>;
  clear(): Promise<void>;
}

/** 设置仓储（单例，JSON 字符串） */
export interface SettingsRepository {
  get(): Promise<SettingsRecord | undefined>;
  put(value: SettingsRecord): Promise<void>;
  clear(): Promise<void>;
}

/** 仓储集合：上层从这一个对象取全部数据访问能力 */
export interface Repositories {
  tasks: TaskRepository;
  sessions: SessionRepository;
  coinLedger: CoinLedgerRepository;
  quotaLedger: QuotaLedgerRepository;
  pet: PetRepository;
  meals: MealRepository;
  finance: FinanceRepository;
  fitness: FitnessRepository;
  inventory: Repository<InventoryRecord>;
  outbox: OutboxRepository;
  kv: KvRepository;
  settings: SettingsRepository;
  /** 清空全部业务数据（用户在设置页主动触发时使用） */
  clearAll(): Promise<void>;
}

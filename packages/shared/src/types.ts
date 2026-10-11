/**
 * 跨端共享领域类型。
 *
 * 约束（见 AGENTS.md 第 2 节）：
 * - 本文件与整个 packages/shared 必须零依赖（不加 node_modules 里的包）
 * - 时间一律 number（Unix 毫秒 UTC），禁止存 ISO 字符串
 * - 枚举用字符串字面量联合类型，禁止 TS enum
 */

// ─────────────────────────────────────────────────────────────
// 会话
// ─────────────────────────────────────────────────────────────

export type SessionKind = 'FOCUS' | 'LOCK';

export type SessionStatus =
  | 'SCHEDULED'
  | 'RUNNING'
  | 'PAUSED'
  | 'AWAITING_SETTLEMENT'
  | 'SETTLED'
  | 'ABANDONED';

export type ViolationSource =
  | 'VISIBILITY'
  | 'BLUR'
  | 'FULLSCREEN_EXIT'
  | 'NATIVE'
  | 'MANUAL';

export interface Violation {
  /** 墙钟时间戳，用于展示 */
  startedAt: number;
  endedAt?: number;
  durationMs: number;
  source: ViolationSource;
  /** 原生模式下为被拦截的进程名 */
  detail?: string;
}

export type ExitKind =
  | 'NONE'
  | 'QUOTA_DAILY'
  | 'QUOTA_MONTHLY'
  | 'SKIP'
  | 'BREACH'
  | 'NATURAL';

export type SkipReason = 'MEETING' | 'CLASS' | 'ILLNESS' | 'URGENT' | 'OTHER';

/** 会话的「事实」——只有这些会被持久化，剩余时间永远由它们推导 */
export interface SessionFacts {
  kind: SessionKind;
  plannedMs: number;
  /** performance.timeOrigin + performance.now()，单调时钟基准 */
  startedAtMonotonic: number;
  /** 与 startedAtMonotonic 对应的墙钟近似值，仅用于展示与偏差检测 */
  startedAtWall: number;
  pausedIntervals: ReadonlyArray<PauseInterval>;
  violations: ReadonlyArray<Violation>;
  /** 会话结束的墙钟时间（结算时写入） */
  endedAt?: number;
}

export interface PauseInterval {
  /** 单调时钟 */
  from: number;
  /** 未闭合时表示此刻仍在暂停 */
  to?: number;
}

// ─────────────────────────────────────────────────────────────
// 配额
// ─────────────────────────────────────────────────────────────

export type QuotaScope = 'FOCUS_DAILY' | 'FOCUS_MONTHLY' | 'LOCK_MONTHLY';

export type QuotaEntryKind = 'GRANT' | 'CONSUME' | 'REFUND';

export interface QuotaEntry {
  scope: QuotaScope;
  kind: QuotaEntryKind;
  periodKey: string;
  /**
   * 该条目的次数。语义随 kind 变化：
   * - GRANT：本周期**一次性发放的总次数**（专注月度为 5，每日为 1）
   * - CONSUME / REFUND：本次操作的次数（通常为 1）
   * 省略时按 1 计。
   */
  amount?: number;
}

export interface QuotaRemaining {
  /** 今日剩余额度（仅 FOCUS_DAILY 有意义） */
  daily: number;
  /** 本月剩余额度 */
  monthly: number;
}

// ─────────────────────────────────────────────────────────────
// 经济
// ─────────────────────────────────────────────────────────────

export type CoinEntryKind =
  | 'TASK_DONE'
  | 'FOCUS_DONE'
  | 'LOCK_DONE'
  | 'STREAK_BONUS'
  | 'PUNCTUAL_BONUS'
  | 'FITNESS'
  | 'DIET'
  | 'FINANCE'
  | 'MILESTONE'
  | 'PENALTY'
  | 'PURCHASE'
  | 'REFUND'
  | 'DEMO';

export interface RewardBreakdown {
  base: number;
  durationFactor: number;
  qualityFactor: number;
  punctual: number;
  penalty: number;
  /** 是否被每日产出上限截断 */
  capped: boolean;
}

export interface RewardResult {
  total: number;
  breakdown: RewardBreakdown;
}

export interface FocusRewardInput {
  plannedMs: number;
  effectiveMs: number;
  violationMs: number;
  isPunctual: boolean;
  linkedToTask: boolean;
  exitKind: ExitKind;
  /** 当日已产出金币，用于日上限 */
  dailyEarnedCoin: number;
}

export interface LockRewardInput {
  /** 实际完成的有效时长 */
  effectiveMs: number;
  exitKind: ExitKind;
  /** 当日已产出金币 */
  dailyEarnedCoin: number;
  /** 本日此前已完成的锁机段数，用于连续加成 */
  priorLockSessionsToday: number;
}

// ─────────────────────────────────────────────────────────────
// 宠物
// ─────────────────────────────────────────────────────────────

export type PetMood = 'HAPPY' | 'CALM' | 'WILTING';

export type PetAnimation =
  | 'IDLE'
  | 'BLINK'
  | 'LOOK_AROUND'
  | 'YAWN'
  | 'TAIL_WAG'
  | 'PET_REACTION'
  | 'CHEER'
  | 'EAT'
  | 'WILT'
  | 'DRESS_CHANGE';

export type EquipSlot = 'HEAD' | 'BODY' | 'FACE' | 'HAND' | 'BACKGROUND';

export interface PetVitals {
  mood: number;
  satiety: number;
  energy: number;
  /** 蔫状态结束的墙钟时间；未蔫时不存在 */
  wiltingUntil?: number;
}

export interface PetDecayInput {
  vitals: PetVitals;
  /** 上次结算的墙钟时间 */
  lastTickAt: number;
  /** 当前墙钟时间 */
  now: number;
}

// ─────────────────────────────────────────────────────────────
// 营养
// ─────────────────────────────────────────────────────────────

export interface Nutrients {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number;
  sodiumMg?: number;
}

export type NutritionSource = 'LOCAL_DB' | 'AI_ESTIMATE' | 'MANUAL';

export type PortionUnit = 'SERVING' | 'GRAM' | 'ML';

export interface Portion {
  value: number;
  unit: PortionUnit;
}

export interface FoodRecord {
  id: string;
  name: string;
  aliases: ReadonlyArray<string>;
  /** 营养值对应的基准份量 */
  per: Portion;
  nutrients: Nutrients;
  source: string;
  tags: ReadonlyArray<string>;
}

export type NutritionMatchKind = 'EXACT' | 'ALIAS' | 'APPROXIMATE' | 'COMPOSITE' | 'MISS';

export interface NutritionLookupResult {
  kind: NutritionMatchKind;
  /** MISS 时为 undefined */
  nutrients?: Nutrients;
  /** 命中的食物（MISS 时不存在） */
  matchedName?: string;
  /** 参与累加的各组分，便于 UI 展示 */
  parts: ReadonlyArray<{ name: string; nutrients: Nutrients }>;
}

export interface NutritionLookupOptions {
  /** 别名 → 食物 id 的索引，由 buildFoodIndex 生成 */
  aliasIndex: ReadonlyMap<string, string>;
  byId: ReadonlyMap<string, FoodRecord>;
  /** 是否启用「米饭+鸡腿」这类成分拆分 */
  allowComposite: boolean;
}

// ─────────────────────────────────────────────────────────────
// 统计
// ─────────────────────────────────────────────────────────────

export interface DailyStat {
  dayKey: string;
  focusMs: number;
  lockMs: number;
  tasksPlanned: number;
  tasksDone: number;
  coinEarned: number;
  coinSpent: number;
  quotaConsumed: number;
  violationMs: number;
}

/** 统计聚合的输入：只依赖必要的字段，便于测试与复用 */
export interface SessionStatInput {
  kind: SessionKind;
  status: SessionStatus;
  dayKey: string;
  effectiveMs: number;
  violationMs: number;
}

export interface TaskStatInput {
  dayKey: string;
  status: TaskStatus;
  completedAt?: number;
}

export interface CoinStatInput {
  dayKey: string;
  amount: number;
  kind: CoinEntryKind;
}

export interface QuotaStatInput {
  scope: QuotaScope;
  kind: QuotaEntryKind;
  periodKey: string;
}

export interface StatRange {
  dayKeys: ReadonlyArray<string>;
}

// ─────────────────────────────────────────────────────────────
// 待办
// ─────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'DONE'
  | 'DEFERRED'
  | 'SKIPPED'
  | 'MISSED';

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

// ─────────────────────────────────────────────────────────────
// 专项模块（健身 / 饮食 / 记账）
// ─────────────────────────────────────────────────────────────

/** 餐次 [PRD AC-5.2.3] */
export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

/** 收支类型 [PRD AC-5.3.1] */
export type FinanceType = 'EXPENSE' | 'INCOME';

/** 健身记录单位 [PRD AC-5.1.3] */
export type FitnessUnit = 'REPS' | 'SETS' | 'MINUTES' | 'KM';

/** 自定义模块类型 [PRD AC-5.0.4] */
export type CustomModuleType = 'COUNTER' | 'CHECKIN' | 'LIST' | 'METRIC';

// ─────────────────────────────────────────────────────────────
// 商城
// ─────────────────────────────────────────────────────────────

export type ShopCategory = 'FOOD' | 'OUTFIT' | 'FURNITURE' | 'ITEM';

/** 商品与当前模型的适配性 [PRD AC-6.3.5] */
export type ModelCompat = 'FULL' | 'PARTIAL' | 'NONE';

export type ItemRarity = 'COMMON' | 'RARE' | 'EPIC';

/**
 * 记账模块的领域逻辑：分类、汇总、预算、拆分。纯函数，零依赖。
 *
 * ⚠️ 金额一律用**整数分**（AGENTS.md 3.1）：
 * 浮点金额做累加会出现 0.1 + 0.2 = 0.30000000000000004，
 * 记账场景下这类误差会一路累积到月度汇总。因此：
 * - 存储与计算全用 `amountCents: number`（整数）
 * - 只在**展示时**除以 100，并用 `formatMoney` 统一格式化
 */
import { MONEY } from '../config/index.ts';
import type { FinanceType } from '../types.ts';

/** 内置分类（用户可增删；`isBuiltin` 标记来自此表） */
export interface BuiltinCategory {
  id: string;
  name: string;
  icon: string;
  type: FinanceType;
  order: number;
}

/**
 * 支出分类。顺序按日常使用频率排，让最常用的在最前面。
 * 刻意**不做"其他"之外的模糊分类**——分类太细会导致用户放弃记账。
 */
export const EXPENSE_CATEGORIES: ReadonlyArray<BuiltinCategory> = [
  { id: 'cat-food', name: '餐饮', icon: '🍜', type: 'EXPENSE', order: 1 },
  { id: 'cat-transport', name: '交通', icon: '🚌', type: 'EXPENSE', order: 2 },
  { id: 'cat-grocery', name: '日用', icon: '🧺', type: 'EXPENSE', order: 3 },
  { id: 'cat-housing', name: '房租', icon: '🏠', type: 'EXPENSE', order: 4 },
  { id: 'cat-utility', name: '水电', icon: '💡', type: 'EXPENSE', order: 5 },
  { id: 'cat-communication', name: '通讯', icon: '📱', type: 'EXPENSE', order: 6 },
  { id: 'cat-entertainment', name: '娱乐', icon: '🎮', type: 'EXPENSE', order: 7 },
  { id: 'cat-shopping', name: '购物', icon: '🛍️', type: 'EXPENSE', order: 8 },
  { id: 'cat-medical', name: '医疗', icon: '💊', type: 'EXPENSE', order: 9 },
  { id: 'cat-education', name: '学习', icon: '📚', type: 'EXPENSE', order: 10 },
  { id: 'cat-social', name: '人情', icon: '🎁', type: 'EXPENSE', order: 11 },
  { id: 'cat-fitness', name: '运动', icon: '🏃', type: 'EXPENSE', order: 12 },
  { id: 'cat-other-expense', name: '其他', icon: '📦', type: 'EXPENSE', order: 99 },
];

/** 收入分类 */
export const INCOME_CATEGORIES: ReadonlyArray<BuiltinCategory> = [
  { id: 'cat-salary', name: '工资', icon: '💰', type: 'INCOME', order: 1 },
  { id: 'cat-bonus', name: '奖金', icon: '🎊', type: 'INCOME', order: 2 },
  { id: 'cat-parttime', name: '兼职', icon: '⏰', type: 'INCOME', order: 3 },
  { id: 'cat-investment', name: '理财', icon: '📈', type: 'INCOME', order: 4 },
  { id: 'cat-refund', name: '退款', icon: '↩️', type: 'INCOME', order: 5 },
  { id: 'cat-gift-money', name: '红包', icon: '🧧', type: 'INCOME', order: 6 },
  { id: 'cat-other-income', name: '其他', icon: '📦', type: 'INCOME', order: 99 },
];

export const ALL_BUILTIN_CATEGORIES: ReadonlyArray<BuiltinCategory> = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
];

export function builtinCategoriesOf(type: FinanceType): ReadonlyArray<BuiltinCategory> {
  return type === 'EXPENSE' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}

/** 记账记录的最小形状 */
export interface FinanceEntryLike {
  dayKey: string;
  type: FinanceType;
  amountCents: number;
  categoryId: string;
}

/**
 * 汇总结果。
 * 注意 `netCents` 可能为负（花得比赚得多），这是**事实**，UI 不应该评判它。
 */
export interface FinanceSummary {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  entryCount: number;
  /** 按分类的支出（降序） */
  expenseByCategory: ReadonlyArray<{ categoryId: string; amountCents: number; count: number }>;
  incomeByCategory: ReadonlyArray<{ categoryId: string; amountCents: number; count: number }>;
}

export function summarizeFinance(
  entries: ReadonlyArray<FinanceEntryLike>,
  dayKeys?: ReadonlyArray<string>,
): FinanceSummary {
  const wanted = dayKeys === undefined ? undefined : new Set(dayKeys);

  let incomeCents = 0;
  let expenseCents = 0;
  let entryCount = 0;
  const expenseMap = new Map<string, { amountCents: number; count: number }>();
  const incomeMap = new Map<string, { amountCents: number; count: number }>();

  for (const entry of entries) {
    if (wanted !== undefined && !wanted.has(entry.dayKey)) continue;
    // 金额应是整数分；出现非整数时按四舍五入归一到分，避免脏数据污染汇总
    const amount = Math.round(entry.amountCents);
    entryCount += 1;

    if (entry.type === 'EXPENSE') {
      expenseCents += amount;
      const current = expenseMap.get(entry.categoryId) ?? { amountCents: 0, count: 0 };
      expenseMap.set(entry.categoryId, { amountCents: current.amountCents + amount, count: current.count + 1 });
    } else {
      incomeCents += amount;
      const current = incomeMap.get(entry.categoryId) ?? { amountCents: 0, count: 0 };
      incomeMap.set(entry.categoryId, { amountCents: current.amountCents + amount, count: current.count + 1 });
    }
  }

  const toSorted = (
    map: Map<string, { amountCents: number; count: number }>,
  ): Array<{ categoryId: string; amountCents: number; count: number }> =>
    [...map.entries()]
      .map(([categoryId, v]) => ({ categoryId, amountCents: v.amountCents, count: v.count }))
      .sort((a, b) => b.amountCents - a.amountCents);

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    entryCount,
    expenseByCategory: toSorted(expenseMap),
    incomeByCategory: toSorted(incomeMap),
  };
}

/** 按日汇总（用于趋势图） */
export interface DailyFinance {
  dayKey: string;
  incomeCents: number;
  expenseCents: number;
}

export function summarizeByDay(
  entries: ReadonlyArray<FinanceEntryLike>,
  dayKeys: ReadonlyArray<string>,
): DailyFinance[] {
  const byDay = new Map<string, DailyFinance>();
  for (const dayKey of dayKeys) byDay.set(dayKey, { dayKey, incomeCents: 0, expenseCents: 0 });

  for (const entry of entries) {
    const row = byDay.get(entry.dayKey);
    if (!row) continue;
    const amount = Math.round(entry.amountCents);
    if (entry.type === 'EXPENSE') row.expenseCents += amount;
    else row.incomeCents += amount;
  }

  return dayKeys.map((k) => byDay.get(k) ?? { dayKey: k, incomeCents: 0, expenseCents: 0 });
}

// ─────────────────────────────────────────────────────────────
// 预算
// ─────────────────────────────────────────────────────────────

export type BudgetLevel = 'NONE' | 'SAFE' | 'WATCH' | 'NEAR' | 'OVER';

export interface BudgetStatus {
  level: BudgetLevel;
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  /** 已用比例（可能 > 1） */
  usedRatio: number;
}

/** 预算档位的阈值（比例） */
const WATCH_RATIO = 0.7;
const NEAR_RATIO = 0.9;

/**
 * 预算状态。
 *
 * ⚠️ 文案原则（AGENTS.md 原则 2：惩罚不羞辱）：
 * 本函数只返回**等级与数字**，不返回任何评语。
 * UI 展示时必须只说事实（"已用 82%"），禁止"你花太多了"这类表达。
 */
export function budgetStatus(
  limitCents: number,
  spentCents: number,
): BudgetStatus {
  if (limitCents <= 0) {
    return {
      level: 'NONE',
      limitCents: 0,
      spentCents,
      remainingCents: 0,
      usedRatio: 0,
    };
  }

  const usedRatio = spentCents / limitCents;
  let level: BudgetLevel;
  if (usedRatio > 1) level = 'OVER';
  else if (usedRatio >= NEAR_RATIO) level = 'NEAR';
  else if (usedRatio >= WATCH_RATIO) level = 'WATCH';
  else level = 'SAFE';

  return {
    level,
    limitCents,
    spentCents,
    remainingCents: limitCents - spentCents,
    usedRatio,
  };
}

/** 按剩余天数算出的"每天还能花多少"（PRD AC-9.3.x） */
export function dailyAllowance(remainingCents: number, remainingDays: number): number {
  if (remainingDays <= 0) return 0;
  // 向下取整到分，不虚报可用额度
  return Math.max(0, Math.floor(remainingCents / remainingDays));
}

// ─────────────────────────────────────────────────────────────
// 展示格式
// ─────────────────────────────────────────────────────────────

/**
 * 分 → 展示字符串。
 * 用整数除法与取模，**不做浮点除法**，避免 1234.9999 这类结果。
 */
export function formatMoney(cents: number): string {
  const rounded = Math.round(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const yuan = Math.floor(abs / MONEY.centsPerYuan);
  const fen = abs % MONEY.centsPerYuan;
  const base = fen === 0 ? String(yuan) : `${yuan}.${String(fen).padStart(2, '0')}`;
  return negative ? `-${base}` : base;
}

/** 带符号的展示（用于收入/支出行） */
export function formatSignedMoney(cents: number, type: FinanceType): string {
  const sign = type === 'EXPENSE' ? '−' : '+';
  return `${sign}${formatMoney(cents)}`;
}

/**
 * 解析用户输入的金额为整数分。
 *
 * 为什么不用 `Math.round(parseFloat(x) * 100)`：
 * `parseFloat('1.005') * 100 = 100.49999999999999`，四舍五入会得到 100 分（应为 101 分）。
 * 这里直接对**字符串**做小数点切分，避免浮点介入。
 * 返回 undefined 表示输入非法（由调用方给出提示，而不是默默记成 0）。
 */
export function parseAmountToCents(input: string): number | undefined {
  const text = input.trim().replace(/[¥￥,，\s]/g, '');
  if (text.length === 0) return undefined;

  if (!/^\d+(\.\d{0,2})?$/.test(text)) return undefined;

  const [yuanPart, fenPart = ''] = text.split('.');
  const yuan = Number(yuanPart);
  if (!Number.isFinite(yuan)) return undefined;

  // 补足两位：'1.5' → 150 分；'1' → 100 分
  const fen = Number(fenPart.padEnd(2, '0'));
  return yuan * MONEY.centsPerYuan + fen;
}

/**
 * 拆分账单（AA 制 / 分账）。
 * 余数分给前几个人，保证**各份之和恰好等于总额**（不能凭空多出或少掉 1 分）。
 */
export function splitBill(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const total = Math.round(totalCents);
  const base = Math.floor(Math.abs(total) / parts);
  const remainder = Math.abs(total) - base * parts;
  const sign = total < 0 ? -1 : 1;

  return Array.from({ length: parts }, (_, index) => {
    // 前 remainder 个人各多 1 分
    const extra = index < remainder ? 1 : 0;
    return sign * (base + extra);
  });
}

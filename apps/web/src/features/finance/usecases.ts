/**
 * 记账用例层：记账、月度汇总、预算、发放金币。
 *
 * 职责边界（AGENTS.md 第 2 节）：金额与预算的算法在 `@petfocus/shared` 的 domain（已单测），
 * 本文件只做「取数 + 落盘 + 发放」。
 *
 * ⚠️ 隐私提示（AGENTS.md 第 6 节）：记账金额属于隐私数据。
 * 数据只写本机 IndexedDB；导出文件是明文 JSON，UI 必须提示用户妥善保管。
 */
import {
  MODULE_COIN,
  builtinCategoriesOf,
  budgetStatus,
  dayKeyOf,
  dayKeysBetween,
  formatMoney,
  parseAmountToCents,
  periodKeyOf,
  summarizeByDay,
  summarizeFinance,
  type BudgetStatus,
  type DailyFinance,
  type FinanceEntryLike,
  type FinanceSummary,
  type FinanceType,
} from '@petfocus/shared';
import type { FinanceCategoryRecord, FinanceEntryRecord } from '@petfocus/shared';
import { getRuntime, tryGetRuntime } from '../../app/runtime.ts';

export function isFinanceStoreReady(): boolean {
  return tryGetRuntime() !== undefined;
}

function requireRuntime(): ReturnType<typeof getRuntime> {
  const runtime = tryGetRuntime();
  if (!runtime) {
    const error = new Error('运行时尚未就绪');
    error.name = 'RUNTIME_NOT_READY';
    throw error;
  }
  return runtime;
}

/**
 * 确保内置分类已写入。
 *
 * 为什么需要：用户第一次记账时分类表是空的，界面会没有可选项。
 * 这里在读取分类时顺手补齐缺失的内置分类（幂等，已存在的不覆盖）。
 */
export async function ensureCategories(): Promise<FinanceCategoryRecord[]> {
  const { repositories } = requireRuntime();
  const existing = await repositories.finance.categories();
  const existingIds = new Set(existing.map((c) => c.id));

  const missing = [...builtinCategoriesOf('EXPENSE'), ...builtinCategoriesOf('INCOME')].filter(
    (c) => !existingIds.has(c.id),
  );

  for (const cat of missing) {
    await repositories.finance.putCategory({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      type: cat.type,
      isBuiltin: true,
      order: cat.order,
    });
  }

  if (missing.length === 0) return [...existing].sort((a, b) => a.order - b.order);
  const merged = await repositories.finance.categories();
  return [...merged].sort((a, b) => a.order - b.order);
}

export interface AddEntryResult {
  ok: boolean;
  message: string;
  coinEarned: number;
  entry?: FinanceEntryRecord;
}

/** 发一笔金币（与健身模块同一模式） */
async function awardFinanceCoin(entryId: string, now: number): Promise<number> {
  const { repositories } = requireRuntime();
  const dayKey = dayKeyOf(now);
  const todayEntries = await repositories.finance.byDay(dayKey);
  // 已发放的条数 = 今天已有的记录数（本条已写入，因此减 1）
  const alreadyAwarded = Math.max(0, todayEntries.length - 1);
  if (alreadyAwarded >= MODULE_COIN.financeDailyMax) return 0;

  const before = await repositories.coinLedger.balance();
  const after = before + MODULE_COIN.financePerEntry;
  await repositories.coinLedger.put({
    id: `finance-${entryId}`,
    kind: 'FINANCE',
    amount: MODULE_COIN.financePerEntry,
    balanceAfter: after,
    refId: entryId,
    dayKey,
    serverTime: 0,
    confirmed: false,
    note: '记一笔账',
  });
  return MODULE_COIN.financePerEntry;
}

/**
 * 添加一笔账。
 * 金额走 `parseAmountToCents` 解析——**非法输入直接拒绝**，
 * 而不是默默记成 0（那会让用户以为记上了）。
 */
export async function addEntry(
  input: { amountText: string; type: FinanceType; categoryId: string; note?: string },
  now: number,
): Promise<AddEntryResult> {
  const { repositories } = requireRuntime();

  const cents = parseAmountToCents(input.amountText);
  if (cents === undefined) {
    return { ok: false, message: '金额填得不太对，试试「12.5」这样的写法。', coinEarned: 0 };
  }
  if (cents <= 0) {
    return { ok: false, message: '金额要大于 0。', coinEarned: 0 };
  }
  if (input.categoryId.length === 0) {
    return { ok: false, message: '请选一个分类。', coinEarned: 0 };
  }

  const id = `fin-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: FinanceEntryRecord = {
    id,
    dayKey: dayKeyOf(now),
    type: input.type,
    amountCents: cents,
    categoryId: input.categoryId,
    ...(input.note === undefined || input.note.trim().length === 0 ? {} : { note: input.note.trim() }),
    occurredAt: now,
  };
  await repositories.finance.put(entry);

  const coin = await awardFinanceCoin(id, now);
  const label = input.type === 'EXPENSE' ? '支出' : '收入';
  return {
    ok: true,
    message:
      coin > 0
        ? `记下了${label} ${formatMoney(cents)}，+${coin} 金币。`
        : `记下了${label} ${formatMoney(cents)}。今天的记账金币已拿满（上限 ${MODULE_COIN.financeDailyMax} 笔）。`,
    coinEarned: coin,
    entry,
  };
}

export async function removeEntry(id: string): Promise<void> {
  const { repositories } = requireRuntime();
  await repositories.finance.delete(id);
}

export interface DayFinance {
  dayKey: string;
  entries: FinanceEntryRecord[];
  summary: FinanceSummary;
}

export async function loadDay(now: number): Promise<DayFinance> {
  const { repositories } = requireRuntime();
  const dayKey = dayKeyOf(now);
  const entries = await repositories.finance.byDay(dayKey);
  return {
    dayKey,
    entries: entries.sort((a, b) => b.occurredAt - a.occurredAt),
    summary: summarizeFinance(entries),
  };
}

export interface MonthFinance {
  monthKey: string;
  summary: FinanceSummary;
  daily: DailyFinance[];
  budget: BudgetStatus;
  /** 本月剩余天数（用于"每天还能花多少"） */
  remainingDays: number;
  dailyAllowanceCents: number;
  categoryNames: Record<string, { name: string; icon: string }>;
}

/** 读本月汇总 + 预算状态 */
export async function loadMonth(now: number): Promise<MonthFinance> {
  const { repositories } = requireRuntime();
  const monthKey = periodKeyOf(now, 'FOCUS_MONTHLY');
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const monthEnd = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 0, 23, 59, 59).getTime();

  const entries = await repositories.finance.all();
  const dayKeys = dayKeysBetween(monthStart, monthEnd);
  const wanted = new Set(dayKeys);

  const inMonth = entries.filter((e) => wanted.has(e.dayKey));
  const summary = summarizeFinance(inMonth);
  const daily = summarizeByDay(entries, dayKeys);

  const [budgets, categories] = await Promise.all([
    repositories.finance.budgets(),
    ensureCategories(),
  ]);
  const budget = budgets.find((b) => b.monthKey === monthKey);

  const today = new Date(now).getDate();
  const daysInMonth = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 0).getDate();
  const remainingDays = Math.max(0, daysInMonth - today + 1);

  const status = budgetStatus(budget?.totalLimitCents ?? 0, summary.expenseCents);
  const categoryNames: Record<string, { name: string; icon: string }> = {};
  for (const cat of categories) categoryNames[cat.id] = { name: cat.name, icon: cat.icon };

  return {
    monthKey,
    summary,
    daily,
    budget: status,
    remainingDays,
    dailyAllowanceCents: Math.max(0, Math.floor(status.remainingCents / Math.max(1, remainingDays))),
    categoryNames,
  };
}

/** 设置本月总预算（传 0 表示取消预算） */
export async function setMonthBudget(monthKey: string, limitYuanText: string): Promise<boolean> {
  const { repositories } = requireRuntime();
  const cents = limitYuanText.trim().length === 0 ? 0 : parseAmountToCents(limitYuanText);
  if (cents === undefined) return false;

  await repositories.finance.putBudget({
    id: `budget-${monthKey}`,
    monthKey,
    totalLimitCents: cents,
    categoryLimits: {},
  });
  return true;
}

/** 近 N 天的收支（趋势图） */
export async function loadTrend(now: number, days: number): Promise<DailyFinance[]> {
  const { repositories } = requireRuntime();
  const dayKeys = dayKeysBetween(now - (days - 1) * 86_400_000, now);
  const entries = (await repositories.finance.all()) as FinanceEntryLike[];
  return summarizeByDay(entries, dayKeys);
}

/**
 * 隐私提示：记账数据是隐私，导出文件是明文。
 * 这句话必须在页面上出现，不能只写在文档里。
 */
export const FINANCE_PRIVACY_NOTICE =
  '记账数据只存在这台设备上，不会上传。导出的备份文件是明文 JSON，请自行妥善保管。';

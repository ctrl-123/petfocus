/**
 * 配额系统：退出机会的发放、消耗、退还与剩余计算。纯函数，零依赖。
 *
 * 规则（PRD AC-1.4.5 / AC-1.4.6 / AC-3.2.4）：
 * - 专注：每日 1 次 + 每月累计上限 5 次，**优先扣每日额度，用尽后从月度池扣**
 * - 锁机：仅每月 5 次，与专注配额**完全独立、互不占用**
 * - 配额用尽后仍允许退出，但要走越界（BREACH）流程并受罚
 *
 * 时区与边界：periodKey 由 calendar.periodKeyOf 生成（本地 04:00 自然日 / 自然月）。
 */

import { QUOTA } from '../config/index.ts';
import type { QuotaEntry, QuotaEntryKind, QuotaRemaining, QuotaScope } from '../types.ts';

export type QuotaPool = 'DAILY' | 'MONTHLY' | 'NONE';

export interface QuotaConsumeRequest {
  /** 会话类型：决定可用哪些池 */
  kind: 'FOCUS' | 'LOCK';
  /** 当前时刻对应的周期键集合 */
  periodKeys: {
    /** 当日 dayKey，如 '2026-02-14' */
    daily: string;
    /** 当月 monthKey，如 '2026-02' */
    monthly: string;
  };
  /** 是否允许越界（配额用尽时）。true 则返回 BREACH 决策而不抛错 */
  allowBreach: boolean;
}

export interface QuotaConsumeDecision {
  outcome: 'CONSUMED' | 'BREACH';
  /** 消耗来自哪个池（BREACH 时为 NONE） */
  pool: QuotaPool;
  /** 应当写入账本的新条目（BREACH 时为空数组，因为不扣配额） */
  entries: QuotaEntry[];
  /** 消耗后可用的剩余额度（用于 UI 展示） */
  remaining: QuotaRemaining;
}

/** 该 scope 在当前周期的发放上限 */
export function grantAmountFor(scope: QuotaScope): number {
  switch (scope) {
    case 'FOCUS_DAILY':
      return QUOTA.focusDaily;
    case 'FOCUS_MONTHLY':
      return QUOTA.focusMonthly;
    case 'LOCK_MONTHLY':
      return QUOTA.lockMonthly;
  }
}

/**
 * 某个 scope + 周期键 的净剩余额度；不会小于 0，也不会超过该 scope 的上限。
 *
 * 账本语义：GRANT 表示「本周期一次性发放的总额度」（专注月度 = 5），
 * 因此要用 amount 累加，而不是把每条 GRANT 当作 1 次。
 */
export function remainingFor(
  ledger: ReadonlyArray<QuotaEntry>,
  scope: QuotaScope,
  periodKey: string,
): number {
  let granted = 0;
  let consumed = 0;
  let refunded = 0;
  for (const e of ledger) {
    if (e.scope !== scope || e.periodKey !== periodKey) continue;
    const amount = e.amount ?? 1;
    if (e.kind === 'GRANT') granted += amount;
    else if (e.kind === 'CONSUME') consumed += amount;
    else refunded += amount;
  }
  const cap = grantAmountFor(scope);
  return Math.max(0, Math.min(cap, granted) - consumed + refunded);
}

/**
 * 计算会话在此刻的配额剩余。
 * 专注返回「今日剩余 + 本月剩余」，锁机只返回月度（daily 恒为 0）。
 */
export function computeRemaining(
  ledger: ReadonlyArray<QuotaEntry>,
  kind: 'FOCUS' | 'LOCK',
  periodKeys: { daily: string; monthly: string },
): QuotaRemaining {
  if (kind === 'LOCK') {
    return { daily: 0, monthly: remainingFor(ledger, 'LOCK_MONTHLY', periodKeys.monthly) };
  }
  return {
    daily: remainingFor(ledger, 'FOCUS_DAILY', periodKeys.daily),
    monthly: remainingFor(ledger, 'FOCUS_MONTHLY', periodKeys.monthly),
  };
}

/**
 * 消耗配额。**不修改传入账本**，而是返回应追加的条目（便于与本地库/服务端结算对齐）。
 *
 * 决策顺序（专注）：
 *   1. 每日池有余额 → 扣每日
 *   2. 否则月度池有余额 → 扣月度
 *   3. 都没有 → allowBreach ? BREACH : 抛错（调用方应默认传 true 并走惩罚流程）
 */
export function consumeQuota(
  ledger: ReadonlyArray<QuotaEntry>,
  request: QuotaConsumeRequest,
): QuotaConsumeDecision {
  const { kind, periodKeys, allowBreach } = request;

  if (kind === 'FOCUS') {
    const dailyLeft = remainingFor(ledger, 'FOCUS_DAILY', periodKeys.daily);
    if (dailyLeft > 0) {
      const entry: QuotaEntry = { scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: periodKeys.daily };
      const next = [...ledger, entry];
      return {
        outcome: 'CONSUMED',
        pool: 'DAILY',
        entries: [entry],
        remaining: computeRemaining(next, kind, periodKeys),
      };
    }
    const monthlyLeft = remainingFor(ledger, 'FOCUS_MONTHLY', periodKeys.monthly);
    if (monthlyLeft > 0) {
      const entry: QuotaEntry = { scope: 'FOCUS_MONTHLY', kind: 'CONSUME', periodKey: periodKeys.monthly };
      const next = [...ledger, entry];
      return {
        outcome: 'CONSUMED',
        pool: 'MONTHLY',
        entries: [entry],
        remaining: computeRemaining(next, kind, periodKeys),
      };
    }
    if (!allowBreach) {
      throw new Error('专注配额已用尽，且未允许越界');
    }
    return {
      outcome: 'BREACH',
      pool: 'NONE',
      entries: [],
      remaining: computeRemaining(ledger, kind, periodKeys),
    };
  }

  // 锁机：只有月度池
  const lockLeft = remainingFor(ledger, 'LOCK_MONTHLY', periodKeys.monthly);
  if (lockLeft > 0) {
    const entry: QuotaEntry = { scope: 'LOCK_MONTHLY', kind: 'CONSUME', periodKey: periodKeys.monthly };
    const next = [...ledger, entry];
    return {
      outcome: 'CONSUMED',
      pool: 'MONTHLY',
      entries: [entry],
      remaining: computeRemaining(next, kind, periodKeys),
    };
  }
  if (!allowBreach) {
    throw new Error('锁机配额已用尽，且未允许越界');
  }
  return {
    outcome: 'BREACH',
    pool: 'NONE',
    entries: [],
    remaining: computeRemaining(ledger, kind, periodKeys),
  };
}

/** 生成「补发」条目：一条 GRANT 即代表发放该 scope 在本周期的全部额度 */
export function grantEntries(
  scopes: ReadonlyArray<QuotaScope>,
  periodKeys: { daily: string; monthly: string },
): QuotaEntry[] {
  return scopes.map((scope) => ({
    scope,
    kind: 'GRANT' as QuotaEntryKind,
    periodKey: scope === 'FOCUS_DAILY' ? periodKeys.daily : periodKeys.monthly,
    amount: grantAmountFor(scope),
  }));
}

/** 退还（用于误操作/服务端纠错）；只在该 scope 有已消耗记录时才有意义 */
export function refundEntry(scope: QuotaScope, periodKeys: { daily: string; monthly: string }): QuotaEntry {
  return {
    scope,
    kind: 'REFUND',
    periodKey: scope === 'FOCUS_DAILY' ? periodKeys.daily : periodKeys.monthly,
  };
}

// ─────────────────────────────────────────────────────────────
// 「本次跳过」[PRD AC-1.4.6]
// ─────────────────────────────────────────────────────────────

/**
 * 今日还能用几次「本次跳过」。
 * 跳过不消耗月配额，但每日上限 2 次，并扣固定金币。
 */
export function skipRemainingToday(
  skipEntries: ReadonlyArray<QuotaEntry>,
  dayKey: string,
): number {
  const used = skipEntries.filter((e) => e.scope === 'FOCUS_DAILY' && e.kind === 'CONSUME' && e.periodKey === dayKey).length;
  return Math.max(0, QUOTA.skipDaily - used);
}

export interface SkipDecision {
  allowed: boolean;
  /** 需要扣的金币（未允许时为 0） */
  coinCost: number;
  remainingToday: number;
}

export function requestSkip(
  skipEntries: ReadonlyArray<QuotaEntry>,
  dayKey: string,
  coinCost: number,
): SkipDecision {
  const left = skipRemainingToday(skipEntries, dayKey);
  if (left <= 0) {
    return { allowed: false, coinCost: 0, remainingToday: 0 };
  }
  return { allowed: true, coinCost, remainingToday: left - 1 };
}

/** 越界后宠物「蔫」的结束时刻 */
export function wiltingUntilOf(now: number, wiltingMs: number): number {
  return now + wiltingMs;
}

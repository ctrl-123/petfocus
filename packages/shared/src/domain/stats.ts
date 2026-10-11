/**
 * 统计聚合：把会话/待办/金币/配额账本聚合成每日统计。纯函数，零依赖。
 *
 * ⚠️ 口径唯一性（PRD AC-4.2 / 技术设计 5.7）：所有页面的同一个指标必须走本文件的同一个函数，
 * 否则「首页显示专注 2 小时、统计页显示 1 小时 47 分」这类问题一定会出现。
 *
 * 口径定义：
 * - 专注时长 = status 为 SETTLED 的 FOCUS 会话的 effectiveMs 之和
 * - 锁机时长 同上（kind = LOCK），用 effectiveMs 而非 plannedMs
 * - 完成任务数 = status = DONE 的待办数（按 completedAt/所属 dayKey 归属）
 * - 完成率 = 完成 / (完成 + 未完成 + 已跳过 + 已顺延)
 * - 获得金币 = amount > 0 之和（不含 DEMO 演示数据）；消耗 = amount < 0 的绝对值之和
 * - 违规秒数 = 所有会话违规区间时长之和
 * - 环比 = (本期 − 上期) / 上期；上期为 0 时返回 null（UI 显示「—」而不是 Infinity）
 */

import type {
  CoinStatInput,
  DailyStat,
  QuotaStatInput,
  SessionStatInput,
  StatRange,
  TaskStatInput,
} from '../types.ts';
import { shiftDayKey } from '../calendar.ts';
import { HEAT_LEVEL_THRESHOLDS_MINUTES, HOUR_BUCKETS, TIME_UNITS } from '../config/index.ts';

export interface AggregateInput {
  sessions: ReadonlyArray<SessionStatInput>;
  tasks: ReadonlyArray<TaskStatInput>;
  coins: ReadonlyArray<CoinStatInput>;
  quota: ReadonlyArray<QuotaStatInput>;
}

function emptyStat(dayKey: string): DailyStat {
  return {
    dayKey,
    focusMs: 0,
    lockMs: 0,
    tasksPlanned: 0,
    tasksDone: 0,
    coinEarned: 0,
    coinSpent: 0,
    quotaConsumed: 0,
    violationMs: 0,
  };
}

/** 会话是否计入时长统计：只有正常结算的会话算数（放弃/待结算不计） */
function isSettledSession(s: SessionStatInput): boolean {
  return s.status === 'SETTLED';
}

/**
 * 聚合每个 dayKey 的每日统计。**结果按传入的 dayKeys 顺序返回，缺失日为全 0**。
 */
export function aggregateDaily(input: AggregateInput, range: StatRange): DailyStat[] {
  const byDay = new Map<string, DailyStat>();
  for (const dayKey of range.dayKeys) {
    byDay.set(dayKey, emptyStat(dayKey));
  }

  for (const s of input.sessions) {
    const stat = byDay.get(s.dayKey);
    if (!stat) continue;
    if (isSettledSession(s)) {
      if (s.kind === 'FOCUS') stat.focusMs += Math.max(0, s.effectiveMs);
      else stat.lockMs += Math.max(0, s.effectiveMs);
    }
    stat.violationMs += Math.max(0, s.violationMs);
  }

  for (const t of input.tasks) {
    const stat = byDay.get(t.dayKey);
    if (!stat) continue;
    stat.tasksPlanned += 1;
    if (t.status === 'DONE') stat.tasksDone += 1;
  }

  for (const c of input.coins) {
    const stat = byDay.get(c.dayKey);
    if (!stat) continue;
    if (c.kind === 'DEMO') continue; // 演示数据绝不计入真实统计
    if (c.amount > 0) stat.coinEarned += c.amount;
    else if (c.amount < 0) stat.coinSpent += Math.abs(c.amount);
  }

  for (const q of input.quota) {
    if (q.kind !== 'CONSUME') continue;
    // 只有「日」周期键（YYYY-MM-DD）才可能对应某一天；月度键（YYYY-MM）无法归属到日
    if (!isDayKey(q.periodKey)) continue;
    const stat = byDay.get(q.periodKey);
    if (stat) stat.quotaConsumed += 1;
  }

  return range.dayKeys.map((k) => byDay.get(k) ?? emptyStat(k));
}

/** dayKey 形如 2026-02-14；月度 periodKey 形如 2026-02，必须区分开 */
function isDayKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key);
}

export interface StatsSummary {
  focusMs: number;
  lockMs: number;
  tasksPlanned: number;
  tasksDone: number;
  /** 0–1；无计划任务时为 null */
  completionRate: number | null;
  coinEarned: number;
  coinSpent: number;
  quotaConsumed: number;
  violationMs: number;
  /** 有专注记录的天数（用于「坚持了几天」） */
  activeDays: number;
}

/** 把每日统计汇总成区间总计 */
export function summarize(daily: ReadonlyArray<DailyStat>): StatsSummary {
  let focusMs = 0;
  let lockMs = 0;
  let tasksPlanned = 0;
  let tasksDone = 0;
  let coinEarned = 0;
  let coinSpent = 0;
  let quotaConsumed = 0;
  let violationMs = 0;
  let activeDays = 0;

  for (const d of daily) {
    focusMs += d.focusMs;
    lockMs += d.lockMs;
    tasksPlanned += d.tasksPlanned;
    tasksDone += d.tasksDone;
    coinEarned += d.coinEarned;
    coinSpent += d.coinSpent;
    quotaConsumed += d.quotaConsumed;
    violationMs += d.violationMs;
    if (d.focusMs > 0 || d.lockMs > 0) activeDays += 1;
  }

  return {
    focusMs,
    lockMs,
    tasksPlanned,
    tasksDone,
    completionRate: tasksPlanned === 0 ? null : tasksDone / tasksPlanned,
    coinEarned,
    coinSpent,
    quotaConsumed,
    violationMs,
    activeDays,
  };
}

/** 环比：上期为 0 时返回 null（避免 Infinity 污染 UI） */
export function periodOverPeriod(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/** 专注日历的五档热度（0 = 空格子，4 = 最热） */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * 专注日历分档 [PRD AC-4.2.3]：0 / 1–30 / 31–60 / 61–120 / >120 分钟。
 * **0 档必须视觉上明显**（这是刻意的「痛感设计」，不是排版疏忽）。
 */
export function focusHeatLevel(focusMs: number): HeatLevel {
  // NaN 的所有比较都是 false，若不先拦截会一路落到最后一档
  if (!Number.isFinite(focusMs)) return 0;
  const minutes = focusMs / TIME_UNITS.MS_PER_MINUTE;
  if (minutes <= 0) return 0;
  const [l1, l2, l3] = HEAT_LEVEL_THRESHOLDS_MINUTES;
  if (l1 === undefined || l2 === undefined || l3 === undefined) return 0;
  if (minutes <= l1) return 1;
  if (minutes <= l2) return 2;
  if (minutes <= l3) return 3;
  return 4;
}

/** 时段分布 [PRD AC-4.2.5]：24 小时桶。调用方提供每条会话的起始小时（本地时间 0–23）。 */
export interface HourBucket {
  hour: number;
  focusMs: number;
  lockMs: number;
}

export interface HourDistributionInput {
  kind: 'FOCUS' | 'LOCK';
  /** 会话起始的本地小时（0–23） */
  startHour: number;
  effectiveMs: number;
  status: string;
}

export function aggregateByHour(entries: ReadonlyArray<HourDistributionInput>): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: HOUR_BUCKETS }, (_, hour) => ({ hour, focusMs: 0, lockMs: 0 }));
  const maxHour = HOUR_BUCKETS - 1;
  for (const e of entries) {
    if (e.status !== 'SETTLED') continue;
    const hour = Math.trunc(e.startHour);
    if (hour < 0 || hour > maxHour) continue;
    const bucket = buckets[hour];
    if (!bucket) continue;
    if (e.kind === 'FOCUS') bucket.focusMs += Math.max(0, e.effectiveMs);
    else bucket.lockMs += Math.max(0, e.effectiveMs);
  }
  return buckets;
}

/** 从前一日/前一周期构造对照区间（用于环比） */
export function previousRange(range: StatRange, offsetDays: number): StatRange {
  return { dayKeys: range.dayKeys.map((k) => shiftDayKey(k, -offsetDays)) };
}

/** 格式化时长，供文本等价物使用（图表无障碍要求 NFR-5.4） */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 分钟';
  const totalMinutes = Math.round(ms / TIME_UNITS.MS_PER_MINUTE);
  const h = Math.floor(totalMinutes / TIME_UNITS.MINUTES_PER_HOUR);
  const m = totalMinutes % TIME_UNITS.MINUTES_PER_HOUR;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

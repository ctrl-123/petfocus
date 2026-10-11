/**
 * 统计用例层：从仓储取数并交给领域函数聚合。
 *
 * 职责边界（AGENTS.md 第 2 节）：聚合口径全在 `@petfocus/shared` 的 domain（已单测），
 * 本文件只做「取数 + 转换」，**不写任何统计公式**——否则迟早出现
 * 「首页显示专注 2 小时、统计页显示 1 小时 47 分」。
 *
 * ⚠️ 性能注意：目前是「全表读出后在内存里按区间过滤」（本地库 + 个人数据量下够用），
 * 但没有区间索引查询。数据量增长到数千条后应改为按时间索引区间查询，
 * 届时需要给 Dexie schema 加索引（见 AGENTS.md 第 6 节的迁移要求）。
 */
import {
  aggregateByHour,
  aggregateDaily,
  dayKeyOf,
  dayKeysBetween,
  periodKeyOf,
  previousRange,
  summarize,
  type DailyStat,
  type HourBucket,
  type StatRange,
  type StatsSummary,
} from '@petfocus/shared';
import { getRuntime } from '../../app/runtime.ts';

export interface RangeStats {
  range: StatRange;
  daily: DailyStat[];
  summary: StatsSummary;
}

/** 常用区间预设（PRD FR-4.1：今日 / 本周 / 本月 / 自定义） */
export type RangePreset = 'TODAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH';

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  TODAY: '今日',
  LAST_7: '近 7 天',
  LAST_30: '近 30 天',
  THIS_MONTH: '本月',
};

export const RANGE_PRESET_DAYS: Record<RangePreset, number> = {
  TODAY: 1,
  LAST_7: 7,
  LAST_30: 30,
  THIS_MONTH: 31,
};

/**
 * 构造区间。
 * `dayKeysBetween` 接收的是**时间戳**，内部按 04:00 自然日边界归位。
 */
export function makeRange(now: number, dayCount: number): StatRange {
  const safeCount = Math.max(1, Math.floor(dayCount));
  const from = now - (safeCount - 1) * 86_400_000;
  return { dayKeys: dayKeysBetween(from, now) };
}

export function makePresetRange(now: number, preset: RangePreset): StatRange {
  return makeRange(now, RANGE_PRESET_DAYS[preset]);
}

/** 聚合某个区间的全部统计 */
export async function loadRangeStats(range: StatRange): Promise<RangeStats> {
  const { repositories } = getRuntime();
  const wanted = new Set(range.dayKeys);

  const [sessions, tasks, coins, quota] = await Promise.all([
    repositories.sessions.all(),
    repositories.tasks.all(),
    repositories.coinLedger.all(),
    repositories.quotaLedger.allEntries(),
  ]);

  const sessionInputs = sessions
    .filter((s) => wanted.has(dayKeyOf(s.startedAtWall)))
    .map((s) => ({
      dayKey: dayKeyOf(s.startedAtWall),
      kind: s.kind,
      status: s.status,
      effectiveMs: s.effectiveMs,
      violationMs: s.violations.reduce((sum, v) => sum + Math.max(0, v.durationMs), 0),
    }));

  const taskInputs = tasks
    .filter((t) => t.deletedAt === undefined && wanted.has(t.dayKey))
    .map((t) => ({
      dayKey: t.dayKey,
      status: t.status,
      ...(t.completedAt === undefined ? {} : { completedAt: t.completedAt }),
    }));

  const coinInputs = coins
    .filter((c) => wanted.has(c.dayKey))
    .map((c) => ({ dayKey: c.dayKey, amount: c.amount, kind: c.kind }));

  // 配额：只有「日」粒度能归属到某一天，月度键交给 aggregateDaily 自行忽略
  const quotaInputs = quota.map((q) => ({
    scope: q.scope,
    kind: q.kind,
    periodKey: q.periodKey,
  }));

  const daily = aggregateDaily(
    { sessions: sessionInputs, tasks: taskInputs, coins: coinInputs, quota: quotaInputs },
    range,
  );

  return { range, daily, summary: summarize(daily) };
}

/** 上一周期对比（用于"比上周 +12%"） */
export async function loadComparison(
  current: RangeStats,
  offsetDays: number,
): Promise<{ previous: RangeStats; focusDelta: number | null }> {
  const previous = await loadRangeStats(previousRange(current.range, offsetDays));
  return { previous, focusDelta: relativeDelta(current.summary.focusMs, previous.summary.focusMs) };
}

/** 环比：上期为 0 时返回 null（UI 显示「—」而不是 Infinity） */
export function relativeDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

/** 按小时的专注分布（PRD AC-4.3：找出"你的黄金时段"） */
export async function loadHourDistribution(range: StatRange): Promise<HourBucket[]> {
  const { repositories } = getRuntime();
  const wanted = new Set(range.dayKeys);
  const sessions = await repositories.sessions.all();
  const entries = sessions
    .filter((s) => wanted.has(dayKeyOf(s.startedAtWall)))
    .map((s) => ({
      kind: s.kind,
      // aggregateByHour 需要「会话起始的本地小时」，由墙钟时间戳推导
      startHour: new Date(s.startedAtWall).getHours(),
      effectiveMs: s.effectiveMs,
      status: s.status,
    }));
  return aggregateByHour(entries);
}

/** 当前月份键（供成本可见性展示使用） */
export function currentMonthKey(now: number): string {
  return periodKeyOf(now, 'FOCUS_MONTHLY');
}

/**
 * 数据完整度。
 * 统计页要**如实**告诉用户"哪些数据还没有"——
 * 空图表配上"你什么都没做"的暗示，比直接说明"还没有记录"伤害大得多。
 */
export interface DataCoverage {
  sessionCount: number;
  taskCount: number;
  coinCount: number;
  firstDayKey: string | null;
  isEmpty: boolean;
}

export async function loadCoverage(): Promise<DataCoverage> {
  const { repositories } = getRuntime();
  const [sessions, tasks, coins] = await Promise.all([
    repositories.sessions.all(),
    repositories.tasks.all(),
    repositories.coinLedger.all(),
  ]);

  const dayKeys = [
    ...sessions.map((s) => dayKeyOf(s.startedAtWall)),
    ...tasks.map((t) => t.dayKey),
    ...coins.map((c) => c.dayKey),
  ].filter((k) => k.length > 0);

  return {
    sessionCount: sessions.length,
    taskCount: tasks.length,
    coinCount: coins.length,
    firstDayKey: dayKeys.length > 0 ? ([...dayKeys].sort()[0] ?? null) : null,
    isEmpty: sessions.length === 0 && tasks.length === 0,
  };
}

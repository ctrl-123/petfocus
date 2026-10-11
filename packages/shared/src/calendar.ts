/**
 * 日历工具：自然日边界（默认本地 04:00）与周期键。
 *
 * 为什么不用 date-fns（见技术设计「3. 仓库与模块结构」备注）：
 * domain 与 shared 必须零依赖。日期格式化属于表现层，由 apps/web 用 date-fns 处理；
 * 而「这一天属于哪个 dayKey」是业务规则，必须与格式化库解耦，否则换库就会改业务行为。
 *
 * 规则来源：PRD 第 4.1 节「自然日边界 = 本地时间 04:00」。
 */

import { DAY_BOUNDARY_HOUR, TIME_UNITS } from './config/index.ts';
import type { QuotaScope } from './types.ts';

const MS_PER_DAY = TIME_UNITS.HOURS_PER_DAY * TIME_UNITS.MS_PER_HOUR;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 把时间戳转为 YYYY-MM-DD（按本地时区） */
export function formatDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 把时间戳转为 YYYY-MM（按本地时区） */
export function formatMonthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * 归属日：凌晨 boundaryHour 点之前算前一天。
 * 例：boundaryHour=4 时，2026-02-14 03:30 → '2026-02-13'。
 */
export function dayKeyOf(ts: number, boundaryHour: number = DAY_BOUNDARY_HOUR): string {
  const d = new Date(ts);
  if (d.getHours() < boundaryHour) {
    d.setDate(d.getDate() - 1);
  }
  return formatDayKey(d.getTime());
}

/** 周期键：月度配额用 YYYY-MM，其余用 dayKey */
export function periodKeyOf(
  ts: number,
  scope: QuotaScope,
  boundaryHour: number = DAY_BOUNDARY_HOUR,
): string {
  return scope === 'LOCK_MONTHLY' || scope === 'FOCUS_MONTHLY'
    ? formatMonthKey(ts)
    : dayKeyOf(ts, boundaryHour);
}

/** 归属日的起始时刻（本地 boundaryHour 点） */
export function dayStartOf(ts: number, boundaryHour: number = DAY_BOUNDARY_HOUR): number {
  const d = new Date(ts);
  if (d.getHours() < boundaryHour) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(boundaryHour, 0, 0, 0);
  return d.getTime();
}

/** 归属日的结束时刻（次日 boundaryHour 点） */
export function dayEndOf(ts: number, boundaryHour: number = DAY_BOUNDARY_HOUR): number {
  return dayStartOf(ts, boundaryHour) + MS_PER_DAY;
}

/**
 * 给定日期区间，列出其中所有 dayKey（含首尾）。
 * 用于统计模块：把「今日/本周/本月/自定义」统一转成 dayKey 列表。
 */
export function dayKeysBetween(fromTs: number, toTs: number, boundaryHour: number = DAY_BOUNDARY_HOUR): string[] {
  if (toTs < fromTs) return [];
  const keys: string[] = [];
  // 从 from 的归属日起步，逐日推进，最多 400 天防御性上限
  let cursor = dayStartOf(fromTs, boundaryHour);
  const lastStart = dayStartOf(toTs, boundaryHour);
  for (let i = 0; i < 400 && cursor <= lastStart; i += 1) {
    keys.push(formatDayKey(cursor));
    cursor += MS_PER_DAY;
  }
  return keys;
}

/**
 * 相对某个 dayKey 偏移若干天，返回新的 dayKey。
 * 对非法输入**抛错**而不是返回垃圾值——静默的 NaN 会一路污染统计。
 * 注意：不能只用 `Number.isNaN(y + m + d)` 判空，因为 `Number(undefined)` 是 NaN 而
 * `NaN !== NaN` 会让这类判断意外通过，所以这里用格式正则做严格校验。
 */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) {
    throw new Error(`无效的 dayKey: ${dayKey}`);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error(`无效的 dayKey: ${dayKey}`);
  }
  const dt = new Date(y, m - 1, d, DAY_BOUNDARY_HOUR, 0, 0, 0);
  // 归一化后日期被改动说明原始日期不存在（如 2026-02-30）
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    throw new Error(`无效的 dayKey: ${dayKey}`);
  }
  dt.setDate(dt.getDate() + deltaDays);
  return formatDayKey(dt.getTime());
}

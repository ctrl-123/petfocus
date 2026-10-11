/**
 * 健身模块的领域逻辑：连续打卡、里程碑、汇总。纯函数，零依赖。
 *
 * ⚠️ 日期的算法细节（容易搞错，所以在这里一次说清）：
 * 所有运算都在 **dayKey 字符串**层面做，而不是 Date 对象——
 * dayKey 是「归属日」（04:00 边界，见 calendar.ts），用 Date 加减会因为时区与夏令时出错。
 * 因此这里统一用 `Date.UTC` 做纯日期算术：它不涉及时区，只做"日历天数"运算。
 */
import { MODULE_COIN } from '../config/index.ts';
import { dayKeyOf, shiftDayKey } from '../calendar.ts';

/** 打卡记录的最小形状（只要这两个字段就能算连续天数） */
export interface CheckinLike {
  dayKey: string;
}

/** 健身记录的最小形状 */
export interface FitnessRecordLike {
  dayKey: string;
  itemName: string;
  unit: string;
  value: number;
  sets?: number;
}

/** 连续打卡的计算结果 */
export interface StreakResult {
  /** 截至今天（或最后一天）的连续天数 */
  current: number;
  /** 历史最长连续天数 */
  longest: number;
  /** 今天是否已打卡 */
  checkedInToday: boolean;
  /** 连续打卡里包含的 dayKey（升序），便于 UI 高亮 */
  currentDays: string[];
}

/**
 * 计算连续打卡天数。
 *
 * 两条规则（对齐 PRD AC-9.1.3）：
 * 1. **今天还没打卡不断签**——否则用户上午打开页面会看到"连续 0 天"，
 *    那是在惩罚"还没到晚上"，不合理。
 * 2. 断签以"归属日"为准，即昨天打过、今天没打仍算连续。
 */
export function calculateStreak(
  checkins: ReadonlyArray<CheckinLike>,
  todayKey: string,
): StreakResult {
  // 去重 + 升序
  const days = [...new Set(checkins.map((c) => c.dayKey))].sort();
  if (days.length === 0) {
    return { current: 0, longest: 0, checkedInToday: false, currentDays: [] };
  }

  const has = new Set(days);
  const checkedInToday = has.has(todayKey);

  // ── 当前连续：从今天（或昨天）往前数 ──
  // 起点选择：今天打了就从今天算；今天没打但从昨天开始连着，就从昨天算
  let anchor: string | undefined;
  if (checkedInToday) anchor = todayKey;
  else {
    const yesterday = shiftDayKey(todayKey, -1);
    if (has.has(yesterday)) anchor = yesterday;
  }

  const currentDays: string[] = [];
  if (anchor !== undefined) {
    let cursor = anchor;
    // 防御性上限：连续天数不可能超过记录总数
    for (let i = 0; i < days.length + 1; i += 1) {
      if (!has.has(cursor)) break;
      currentDays.push(cursor);
      cursor = shiftDayKey(cursor, -1);
    }
    currentDays.reverse();
  }

  // ── 历史最长：从最早一天开始扫，比较相邻日是否差 1 天 ──
  let longest = 0;
  let run = 0;
  let previous: string | undefined;
  for (const day of days) {
    if (previous !== undefined && shiftDayKey(previous, 1) === day) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    previous = day;
  }

  return {
    current: currentDays.length,
    longest,
    checkedInToday,
    currentDays,
  };
}

/** 已达成/下一个里程碑（对齐 MODULE_COIN.milestones） */
export interface MilestoneStatus {
  /** 已达成的里程碑（天数升序） */
  reached: ReadonlyArray<{ days: number; coin: number }>;
  /** 下一个里程碑；全部达成时为 undefined */
  next: { days: number; coin: number } | undefined;
  /** 距下一个里程碑还差几天；无下一个时为 0 */
  daysToNext: number;
}

export function milestoneStatus(currentStreak: number): MilestoneStatus {
    const reached = MODULE_COIN.milestones.filter((m) => m.days <= currentStreak);
  const next = MODULE_COIN.milestones.find((m) => m.days > currentStreak);
  return {
    reached,
    next,
    daysToNext: next === undefined ? 0 : next.days - currentStreak,
  };
}

/** 单日健身汇总 */
export interface DayFitnessSummary {
  dayKey: string;
  recordedCount: number;
  /** 按单位分组的合计（例如 30 分钟、50 次） */
  byUnit: Record<string, number>;
  /** 不同动作数 */
  distinctItems: number;
}

export function summarizeDay(
  records: ReadonlyArray<FitnessRecordLike>,
  dayKey: string,
): DayFitnessSummary {
  const byUnit: Record<string, number> = {};
  const items = new Set<string>();
  for (const record of records) {
    if (record.dayKey !== dayKey) continue;
    byUnit[record.unit] = (byUnit[record.unit] ?? 0) + record.value;
    items.add(record.itemName);
  }
  return {
    dayKey,
    recordedCount: records.filter((r) => r.dayKey === dayKey).length,
    byUnit,
    distinctItems: items.size,
  };
}

/** 一段时间的健身统计 */
export interface FitnessRangeSummary {
  /** 打卡天数 */
  checkinDays: number;
  /** 总记录条数 */
  recordCount: number;
  byUnit: Record<string, number>;
  /** 各动作的总量排行（按 value 降序，同单位内可比） */
  byItem: ReadonlyArray<{ itemName: string; unit: string; total: number; sessions: number }>;
}

export function summarizeRange(
  checkins: ReadonlyArray<CheckinLike>,
  records: ReadonlyArray<FitnessRecordLike>,
  dayKeys: ReadonlyArray<string>,
): FitnessRangeSummary {
  const wanted = new Set(dayKeys);
  const byUnit: Record<string, number> = {};
  const itemMap = new Map<string, { itemName: string; unit: string; total: number; sessions: number }>();

  let recordCount = 0;
  for (const record of records) {
    if (!wanted.has(record.dayKey)) continue;
    recordCount += 1;
    byUnit[record.unit] = (byUnit[record.unit] ?? 0) + record.value;

    const key = `${record.itemName}::${record.unit}`;
    const existing = itemMap.get(key);
    if (existing) {
      existing.total += record.value;
      existing.sessions += 1;
    } else {
      itemMap.set(key, {
        itemName: record.itemName,
        unit: record.unit,
        total: record.value,
        sessions: 1,
      });
    }
  }

  const checkinDays = new Set(
    checkins.filter((c) => wanted.has(c.dayKey)).map((c) => c.dayKey),
  ).size;

  return {
    checkinDays,
    recordCount,
    byUnit,
    byItem: [...itemMap.values()].sort((a, b) => b.total - a.total),
  };
}

/** 单位的中文标签 */
export const FITNESS_UNIT_LABELS: Record<string, string> = {
  REPS: '次',
  SETS: '组',
  MINUTES: '分钟',
  KM: '公里',
};

/** 常用动作预设（离线可用，用户也可自己输入） */
export const FITNESS_PRESETS: ReadonlyArray<{ name: string; unit: string; defaultValue: number }> = [
  { name: '跑步', unit: 'KM', defaultValue: 3 },
  { name: '快走', unit: 'MINUTES', defaultValue: 30 },
  { name: '俯卧撑', unit: 'REPS', defaultValue: 20 },
  { name: '深蹲', unit: 'REPS', defaultValue: 30 },
  { name: '平板支撑', unit: 'MINUTES', defaultValue: 2 },
  { name: '仰卧起坐', unit: 'REPS', defaultValue: 30 },
  { name: '引体向上', unit: 'REPS', defaultValue: 8 },
  { name: '跳绳', unit: 'MINUTES', defaultValue: 10 },
  { name: '哑铃', unit: 'SETS', defaultValue: 3 },
  { name: '游泳', unit: 'MINUTES', defaultValue: 30 },
  { name: '骑车', unit: 'MINUTES', defaultValue: 30 },
  { name: '瑜伽', unit: 'MINUTES', defaultValue: 20 },
];

/** 打卡金币（含里程碑加成），返回总额与明细便于 UI 展示 */
export interface CheckinReward {
  total: number;
  base: number;
  milestoneCoin: number;
  /** 本次达成的里程碑（可能为空） */
  reachedMilestones: ReadonlyArray<{ days: number; coin: number }>;
}

export function checkinReward(streakAfterCheckin: number): CheckinReward {
  const base = MODULE_COIN.fitnessCheckin;
  const reached = MODULE_COIN.milestones.filter((m) => m.days === streakAfterCheckin);
  const milestoneCoin = reached.reduce((sum, m) => sum + m.coin, 0);
  return {
    total: base + milestoneCoin,
    base,
    milestoneCoin,
    reachedMilestones: reached,
  };
}

/** 当天还能拿多少条记录金币（每日上限） */
export function recordCoinFor(existingTodayCount: number): number {
  const allowed = Math.max(0, MODULE_COIN.fitnessRecordDailyMax - existingTodayCount);
  return Math.min(allowed, 1) * MODULE_COIN.fitnessRecordPerItem;
}

/** 把时间戳转成归属日（供 usecase 层统一调用，避免各处各写一份） */
export function todayKeyOf(now: number): string {
  return dayKeyOf(now);
}

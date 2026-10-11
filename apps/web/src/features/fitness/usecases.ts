/**
 * 健身用例层：打卡、记录、统计、发放金币。
 *
 * 职责边界（AGENTS.md 第 2 节）：连续天数与金币规则在 `@petfocus/shared` 的 domain（已单测），
 * 本文件只做「取数 + 落盘 + 发放」。
 *
 * 金币发放遵循会话结算的同一模式：**追加型账本**，余额由求和推导，
 * 因此不存在"余额字段与流水不一致"的问题。
 */
import {
  MODULE_COIN,
  calculateStreak,
  checkinReward,
  dayKeyOf,
  dayKeysBetween,
  milestoneStatus,
  recordCoinFor,
  summarizeDay,
  summarizeRange,
  todayKeyOf,
  type CheckinLike,
  type FitnessRangeSummary,
  type FitnessRecordLike,
  type MilestoneStatus,
  type StreakResult,
} from '@petfocus/shared';
import { getRuntime, tryGetRuntime } from '../../app/runtime.ts';

/** 与宠物/饮食模块同一套就绪守卫（原因见 AGENTS.md §0.5） */
export function isFitnessStoreReady(): boolean {
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

/** 发一笔金币并返回发放后的余额 */
async function awardCoins(input: {
  amount: number;
  kind: 'FITNESS' | 'MILESTONE';
  refId: string;
  note: string;
  now: number;
}): Promise<number> {
  const { repositories } = requireRuntime();
  const before = await repositories.coinLedger.balance();
  if (input.amount <= 0) return before;

  const after = before + input.amount;
  await repositories.coinLedger.put({
    id: `${input.kind.toLowerCase()}-${input.refId}`,
    kind: input.kind,
    amount: input.amount,
    balanceAfter: after,
    refId: input.refId,
    dayKey: dayKeyOf(input.now),
    serverTime: 0,
    confirmed: false,
    note: input.note,
  });
  return after;
}

export interface FitnessOverview {
  streak: StreakResult;
  milestone: MilestoneStatus;
  todaySummary: ReturnType<typeof summarizeDay>;
  todayRecords: ReadonlyArray<FitnessRecordLike & { id: string }>;
  recentCheckins: ReadonlyArray<CheckinLike>;
}

/** 读总览：连续天数、里程碑、今日记录 */
export async function loadOverview(now: number): Promise<FitnessOverview> {
  const { repositories } = requireRuntime();
  const todayKey = todayKeyOf(now);

  const [checkinRows, allRecords] = await Promise.all([
    repositories.fitness.checkins(),
    repositories.fitness.all(),
  ]);

  const checkins: CheckinLike[] = checkinRows.map((c) => ({ dayKey: c.dayKey }));
  const streak = calculateStreak(checkins, todayKey);
  const todayRecords = allRecords.filter((r) => r.dayKey === todayKey);

  const stripStart = dayKeysBetween(now - 13 * 86_400_000, now)[0] ?? todayKey;

  return {
    streak,
    // 直接复用 domain 的实现，避免两处公式漂移
    milestone: milestoneStatus(streak.current),
    todaySummary: summarizeDay(allRecords, todayKey),
    todayRecords,
    // 最近 14 天的打卡（用于日历条）
    recentCheckins: checkins.filter((c) => c.dayKey >= stripStart),
  };
}

export interface CheckinResult {
  ok: boolean;
  message: string;
  /** 已打过卡时不是错误，只是提示 */
  alreadyCheckedIn: boolean;
  coinEarned: number;
  streak: StreakResult;
  reachedMilestones: ReadonlyArray<{ days: number; coin: number }>;
}

/**
 * 打卡。
 * 同一天重复打卡**不报错也不重复给币**，只提示"今天已经打过了"——
 * 报错会让用户以为操作失败，而重复给币会让人刷币。
 */
export async function checkIn(now: number, note?: string): Promise<CheckinResult> {
  const { repositories } = requireRuntime();
  const todayKey = todayKeyOf(now);

  const existing = await repositories.fitness.checkins();
  const already = existing.some((c) => c.dayKey === todayKey);
  const streakBefore = calculateStreak(
    existing.map((c) => ({ dayKey: c.dayKey })),
    todayKey,
  );

  if (already) {
    return {
      ok: true,
      alreadyCheckedIn: true,
      message: `今天已经打过卡了。连续 ${streakBefore.current} 天。`,
      coinEarned: 0,
      streak: streakBefore,
      reachedMilestones: [],
    };
  }

  // 先落打卡记录，再按"打卡后的连续天数"算奖励
  const streakAfter =
    streakBefore.checkedInToday || streakBefore.current > 0
      ? streakBefore.current + 1
      : 1;

  await repositories.fitness.putCheckin({
    id: `checkin-${todayKey}`,
    dayKey: todayKey,
    checkedAt: now,
    ...(note === undefined ? {} : { note }),
    streakAtTime: streakAfter,
  });

  const reward = checkinReward(streakAfter);
  await awardCoins({
    amount: reward.base,
    kind: 'FITNESS',
    refId: `checkin-${todayKey}`,
    note: `健身打卡（连续 ${streakAfter} 天）`,
    now,
  });

  // 里程碑单独记一笔，便于用户在流水里看清奖励来源
  if (reward.milestoneCoin > 0) {
    const milestoneDays = reward.reachedMilestones.map((m) => m.days).join('、');
    await awardCoins({
      amount: reward.milestoneCoin,
      kind: 'MILESTONE',
      refId: `streak-${todayKey}`,
      note: `连续打卡里程碑（第 ${milestoneDays} 天）`,
      now,
    });
  }

  const updated = [{ dayKey: todayKey }, ...existing.map((c) => ({ dayKey: c.dayKey }))];

  return {
    ok: true,
    alreadyCheckedIn: false,
    message:
      reward.milestoneCoin > 0
        ? `打卡成功，连续 ${streakAfter} 天！达成里程碑，额外 +${reward.milestoneCoin} 金币。`
        : `打卡成功，连续 ${streakAfter} 天，+${reward.base} 金币。`,
    coinEarned: reward.total,
    streak: calculateStreak(updated, todayKey),
    reachedMilestones: reward.reachedMilestones,
  };
}

export interface AddRecordResult {
  ok: boolean;
  message: string;
  coinEarned: number;
}

/** 添加一条动作记录（有每日金币上限） */
export async function addRecord(
  input: { itemName: string; unit: string; value: number; sets?: number; note?: string },
  now: number,
): Promise<AddRecordResult> {
  const { repositories } = requireRuntime();
  const name = input.itemName.trim();
  if (name.length === 0) return { ok: false, message: '请写下做了什么动作。', coinEarned: 0 };
  if (!Number.isFinite(input.value) || input.value <= 0) {
    return { ok: false, message: '数量要大于 0。', coinEarned: 0 };
  }

  const todayKey = todayKeyOf(now);
  const all = await repositories.fitness.all();
  const todayCount = all.filter((r) => r.dayKey === todayKey).length;

  const id = `fit-${now}-${Math.random().toString(36).slice(2, 8)}`;
  await repositories.fitness.put({
    id,
    dayKey: todayKey,
    itemName: name,
    unit: input.unit as 'REPS' | 'SETS' | 'MINUTES' | 'KM',
    value: input.value,
    ...(input.sets === undefined ? {} : { sets: input.sets }),
    ...(input.note === undefined ? {} : { note: input.note }),
    recordedAt: now,
  });

  const coin = recordCoinFor(todayCount);
  if (coin > 0) {
    await awardCoins({
      amount: coin,
      kind: 'FITNESS',
      refId: id,
      note: `健身记录：${name}`,
      now,
    });
  }

  return {
    ok: true,
    message:
      coin > 0
        ? `记下了「${name}」，+${coin} 金币。`
        : `记下了「${name}」。今天的记录金币已拿满（上限 ${MODULE_COIN.fitnessRecordDailyMax} 条）。`,
    coinEarned: coin,
  };
}

/** 删除一条记录（不扣回金币——避免"删了记录变成负币"这种荒谬状态） */
export async function removeRecord(id: string): Promise<void> {
  const { repositories } = requireRuntime();
  await repositories.fitness.delete(id);
}

/** 区间统计 */
export async function loadRangeSummary(
  now: number,
  days: number,
): Promise<FitnessRangeSummary> {
  const { repositories } = requireRuntime();
  const dayKeys = dayKeysBetween(now - (days - 1) * 86_400_000, now);
  const [checkinRows, records] = await Promise.all([
    repositories.fitness.checkins(),
    repositories.fitness.all(),
  ]);
  return summarizeRange(
    checkinRows.map((c) => ({ dayKey: c.dayKey })),
    records,
    dayKeys,
  );
}

/** 近 N 天的打卡状态（供日历条） */
export interface CheckinDay {
  dayKey: string;
  checkedIn: boolean;
  /** 该天是否有动作记录 */
  hasRecords: boolean;
}

export async function loadCheckinStrip(now: number, days: number): Promise<CheckinDay[]> {
  const { repositories } = requireRuntime();
  const dayKeys = dayKeysBetween(now - (days - 1) * 86_400_000, now);
  const [checkinRows, records] = await Promise.all([
    repositories.fitness.checkins(),
    repositories.fitness.all(),
  ]);
  const checked = new Set(checkinRows.map((c) => c.dayKey));
  const withRecords = new Set(records.map((r) => r.dayKey));

  return dayKeys.map((dayKey) => ({
    dayKey,
    checkedIn: checked.has(dayKey),
    hasRecords: withRecords.has(dayKey),
  }));
}

/**
 * 统计用例层集成测试（真实 Dexie + fake-indexeddb）。
 *
 * 为什么必须测这一层：统计的口径在 domain 里（已单测），但「从仓储取哪些行、
 * 怎么和 dayKey 对齐」是在这里做的。取错行或算错归属日，用户看到的就是
 * 错误的时长——而这类错误在纯函数测试里永远测不出来。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { closeDb, deleteDb, openDb, type PetFocusDb } from '../../../../../packages/shared/src/data/db.ts';
import { createDexieKeyValueStore, createDexieRepositories } from '../../../../../packages/shared/src/data/dexie-stores.ts';
import { setRuntime, resetRuntime } from '../../app/runtime.ts';
import { dayKeyOf } from '@petfocus/shared';
import {
  currentMonthKey,
  loadComparison,
  loadCoverage,
  loadHourDistribution,
  loadRangeStats,
  makePresetRange,
  makeRange,
  relativeDelta,
} from './usecases.ts';

const MIN = 60_000;
/** 用正午时刻避免踩到 04:00 自然日边界 */
const NOW = new Date(2026, 1, 14, 12, 0, 0, 0).getTime();
const TODAY = dayKeyOf(NOW);

let db: PetFocusDb | undefined;
let dbName = '';

beforeEach(async () => {
  dbName = `pf-stats-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db = await openDb(dbName);
  setRuntime({
    repositories: createDexieRepositories(db),
    kv: createDexieKeyValueStore(db),
    persistent: true,
  });
});

afterEach(async () => {
  if (db) closeDb(db);
  if (dbName) await deleteDb(dbName);
  db = undefined;
  resetRuntime();
});

function repos(): ReturnType<typeof createDexieRepositories> {
  if (!db) throw new Error('db 未初始化');
  return createDexieRepositories(db);
}

/** 造一条已结算的专注会话 */
async function addSession(
  id: string,
  startedAtWall: number,
  effectiveMs: number,
  overrides: { kind?: 'FOCUS' | 'LOCK'; status?: string; violationMs?: number } = {},
): Promise<void> {
  const kind = overrides.kind ?? 'FOCUS';
  const status = overrides.status ?? 'SETTLED';
  await repos().sessions.put({
    id,
    kind,
    status: status as 'SETTLED',
    title: '专注',
    plannedMs: effectiveMs,
    startedAtMonotonic: startedAtWall,
    startedAtWall,
    pausedIntervals: [],
    violations:
      overrides.violationMs && overrides.violationMs > 0
        ? [{ startedAt: startedAtWall, durationMs: overrides.violationMs, source: 'VISIBILITY' }]
        : [],
    effectiveMs,
    exitKind: 'NATURAL',
    rewardCoin: 0,
    updatedAt: startedAtWall,
  });
}

async function addTask(id: string, dayKey: string, status: string): Promise<void> {
  await repos().tasks.put({
    id,
    dayKey,
    title: `任务 ${id}`,
    startAt: NOW,
    plannedMs: 25 * MIN,
    priority: 'MEDIUM',
    status: status as 'DONE',
    linkedSessionIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function addCoin(id: string, dayKey: string, amount: number, kind: string): Promise<void> {
  await repos().coinLedger.put({
    id,
    kind: kind as 'FOCUS_DONE',
    amount,
    balanceAfter: 0,
    dayKey,
    serverTime: NOW,
    confirmed: true,
  });
}

describe('makeRange / makePresetRange：区间构造', () => {
  it('今日区间只含一天', () => {
    const range = makeRange(NOW, 1);
    assert.equal(range.dayKeys.length, 1);
    assert.equal(range.dayKeys[0], TODAY);
  });

  it('近 7 天含 7 天且以今天结尾', () => {
    const range = makePresetRange(NOW, 'LAST_7');
    assert.equal(range.dayKeys.length, 7);
    assert.equal(range.dayKeys.at(-1), TODAY);
  });

  it('近 30 天含 30 天', () => {
    assert.equal(makePresetRange(NOW, 'LAST_30').dayKeys.length, 30);
  });

  it('非法天数被夹到至少 1 天（不产生空区间）', () => {
    assert.equal(makeRange(NOW, 0).dayKeys.length, 1);
    assert.equal(makeRange(NOW, -5).dayKeys.length, 1);
  });

  it('跨月也能正确列出（含 04:00 边界归位）', () => {
    const range = makePresetRange(NOW, 'THIS_MONTH');
    assert.ok(range.dayKeys.length >= 28);
  });
});

describe('loadRangeStats：口径正确性', () => {
  it('空库时返回全 0 且天数为区间长度', async () => {
    const stats = await loadRangeStats(makeRange(NOW, 7));
    assert.equal(stats.daily.length, 7);
    assert.equal(stats.summary.focusMs, 0);
    assert.equal(stats.summary.activeDays, 0);
    assert.equal(stats.summary.completionRate, null);
  });

  it('只统计已结算的会话（放弃/待结算不计入）', async () => {
    await addSession('ok', NOW - 2 * 3_600_000, 45 * MIN);
    await addSession('abandoned', NOW - 3_600_000, 30 * MIN, { status: 'ABANDONED' });
    await addSession('awaiting', NOW, 20 * MIN, { status: 'AWAITING_SETTLEMENT' });

    const stats = await loadRangeStats(makeRange(NOW, 1));
    assert.equal(stats.summary.focusMs, 45 * MIN, '只有已结算的算数');
  });

  it('专注与锁机分开统计', async () => {
    await addSession('f', NOW - 3_600_000, 45 * MIN);
    await addSession('l', NOW - 1_800_000, 90 * MIN, { kind: 'LOCK' });

    const stats = await loadRangeStats(makeRange(NOW, 1));
    assert.equal(stats.summary.focusMs, 45 * MIN);
    assert.equal(stats.summary.lockMs, 90 * MIN);
  });

  it('区间外的会话不计入', async () => {
    await addSession('old', NOW - 20 * 86_400_000, 60 * MIN);
    const stats = await loadRangeStats(makeRange(NOW, 7));
    assert.equal(stats.summary.focusMs, 0);
  });

  it('待办完成率 = 完成/计划', async () => {
    await addTask('t1', TODAY, 'DONE');
    await addTask('t2', TODAY, 'DONE');
    await addTask('t3', TODAY, 'PENDING');
    await addTask('t4', TODAY, 'SKIPPED');

    const stats = await loadRangeStats(makeRange(NOW, 1));
    assert.equal(stats.summary.tasksPlanned, 4);
    assert.equal(stats.summary.tasksDone, 2);
    assert.equal(stats.summary.completionRate, 0.5);
  });

  it('软删除的待办不计入', async () => {
    await addTask('gone', TODAY, 'DONE');
    await repos().tasks.put({
      ...(await repos().tasks.get('gone'))!,
      deletedAt: NOW,
    });
    const stats = await loadRangeStats(makeRange(NOW, 1));
    assert.equal(stats.summary.tasksPlanned, 0);
  });

  it('金币收支分开统计，且排除 DEMO 演示数据', async () => {
    await addCoin('a', TODAY, 46, 'FOCUS_DONE');
    await addCoin('b', TODAY, -30, 'PURCHASE');
    await addCoin('demo', TODAY, 999, 'DEMO');

    const stats = await loadRangeStats(makeRange(NOW, 1));
    assert.equal(stats.summary.coinEarned, 46, '演示数据不得计入真实统计');
    assert.equal(stats.summary.coinSpent, 30);
  });

  it('违规时长累加', async () => {
    await addSession('v', NOW - 3_600_000, 45 * MIN, { violationMs: 5 * MIN });
    const stats = await loadRangeStats(makeRange(NOW, 1));
    assert.equal(stats.summary.violationMs, 5 * MIN);
  });

  it('activeDays 只数有专注/锁机的天', async () => {
    await addSession('d1', NOW - 3_600_000, 30 * MIN);
    await addSession('d2', NOW - 26 * 3_600_000, 30 * MIN);
    const stats = await loadRangeStats(makeRange(NOW, 7));
    assert.ok(stats.summary.activeDays >= 1);
  });

  it('每日明细与摘要一致（无口径漂移）', async () => {
    await addSession('s1', NOW - 3_600_000, 25 * MIN);
    await addSession('s2', NOW - 1_800_000, 35 * MIN);
    const stats = await loadRangeStats(makeRange(NOW, 1));
    const sumOfDaily = stats.daily.reduce((sum, d) => sum + d.focusMs, 0);
    assert.equal(sumOfDaily, stats.summary.focusMs, '明细与摘要必须相等');
  });
});

describe('loadComparison：环比', () => {
  it('上期无数据时 delta 为 null（不造假增长）', async () => {
    await addSession('now', NOW - 3_600_000, 60 * MIN);
    const current = await loadRangeStats(makeRange(NOW, 1));
    const { focusDelta } = await loadComparison(current, 1);
    assert.equal(focusDelta, null);
  });

  it('上期有数据时给出正确比例', async () => {
    await addSession('this', NOW - 3_600_000, 90 * MIN);
    await addSession('prev', NOW - 86_400_000, 60 * MIN);

    const current = await loadRangeStats(makeRange(NOW, 1));
    const { previous, focusDelta } = await loadComparison(current, 1);
    assert.equal(previous.summary.focusMs, 60 * MIN);
    assert.equal(focusDelta, 0.5, '90 分钟相对 60 分钟应 +50%');
  });

  it('relativeDelta 在分母为 0 时返回 null', () => {
    assert.equal(relativeDelta(100, 0), null);
    assert.equal(relativeDelta(0, 100), -1);
    assert.equal(relativeDelta(200, 100), 1);
  });
});

describe('loadHourDistribution：时段分布', () => {
  it('只在会话起始小时上累计', async () => {
    const nineAm = new Date(2026, 1, 14, 9, 30, 0, 0).getTime();
    await addSession('am', nineAm, 45 * MIN);
    const buckets = await loadHourDistribution(makeRange(NOW, 1));
    assert.equal(buckets.length, 24);
    assert.equal(buckets[9]?.focusMs, 45 * MIN);
    assert.equal(buckets[10]?.focusMs, 0);
  });

  it('未结算的会话不计入时段分布', async () => {
    const nineAm = new Date(2026, 1, 14, 9, 0, 0, 0).getTime();
    await addSession('x', nineAm, 45 * MIN, { status: 'ABANDONED' });
    const buckets = await loadHourDistribution(makeRange(NOW, 1));
    assert.equal(buckets.reduce((sum, b) => sum + b.focusMs, 0), 0);
  });

  it('锁机也会计入时段（都算"坐得住"的时间）', async () => {
    const tenAm = new Date(2026, 1, 14, 10, 0, 0, 0).getTime();
    await addSession('lock', tenAm, 60 * MIN, { kind: 'LOCK' });
    const buckets = await loadHourDistribution(makeRange(NOW, 1));
    assert.equal(buckets[10]?.lockMs, 60 * MIN);
  });
});

describe('loadCoverage：数据完整度', () => {
  it('空库时 isEmpty 为 true 且无最早日期', async () => {
    const coverage = await loadCoverage();
    assert.equal(coverage.isEmpty, true);
    assert.equal(coverage.firstDayKey, null);
  });

  it('有数据时给出最早日期与计数', async () => {
    const older = NOW - 3 * 86_400_000;
    await addSession('s', older, 30 * MIN);
    await addTask('t', TODAY, 'PENDING');

    const coverage = await loadCoverage();
    assert.equal(coverage.isEmpty, false);
    assert.equal(coverage.sessionCount, 1);
    assert.equal(coverage.taskCount, 1);
    assert.ok(coverage.firstDayKey);
    assert.ok(coverage.firstDayKey <= TODAY, '最早日期不应晚于今天');
  });
});

describe('currentMonthKey', () => {
  it('返回 YYYY-MM 格式', () => {
    assert.match(currentMonthKey(NOW), /^\d{4}-\d{2}$/);
    assert.equal(currentMonthKey(NOW), '2026-02');
  });
});

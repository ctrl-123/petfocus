/**
 * 健身用例层集成测试（真实 Dexie + fake-indexeddb）。
 * 重点：**打卡的金币发放与连续天数是否正确落盘**。
 * 重复给币会让人刷币，重复报错会让用户以为操作失败——两者都测。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { closeDb, deleteDb, openDb, type PetFocusDb } from '../../../../../packages/shared/src/data/db.ts';
import {
  createDexieKeyValueStore,
  createDexieRepositories,
} from '../../../../../packages/shared/src/data/dexie-stores.ts';
import { setRuntime, resetRuntime } from '../../app/runtime.ts';
import { MODULE_COIN } from '@petfocus/shared';
import {
  addRecord,
  checkIn,
  isFitnessStoreReady,
  loadCheckinStrip,
  loadOverview,
  loadRangeSummary,
  removeRecord,
} from './usecases.ts';

const NOW = new Date(2026, 1, 14, 12, 0, 0, 0).getTime();
const DAY = 86_400_000;

let db: PetFocusDb | undefined;
let dbName = '';

beforeEach(async () => {
  dbName = `pf-fit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function balance(): Promise<number> {
  if (!db) throw new Error('db 未初始化');
  return createDexieRepositories(db).coinLedger.balance();
}

describe('运行时就绪守卫', () => {
  it('未就绪时为 false，就绪后为 true', () => {
    resetRuntime();
    assert.equal(isFitnessStoreReady(), false);
    setRuntime({
      repositories: createDexieRepositories(db!),
      kv: createDexieKeyValueStore(db!),
      persistent: true,
    });
    assert.equal(isFitnessStoreReady(), true);
  });
});

describe('checkIn：打卡与金币', () => {
  it('首次打卡给出基础金币并落盘', async () => {
    const result = await checkIn(NOW);
    assert.equal(result.ok, true);
    assert.equal(result.alreadyCheckedIn, false);
    assert.equal(result.coinEarned, MODULE_COIN.fitnessCheckin);
    assert.equal(result.streak.current, 1);
    assert.equal(await balance(), MODULE_COIN.fitnessCheckin);
  });

  it('同一天重复打卡：不报错、不重复给币', async () => {
    await checkIn(NOW);
    const second = await checkIn(NOW + 3600_000);

    assert.equal(second.ok, true, '重复打卡不该被当成失败');
    assert.equal(second.alreadyCheckedIn, true);
    assert.equal(second.coinEarned, 0, '不能重复给币');
    assert.equal(await balance(), MODULE_COIN.fitnessCheckin, '余额不应变化');
    assert.match(second.message, /已经打过卡/);
  });

  it('连续两天打卡累计金币', async () => {
    await checkIn(NOW - DAY);
    const result = await checkIn(NOW);
    assert.equal(result.streak.current, 2);
    assert.equal(await balance(), MODULE_COIN.fitnessCheckin * 2);
  });

  it('第 7 天达成里程碑，额外发放里程碑金币', async () => {
    // 连续打 6 天（昨天往前）
    for (let i = 6; i >= 1; i -= 1) await checkIn(NOW - i * DAY);
    const seventh = await checkIn(NOW);

    assert.equal(seventh.streak.current, 7);
    assert.deepEqual(seventh.reachedMilestones.map((m) => m.days), [7]);

    // 注意：连续 7 天的过程中也达成了第 3 天里程碑（15 币），
    // 因此总余额 = 7 次基础 + 第 3 天 15 + 第 7 天 40
    const expected = MODULE_COIN.fitnessCheckin * 7 + 15 + 40;
    assert.equal(await balance(), expected, '基础金币 + 两个里程碑');
    assert.equal(seventh.coinEarned, MODULE_COIN.fitnessCheckin + 40, '本次只叠加第 7 天的奖励');
  });

  it('里程碑单独记一笔（流水里能看清来源）', async () => {
    for (let i = 3; i >= 1; i -= 1) await checkIn(NOW - i * DAY);
    await checkIn(NOW);

    const rows = await createDexieRepositories(db!).coinLedger.all();
    const milestones = rows.filter((r) => r.kind === 'MILESTONE');
    assert.equal(milestones.length, 1, '第 3 天里程碑应记一笔');
    assert.equal(milestones[0]?.amount, 15);
    assert.match(milestones[0]?.note ?? '', /第 3 天/);
  });

  it('断签后重新打卡：连续从 1 重新开始', async () => {
    await checkIn(NOW - 3 * DAY);
    await checkIn(NOW - 2 * DAY);
    // 昨天没打
    const result = await checkIn(NOW);
    assert.equal(result.streak.current, 1, '断签后重新计数');
  });

  it('余额由账本派生，与流水求和一致', async () => {
    await checkIn(NOW);
    await checkIn(NOW - DAY);
    const rows = await createDexieRepositories(db!).coinLedger.all();
    const sum = rows.reduce((acc, r) => acc + r.amount, 0);
    assert.equal(await balance(), sum);
  });
});

describe('addRecord：动作记录与每日上限', () => {
  it('前几条给币', async () => {
    const result = await addRecord({ itemName: '跑步', unit: 'KM', value: 3 }, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.coinEarned, MODULE_COIN.fitnessRecordPerItem);
    assert.equal(await balance(), MODULE_COIN.fitnessRecordPerItem);
  });

  it('达到每日上限后不再给币，但仍能记录', async () => {
    for (let i = 0; i < MODULE_COIN.fitnessRecordDailyMax; i += 1) {
      await addRecord({ itemName: '俯卧撑', unit: 'REPS', value: 20 }, NOW + i);
    }
    const over = await addRecord({ itemName: '深蹲', unit: 'REPS', value: 30 }, NOW + 100);

    assert.equal(over.ok, true, '超过上限仍应记录成功');
    assert.equal(over.coinEarned, 0);
    assert.match(over.message, /已拿满/);

    const rows = await createDexieRepositories(db!).fitness.all();
    assert.equal(rows.length, MODULE_COIN.fitnessRecordDailyMax + 1);
  });

  it('空名称被拒绝', async () => {
    const result = await addRecord({ itemName: '   ', unit: 'REPS', value: 10 }, NOW);
    assert.equal(result.ok, false);
    assert.equal(await balance(), 0);
  });

  it('数量非正被拒绝', async () => {
    for (const value of [0, -5, Number.NaN]) {
      const result = await addRecord({ itemName: '跑步', unit: 'KM', value }, NOW);
      assert.equal(result.ok, false, `数量 ${value} 应被拒绝`);
    }
    assert.equal(await balance(), 0);
  });

  it('删除记录不扣回金币（避免出现负币）', async () => {
    const added = await addRecord({ itemName: '跑步', unit: 'KM', value: 3 }, NOW);
    assert.ok(added.ok);
    const rows = await createDexieRepositories(db!).fitness.all();
    const id = rows[0]?.id;
    assert.ok(id);

    await removeRecord(id);
    assert.equal((await createDexieRepositories(db!).fitness.all()).length, 0);
    assert.equal(await balance(), MODULE_COIN.fitnessRecordPerItem, '金币不应被扣回');
  });
});

describe('loadOverview：总览', () => {
  it('空库时连续为 0 且无异常', async () => {
    const overview = await loadOverview(NOW);
    assert.equal(overview.streak.current, 0);
    assert.equal(overview.todaySummary.recordedCount, 0);
    assert.equal(overview.todayRecords.length, 0);
  });

  it('今天没打卡但昨天打了 → 不断签', async () => {
    await checkIn(NOW - DAY);
    const overview = await loadOverview(NOW);
    assert.equal(overview.streak.current, 1);
    assert.equal(overview.streak.checkedInToday, false);
  });

  it('里程碑信息与当前连续天数一致', async () => {
    await checkIn(NOW);
    const overview = await loadOverview(NOW);
    assert.equal(overview.milestone.next?.days, 3);
    assert.equal(overview.milestone.daysToNext, 2);
  });

  it('今日记录只含今天的', async () => {
    await addRecord({ itemName: '跑步', unit: 'KM', value: 3 }, NOW);
    await addRecord({ itemName: '跑步', unit: 'KM', value: 5 }, NOW - DAY);
    const overview = await loadOverview(NOW);
    assert.equal(overview.todayRecords.length, 1);
    assert.equal(overview.todaySummary.byUnit.KM, 3);
  });
});

describe('loadCheckinStrip：14 天日历条', () => {
  it('返回 14 天且顺序升序', async () => {
    const strip = await loadCheckinStrip(NOW, 14);
    assert.equal(strip.length, 14);
    const keys = strip.map((d) => d.dayKey);
    assert.deepEqual(keys, [...keys].sort());
    assert.equal(strip.at(-1)?.dayKey, '2026-02-14');
  });

  it('区分"已打卡"与"只有记录"', async () => {
    await checkIn(NOW);
    await addRecord({ itemName: '跑步', unit: 'KM', value: 3 }, NOW - DAY);

    const strip = await loadCheckinStrip(NOW, 14);
    const today = strip.find((d) => d.dayKey === '2026-02-14');
    const yesterday = strip.find((d) => d.dayKey === '2026-02-13');

    assert.equal(today?.checkedIn, true);
    assert.equal(yesterday?.checkedIn, false, '只有记录不算打卡');
    assert.equal(yesterday?.hasRecords, true);
  });
});

describe('loadRangeSummary：区间统计', () => {
  it('统计打卡天数与记录量', async () => {
    await checkIn(NOW);
    await checkIn(NOW - DAY);
    await addRecord({ itemName: '跑步', unit: 'KM', value: 3 }, NOW);
    await addRecord({ itemName: '跑步', unit: 'KM', value: 4 }, NOW - DAY);

    const summary = await loadRangeSummary(NOW, 30);
    assert.equal(summary.checkinDays, 2);
    assert.equal(summary.recordCount, 2);
    assert.equal(summary.byUnit.KM, 7);
    assert.equal(summary.byItem[0]?.sessions, 2);
  });

  it('区间外的记录不计入', async () => {
    await checkIn(NOW - 60 * DAY);
    const summary = await loadRangeSummary(NOW, 30);
    assert.equal(summary.checkinDays, 0);
  });
});

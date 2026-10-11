/**
 * 健身领域逻辑单测。
 * 重点在**连续打卡的边界**：这是最容易写错、也最容易被用户发现的地方。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateStreak,
  checkinReward,
  milestoneStatus,
  recordCoinFor,
  summarizeDay,
  summarizeRange,
} from './fitness.ts';
import { MODULE_COIN } from '../config/index.ts';

const TODAY = '2026-02-14';

/** 便捷构造：相对今天的偏移天数 */
function checkin(daysAgo: number): { dayKey: string } {
  const base = Date.UTC(2026, 1, 14);
  const d = new Date(base - daysAgo * 86_400_000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return { dayKey: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` };
}

describe('calculateStreak：连续打卡', () => {
  it('空记录返回 0', () => {
    const result = calculateStreak([], TODAY);
    assert.equal(result.current, 0);
    assert.equal(result.longest, 0);
    assert.equal(result.checkedInToday, false);
  });

  it('只有今天 → 连续 1 天', () => {
    const result = calculateStreak([checkin(0)], TODAY);
    assert.equal(result.current, 1);
    assert.equal(result.checkedInToday, true);
  });

  it('只有昨天、今天没打 → 仍算连续（不能惩罚"还没到晚上"）', () => {
    const result = calculateStreak([checkin(1)], TODAY);
    assert.equal(result.current, 1, '今天还没打卡不该断签');
    assert.equal(result.checkedInToday, false);
  });

  it('昨天和前天连着、今天没打 → 连续 2 天', () => {
    const result = calculateStreak([checkin(1), checkin(2)], TODAY);
    assert.equal(result.current, 2);
  });

  it('前天打了但昨天没打（今天也没打）→ 断签，连续 0', () => {
    const result = calculateStreak([checkin(2)], TODAY);
    assert.equal(result.current, 0, '中间断了一天就不算连续');
  });

  it('今天+昨天+前天 → 连续 3 天', () => {
    const result = calculateStreak([checkin(0), checkin(1), checkin(2)], TODAY);
    assert.equal(result.current, 3);
  });

  it('断签后重新开始：连续只算最近这一段', () => {
    // 打了 1,2,3 天前，然后断了（4、5 天前没打），再打 0,1 天前
    const result = calculateStreak([checkin(0), checkin(1), checkin(3), checkin(4)], TODAY);
    assert.equal(result.current, 2, '只算最近这段');
  });

  it('longest 记录历史上最长的一段', () => {
    const result = calculateStreak(
      [checkin(0), checkin(1), checkin(3), checkin(4), checkin(5), checkin(6)],
      TODAY,
    );
    assert.equal(result.current, 2);
    assert.equal(result.longest, 4, '3–6 天前是连着 4 天');
  });

  it('重复打卡同一天只算一次', () => {
    const result = calculateStreak([checkin(0), checkin(0), checkin(0)], TODAY);
    assert.equal(result.current, 1);
  });

  it('乱序输入也能正确计算', () => {
    const result = calculateStreak([checkin(2), checkin(0), checkin(1)], TODAY);
    assert.equal(result.current, 3);
  });

  it('currentDays 升序且与实际日期一致', () => {
    const result = calculateStreak([checkin(0), checkin(1), checkin(2)], TODAY);
    assert.deepEqual(result.currentDays, ['2026-02-12', '2026-02-13', '2026-02-14']);
  });

  it('跨月也能连上', () => {
    // 2026-03-01 打卡，前一天是 2026-02-28（2026 非闰年）
    const result = calculateStreak([{ dayKey: '2026-03-01' }, { dayKey: '2026-02-28' }], '2026-03-01');
    assert.equal(result.current, 2, '跨月不应断开');
  });

  it('跨年也能连上', () => {
    const result = calculateStreak([{ dayKey: '2027-01-01' }, { dayKey: '2026-12-31' }], '2027-01-01');
    assert.equal(result.current, 2);
  });

  it('长时间连续不会因防御上限被截断', () => {
    const many = Array.from({ length: 60 }, (_, i) => checkin(i));
    const result = calculateStreak(many, TODAY);
    assert.equal(result.current, 60);
  });
});

describe('milestoneStatus：里程碑', () => {
  it('0 天时下一个是 3 天', () => {
    const status = milestoneStatus(0);
    assert.equal(status.reached.length, 0);
    assert.equal(status.next?.days, 3);
    assert.equal(status.daysToNext, 3);
  });

  it('刚好达成时计入 reached', () => {
    const status = milestoneStatus(3);
    assert.deepEqual(status.reached.map((m) => m.days), [3]);
    assert.equal(status.next?.days, 7);
    assert.equal(status.daysToNext, 4);
  });

  it('超过多个里程碑时全部计入', () => {
    const status = milestoneStatus(20);
    assert.deepEqual(status.reached.map((m) => m.days), [3, 7, 14]);
    assert.equal(status.next?.days, 30);
  });

  it('全部达成后 next 为 undefined 且 daysToNext 为 0', () => {
    const status = milestoneStatus(365);
    assert.equal(status.next, undefined);
    assert.equal(status.daysToNext, 0);
    assert.equal(status.reached.length, MODULE_COIN.milestones.length);
  });
});

describe('checkinReward：打卡金币', () => {
  it('普通打卡只给基础金币', () => {
    const reward = checkinReward(1);
    assert.equal(reward.total, MODULE_COIN.fitnessCheckin);
    assert.equal(reward.milestoneCoin, 0);
  });

  it('达成里程碑时叠加奖励', () => {
    const reward = checkinReward(7);
    assert.equal(reward.milestoneCoin, 40);
    assert.equal(reward.total, MODULE_COIN.fitnessCheckin + 40);
    assert.deepEqual(reward.reachedMilestones.map((m) => m.days), [7]);
  });

  it('第 30 天奖励最高', () => {
    assert.equal(checkinReward(30).milestoneCoin, 200);
  });
});

describe('recordCoinFor：记录金币的每日上限', () => {
  it('前几条给币，达到上限后为 0', () => {
    assert.equal(recordCoinFor(0), MODULE_COIN.fitnessRecordPerItem);
    assert.equal(recordCoinFor(1), MODULE_COIN.fitnessRecordPerItem);
    assert.equal(recordCoinFor(2), MODULE_COIN.fitnessRecordPerItem);
    assert.equal(recordCoinFor(MODULE_COIN.fitnessRecordDailyMax), 0, '达到上限后不再给币');
    assert.equal(recordCoinFor(100), 0);
  });
});

describe('summarizeDay：单日汇总', () => {
  const records = [
    { dayKey: TODAY, itemName: '跑步', unit: 'KM', value: 3 },
    { dayKey: TODAY, itemName: '俯卧撑', unit: 'REPS', value: 20 },
    { dayKey: TODAY, itemName: '俯卧撑', unit: 'REPS', value: 15 },
    { dayKey: '2026-02-13', itemName: '跑步', unit: 'KM', value: 5 },
  ];

  it('只统计目标日', () => {
    const summary = summarizeDay(records, TODAY);
    assert.equal(summary.recordedCount, 3);
    assert.equal(summary.byUnit.KM, 3);
    assert.equal(summary.byUnit.REPS, 35, '同单位应累加');
  });

  it('distinctItems 数不同动作', () => {
    assert.equal(summarizeDay(records, TODAY).distinctItems, 2);
  });

  it('没有记录的日子返回全 0', () => {
    const summary = summarizeDay(records, '2026-02-01');
    assert.equal(summary.recordedCount, 0);
    assert.deepEqual(summary.byUnit, {});
    assert.equal(summary.distinctItems, 0);
  });
});

describe('summarizeRange：区间汇总', () => {
  const checkins = [{ dayKey: TODAY }, { dayKey: '2026-02-13' }, { dayKey: '2026-01-01' }];
  const records = [
    { dayKey: TODAY, itemName: '跑步', unit: 'KM', value: 3 },
    { dayKey: '2026-02-13', itemName: '跑步', unit: 'KM', value: 5 },
    { dayKey: '2026-01-01', itemName: '游泳', unit: 'MINUTES', value: 30 },
  ];

  it('只统计区间内的打卡与记录', () => {
    const summary = summarizeRange(checkins, records, [TODAY, '2026-02-13']);
    assert.equal(summary.checkinDays, 2);
    assert.equal(summary.recordCount, 2);
    assert.equal(summary.byUnit.KM, 8);
  });

  it('byItem 按总量降序并合并同名同单位', () => {
    const summary = summarizeRange(checkins, records, [TODAY, '2026-02-13']);
    assert.equal(summary.byItem[0]?.itemName, '跑步');
    assert.equal(summary.byItem[0]?.total, 8);
    assert.equal(summary.byItem[0]?.sessions, 2);
  });

  it('空区间返回全 0', () => {
    const summary = summarizeRange(checkins, records, ['2026-05-01']);
    assert.equal(summary.checkinDays, 0);
    assert.equal(summary.recordCount, 0);
    assert.deepEqual(summary.byItem, []);
  });
});

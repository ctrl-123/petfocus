/**
 * 日历模块单测 —— 自然日边界（本地 04:00）是全局规则，必须锁死。
 * 这些测试用本地时区构造时间戳，与实现保持同一时区语义。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  dayEndOf,
  dayKeyOf,
  dayKeysBetween,
  dayStartOf,
  formatDayKey,
  formatMonthKey,
  periodKeyOf,
  shiftDayKey,
} from './calendar.ts';
import { DAY_BOUNDARY_HOUR } from './config/index.ts';

/** 构造本地时间戳（避免时区漂移导致测试在别的机器上挂） */
function at(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return new Date(y, m - 1, d, h, min, s, 0).getTime();
}

describe('dayKeyOf：04:00 边界 [PRD 4.1]', () => {
  it('边界前算前一天，边界后算当天', () => {
    assert.equal(dayKeyOf(at(2026, 2, 14, 3, 59)), '2026-02-13');
    assert.equal(dayKeyOf(at(2026, 2, 14, 4, 0)), '2026-02-14');
    assert.equal(dayKeyOf(at(2026, 2, 14, 23, 59)), '2026-02-14');
  });

  it('跨年边界：1 月 1 日凌晨 3 点算上一年 12 月 31 日', () => {
    assert.equal(dayKeyOf(at(2026, 1, 1, 3, 0)), '2025-12-31');
    assert.equal(dayKeyOf(at(2026, 1, 1, 4, 0)), '2026-01-01');
  });

  it('跨月边界：3 月 1 日凌晨算 2 月最后一天', () => {
    assert.equal(dayKeyOf(at(2026, 3, 1, 2, 0)), '2026-02-28');
  });

  it('闰年 2 月 29 日正确', () => {
    assert.equal(dayKeyOf(at(2028, 2, 29, 12, 0)), '2028-02-29');
    assert.equal(dayKeyOf(at(2028, 3, 1, 1, 0)), '2028-02-29');
  });

  it('可自定义边界小时', () => {
    assert.equal(dayKeyOf(at(2026, 2, 14, 3, 0), 0), '2026-02-14');
    assert.equal(dayKeyOf(at(2026, 2, 14, 6, 0), 6), '2026-02-14');
    assert.equal(dayKeyOf(at(2026, 2, 14, 5, 59), 6), '2026-02-13');
  });

  it('默认边界取自配置（4 点）', () => {
    assert.equal(DAY_BOUNDARY_HOUR, 4);
  });
});

describe('formatDayKey / formatMonthKey', () => {
  it('补零', () => {
    assert.equal(formatDayKey(at(2026, 2, 4, 12)), '2026-02-04');
    assert.equal(formatMonthKey(at(2026, 2, 4, 12)), '2026-02');
    assert.equal(formatMonthKey(at(2026, 12, 31, 12)), '2026-12');
  });
});

describe('periodKeyOf：按 scope 选择日/月周期键', () => {
  it('每日 scope 用 dayKey（含 04:00 边界）', () => {
    assert.equal(periodKeyOf(at(2026, 2, 14, 3, 0), 'FOCUS_DAILY'), '2026-02-13');
    assert.equal(periodKeyOf(at(2026, 2, 14, 5, 0), 'FOCUS_DAILY'), '2026-02-14');
  });

  it('月度 scope 用 monthKey，不受 04:00 边界影响', () => {
    // 3 月 1 日凌晨 2 点：dayKey 属 2 月，但 monthKey 应属 3 月
    assert.equal(periodKeyOf(at(2026, 3, 1, 2, 0), 'FOCUS_MONTHLY'), '2026-03');
    assert.equal(periodKeyOf(at(2026, 3, 1, 2, 0), 'LOCK_MONTHLY'), '2026-03');
    assert.equal(periodKeyOf(at(2026, 3, 1, 2, 0), 'FOCUS_DAILY'), '2026-02-28');
  });
});

describe('dayStartOf / dayEndOf', () => {
  it('归属日从本地 04:00 开始，到次日 04:00 结束', () => {
    const ts = at(2026, 2, 14, 12, 0);
    assert.equal(dayStartOf(ts), at(2026, 2, 14, 4, 0));
    assert.equal(dayEndOf(ts), at(2026, 2, 15, 4, 0));
  });

  it('凌晨时间落在前一天的区间内', () => {
    const ts = at(2026, 2, 14, 2, 0);
    assert.equal(dayStartOf(ts), at(2026, 2, 13, 4, 0));
    assert.equal(dayEndOf(ts), at(2026, 2, 14, 4, 0));
  });

  it('区间长度恒为 24 小时', () => {
    for (const ts of [at(2026, 2, 14, 3, 0), at(2026, 2, 14, 5, 0), at(2028, 2, 29, 12, 0)]) {
      assert.equal(dayEndOf(ts) - dayStartOf(ts), 24 * 3_600_000);
    }
  });
});

describe('dayKeysBetween：区间展开', () => {
  it('含首尾，按天递增', () => {
    assert.deepEqual(dayKeysBetween(at(2026, 2, 12, 10), at(2026, 2, 14, 10)), [
      '2026-02-12',
      '2026-02-13',
      '2026-02-14',
    ]);
  });

  it('同一天返回单个', () => {
    assert.deepEqual(dayKeysBetween(at(2026, 2, 14, 5), at(2026, 2, 14, 23)), ['2026-02-14']);
  });

  it('结束早于开始返回空数组', () => {
    assert.deepEqual(dayKeysBetween(at(2026, 2, 14), at(2026, 2, 12)), []);
  });

  it('边界敏感的区间：跨过 04:00 会多出一天', () => {
    assert.deepEqual(dayKeysBetween(at(2026, 2, 14, 3, 0), at(2026, 2, 14, 5, 0)), [
      '2026-02-13',
      '2026-02-14',
    ]);
  });

  it('跨月正确', () => {
    assert.deepEqual(dayKeysBetween(at(2026, 2, 27, 12), at(2026, 3, 2, 12)), [
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('有防御性上限，不会无限循环', () => {
    const keys = dayKeysBetween(at(2020, 1, 1, 12), at(2030, 1, 1, 12));
    assert.ok(keys.length <= 400);
  });
});

describe('shiftDayKey：按天偏移', () => {
  it('正负偏移', () => {
    assert.equal(shiftDayKey('2026-02-14', 1), '2026-02-15');
    assert.equal(shiftDayKey('2026-02-14', -1), '2026-02-13');
    assert.equal(shiftDayKey('2026-02-14', 0), '2026-02-14');
  });

  it('跨月与跨年', () => {
    assert.equal(shiftDayKey('2026-02-28', 1), '2026-03-01');
    assert.equal(shiftDayKey('2026-12-31', 1), '2027-01-01');
    assert.equal(shiftDayKey('2026-01-01', -1), '2025-12-31');
  });

  it('闰年', () => {
    assert.equal(shiftDayKey('2028-02-28', 1), '2028-02-29');
    assert.equal(shiftDayKey('2028-02-29', 1), '2028-03-01');
    assert.equal(shiftDayKey('2026-02-28', 1), '2026-03-01', '2026 非闰年');
  });

  it('非法输入抛错（不静默返回垃圾值）', () => {
    assert.throws(() => shiftDayKey('abc', 1), /无效的 dayKey/);
    assert.throws(() => shiftDayKey('2026-13-99', 1), /无效的 dayKey/);
  });
});

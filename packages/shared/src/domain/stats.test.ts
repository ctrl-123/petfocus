/**
 * 统计聚合单测 —— 重点是「口径唯一」，以及演示数据绝不计入真实统计。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateByHour,
  aggregateDaily,
  focusHeatLevel,
  formatDuration,
  periodOverPeriod,
  previousRange,
  summarize,
  type AggregateInput,
} from './stats.ts';
import type { SessionStatInput } from '../types.ts';

const MIN = 60_000;
const HOUR = 3_600_000;
const D1 = '2026-02-12';
const D2 = '2026-02-13';
const D3 = '2026-02-14';

function session(partial: Partial<SessionStatInput> & { dayKey: string }): SessionStatInput {
  return {
    kind: 'FOCUS',
    status: 'SETTLED',
    effectiveMs: 0,
    violationMs: 0,
    ...partial,
  };
}

function emptyInput(): AggregateInput {
  return { sessions: [], tasks: [], coins: [], quota: [] };
}

describe('aggregateDaily：每日聚合口径', () => {
  it('缺失日为全 0，且顺序与传入 dayKeys 一致', () => {
    const daily = aggregateDaily(emptyInput(), { dayKeys: [D1, D2, D3] });
    assert.equal(daily.length, 3);
    assert.deepEqual(daily.map((d) => d.dayKey), [D1, D2, D3]);
    for (const d of daily) {
      assert.equal(d.focusMs, 0);
      assert.equal(d.tasksDone, 0);
    }
  });

  it('专注与锁机时长分别累计，且只用 effectiveMs', () => {
    const daily = aggregateDaily(
      {
        ...emptyInput(),
        sessions: [
          session({ dayKey: D1, kind: 'FOCUS', effectiveMs: 45 * MIN }),
          session({ dayKey: D1, kind: 'FOCUS', effectiveMs: 25 * MIN }),
          session({ dayKey: D1, kind: 'LOCK', effectiveMs: 90 * MIN }),
        ],
      },
      { dayKeys: [D1] },
    );
    assert.equal(daily[0]?.focusMs, 70 * MIN);
    assert.equal(daily[0]?.lockMs, 90 * MIN);
  });

  it('未结算的会话不计入时长（放弃/待结算/进行中）', () => {
    const daily = aggregateDaily(
      {
        ...emptyInput(),
        sessions: [
          session({ dayKey: D1, status: 'RUNNING', effectiveMs: 30 * MIN }),
          session({ dayKey: D1, status: 'ABANDONED', effectiveMs: 30 * MIN }),
          session({ dayKey: D1, status: 'AWAITING_SETTLEMENT', effectiveMs: 30 * MIN }),
          session({ dayKey: D1, status: 'SETTLED', effectiveMs: 30 * MIN }),
        ],
      },
      { dayKeys: [D1] },
    );
    assert.equal(daily[0]?.focusMs, 30 * MIN);
  });

  it('违规时长对所有状态都统计（包括放弃的会话）', () => {
    const daily = aggregateDaily(
      {
        ...emptyInput(),
        sessions: [
          session({ dayKey: D1, status: 'ABANDONED', violationMs: 40_000 }),
          session({ dayKey: D1, status: 'SETTLED', violationMs: 20_000 }),
        ],
      },
      { dayKeys: [D1] },
    );
    assert.equal(daily[0]?.violationMs, 60_000);
  });

  it('任务：计划数与完成数分别统计', () => {
    const daily = aggregateDaily(
      {
        ...emptyInput(),
        tasks: [
          { dayKey: D1, status: 'DONE' },
          { dayKey: D1, status: 'DONE' },
          { dayKey: D1, status: 'MISSED' },
          { dayKey: D1, status: 'SKIPPED' },
          { dayKey: D1, status: 'PENDING' },
        ],
      },
      { dayKeys: [D1] },
    );
    assert.equal(daily[0]?.tasksPlanned, 5);
    assert.equal(daily[0]?.tasksDone, 2);
  });

  it('金币：收入与支出分开累计，支出取绝对值', () => {
    const daily = aggregateDaily(
      {
        ...emptyInput(),
        coins: [
          { dayKey: D1, amount: 46, kind: 'FOCUS_DONE' },
          { dayKey: D1, amount: 18, kind: 'LOCK_DONE' },
          { dayKey: D1, amount: -50, kind: 'PENALTY' },
          { dayKey: D1, amount: -150, kind: 'PURCHASE' },
        ],
      },
      { dayKeys: [D1] },
    );
    assert.equal(daily[0]?.coinEarned, 64);
    assert.equal(daily[0]?.coinSpent, 200);
  });

  it('演示数据（DEMO）绝不计入真实统计', () => {
    const daily = aggregateDaily(
      {
        ...emptyInput(),
        coins: [
          { dayKey: D1, amount: 1000, kind: 'DEMO' },
          { dayKey: D1, amount: 46, kind: 'FOCUS_DONE' },
        ],
      },
      { dayKeys: [D1] },
    );
    assert.equal(daily[0]?.coinEarned, 46);
  });

  it('配额消耗只统计 CONSUME，且只在 periodKey 为「日」时归属到当天', () => {
    const daily = aggregateDaily(
      {
        ...emptyInput(),
        quota: [
          { scope: 'FOCUS_DAILY', kind: 'GRANT', periodKey: D1 },
          { scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: D1 },
          { scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: D1 },
          { scope: 'FOCUS_DAILY', kind: 'REFUND', periodKey: D1 },
          // 月度周期键（'2026-02'）不是某一天，不应计入任何日
          { scope: 'FOCUS_MONTHLY', kind: 'CONSUME', periodKey: '2026-02' },
          { scope: 'LOCK_MONTHLY', kind: 'CONSUME', periodKey: '2026-02' },
        ],
      },
      { dayKeys: [D1] },
    );
    assert.equal(daily[0]?.quotaConsumed, 2);
  });

  it('不在 dayKeys 范围内的记录被忽略', () => {
    const daily = aggregateDaily(
      {
        ...emptyInput(),
        sessions: [session({ dayKey: '2026-01-01', effectiveMs: 99 * MIN })],
      },
      { dayKeys: [D1] },
    );
    assert.equal(daily[0]?.focusMs, 0);
  });
});

describe('summarize：区间汇总', () => {
  const input: AggregateInput = {
    sessions: [
      session({ dayKey: D1, kind: 'FOCUS', effectiveMs: 45 * MIN }),
      session({ dayKey: D2, kind: 'FOCUS', effectiveMs: 30 * MIN }),
      session({ dayKey: D3, kind: 'LOCK', effectiveMs: 60 * MIN }),
      session({ dayKey: D3, kind: 'FOCUS', violationMs: 90_000 }),
    ],
    tasks: [
      { dayKey: D1, status: 'DONE' },
      { dayKey: D1, status: 'DONE' },
      { dayKey: D2, status: 'DONE' },
      { dayKey: D2, status: 'MISSED' },
    ],
    coins: [{ dayKey: D1, amount: 46, kind: 'FOCUS_DONE' }],
    quota: [{ scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: D2 }],
  };

  it('汇总口径与每日聚合一致（交叉验证）', () => {
    const daily = aggregateDaily(input, { dayKeys: [D1, D2, D3] });
    const sum = summarize(daily);

    assert.equal(sum.focusMs, 75 * MIN);
    assert.equal(sum.lockMs, 60 * MIN);
    assert.equal(sum.tasksPlanned, 4);
    assert.equal(sum.tasksDone, 3);
    assert.equal(sum.completionRate, 0.75);
    assert.equal(sum.coinEarned, 46);
    assert.equal(sum.violationMs, 90_000);
    assert.equal(sum.quotaConsumed, 1);
    assert.equal(sum.activeDays, 3);
  });

  it('无计划任务时完成率为 null（而不是 0 或 NaN）', () => {
    const sum = summarize(aggregateDaily(emptyInput(), { dayKeys: [D1] }));
    assert.equal(sum.completionRate, null);
  });

  it('activeDays 只算有专注或锁机的天', () => {
    const sum = summarize(
      aggregateDaily(
        { ...emptyInput(), tasks: [{ dayKey: D1, status: 'DONE' }] },
        { dayKeys: [D1, D2] },
      ),
    );
    assert.equal(sum.activeDays, 0);
  });
});

describe('periodOverPeriod：环比', () => {
  it('正常计算增长率', () => {
    assert.equal(periodOverPeriod(120, 100), 0.2);
    assert.equal(periodOverPeriod(80, 100), -0.2);
    assert.equal(periodOverPeriod(100, 100), 0);
  });

  it('上期为 0 时返回 null（UI 显示「—」，绝不显示 Infinity）', () => {
    assert.equal(periodOverPeriod(50, 0), null);
    assert.equal(periodOverPeriod(0, 0), null);
  });

  it('非有限输入返回 null', () => {
    assert.equal(periodOverPeriod(Number.NaN, 100), null);
    assert.equal(periodOverPeriod(50, Number.POSITIVE_INFINITY), null);
  });
});

describe('focusHeatLevel：专注日历五档 [PRD AC-4.2.3]', () => {
  it('按 0 / 1–30 / 31–60 / 61–120 / >120 分钟分档', () => {
    assert.equal(focusHeatLevel(0), 0);
    assert.equal(focusHeatLevel(1), 1);
    assert.equal(focusHeatLevel(30 * MIN), 1);
    assert.equal(focusHeatLevel(30 * MIN + 1), 2);
    assert.equal(focusHeatLevel(60 * MIN), 2);
    assert.equal(focusHeatLevel(60 * MIN + 1), 3);
    assert.equal(focusHeatLevel(120 * MIN), 3);
    assert.equal(focusHeatLevel(120 * MIN + 1), 4);
    assert.equal(focusHeatLevel(10 * HOUR), 4);
  });

  it('负数与非法值按 0 档（空格子）处理', () => {
    assert.equal(focusHeatLevel(-1), 0);
    assert.equal(focusHeatLevel(Number.NaN), 0);
  });
});

describe('aggregateByHour：时段分布 [PRD AC-4.2.5]', () => {
  it('返回 24 个桶，按起始小时归类', () => {
    const buckets = aggregateByHour([
      { kind: 'FOCUS', startHour: 9, effectiveMs: 45 * MIN, status: 'SETTLED' },
      { kind: 'FOCUS', startHour: 9, effectiveMs: 15 * MIN, status: 'SETTLED' },
      { kind: 'LOCK', startHour: 22, effectiveMs: 60 * MIN, status: 'SETTLED' },
    ]);
    assert.equal(buckets.length, 24);
    assert.equal(buckets[9]?.focusMs, 60 * MIN);
    assert.equal(buckets[22]?.lockMs, 60 * MIN);
    assert.equal(buckets[0]?.focusMs, 0);
  });

  it('未结算会话不计入；非法小时被忽略', () => {
    const buckets = aggregateByHour([
      { kind: 'FOCUS', startHour: 9, effectiveMs: 45 * MIN, status: 'ABANDONED' },
      { kind: 'FOCUS', startHour: 99, effectiveMs: 45 * MIN, status: 'SETTLED' },
      { kind: 'FOCUS', startHour: -1, effectiveMs: 45 * MIN, status: 'SETTLED' },
    ]);
    assert.equal(buckets.reduce((s, b) => s + b.focusMs, 0), 0);
  });
});

describe('previousRange：构造对照区间', () => {
  it('整体往前偏移 N 天', () => {
    const prev = previousRange({ dayKeys: [D2, D3] }, 2);
    assert.deepEqual(prev.dayKeys, ['2026-02-11', '2026-02-12']);
  });

  it('跨月边界正确', () => {
    const prev = previousRange({ dayKeys: ['2026-03-01'] }, 1);
    assert.deepEqual(prev.dayKeys, ['2026-02-28']);
  });
});

describe('formatDuration：给图表的文本等价物（无障碍 NFR-5.4）', () => {
  it('按小时/分钟格式化', () => {
    assert.equal(formatDuration(0), '0 分钟');
    assert.equal(formatDuration(-100), '0 分钟');
    assert.equal(formatDuration(25 * MIN), '25 分钟');
    assert.equal(formatDuration(60 * MIN), '1 小时');
    assert.equal(formatDuration(107 * MIN), '1 小时 47 分钟');
    assert.equal(formatDuration(Number.NaN), '0 分钟');
  });
});

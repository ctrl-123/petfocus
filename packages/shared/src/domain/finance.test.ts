/**
 * 记账领域逻辑单测。
 * 重点在**金额精度**：记账场景下浮点误差会一路累积到月度汇总。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_BUILTIN_CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  budgetStatus,
  builtinCategoriesOf,
  dailyAllowance,
  formatMoney,
  formatSignedMoney,
  parseAmountToCents,
  splitBill,
  summarizeByDay,
  summarizeFinance,
  type FinanceEntryLike,
} from './finance.ts';

function entry(partial: Partial<FinanceEntryLike>): FinanceEntryLike {
  return {
    dayKey: '2026-02-14',
    type: 'EXPENSE',
    amountCents: 1000,
    categoryId: 'cat-food',
    ...partial,
  };
}

describe('内置分类', () => {
  it('支出与收入分类都非空', () => {
    assert.ok(EXPENSE_CATEGORIES.length > 0);
    assert.ok(INCOME_CATEGORIES.length > 0);
  });

  it('分类 id 唯一', () => {
    const ids = ALL_BUILTIN_CATEGORIES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('两类都有"其他"作为兜底', () => {
    assert.ok(EXPENSE_CATEGORIES.some((c) => c.name === '其他'));
    assert.ok(INCOME_CATEGORIES.some((c) => c.name === '其他'));
  });

  it('builtinCategoriesOf 按类型返回', () => {
    assert.equal(builtinCategoriesOf('EXPENSE').length, EXPENSE_CATEGORIES.length);
    assert.equal(builtinCategoriesOf('INCOME').length, INCOME_CATEGORIES.length);
  });

  it('分类都带图标与名称（UI 直接渲染）', () => {
    for (const cat of ALL_BUILTIN_CATEGORIES) {
      assert.ok(cat.name.length > 0, `${cat.id} 缺名称`);
      assert.ok(cat.icon.length > 0, `${cat.id} 缺图标`);
    }
  });
});

describe('parseAmountToCents：金额解析（避免浮点）', () => {
  it('整数元', () => {
    assert.equal(parseAmountToCents('12'), 1200);
    assert.equal(parseAmountToCents('0'), 0);
  });

  it('一位小数按角补齐', () => {
    assert.equal(parseAmountToCents('1.5'), 150, '1.5 元 = 150 分');
  });

  it('两位小数', () => {
    assert.equal(parseAmountToCents('12.34'), 1234);
    assert.equal(parseAmountToCents('0.01'), 1);
  });

  it('1.005 这类三位小数被拒绝（而不是悄悄算错）', () => {
    // Math.round(parseFloat('1.005') * 100) 会得到 100，少 1 分；这里直接拒绝
    assert.equal(parseAmountToCents('1.005'), undefined);
  });

  it('容忍货币符号、千分位与空格', () => {
    assert.equal(parseAmountToCents('¥1,234.50'), 123450);
    assert.equal(parseAmountToCents(' 88 '), 8800);
  });

  it('拒绝非法输入（交给调用方提示，不默默记成 0）', () => {
    for (const bad of ['', '  ', 'abc', '-5', '1.2.3', '五块', '1e3']) {
      assert.equal(parseAmountToCents(bad), undefined, `「${bad}」应被拒绝`);
    }
  });

  it('大额不出精度问题', () => {
    assert.equal(parseAmountToCents('999999.99'), 99999999);
  });
});

describe('formatMoney：展示格式', () => {
  it('整数元不显示小数', () => {
    assert.equal(formatMoney(1200), '12');
  });

  it('有分时显示两位', () => {
    assert.equal(formatMoney(1234), '12.34');
    assert.equal(formatMoney(1205), '12.05');
  });

  it('负数带符号（用于净额）', () => {
    assert.equal(formatMoney(-1234), '-12.34');
    assert.equal(formatMoney(-100), '-1');
  });

  it('0 显示为 0', () => {
    assert.equal(formatMoney(0), '0');
  });

  it('formatSignedMoney 用支出/收入区分符号', () => {
    assert.equal(formatSignedMoney(1234, 'EXPENSE'), '−12.34');
    assert.equal(formatSignedMoney(1234, 'INCOME'), '+12.34');
  });

  it('格式化后再解析回来能得到原值（往返一致）', () => {
    for (const cents of [0, 1, 99, 100, 1234, 99999999, -1234]) {
      const text = formatMoney(cents);
      const back = parseAmountToCents(text.startsWith('-') ? text.slice(1) : text);
      assert.equal(back, Math.abs(cents), `${cents} 往返不一致`);
    }
  });
});

describe('summarizeFinance：汇总', () => {
  it('空记录返回全 0', () => {
    const summary = summarizeFinance([]);
    assert.equal(summary.incomeCents, 0);
    assert.equal(summary.expenseCents, 0);
    assert.equal(summary.netCents, 0);
    assert.equal(summary.entryCount, 0);
  });

  it('收入与支出分开累加', () => {
    const summary = summarizeFinance([
      entry({ amountCents: 3000 }),
      entry({ type: 'INCOME', amountCents: 10000, categoryId: 'cat-salary' }),
    ]);
    assert.equal(summary.expenseCents, 3000);
    assert.equal(summary.incomeCents, 10000);
    assert.equal(summary.netCents, 7000);
  });

  it('支出大于收入时净额为负（如实呈现，不评判）', () => {
    const summary = summarizeFinance([entry({ amountCents: 5000 })]);
    assert.equal(summary.netCents, -5000);
  });

  it('按分类汇总并降序', () => {
    const summary = summarizeFinance([
      entry({ amountCents: 1000, categoryId: 'cat-food' }),
      entry({ amountCents: 2000, categoryId: 'cat-transport' }),
      entry({ amountCents: 500, categoryId: 'cat-food' }),
    ]);
    assert.equal(summary.expenseByCategory[0]?.categoryId, 'cat-transport');
    assert.equal(summary.expenseByCategory[0]?.amountCents, 2000);
    assert.equal(summary.expenseByCategory[1]?.categoryId, 'cat-food');
    assert.equal(summary.expenseByCategory[1]?.amountCents, 1500);
    assert.equal(summary.expenseByCategory[1]?.count, 2);
  });

  it('可限定 dayKey 区间', () => {
    const summary = summarizeFinance(
      [
        entry({ dayKey: '2026-02-14', amountCents: 1000 }),
        entry({ dayKey: '2026-01-01', amountCents: 9999 }),
      ],
      ['2026-02-14'],
    );
    assert.equal(summary.expenseCents, 1000);
  });

  it('小数分被归一到整数（防止脏数据污染汇总）', () => {
    const summary = summarizeFinance([entry({ amountCents: 1000.6 })]);
    assert.equal(summary.expenseCents, 1001);
  });

  it('大量记录累加无浮点误差', () => {
    // 0.1 元的 1000 笔应是 10000 分（而非 10000.000000000002）
    const many = Array.from({ length: 1000 }, () => entry({ amountCents: 10 }));
    const summary = summarizeFinance(many);
    assert.equal(summary.expenseCents, 10000);
    assert.equal(Number.isInteger(summary.expenseCents), true);
  });
});

describe('summarizeByDay：按日汇总', () => {
  it('缺失日为 0 且顺序与传入一致', () => {
    const rows = summarizeByDay([entry({ dayKey: '2026-02-13', amountCents: 500 })], [
      '2026-02-12',
      '2026-02-13',
      '2026-02-14',
    ]);
    assert.deepEqual(rows.map((r) => r.dayKey), ['2026-02-12', '2026-02-13', '2026-02-14']);
    assert.equal(rows[0]?.expenseCents, 0);
    assert.equal(rows[1]?.expenseCents, 500);
  });

  it('收入与支出分别落在日上', () => {
    const rows = summarizeByDay(
      [
        entry({ dayKey: '2026-02-14', amountCents: 1000 }),
        entry({ dayKey: '2026-02-14', type: 'INCOME', amountCents: 2000 }),
      ],
      ['2026-02-14'],
    );
    assert.equal(rows[0]?.expenseCents, 1000);
    assert.equal(rows[0]?.incomeCents, 2000);
  });

  it('区间外的记录被忽略', () => {
    const rows = summarizeByDay([entry({ dayKey: '2020-01-01' })], ['2026-02-14']);
    assert.equal(rows[0]?.expenseCents, 0);
  });
});

describe('budgetStatus：预算档位', () => {
  it('未设预算时等级为 NONE（不误报）', () => {
    const status = budgetStatus(0, 5000);
    assert.equal(status.level, 'NONE');
    assert.equal(status.usedRatio, 0);
  });

  it('各档位阈值正确', () => {
    assert.equal(budgetStatus(10000, 1000).level, 'SAFE');
    assert.equal(budgetStatus(10000, 7000).level, 'WATCH', '70% 起进入关注档');
    assert.equal(budgetStatus(10000, 9000).level, 'NEAR', '90% 起进入接近档');
    assert.equal(budgetStatus(10000, 10000).level, 'NEAR', '刚好用满不算超');
    assert.equal(budgetStatus(10000, 10001).level, 'OVER');
  });

  it('剩余额度可为负（超支是事实）', () => {
    const status = budgetStatus(10000, 12000);
    assert.equal(status.remainingCents, -2000);
    assert.ok(status.usedRatio > 1);
  });

  it('只返回等级与数字，不含任何评语（文案原则）', () => {
    const status = budgetStatus(10000, 12000);
    // 结构里只有数字字段，没有 message/text 之类的评语字段
    assert.deepEqual(Object.keys(status).sort(), [
      'level',
      'limitCents',
      'remainingCents',
      'spentCents',
      'usedRatio',
    ]);
  });
});

describe('dailyAllowance：每日可用额度', () => {
  it('按剩余天数均分并向下取整（不虚报）', () => {
    assert.equal(dailyAllowance(10000, 3), 3333);
  });

  it('剩余天数为 0 或负数时为 0', () => {
    assert.equal(dailyAllowance(10000, 0), 0);
    assert.equal(dailyAllowance(10000, -1), 0);
  });

  it('已超支时为 0（不显示负数额度）', () => {
    assert.equal(dailyAllowance(-500, 5), 0);
  });
});

describe('splitBill：拆账', () => {
  it('整除时各份相等', () => {
    assert.deepEqual(splitBill(10000, 4), [2500, 2500, 2500, 2500]);
  });

  it('有余数时前几份多 1 分，且总和恰好等于总额', () => {
    const parts = splitBill(10000, 3);
    assert.equal(parts.reduce((a, b) => a + b, 0), 10000, '各份之和必须等于总额');
    assert.deepEqual(parts, [3334, 3333, 3333]);
  });

  it('1 分钱分给 3 个人不会凭空变多', () => {
    const parts = splitBill(1, 3);
    assert.equal(parts.reduce((a, b) => a + b, 0), 1);
  });

  it('各种总额与人数都不丢分', () => {
    for (const total of [1, 7, 99, 100, 12345, 999999]) {
      for (const parts of [1, 2, 3, 7, 13]) {
        const list = splitBill(total, parts);
        assert.equal(
          list.reduce((a, b) => a + b, 0),
          total,
          `${total} 分给 ${parts} 人时总额对不上`,
        );
        assert.equal(list.length, parts);
      }
    }
  });

  it('人数非法时返回空数组', () => {
    assert.deepEqual(splitBill(100, 0), []);
    assert.deepEqual(splitBill(100, -2), []);
  });
});

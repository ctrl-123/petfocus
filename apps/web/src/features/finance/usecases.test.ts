/**
 * 记账用例层集成测试（真实 Dexie + fake-indexeddb）。
 * 重点：**金额精度**（整数分）与**内置分类的幂等补齐**。
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
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, MODULE_COIN, formatMoney } from '@petfocus/shared';
import {
  addEntry,
  ensureCategories,
  isFinanceStoreReady,
  loadDay,
  loadMonth,
  loadTrend,
  removeEntry,
  setMonthBudget,
} from './usecases.ts';

const NOW = new Date(2026, 1, 14, 12, 0, 0, 0).getTime();
const DAY = 86_400_000;

let db: PetFocusDb | undefined;
let dbName = '';

beforeEach(async () => {
  dbName = `pf-fin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

describe('运行时就绪守卫', () => {
  it('未就绪时为 false', () => {
    resetRuntime();
    assert.equal(isFinanceStoreReady(), false);
  });
});

describe('ensureCategories：内置分类的幂等补齐', () => {
  it('首次调用写入全部内置分类', async () => {
    const cats = await ensureCategories();
    const expected = EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length;
    assert.equal(cats.length, expected);
  });

  it('重复调用不会产生重复（幂等）', async () => {
    await ensureCategories();
    const second = await ensureCategories();
    const expected = EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length;
    assert.equal(second.length, expected, '不应重复写入');
  });

  it('返回结果按 order 排序', async () => {
    const cats = await ensureCategories();
    const orders = cats.map((c) => c.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });

  it('不覆盖用户自定义分类', async () => {
    await repos().finance.putCategory({
      id: 'my-custom',
      name: '自定义',
      icon: '⭐',
      type: 'EXPENSE',
      isBuiltin: false,
      order: 50,
    });
    const cats = await ensureCategories();
    assert.ok(cats.some((c) => c.id === 'my-custom'));
    assert.equal(cats.find((c) => c.id === 'my-custom')?.isBuiltin, false);
  });
});

describe('addEntry：记账与金额精度', () => {
  it('整数元正确转为分', async () => {
    const result = await addEntry({ amountText: '12', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.entry?.amountCents, 1200);
    assert.equal(result.entry?.dayKey, '2026-02-14');
    assert.equal(result.entry?.type, 'EXPENSE');
  });

  it('带小数的金额正确转为分（无浮点误差）', async () => {
    const result = await addEntry({ amountText: '12.34', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    assert.equal(result.entry?.amountCents, 1234);
  });

  it('非法金额被拒绝且不落盘', async () => {
    const result = await addEntry({ amountText: 'abc', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.entry, undefined);
    assert.equal((await repos().finance.all()).length, 0);
  });

  it('金额为 0 被拒绝（记账不该有 0 元流水）', async () => {
    const result = await addEntry({ amountText: '0', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    assert.equal(result.ok, false);
  });

  it('未选分类被拒绝', async () => {
    const result = await addEntry({ amountText: '10', type: 'EXPENSE', categoryId: '' }, NOW);
    assert.equal(result.ok, false);
  });

  it('备注为空时不写入该字段', async () => {
    const result = await addEntry(
      { amountText: '10', type: 'EXPENSE', categoryId: 'cat-food', note: '   ' },
      NOW,
    );
    assert.equal('note' in (result.entry ?? {}), false);
  });

  it('大量小额记录累加无浮点误差', async () => {
    for (let i = 0; i < 100; i += 1) {
      await addEntry({ amountText: '0.1', type: 'EXPENSE', categoryId: 'cat-food' }, NOW + i);
    }
    const day = await loadDay(NOW);
    assert.equal(day.summary.expenseCents, 1000, '100 笔 0.1 元 = 10 元 = 1000 分');
    assert.equal(Number.isInteger(day.summary.expenseCents), true);
  });
});

describe('记账金币与每日上限', () => {
  it('前几笔给币', async () => {
    const result = await addEntry({ amountText: '10', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    assert.equal(result.coinEarned, MODULE_COIN.financePerEntry);
    assert.equal(await repos().coinLedger.balance(), MODULE_COIN.financePerEntry);
  });

  it('达到每日上限后不再给币，但仍能记账', async () => {
    for (let i = 0; i < MODULE_COIN.financeDailyMax; i += 1) {
      await addEntry({ amountText: '10', type: 'EXPENSE', categoryId: 'cat-food' }, NOW + i);
    }
    const over = await addEntry({ amountText: '10', type: 'EXPENSE', categoryId: 'cat-food' }, NOW + 100);

    assert.equal(over.ok, true, '超过上限仍应记账成功');
    assert.equal(over.coinEarned, 0);
    assert.match(over.message, /已拿满/);
    assert.equal((await repos().finance.all()).length, MODULE_COIN.financeDailyMax + 1);
  });

  it('余额与流水求和一致', async () => {
    await addEntry({ amountText: '10', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    await addEntry({ amountText: '20', type: 'EXPENSE', categoryId: 'cat-food' }, NOW + 1);
    const rows = await repos().coinLedger.all();
    assert.equal(await repos().coinLedger.balance(), rows.reduce((a, r) => a + r.amount, 0));
  });

  it('删除记录不扣回金币', async () => {
    await addEntry({ amountText: '10', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    const rows = await repos().finance.all();
    await removeEntry(rows[0]!.id);
    assert.equal(await repos().coinLedger.balance(), MODULE_COIN.financePerEntry);
  });
});

describe('loadDay：当日明细', () => {
  it('空库时全 0', async () => {
    const day = await loadDay(NOW);
    assert.equal(day.dayKey, '2026-02-14');
    assert.equal(day.entries.length, 0);
    assert.equal(day.summary.expenseCents, 0);
  });

  it('按录入时间倒序（最新的在最上面）', async () => {
    await addEntry({ amountText: '10', type: 'EXPENSE', categoryId: 'cat-food', note: '早' }, NOW);
    await addEntry({ amountText: '20', type: 'EXPENSE', categoryId: 'cat-food', note: '晚' }, NOW + 1000);
    const day = await loadDay(NOW);
    assert.equal(day.entries[0]?.note, '晚');
  });

  it('只含当天的记录', async () => {
    await addEntry({ amountText: '10', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    await addEntry({ amountText: '99', type: 'EXPENSE', categoryId: 'cat-food' }, NOW - DAY);
    const day = await loadDay(NOW);
    assert.equal(day.entries.length, 1);
    assert.equal(day.summary.expenseCents, 1000);
  });
});

describe('loadMonth：月度汇总与预算', () => {
  it('本月的收支分开统计，且不含其他月份', async () => {
    await addEntry({ amountText: '100', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    await addEntry({ amountText: '5000', type: 'INCOME', categoryId: 'cat-salary' }, NOW);
    // 上个月
    await addEntry({ amountText: '999', type: 'EXPENSE', categoryId: 'cat-food' }, NOW - 31 * DAY);

    const month = await loadMonth(NOW);
    assert.equal(month.summary.expenseCents, 10000);
    assert.equal(month.summary.incomeCents, 500000);
    assert.equal(month.summary.netCents, 490000);
  });

  it('未设预算时等级为 NONE（不误报超支）', async () => {
    await addEntry({ amountText: '100', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    const month = await loadMonth(NOW);
    assert.equal(month.budget.level, 'NONE');
  });

  it('设置预算后给出进度与每日可用额度', async () => {
    const ok = await setMonthBudget('2026-02', '3000');
    assert.equal(ok, true);
    await addEntry({ amountText: '600', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);

    const month = await loadMonth(NOW);
    assert.equal(month.budget.limitCents, 300000);
    assert.equal(month.budget.spentCents, 60000);
    assert.equal(month.budget.level, 'SAFE');
    assert.ok(month.remainingDays > 0);
    assert.ok(month.dailyAllowanceCents > 0);
    // 每日额度按剩余天数均分
    assert.equal(
      month.dailyAllowanceCents,
      Math.floor((300000 - 60000) / month.remainingDays),
    );
  });

  it('非法预算金额被拒绝', async () => {
    const ok = await setMonthBudget('2026-02', '三千');
    assert.equal(ok, false);
    assert.equal((await repos().finance.budgets()).length, 0);
  });

  it('空预算输入等于取消预算', async () => {
    await setMonthBudget('2026-02', '3000');
    const ok = await setMonthBudget('2026-02', '');
    assert.equal(ok, true);
    const month = await loadMonth(NOW);
    assert.equal(month.budget.level, 'NONE');
  });

  it('分类名称映射齐全（UI 不用自己查）', async () => {
    const month = await loadMonth(NOW);
    assert.ok(month.categoryNames['cat-food']);
    assert.equal(month.categoryNames['cat-food']?.name, '餐饮');
    assert.ok(month.categoryNames['cat-salary']);
  });

  it('daily 数组覆盖整月且缺失日为 0', async () => {
    const month = await loadMonth(NOW);
    assert.ok(month.daily.length >= 28, '2 月至少 28 天');
    const today = month.daily.find((d) => d.dayKey === '2026-02-14');
    assert.ok(today);
    assert.equal(today.expenseCents, 0);
  });

  it('超支时净额为负且预算等级为 OVER（如实呈现）', async () => {
    await setMonthBudget('2026-02', '100');
    await addEntry({ amountText: '150', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    const month = await loadMonth(NOW);
    assert.equal(month.budget.level, 'OVER');
    assert.ok(month.budget.remainingCents < 0);
    assert.equal(month.summary.netCents, -15000);
  });
});

describe('loadTrend：近 N 天收支', () => {
  it('返回正确天数且升序', async () => {
    const trend = await loadTrend(NOW, 14);
    assert.equal(trend.length, 14);
    const keys = trend.map((d) => d.dayKey);
    assert.deepEqual(keys, [...keys].sort());
  });

  it('今天的记录体现在最后一天', async () => {
    await addEntry({ amountText: '88', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    const trend = await loadTrend(NOW, 14);
    assert.equal(trend.at(-1)?.expenseCents, 8800);
  });

  it('没有记录的日子为 0', async () => {
    const trend = await loadTrend(NOW, 3);
    assert.ok(trend.every((d) => d.expenseCents === 0 && d.incomeCents === 0));
  });
});

describe('金额展示往返（在真实数据上验证）', () => {
  it('存入的分与展示的元一致', async () => {
    await addEntry({ amountText: '1234.56', type: 'EXPENSE', categoryId: 'cat-food' }, NOW);
    const day = await loadDay(NOW);
    assert.equal(day.summary.expenseCents, 123456);
    assert.equal(formatMoney(day.summary.expenseCents), '1234.56');
  });
});

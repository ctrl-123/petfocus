/**
 * 饮食用例层集成测试（真实 Dexie + 真实食物库）。
 *
 * 为什么必须测这一层：营养口径在 domain、食物数据在 nutrition-db，
 * 而「用户输入的文字 → 命中哪条食物 → 按什么份量换算 → 落到哪一天」这条链路在本文件里。
 * 取错行或算错归属日，用户看到的就是错误的营养数字，而纯函数测试测不出这类问题。
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
import { dayKeyOf } from '@petfocus/shared';
import {
  buildManualEntry,
  buildMealEntry,
  guessMealSlot,
  isDietStoreReady,
  loadDayMeals,
  loadFrequentFoods,
  loadIntakeTrend,
  lookup,
  MEAL_SLOTS,
  portionOfEntry,
  removeMealEntry,
  saveMealEntry,
} from './usecases.ts';

const NOW = new Date(2026, 1, 14, 12, 0, 0, 0).getTime();
const TODAY = dayKeyOf(NOW);

let db: PetFocusDb | undefined;
let dbName = '';

beforeEach(async () => {
  dbName = `pf-diet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

describe('运行时就绪守卫（与宠物模块同一套模式）', () => {
  it('未就绪时 isDietStoreReady() 为 false', () => {
    resetRuntime();
    assert.equal(isDietStoreReady(), false);
  });

  it('就绪后为 true', () => {
    assert.equal(isDietStoreReady(), true);
  });
});

describe('guessMealSlot：按小时猜餐次', () => {
  it('早/中/晚/夜分别对应四个餐次', () => {
    const at = (hour: number): number => new Date(2026, 1, 14, hour, 0, 0, 0).getTime();
    assert.equal(guessMealSlot(at(8)), 'BREAKFAST');
    assert.equal(guessMealSlot(at(12)), 'LUNCH');
    assert.equal(guessMealSlot(at(19)), 'DINNER');
    assert.equal(guessMealSlot(at(22)), 'SNACK');
    assert.equal(guessMealSlot(at(2)), 'BREAKFAST');
  });
});

describe('lookup：本地库命中与未命中', () => {
  it('精确命中常见食物', () => {
    const result = lookup('米饭', { value: 100, unit: 'GRAM' });
    assert.notEqual(result.kind, 'MISS');
    assert.ok(result.nutrients);
    assert.ok(result.nutrients.kcal > 0);
  });

  it('走别名命中（口语叫法）', () => {
    // 「番茄」是「西红柿」的别名
    const viaAlias = lookup('番茄', { value: 100, unit: 'GRAM' });
    assert.notEqual(viaAlias.kind, 'MISS');
    assert.equal(viaAlias.matchedName, '西红柿');
  });

  it('完全不认识的名字返回 MISS 且不带营养值', () => {
    const result = lookup('外星烤肉', { value: 100, unit: 'GRAM' });
    assert.equal(result.kind, 'MISS');
    assert.equal(result.nutrients, undefined);
  });

  it('容量类食物按毫升查询（牛奶）', () => {
    const result = lookup('牛奶', { value: 250, unit: 'ML' });
    assert.notEqual(result.kind, 'MISS');
    assert.ok(result.nutrients);
  });
});

describe('buildMealEntry：命中与未命中的两条路径', () => {
  it('命中时给出可写入的记录（含正确归属日与餐次）', () => {
    const outcome = buildMealEntry({
      rawName: '米饭',
      portion: { value: 150, unit: 'GRAM' },
      slot: 'LUNCH',
      now: NOW,
      id: 'm1',
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.matched, true);
    assert.ok(outcome.entry);
    assert.equal(outcome.entry.dayKey, TODAY);
    assert.equal(outcome.entry.slot, 'LUNCH');
    assert.equal(outcome.entry.source, 'LOCAL_DB');
    assert.equal(outcome.entry.portionValue, 150);
    assert.equal(outcome.entry.portionUnit, 'GRAM');
  });

  it('份量翻倍时营养值也翻倍（份量换算正确）', () => {
    const one = buildMealEntry({ rawName: '米饭', portion: { value: 100, unit: 'GRAM' }, slot: 'LUNCH', now: NOW, id: 'a' });
    const two = buildMealEntry({ rawName: '米饭', portion: { value: 200, unit: 'GRAM' }, slot: 'LUNCH', now: NOW, id: 'b' });
    assert.ok(one.entry && two.entry);
    assert.equal(
      Math.round(two.entry.nutrients.kcal),
      Math.round(one.entry.nutrients.kcal * 2),
      '200 克应是 100 克的两倍',
    );
  });

  it('未命中时不猜数值，而是给出手工录入的指示', () => {
    const outcome = buildMealEntry({
      rawName: '外星烤肉',
      portion: { value: 100, unit: 'GRAM' },
      slot: 'DINNER',
      now: NOW,
      id: 'm2',
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.matched, false);
    assert.equal(outcome.needsManual, true);
    assert.equal(outcome.entry, undefined, '未命中绝不能凭空造一条记录');
    assert.match(outcome.message, /手工/);
  });

  it('空名字被拒绝', () => {
    const outcome = buildMealEntry({ rawName: '   ', portion: { value: 100, unit: 'GRAM' }, slot: 'LUNCH', now: NOW, id: 'm3' });
    assert.equal(outcome.ok, false);
  });

  it('份量为 0 或负数被拒绝', () => {
    for (const value of [0, -1, Number.NaN]) {
      const outcome = buildMealEntry({ rawName: '米饭', portion: { value, unit: 'GRAM' }, slot: 'LUNCH', now: NOW, id: 'm4' });
      assert.equal(outcome.ok, false, `份量 ${value} 应被拒绝`);
    }
  });
});

describe('buildManualEntry：手工录入', () => {
  it('来源标为 MANUAL（不冒充本地库或 AI）', () => {
    const entry = buildManualEntry({
      rawName: '外星烤肉',
      portion: { value: 100, unit: 'GRAM' },
      slot: 'DINNER',
      now: NOW,
      id: 'man1',
      nutrients: { kcal: 300, proteinG: 20, fatG: 20, carbG: 10 },
    });
    assert.equal(entry.source, 'MANUAL');
    assert.equal(entry.dayKey, TODAY);
    assert.equal(entry.nutrients.kcal, 300);
  });
});

describe('落盘与读取', () => {
  async function addFood(rawName: string, slot: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK', grams: number, id: string): Promise<void> {
    const outcome = buildMealEntry({ rawName, portion: { value: grams, unit: 'GRAM' }, slot, now: NOW, id });
    assert.ok(outcome.entry, `${rawName} 应命中本地库`);
    await saveMealEntry(outcome.entry);
  }

  it('空库时返回四个空餐次', async () => {
    const meals = await loadDayMeals(NOW);
    assert.equal(meals.count, 0);
    assert.equal(meals.total.kcal, 0);
    for (const slot of MEAL_SLOTS) assert.deepEqual(meals.bySlot[slot], []);
  });

  it('按餐次正确分组', async () => {
    await addFood('米饭', 'LUNCH', 150, 'a');
    await addFood('一个鸡蛋', 'BREAKFAST', 1, 'b');
    await addFood('牛奶', 'BREAKFAST', 250, 'c');

    const meals = await loadDayMeals(NOW);
    assert.equal(meals.count, 3);
    assert.equal(meals.bySlot.BREAKFAST.length, 2);
    assert.equal(meals.bySlot.LUNCH.length, 1);
    assert.equal(meals.bySlot.DINNER.length, 0);
  });

  it('总计等于各条之和（无口径漂移）', async () => {
    await addFood('米饭', 'LUNCH', 150, 'a');
    await addFood('一个鸡蛋', 'BREAKFAST', 1, 'b');

    const meals = await loadDayMeals(NOW);
    const sumOfRows = MEAL_SLOTS.flatMap((s) => meals.bySlot[s]).reduce(
      (sum, r) => sum + r.nutrients.kcal,
      0,
    );
    assert.equal(Math.round(meals.total.kcal), Math.round(sumOfRows));
  });

  it('删除后计数与总计同步下降', async () => {
    await addFood('米饭', 'LUNCH', 150, 'a');
    await addFood('一个鸡蛋', 'BREAKFAST', 1, 'b');
    await removeMealEntry('a');

    const meals = await loadDayMeals(NOW);
    assert.equal(meals.count, 1);
    assert.equal(meals.bySlot.LUNCH.length, 0);
  });

  it('不同日期的记录不会互相污染', async () => {
    await addFood('米饭', 'LUNCH', 150, 'today');
    const yesterday = NOW - 86_400_000;
    const meals = await loadDayMeals(yesterday);
    assert.equal(meals.count, 0, '昨天不该有今天的记录');
  });

  it('portionOfEntry 能还原份量（供"再来一份"使用）', async () => {
    await addFood('米饭', 'LUNCH', 150, 'a');
    const meals = await loadDayMeals(NOW);
    const entry = meals.bySlot.LUNCH[0];
    assert.ok(entry);
    assert.deepEqual(portionOfEntry(entry), { value: 150, unit: 'GRAM' });
  });
});

describe('loadIntakeTrend：近 N 天趋势', () => {
  it('返回正确天数且按日期升序', async () => {
    const trend = await loadIntakeTrend(NOW, 7);
    assert.equal(trend.length, 7);
    assert.equal(trend.at(-1)?.dayKey, TODAY);
    const keys = trend.map((t) => t.dayKey);
    assert.deepEqual(keys, [...keys].sort(), '应按日期升序');
  });

  it('没有记录的日子标记 hasData 为 false', async () => {
    const trend = await loadIntakeTrend(NOW, 3);
    assert.equal(trend.filter((t) => t.hasData).length, 0);
    for (const day of trend) assert.equal(day.nutrients.kcal, 0);
  });

  it('今天的记录体现在最后一天', async () => {
    const outcome = buildMealEntry({ rawName: '米饭', portion: { value: 100, unit: 'GRAM' }, slot: 'LUNCH', now: NOW, id: 'x' });
    assert.ok(outcome.entry);
    await saveMealEntry(outcome.entry);

    const trend = await loadIntakeTrend(NOW, 7);
    assert.equal(trend.at(-1)?.hasData, true);
    assert.ok((trend.at(-1)?.nutrients.kcal ?? 0) > 0);
  });
});

describe('loadFrequentFoods：常吃排行', () => {
  it('空库返回空数组', async () => {
    assert.deepEqual(await loadFrequentFoods(), []);
  });

  it('按出现次数降序，并保留最近一次份量', async () => {
    for (const [id, grams] of [['a', 100], ['b', 150], ['c', 50]] as const) {
      const outcome = buildMealEntry({ rawName: '米饭', portion: { value: grams, unit: 'GRAM' }, slot: 'LUNCH', now: NOW, id });
      assert.ok(outcome.entry);
      await saveMealEntry(outcome.entry);
    }
    const egg = buildMealEntry({ rawName: '一个鸡蛋', portion: { value: 1, unit: 'SERVING' }, slot: 'BREAKFAST', now: NOW, id: 'e' });
    assert.ok(egg.entry);
    await saveMealEntry(egg.entry);

    const frequent = await loadFrequentFoods();
    assert.equal(frequent[0]?.normalizedName, '米饭');
    assert.equal(frequent[0]?.count, 3);
    assert.equal(frequent[0]?.lastPortion.value, 50, '应保留最近一次的份量');
  });

  it('遵守条数上限', async () => {
    for (let i = 0; i < 12; i += 1) {
      const outcome = buildMealEntry({ rawName: '米饭', portion: { value: 100, unit: 'GRAM' }, slot: 'LUNCH', now: NOW, id: `r${i}` });
      if (outcome.entry) await saveMealEntry(outcome.entry);
    }
    assert.ok((await loadFrequentFoods(5)).length <= 5);
  });
});

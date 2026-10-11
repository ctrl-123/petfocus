/**
 * 营养匹配单测 —— 重点验证「精确优先于近似」这条防误匹配规则，
 * 以及 AI 兜底返回值的合理性校验。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFoodIndex,
  formatPortion,
  isPlausibleNutrients,
  isUnitConvertible,
  lookupNutrition,
  longestCommonSubstring,
  macroRatio,
  normalizeFoodName,
  portionMultiplier,
  scaleNutrients,
  splitComposite,
  sumNutrients,
} from './nutrition.ts';
import type { FoodRecord, Nutrients } from '../types.ts';

const FOODS: FoodRecord[] = [
  {
    id: 'fxhcd',
    name: '西红柿炒蛋',
    aliases: ['番茄炒蛋', '西红柿鸡蛋'],
    per: { value: 100, unit: 'GRAM' },
    nutrients: { kcal: 90, proteinG: 4.6, fatG: 6.5, carbG: 3.6, fiberG: 0.8, sodiumMg: 320 },
    source: '测试数据',
    tags: ['家常菜'],
  },
  {
    id: 'mf',
    name: '米饭',
    aliases: ['白米饭', '大米饭'],
    per: { value: 100, unit: 'GRAM' },
    nutrients: { kcal: 116, proteinG: 2.6, fatG: 0.3, carbG: 25.9 },
    source: '测试数据',
    tags: ['主食'],
  },
  {
    id: 'jt',
    name: '鸡腿',
    aliases: ['烤鸡腿', '鸡腿肉'],
    per: { value: 1, unit: 'SERVING' },
    nutrients: { kcal: 250, proteinG: 26, fatG: 15, carbG: 0 },
    source: '测试数据',
    tags: ['肉类'],
  },
  {
    id: 'xlh',
    name: '西兰花',
    aliases: ['青花菜'],
    per: { value: 100, unit: 'GRAM' },
    nutrients: { kcal: 34, proteinG: 2.8, fatG: 0.4, carbG: 6.6, fiberG: 2.6 },
    source: '测试数据',
    tags: ['蔬菜'],
  },
  {
    id: 'dcf',
    name: '蛋炒饭',
    aliases: ['炒饭'],
    per: { value: 100, unit: 'GRAM' },
    nutrients: { kcal: 163, proteinG: 5.2, fatG: 5.6, carbG: 22.4 },
    source: '测试数据',
    tags: ['主食'],
  },
];

const { aliasIndex, byId } = buildFoodIndex(FOODS);
const OPTIONS = { aliasIndex, byId, allowComposite: true } as const;

describe('normalizeFoodName：规范化', () => {
  it('去空白与噪声词', () => {
    assert.equal(normalizeFoodName(' 今天 吃了 一份 米饭 '), '米饭');
    assert.equal(normalizeFoodName('来一份西红柿炒蛋'), '西红柿炒蛋');
  });

  it('全角转半角（NFKC）', () => {
    assert.equal(normalizeFoodName('Ｍｉｌｋ'), 'Milk');
    assert.equal(normalizeFoodName('１００克米饭'), '100克米饭');
  });

  it('去末尾标点', () => {
    assert.equal(normalizeFoodName('米饭。'), '米饭');
    assert.equal(normalizeFoodName('鸡腿！'), '鸡腿');
  });

  it('空输入返回空串', () => {
    assert.equal(normalizeFoodName('   '), '');
    assert.equal(normalizeFoodName('一份'), '');
  });
});

describe('buildFoodIndex：别名索引', () => {
  it('正式名与别名都指向同一 id', () => {
    assert.equal(aliasIndex.get('西红柿炒蛋'), 'fxhcd');
    assert.equal(aliasIndex.get('番茄炒蛋'), 'fxhcd');
    assert.equal(aliasIndex.get('西红柿鸡蛋'), 'fxhcd');
    assert.equal(aliasIndex.get('白米饭'), 'mf');
  });

  it('不存在重复覆盖（先注册者优先）', () => {
    const dup: FoodRecord[] = [
      { ...FOODS[1]!, id: 'a' },
      { ...FOODS[1]!, id: 'b' },
    ];
    const idx = buildFoodIndex(dup);
    assert.equal(idx.aliasIndex.get('米饭'), 'a');
  });
});

describe('portionMultiplier / scaleNutrients', () => {
  it('同单位按比例换算', () => {
    const per = { value: 100, unit: 'GRAM' } as const;
    assert.equal(portionMultiplier(per, { value: 200, unit: 'GRAM' }), 2);
    assert.equal(portionMultiplier(per, { value: 50, unit: 'GRAM' }), 0.5);
  });

  it('份 ↔ 份 按比例', () => {
    const per = { value: 1, unit: 'SERVING' } as const;
    assert.equal(portionMultiplier(per, { value: 2, unit: 'SERVING' }), 2);
  });

  it('份与克混用时按 1 份处理（不做不可靠换算，回归：曾把 100 克算成 100 份）', () => {
    assert.equal(portionMultiplier({ value: 1, unit: 'SERVING' }, { value: 100, unit: 'GRAM' }), 1);
    assert.equal(portionMultiplier({ value: 100, unit: 'GRAM' }, { value: 1, unit: 'SERVING' }), 1);
    assert.equal(isUnitConvertible({ value: 1, unit: 'SERVING' }, { value: 100, unit: 'GRAM' }), false);
    assert.equal(isUnitConvertible({ value: 100, unit: 'GRAM' }, { value: 100, unit: 'GRAM' }), true);
  });

  it('基准份量为 0 时返回 1 倍（防御）', () => {
    assert.equal(portionMultiplier({ value: 0, unit: 'GRAM' }, { value: 50, unit: 'GRAM' }), 1);
  });

  it('缩放营养值并保留一位小数', () => {
    const base: Nutrients = { kcal: 90, proteinG: 4.6, fatG: 6.5, carbG: 3.6, fiberG: 0.8, sodiumMg: 320 };
    const scaled = scaleNutrients(base, 1.5);
    assert.equal(scaled.kcal, 135);
    assert.equal(scaled.proteinG, 6.9);
    assert.equal(scaled.sodiumMg, 480);
  });

  it('缩放不会产生负值', () => {
    const scaled = scaleNutrients({ kcal: 100, proteinG: 10, fatG: 5, carbG: 20 }, -2);
    assert.equal(scaled.kcal, 0);
    assert.equal(scaled.proteinG, 0);
  });

  it('可选字段缺失时结果里也不出现该字段', () => {
    const scaled = scaleNutrients({ kcal: 100, proteinG: 1, fatG: 1, carbG: 1 }, 2);
    assert.equal('fiberG' in scaled, false);
    assert.equal('sodiumMg' in scaled, false);
  });
});

describe('sumNutrients：成分求和', () => {
  it('累加全部字段', () => {
    const total = sumNutrients([
      { kcal: 116, proteinG: 2.6, fatG: 0.3, carbG: 25.9 },
      { kcal: 250, proteinG: 26, fatG: 15, carbG: 0 },
    ]);
    assert.equal(total.kcal, 366);
    assert.equal(total.proteinG, 28.6);
    assert.equal(total.fatG, 15.3);
    assert.equal(total.carbG, 25.9);
  });

  it('任一子项有纤维则结果包含纤维', () => {
    const total = sumNutrients([
      { kcal: 90, proteinG: 1, fatG: 1, carbG: 1, fiberG: 0.8 },
      { kcal: 34, proteinG: 1, fatG: 1, carbG: 1 },
    ]);
    assert.equal(total.fiberG, 0.8);
  });

  it('空列表返回全 0', () => {
    assert.deepEqual(sumNutrients([]), { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 });
  });
});

describe('longestCommonSubstring', () => {
  it('找出连续公共子串', () => {
    assert.equal(longestCommonSubstring('番茄炒蛋', '西红柿炒蛋'), '炒蛋');
    assert.equal(longestCommonSubstring('abc', 'abc'), 'abc');
  });

  it('无公共字符返回空串', () => {
    assert.equal(longestCommonSubstring('abc', 'xyz'), '');
    assert.equal(longestCommonSubstring('', 'abc'), '');
  });

  it('只计算连续片段（不是最长公共子序列）', () => {
    assert.equal(longestCommonSubstring('abcd', 'acbd'), 'a');
  });
});

describe('splitComposite：成分拆分', () => {
  it('按分隔符拆分', () => {
    assert.deepEqual(splitComposite('米饭+鸡腿+西兰花'), ['米饭', '鸡腿', '西兰花']);
    assert.deepEqual(splitComposite('米饭、鸡腿'), ['米饭', '鸡腿']);
    assert.deepEqual(splitComposite('米饭和鸡腿'), ['米饭', '鸡腿']);
  });

  it('单一食物不拆分', () => {
    assert.deepEqual(splitComposite('米饭'), []);
    assert.deepEqual(splitComposite(''), []);
  });
});

describe('lookupNutrition：匹配顺序与防误匹配', () => {
  it('精确命中', () => {
    const r = lookupNutrition('西红柿炒蛋', { value: 100, unit: 'GRAM' }, OPTIONS);
    assert.equal(r.kind, 'EXACT');
    assert.equal(r.matchedName, '西红柿炒蛋');
    assert.equal(r.nutrients?.kcal, 90);
  });

  it('别名命中', () => {
    const r = lookupNutrition('番茄炒蛋', { value: 100, unit: 'GRAM' }, OPTIONS);
    assert.equal(r.kind, 'ALIAS');
    assert.equal(r.nutrients?.kcal, 90);
  });

  it('带噪声词的输入也能命中', () => {
    const r = lookupNutrition('今天中午吃了来一份米饭', { value: 100, unit: 'GRAM' }, OPTIONS);
    assert.equal(r.kind, 'EXACT');
    assert.equal(r.nutrients?.kcal, 116);
  });

  it('按份量换算营养值', () => {
    const r = lookupNutrition('米饭', { value: 200, unit: 'GRAM' }, OPTIONS);
    assert.equal(r.nutrients?.kcal, 232);
    assert.equal(r.nutrients?.carbG, 51.8);
  });

  it('关键：精确命中优先于近似，避免「米饭」被「蛋炒饭」抢走', () => {
    const r = lookupNutrition('米饭', { value: 100, unit: 'GRAM' }, OPTIONS);
    assert.equal(r.kind, 'EXACT');
    assert.equal(r.matchedName, '米饭');
    assert.equal(r.nutrients?.kcal, 116, '不应匹配到蛋炒饭的 163 kcal');
  });

  it('近似命中：公共子串达阈值', () => {
    const r = lookupNutrition('番茄炒鸡蛋', { value: 100, unit: 'GRAM' }, OPTIONS);
    // 「番茄炒鸡蛋」不在别名表里，但公共子串「炒」+「茄」等足以近似
    assert.ok(r.kind === 'APPROXIMATE' || r.kind === 'COMPOSITE');
    assert.ok((r.nutrients?.kcal ?? 0) > 0);
  });

  it('成分拆分组合命中（克计量项按克缩放，份计量项按 1 份）', () => {
    const r = lookupNutrition('米饭+鸡腿+西兰花', { value: 100, unit: 'GRAM' }, OPTIONS);
    assert.equal(r.kind, 'COMPOSITE');
    assert.equal(r.parts.length, 3);
    // 米饭 100g → 116、西兰花 100g → 34、鸡腿按 1 份 → 250，合计 400
    assert.equal(r.nutrients?.kcal, 400);
    assert.match(r.matchedName ?? '', /米饭.*鸡腿.*西兰花/);
  });

  it('成分拆分不会把「克」误当「份」放大（回归：曾算出 25000 kcal）', () => {
    const r = lookupNutrition('米饭+鸡腿', { value: 100, unit: 'GRAM' }, OPTIONS);
    assert.equal(r.kind, 'COMPOSITE');
    assert.ok((r.nutrients?.kcal ?? 0) < 1000, `实际 ${r.nutrients?.kcal}，明显异常`);
    assert.equal(r.nutrients?.kcal, 366); // 116 + 250
  });

  it('成分中有无法识别的项时整体不命中（宁缺勿错）', () => {
    const r = lookupNutrition('米饭+外星食物', { value: 100, unit: 'GRAM' }, OPTIONS);
    assert.notEqual(r.kind, 'COMPOSITE');
  });

  it('关闭成分拆分时不做拆分', () => {
    const r = lookupNutrition('米饭+鸡腿', { value: 100, unit: 'GRAM' }, { ...OPTIONS, allowComposite: false });
    assert.notEqual(r.kind, 'COMPOSITE');
  });

  it('完全无法识别时返回 MISS（交给 AI 兜底）', () => {
    const r = lookupNutrition('qwerty', { value: 100, unit: 'GRAM' }, OPTIONS);
    assert.equal(r.kind, 'MISS');
    assert.equal(r.nutrients, undefined);
    assert.deepEqual(r.parts, []);
  });

  it('空输入返回 MISS', () => {
    assert.equal(lookupNutrition('   ', { value: 100, unit: 'GRAM' }, OPTIONS).kind, 'MISS');
  });

  it('每次命中都带回 parts，便于 UI 展示明细', () => {
    const r = lookupNutrition('米饭', { value: 100, unit: 'GRAM' }, OPTIONS);
    assert.equal(r.parts.length, 1);
    assert.equal(r.parts[0]?.name, '米饭');
  });
});

describe('isPlausibleNutrients：AI 返回值校验 [PRD AC-5.2.4]', () => {
  it('正常值通过', () => {
    assert.equal(isPlausibleNutrients({ kcal: 300, proteinG: 20, fatG: 10, carbG: 30 }), true);
    assert.equal(
      isPlausibleNutrients({ kcal: 300, proteinG: 20, fatG: 10, carbG: 30, fiberG: 5, sodiumMg: 800 }),
      true,
    );
  });

  it('拒绝非对象', () => {
    assert.equal(isPlausibleNutrients(null), false);
    assert.equal(isPlausibleNutrients('kcal:300'), false);
    assert.equal(isPlausibleNutrients(undefined), false);
  });

  it('拒绝缺失必需字段', () => {
    assert.equal(isPlausibleNutrients({ kcal: 300, proteinG: 20, fatG: 10 }), false);
  });

  it('拒绝 NaN / Infinity', () => {
    assert.equal(isPlausibleNutrients({ kcal: Number.NaN, proteinG: 1, fatG: 1, carbG: 1 }), false);
    assert.equal(isPlausibleNutrients({ kcal: Number.POSITIVE_INFINITY, proteinG: 1, fatG: 1, carbG: 1 }), false);
  });

  it('拒绝超出合理范围的值', () => {
    assert.equal(isPlausibleNutrients({ kcal: 9999, proteinG: 1, fatG: 1, carbG: 1 }), false);
    assert.equal(isPlausibleNutrients({ kcal: 100, proteinG: 500, fatG: 1, carbG: 1 }), false);
    assert.equal(isPlausibleNutrients({ kcal: -10, proteinG: 1, fatG: 1, carbG: 1 }), false);
  });

  it('拒绝类型错误的可选字段', () => {
    assert.equal(
      isPlausibleNutrients({ kcal: 100, proteinG: 1, fatG: 1, carbG: 1, fiberG: '许多' }),
      false,
    );
  });
});

describe('macroRatio：三大营养素供能比', () => {
  it('按 4/9/4 kcal 计算供能比，总和为 1', () => {
    const ratio = macroRatio({ kcal: 200, proteinG: 10, fatG: 10, carbG: 10 });
    // 40 / 90 / 40 → 总 170
    assert.equal(Math.round(ratio.protein * 1000) / 1000, Math.round((40 / 170) * 1000) / 1000);
    assert.equal(Math.round(ratio.fat * 1000) / 1000, Math.round((90 / 170) * 1000) / 1000);
    assert.equal(Math.round(ratio.carb * 1000) / 1000, Math.round((40 / 170) * 1000) / 1000);
    assert.ok(Math.abs(ratio.protein + ratio.fat + ratio.carb - 1) < 1e-9);
  });

  it('全 0 时返回全 0（不产生 NaN）', () => {
    assert.deepEqual(macroRatio({ kcal: 0, proteinG: 0, fatG: 0, carbG: 0 }), { protein: 0, fat: 0, carb: 0 });
  });
});

describe('formatPortion', () => {
  it('带中文单位', () => {
    assert.equal(formatPortion({ value: 100, unit: 'GRAM' }), '100 克');
    assert.equal(formatPortion({ value: 1, unit: 'SERVING' }), '1 份');
    assert.equal(formatPortion({ value: 250, unit: 'ML' }), '250 毫升');
  });
});

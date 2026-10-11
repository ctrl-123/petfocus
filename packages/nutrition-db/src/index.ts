/**
 * 本地食物营养库（离线优先）。
 *
 * ── 数据来源与免责说明（必须如实公示，见 PRD 15 与 AGENTS.md 原则 1）──
 *
 * 本库的数值是**参考值**，依据《中国食物成分表》标准版的常见条目整理，
 * 目的是让用户在离线、不调用 AI 的情况下也能得到**量级正确**的营养估算。
 *
 * ⚠️ 明确的能力边界（UI 上也必须说清）：
 * - 数值是**平均值**，同一种食物的实际值受品种、产地、烹调方式影响，可能有 ±20% 偏差
 * - 中餐"一份"的量差异极大（各家做法不同），因此绝大多数条目以 **100 克**为基准，
 *   让用户按重量记录；只有标准化程度高的食物才用"份"
 * - **不构成任何营养或医疗建议**
 *
 * 设计取舍：
 * - 不做成"一个巨大的 JSON"而是按类别拆文件，便于人工审阅与修正
 * - 每个条目都带 `tags`，供食物转盘按类别筛选与"换一个"使用
 *
 * 数据校验见 `validate.ts`：能量与三大营养素必须互相吻合（否则是录错了），
 * 且由 `nutrition-db.test.ts` 守卫。
 */
import type { FoodRecord } from '@petfocus/shared';

import { STAPLE_FOODS } from './data/staples.ts';
import { MEAT_FOODS } from './data/meats.ts';
import { VEGETABLE_FOODS } from './data/vegetables.ts';
import { FRUIT_FOODS } from './data/fruits.ts';
import { DAIRY_FOODS } from './data/dairy.ts';
import { SNACK_FOODS } from './data/snacks.ts';
import { BEVERAGE_FOODS } from './data/beverages.ts';
import { DISH_FOODS } from './data/dishes.ts';
import { FASTFOOD_FOODS } from './data/fastfood.ts';

/** 全部食物条目（按类别分组维护，此处汇总） */
export const FOOD_DB: ReadonlyArray<FoodRecord> = [
  ...STAPLE_FOODS,
  ...MEAT_FOODS,
  ...VEGETABLE_FOODS,
  ...FRUIT_FOODS,
  ...DAIRY_FOODS,
  ...SNACK_FOODS,
  ...BEVERAGE_FOODS,
  ...DISH_FOODS,
  ...FASTFOOD_FOODS,
];

export {
  STAPLE_FOODS,
  MEAT_FOODS,
  VEGETABLE_FOODS,
  FRUIT_FOODS,
  DAIRY_FOODS,
  SNACK_FOODS,
  BEVERAGE_FOODS,
  DISH_FOODS,
  FASTFOOD_FOODS,
};

/** 库的元信息（「关于」页与营养估算结果里都要如实展示） */
export const FOOD_DB_META = {
  version: '1.0.0',
  itemCount: FOOD_DB.length,
  /** 数据基准说明 */
  basis: '以 100 克可食部为默认基准；标准化食物按"份"',
  provenance: '依据《中国食物成分表》标准版常见条目整理，为参考值',
  disclaimer: '数值为平均值，个体差异可达 ±20%；不构成营养或医疗建议',
} as const;

export { CATEGORY_LABELS_FOR_WHEEL, foodsByTag, categoryCounts, WHEEL_CATEGORIES, type WheelCategory } from './wheel.ts';
export { validateFoodDb, sortIssues, type FoodDbIssue, type FoodDbIssueKind } from './validate.ts';

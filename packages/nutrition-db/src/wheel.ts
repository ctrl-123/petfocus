/**
 * 食物转盘的分类定义（PRD FR-5.2）。
 *
 * 转盘不是"随机抽一个食物"那种玩具，而是**按用户当下想吃的大类缩小选择**，
 * 目的是解决"不知道吃什么"这个真实痛点。因此分类必须贴合"想吃什么样的东西"，
 * 而不是按营养学分类。
 */
import type { FoodRecord } from '@petfocus/shared';

export type WheelCategory =
  | 'STAPLE'
  | 'MEAT'
  | 'VEGETABLE'
  | 'FRUIT'
  | 'DAIRY'
  | 'SNACK'
  | 'BEVERAGE'
  | 'DISH'
  | 'FASTFOOD'
  | 'BREAKFAST'
  | 'LIGHT';

/** 转盘的扇区：面向"想吃什么"的语义，而不是营养学分类 */
export const WHEEL_CATEGORIES: ReadonlyArray<{
  key: WheelCategory;
  label: string;
  hint: string;
  /** 命中规则：标签或 id 前缀 */
  matchTag?: ReadonlyArray<string>;
  matchIdPrefix?: ReadonlyArray<string>;
  /** 只保留低热量选项（「吃得清淡」扇区用） */
  maxKcalPer100?: number;
}> = [
  { key: 'BREAKFAST', label: '早餐', hint: '早上吃得下的东西', matchTag: ['早餐'] },
  { key: 'STAPLE', label: '主食', hint: '饭、面、馒头这类', matchIdPrefix: ['staple-'] },
  { key: 'DISH', label: '家常菜', hint: '有菜有肉的正餐', matchIdPrefix: ['dish-'] },
  { key: 'MEAT', label: '肉蛋', hint: '要蛋白质的时候', matchIdPrefix: ['meat-', 'egg-', 'fish-', 'seafood-'] },
  { key: 'VEGETABLE', label: '蔬菜', hint: '想清淡一点', matchIdPrefix: ['veg-', 'bean-'] },
  { key: 'LIGHT', label: '低卡', hint: '每 100 克不超过 100 千卡', maxKcalPer100: 100 },
  { key: 'FRUIT', label: '水果', hint: '甜的但不太有负担', matchIdPrefix: ['fruit-'] },
  { key: 'DAIRY', label: '奶制品', hint: '牛奶、酸奶、奶酪', matchIdPrefix: ['dairy-'] },
  { key: 'SNACK', label: '零食点心', hint: '嘴馋的时候（会记进账）', matchIdPrefix: ['snack-'] },
  { key: 'BEVERAGE', label: '饮品', hint: '包括含糖的和含酒精的', matchIdPrefix: ['bev-'] },
  { key: 'FASTFOOD', label: '快餐外卖', hint: '赶时间就吃这个', matchIdPrefix: ['ff-'] },
];

export const CATEGORY_LABELS_FOR_WHEEL: Record<WheelCategory, string> = {
  STAPLE: '主食',
  MEAT: '肉蛋',
  VEGETABLE: '蔬菜',
  FRUIT: '水果',
  DAIRY: '奶制品',
  SNACK: '零食点心',
  BEVERAGE: '饮品',
  DISH: '家常菜',
  FASTFOOD: '快餐外卖',
  BREAKFAST: '早餐',
  LIGHT: '低卡',
};

/**
 * 取某个扇区下的全部候选食物。
 * 转盘的指针落在扇区上后，从这些候选里选一个（可反复"换一个"）。
 */
export function foodsByTag(
  category: WheelCategory,
  source: ReadonlyArray<FoodRecord>,
): ReadonlyArray<FoodRecord> {
  const def = WHEEL_CATEGORIES.find((c) => c.key === category);
  if (!def) return [];

  return source.filter((item) => {
    if (def.matchIdPrefix && def.matchIdPrefix.some((p) => item.id.startsWith(p))) return true;
    if (def.matchTag && def.matchTag.some((t) => item.tags.includes(t))) return true;
    if (def.maxKcalPer100 !== undefined) {
      // 「低卡」扇区只看热量，但排除饮品与调料（否则全是水和茶）
      const isDrink = item.id.startsWith('bev-');
      return !isDrink && item.nutrients.kcal <= def.maxKcalPer100;
    }
    return false;
  });
}

/** 扇区候选数量（UI 上可提示"这个分类里有 32 种"） */
export function categoryCounts(
  source: ReadonlyArray<FoodRecord>,
): Record<WheelCategory, number> {
  const out = {} as Record<WheelCategory, number>;
  for (const def of WHEEL_CATEGORIES) {
    out[def.key] = foodsByTag(def.key, source).length;
  }
  return out;
}

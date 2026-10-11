/**
 * 条目构造辅助。
 *
 * 为什么要这个：200+ 条数据手写完整对象会非常冗长且容易漏字段。
 * 用辅助函数把「基准份量」和「营养素」的默认值集中处理，
 * 每个条目只需写它真正不同的部分。
 */
import type { FoodRecord, Nutrients, Portion } from '@petfocus/shared';

/** 默认基准：100 克可食部 */
export const PER_100G: Portion = { value: 100, unit: 'GRAM' };

/** 一份（用于标准化程度高的食物，如鸡蛋、酸奶、可乐罐） */
export function perServing(value = 1): Portion {
  return { value, unit: 'SERVING' };
}

/** 100 毫升（饮品） */
export const PER_100ML: Portion = { value: 100, unit: 'ML' };

interface EntryInput {
  id: string;
  name: string;
  /** 别名：口语叫法、常见错写、简称 */
  aliases?: ReadonlyArray<string>;
  /** 不传则用 100 克 */
  per?: Portion;
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
  fiber?: number;
  sodium?: number;
  tags: ReadonlyArray<string>;
}

function nutrientsOf(input: EntryInput): Nutrients {
  return {
    kcal: input.kcal,
    proteinG: input.protein,
    fatG: input.fat,
    carbG: input.carb,
    ...(input.fiber === undefined ? {} : { fiberG: input.fiber }),
    ...(input.sodium === undefined ? {} : { sodiumMg: input.sodium }),
  };
}

/**
 * 构造一条食物记录。
 * `source` 统一标注来源，便于将来替换为更精确的数据时定位。
 */
export function food(input: EntryInput, source = '中国食物成分表（参考值）'): FoodRecord {
  return {
    id: input.id,
    name: input.name,
    aliases: input.aliases ?? [],
    per: input.per ?? PER_100G,
    nutrients: nutrientsOf(input),
    source,
    tags: input.tags,
  };
}

/** 批量构造，减少重复的 `food({...})` 包裹 */
export function foods(entries: ReadonlyArray<EntryInput>): FoodRecord[] {
  return entries.map((entry) => food(entry));
}

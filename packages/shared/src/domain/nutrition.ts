/**
 * 营养匹配：把用户输入的食物名匹配到本地库，并按份量换算营养值。纯函数，零依赖。
 *
 * 两级策略（PRD AC-5.2.4）：
 *   ① 本地库命中（精确 / 别名 / 近似 / 成分拆分）→ 直接返回，离线可用、零成本
 *   ② 全部未命中 → 返回 MISS，由上层入队调用 AI 估算
 *
 * 匹配顺序刻意从严格到宽松，避免「西红柿」被错误匹配到「西红柿炒蛋」这类高热量菜品。
 */

import type {
  FoodRecord,
  Nutrients,
  NutritionLookupOptions,
  NutritionLookupResult,
  NutritionMatchKind,
  Portion,
  PortionUnit,
} from '../types.ts';
import { MACRO_KCAL_PER_GRAM, NUTRIENT_LIMITS, PRECISION } from '../config/index.ts';

/** 近似匹配所需的最短公共子串长度（低于此值容易误匹配） */
const MIN_APPROX_LENGTH = 2;

/** 语料噪声词：这些词不参与匹配，否则「来一份米饭」永远命中不了 */
const NOISE_WORDS: ReadonlyArray<string> = [
  '来一份',
  '来一份儿',
  '来点',
  '一份',
  '一碗',
  '一杯',
  '一个',
  '吃了',
  '喝了',
  '大概',
  '大约',
  '好像',
  '今天',
  '早上',
  '中午',
  '晚上',
  '的',
  '了',
  '份',
  '碗',
  '杯',
];

/**
 * 规范化食物名：全角转半角、去空白、去噪声词、去末尾标点。
 * 同义词（西红柿/番茄）由别名表处理，不在这里硬编码。
 */
export function normalizeFoodName(input: string): string {
  let s = input.normalize('NFKC'); // 全角 → 半角
  s = s.replace(/\s+/g, '');
  for (const noise of NOISE_WORDS) {
    s = s.split(noise).join('');
  }
  s = s.replace(/[，,。.、;；:：!！?？~～]+$/g, '');
  return s.trim();
}

/** 构造别名索引：别名与正式名都指向同一食物 id */
export function buildFoodIndex(foods: ReadonlyArray<FoodRecord>): {
  aliasIndex: Map<string, string>;
  byId: Map<string, FoodRecord>;
} {
  const aliasIndex = new Map<string, string>();
  const byId = new Map<string, FoodRecord>();
  for (const food of foods) {
    byId.set(food.id, food);
    for (const key of [food.name, ...food.aliases]) {
      const norm = normalizeFoodName(key);
      if (norm && !aliasIndex.has(norm)) aliasIndex.set(norm, food.id);
    }
  }
  return { aliasIndex, byId };
}

/**
 * 最长公共子串（连续），用于「番茄炒蛋」→「西红柿炒蛋」这类近似匹配。
 * 返回匹配到的子串本身，便于日志与 UI 提示。
 */
export function longestCommonSubstring(a: string, b: string): string {
  if (!a || !b) return '';
  let best = '';
  // 经典的 O(n×m) 动态规划；食物名很短，不做优化
  const prev: number[] = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = prev[j] ?? 0;
      if (a[i - 1] === b[j - 1]) {
        const len = diagonal + 1;
        prev[j] = len;
        if (len > best.length) best = a.slice(i - 1 - (len - 1), i);
      } else {
        prev[j] = 0;
      }
      diagonal = saved;
    }
  }
  return best;
}

/**
 * 份量换算：把用户份量换算成相对基准份量的倍数。
 *
 * ⚠️ 单位不可换算时**返回 1**（而不是返回请求值本身）：
 * 早期版本对「基准=份、请求=克」直接返回请求值，导致「100 克」被当成「100 份」，
 * 在成分拆分里会算出 100 × 250 = 25000 kcal 这种荒谬结果。
 * 克与份之间没有可靠换算关系，正确做法是按 1 份处理，并由调用方提示用户确认份量。
 */
export function portionMultiplier(per: Portion, requested: Portion): number {
  if (per.value <= 0) return 1;
  if (per.unit === requested.unit) return requested.value / per.value;
  // 一侧是「份」另一侧是「克/毫升」：语义不同，无法换算 → 按 1 份
  if (per.unit === 'SERVING' || requested.unit === 'SERVING') return 1;
  // 克 ↔ 毫升：近似 1:1（仅适用于水基食物，调用方需注意）
  return requested.value / per.value;
}

/** 单位是否与请求可换算（供 UI 提示「该食物按份计量，请确认份量」） */
export function isUnitConvertible(per: Portion, requested: Portion): boolean {
  if (per.unit === requested.unit) return true;
  return per.unit !== 'SERVING' && requested.unit !== 'SERVING';
}

/** 按倍数缩放营养值；保留配置指定的位数，避免浮点噪声 */
export function scaleNutrients(base: Nutrients, multiplier: number): Nutrients {
  const round = (n: number): number => Math.round(n * PRECISION.SCALE) / PRECISION.SCALE;
  const out: Nutrients = {
    kcal: Math.max(0, round(base.kcal * multiplier)),
    proteinG: Math.max(0, round(base.proteinG * multiplier)),
    fatG: Math.max(0, round(base.fatG * multiplier)),
    carbG: Math.max(0, round(base.carbG * multiplier)),
  };
  if (base.fiberG !== undefined) out.fiberG = Math.max(0, round(base.fiberG * multiplier));
  if (base.sodiumMg !== undefined) out.sodiumMg = Math.max(0, round(base.sodiumMg * multiplier));
  return out;
}

/** 多份营养值求和（成分拆分用） */
export function sumNutrients(list: ReadonlyArray<Nutrients>): Nutrients {
  const round = (n: number): number => Math.round(n * PRECISION.SCALE) / PRECISION.SCALE;
  let kcal = 0;
  let proteinG = 0;
  let fatG = 0;
  let carbG = 0;
  let fiberG = 0;
  let sodiumMg = 0;
  let hasFiber = false;
  let hasSodium = false;
  for (const n of list) {
    kcal += n.kcal;
    proteinG += n.proteinG;
    fatG += n.fatG;
    carbG += n.carbG;
    if (n.fiberG !== undefined) {
      fiberG += n.fiberG;
      hasFiber = true;
    }
    if (n.sodiumMg !== undefined) {
      sodiumMg += n.sodiumMg;
      hasSodium = true;
    }
  }
  const out: Nutrients = {
    kcal: Math.max(0, round(kcal)),
    proteinG: Math.max(0, round(proteinG)),
    fatG: Math.max(0, round(fatG)),
    carbG: Math.max(0, round(carbG)),
  };
  if (hasFiber) out.fiberG = Math.max(0, round(fiberG));
  if (hasSodium) out.sodiumMg = Math.max(0, round(sodiumMg));
  return out;
}

/** 成分拆分：把「米饭+鸡腿+西兰花」拆成若干子项 */
export function splitComposite(normalizedName: string): string[] {
  const parts = normalizedName
    .split(/[+、,，/]|和|跟|配|加/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 1 ? parts : [];
}

/** 精确 / 别名命中 */
function lookupExact(
  normalizedName: string,
  options: NutritionLookupOptions,
): { food: FoodRecord; kind: NutritionMatchKind } | undefined {
  const id = options.aliasIndex.get(normalizedName);
  if (!id) return undefined;
  const food = options.byId.get(id);
  if (!food) return undefined;
  const isPrimary = normalizeFoodName(food.name) === normalizedName;
  return { food, kind: isPrimary ? 'EXACT' : 'ALIAS' };
}

/** 近似命中：取公共子串最长且达到阈值的候选 */
function lookupApproximate(
  normalizedName: string,
  options: NutritionLookupOptions,
): { food: FoodRecord; kind: NutritionMatchKind } | undefined {
  let best: { food: FoodRecord; score: number } | undefined;
  for (const food of options.byId.values()) {
    const candidates = [food.name, ...food.aliases];
    for (const candidate of candidates) {
      const norm = normalizeFoodName(candidate);
      if (!norm) continue;
      const common = longestCommonSubstring(normalizedName, norm);
      if (common.length < MIN_APPROX_LENGTH) continue;
      // 覆盖率高的优先，避免「米饭」抢走「蛋炒饭」
      const coverage = common.length / Math.max(normalizedName.length, norm.length);
      const score = common.length + coverage;
      if (!best || score > best.score) best = { food, score };
    }
  }
  return best ? { food: best.food, kind: 'APPROXIMATE' } : undefined;
}

/**
 * 主入口：查本地库。
 * 返回 kind !== 'MISS' 时携带 nutrients（已按份量换算）。
 */
export function lookupNutrition(
  rawName: string,
  portion: Portion,
  options: NutritionLookupOptions,
): NutritionLookupResult {
  const normalized = normalizeFoodName(rawName);
  if (!normalized) return { kind: 'MISS', parts: [] };

  const exact = lookupExact(normalized, options);
  if (exact) {
    const nutrients = scaleNutrients(exact.food.nutrients, portionMultiplier(exact.food.per, portion));
    return {
      kind: exact.kind,
      nutrients,
      matchedName: exact.food.name,
      parts: [{ name: exact.food.name, nutrients }],
    };
  }

  if (options.allowComposite) {
    const parts = splitComposite(normalized);
    if (parts.length > 0) {
      const resolved: Array<{ name: string; nutrients: Nutrients }> = [];
      let allFound = true;
      for (const part of parts) {
        const hit = lookupExact(part, options) ?? lookupApproximate(part, options);
        if (!hit) {
          allFound = false;
          break;
        }
        resolved.push({
          name: hit.food.name,
          nutrients: scaleNutrients(hit.food.nutrients, portionMultiplier(hit.food.per, portion)),
        });
      }
      if (allFound && resolved.length > 0) {
        return {
          kind: 'COMPOSITE',
          nutrients: sumNutrients(resolved.map((r) => r.nutrients)),
          matchedName: resolved.map((r) => r.name).join(' + '),
          parts: resolved,
        };
      }
    }
  }

  const approx = lookupApproximate(normalized, options);
  if (approx) {
    const nutrients = scaleNutrients(approx.food.nutrients, portionMultiplier(approx.food.per, portion));
    return {
      kind: 'APPROXIMATE',
      nutrients,
      matchedName: approx.food.name,
      parts: [{ name: approx.food.name, nutrients }],
    };
  }

  return { kind: 'MISS', parts: [] };
}

/** AI 兜底返回值的合理性校验（PRD AC-5.2.4：越界值视为非法） */
export function isPlausibleNutrients(value: unknown): value is Nutrients {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  for (const key of ['kcal', 'proteinG', 'fatG', 'carbG'] as const) {
    const n = v[key];
    if (typeof n !== 'number' || !Number.isFinite(n)) return false;
    const [min, max] = NUTRIENT_LIMITS[key];
    if (n < min || n > max) return false;
  }
  for (const key of ['fiberG', 'sodiumMg'] as const) {
    const n = v[key];
    if (n === undefined) continue;
    if (typeof n !== 'number' || !Number.isFinite(n)) return false;
    const [min, max] = NUTRIENT_LIMITS[key];
    if (n < min || n > max) return false;
  }
  return true;
}

/** 三大营养素占比（环图用）；总热量为 0 时返回全 0 */
export function macroRatio(nutrients: Nutrients): { protein: number; fat: number; carb: number } {
  // 用供能比而不是克数比：蛋白/碳水 4 kcal/g，脂肪 9 kcal/g
  const proteinKcal = nutrients.proteinG * MACRO_KCAL_PER_GRAM.protein;
  const fatKcal = nutrients.fatG * MACRO_KCAL_PER_GRAM.fat;
  const carbKcal = nutrients.carbG * MACRO_KCAL_PER_GRAM.carb;
  const total = proteinKcal + fatKcal + carbKcal;
  if (total <= 0) return { protein: 0, fat: 0, carb: 0 };
  return {
    protein: proteinKcal / total,
    fat: fatKcal / total,
    carb: carbKcal / total,
  };
}

/** 单位换算辅助：把「份」与「克」统一展示 */
export function formatPortion(portion: Portion): string {
  const unitLabel: Record<PortionUnit, string> = { SERVING: '份', GRAM: '克', ML: '毫升' };
  return `${portion.value} ${unitLabel[portion.unit]}`;
}

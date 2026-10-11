/**
 * 判定：|实测能量 − 声明能量| 的偏差超过容差即为问题。
 *
 * ── 三个必须建模的现实（否则会满屏误报）──
 *
 * 1. **膳食纤维也产能**（约 2 kcal/g），而《中国食物成分表》的"碳水"**不含纤维**。
 *    因此 4×蛋白 + 9×脂肪 + 4×碳水 会**系统性偏低**，高纤维蔬菜尤其明显（可差 40%）。
 *    判据改为区间：[可见宏量产能, 可见宏量产能 + 纤维产能]。
 *    声明值落在这个区间内或之上（不超容差）即视为合理。
 *
 * 2. **酒精产能不在三大营养素内**（乙醇 7 kcal/g），因此含酒精条目完全跳过本校验。
 *
 * 3. **"一份"不等于 100 克**。一个汉堡套餐 600 多克，营养素合计当然超过 100 克。
 *    因此"营养素是否超过份量"的检查只对以克/毫升为基准的条目做。
 */
import { MACRO_KCAL_PER_GRAM } from '@petfocus/shared';
import type { FoodRecord } from '@petfocus/shared';

export type FoodDbIssueKind =
  | 'ENERGY_MISMATCH'
  | 'NEGATIVE_VALUE'
  | 'IMPOSSIBLE_MACRO'
  | 'DUPLICATE_ID'
  | 'DUPLICATE_NAME'
  | 'EMPTY_NAME'
  | 'MISSING_TAGS'
  | 'BAD_PORTION';

export interface FoodDbIssue {
  kind: FoodDbIssueKind;
  id: string;
  name: string;
  detail: string;
}

/** 能量偏差容差：25%（覆盖成分表的常规误差） */
const TOLERANCE = 0.25;
/** 膳食纤维的产能（kcal/g） */
const FIBER_KCAL_PER_GRAM = 2;

export function validateFoodDb(foods: ReadonlyArray<FoodRecord>): FoodDbIssue[] {
  const issues: FoodDbIssue[] = [];
  const seenIds = new Map<string, number>();
  const seenNames = new Map<string, number>();

  for (const item of foods) {

    // ── 唯一性 ──
    seenIds.set(item.id, (seenIds.get(item.id) ?? 0) + 1);
    if ((seenIds.get(item.id) ?? 0) > 1) {
      issues.push({ kind: 'DUPLICATE_ID', id: item.id, name: item.name, detail: `id 重复：${item.id}` });
    }
    seenNames.set(item.name, (seenNames.get(item.name) ?? 0) + 1);
    if ((seenNames.get(item.name) ?? 0) > 1) {
      issues.push({ kind: 'DUPLICATE_NAME', id: item.id, name: item.name, detail: `名称重复：${item.name}` });
    }

    // ── 基本完整性 ──
    if (item.name.trim().length === 0) {
      issues.push({ kind: 'EMPTY_NAME', id: item.id, name: item.name, detail: '名称为空' });
    }
    if (item.tags.length === 0) {
      issues.push({ kind: 'MISSING_TAGS', id: item.id, name: item.name, detail: '没有标签（转盘分类需要）' });
    }
    if (item.per.value <= 0 || !Number.isFinite(item.per.value)) {
      issues.push({ kind: 'BAD_PORTION', id: item.id, name: item.name, detail: `基准份量非法：${item.per.value}` });
    }

    // ── 数值合法性 ──
    const n = item.nutrients;
    const values: Array<[string, number]> = [
      ['kcal', n.kcal],
      ['proteinG', n.proteinG],
      ['fatG', n.fatG],
      ['carbG', n.carbG],
    ];
    let hasNegative = false;
    for (const [key, value] of values) {
      if (!Number.isFinite(value) || value < 0) {
        issues.push({ kind: 'NEGATIVE_VALUE', id: item.id, name: item.name, detail: `${key} 非法：${value}` });
        hasNegative = true;
      }
    }
    // 「营养素是否超过份量」只对克/毫升基准的条目检查：
    // "一份"没有固定克重，一个套餐 600 克是正常的
    const perGrams = item.per.unit === 'SERVING' ? undefined : item.per.value;
    const macroSum = n.proteinG + n.fatG + n.carbG;
    if (!hasNegative && perGrams !== undefined && macroSum > perGrams * 1.05) {
      issues.push({
        kind: 'IMPOSSIBLE_MACRO',
        id: item.id,
        name: item.name,
        detail: `三大营养素合计 ${macroSum.toFixed(1)} 克，超过基准份量 ${perGrams} 克`,
      });
    }

    // ── 能量一致性（核心校验）──
    // 含酒精条目跳过：乙醇产能（7 kcal/g）不在三大营养素里，无法用此式验证
    if (!hasNegative && n.kcal > 0 && !item.tags.includes('酒精')) {
      const fromMacros =
        n.proteinG * MACRO_KCAL_PER_GRAM.protein +
        n.fatG * MACRO_KCAL_PER_GRAM.fat +
        n.carbG * MACRO_KCAL_PER_GRAM.carb;
      const fiber = n.fiberG ?? 0;
      // 合理区间：下限是可见宏量产能，上限再算上膳食纤维的产能
      const minKcal = fromMacros;
      const maxKcal = fromMacros + fiber * FIBER_KCAL_PER_GRAM;

      const tooLow = n.kcal < minKcal * (1 - TOLERANCE);
      const tooHigh = n.kcal > maxKcal * (1 + TOLERANCE);
      if (tooLow || tooHigh) {
        issues.push({
          kind: 'ENERGY_MISMATCH',
          id: item.id,
          name: item.name,
          detail:
            `声明 ${n.kcal} 千卡，三大营养素给出 ${minKcal.toFixed(0)}`
            + (fiber > 0 ? `（含纤维最多 ${maxKcal.toFixed(0)}）` : '')
            + ` 千卡，落在容许区间之外`,
        });
      }
    }
  }

  return issues;
}

/** 按严重程度排序：能量不一致最需要先修 */
export function sortIssues(issues: ReadonlyArray<FoodDbIssue>): FoodDbIssue[] {
  const weight: Record<FoodDbIssueKind, number> = {
    ENERGY_MISMATCH: 0,
    IMPOSSIBLE_MACRO: 1,
    NEGATIVE_VALUE: 2,
    DUPLICATE_ID: 3,
    DUPLICATE_NAME: 4,
    BAD_PORTION: 5,
    EMPTY_NAME: 6,
    MISSING_TAGS: 7,
  };
  return [...issues].sort((a, b) => weight[a.kind] - weight[b.kind]);
}

/**
 * 饮食用例层：读写餐次记录 + 调用营养查询。
 *
 * 职责边界（AGENTS.md 第 2 节）：
 * - 营养计算口径在 `@petfocus/shared` 的 domain（已单测）
 * - 食物数据在 `@petfocus/nutrition-db`（已校验自洽）
 * - 本文件只做「取数 + 组织 + 落盘」，不写任何营养公式
 *
 * ⚠️ 成本护栏（ADR-011 / AGENTS.md 第 12 节）：
 * 本地库优先。**本文件不做任何网络请求**——AI 回退由 outbox 里的 AI_NUTRITION 请求承担，
 * 且必须走服务端缓存与每日限额。本地未命中时如实告知用户并允许手工录入。
 */
import {
  buildFoodIndex,
  dayKeyOf,
  dayStartOf,
  formatPortion,
  lookupNutrition,
  normalizeFoodName,
  sumNutrients,
  type MealEntryRecord,
  type MealSlot,
  type Nutrients,
  type NutritionLookupResult,
  type Portion,
  type PortionUnit,
} from '@petfocus/shared';
import { FOOD_DB, FOOD_DB_META } from '@petfocus/nutrition-db';
import { getRuntime, tryGetRuntime } from '../../app/runtime.ts';

/**
 * 饮食相关的初始化是否已具备条件。
 * 与宠物模块同一套模式：React 的 effect 子先父后，runtime 由父组件设置，
 * 因此子组件首个 effect 必须等待而不是直接调用（见 AGENTS.md §0.5）。
 */
export function isDietStoreReady(): boolean {
  return tryGetRuntime() !== undefined;
}

function requireRuntime(): ReturnType<typeof getRuntime> {
  const runtime = tryGetRuntime();
  if (!runtime) {
    const error = new Error('运行时尚未就绪');
    error.name = 'RUNTIME_NOT_READY';
    throw error;
  }
  return runtime;
}

/** 食物索引只建一次（500 条的索引不必每次查询都重建） */
let cachedIndex: ReturnType<typeof buildFoodIndex> | undefined;

function foodIndex(): ReturnType<typeof buildFoodIndex> {
  if (!cachedIndex) cachedIndex = buildFoodIndex(FOOD_DB);
  return cachedIndex;
}

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  BREAKFAST: '早餐',
  LUNCH: '午餐',
  DINNER: '晚餐',
  SNACK: '加餐',
};

export const MEAL_SLOTS: ReadonlyArray<MealSlot> = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/** 依据一天中的小时猜当前餐次（UI 默认选中，用户可改） */
export function guessMealSlot(now: number): MealSlot {
  const hour = new Date(now).getHours();
  if (hour < 10) return 'BREAKFAST';
  if (hour < 15) return 'LUNCH';
  if (hour < 21) return 'DINNER';
  return 'SNACK';
}

/** 查一条食物的营养（只查本地库，不联网） */
export function lookup(rawName: string, portion: Portion): NutritionLookupResult {
  const index = foodIndex();
  return lookupNutrition(rawName, portion, {
    aliasIndex: index.aliasIndex,
    byId: index.byId,
    allowComposite: true,
  });
}

/** 一次「添加食物」的结果，UI 用它决定下一步 */
export interface AddFoodOutcome {
  ok: boolean;
  /** 是否命中本地库 */
  matched: boolean;
  message: string;
  /** 命中时可直接写入的记录（未落盘，便于先展示） */
  entry?: MealEntryRecord;
  /** 本地库未命中：如实告知，让用户手工补录或换个叫法 */
  needsManual?: boolean;
}

/** 把一条输入转为待写入的餐次记录（**不落盘**，便于先展示再确认） */
export function buildMealEntry(input: {
  rawName: string;
  portion: Portion;
  slot: MealSlot;
  now: number;
  id: string;
}): AddFoodOutcome {
  const normalized = normalizeFoodName(input.rawName);
  if (normalized.length === 0) {
    return { ok: false, matched: false, message: '请先写下吃了什么。' };
  }
  if (!Number.isFinite(input.portion.value) || input.portion.value <= 0) {
    return { ok: false, matched: false, message: '份量要大于 0。' };
  }

  const result = lookup(input.rawName, input.portion);

  if (result.kind === 'MISS' || !result.nutrients) {
    return {
      ok: true,
      matched: false,
      needsManual: true,
      message:
        `本地库里没有「${normalized}」。可以换个叫法再试（例如「西红柿炒蛋」而不是「番茄蛋」），` +
        `或直接手工填营养值。`,
    };
  }

  const note =
    result.kind === 'ALIAS'
      ? `（按别名匹配到「${result.matchedName}」）`
      : result.kind === 'APPROXIMATE'
        ? `（近似匹配到「${result.matchedName}」，数值可能不准）`
        : result.kind === 'COMPOSITE'
          ? `（拆成 ${result.parts.length} 项分别估算）`
          : '';

  return {
    ok: true,
    matched: true,
    message: `记下了：${result.matchedName ?? normalized} ${formatPortion(input.portion)}${note}`,
    entry: {
      id: input.id,
      dayKey: dayKeyOf(input.now),
      slot: input.slot,
      foodName: input.rawName,
      normalizedName: normalized,
      portionValue: input.portion.value,
      portionUnit: input.portion.unit,
      nutrients: result.nutrients,
      source: 'LOCAL_DB',
      recordedAt: input.now,
    },
  };
}

/** 手工录入（本地库未命中时用；**绝不猜数值**） */
export function buildManualEntry(input: {
  rawName: string;
  portion: Portion;
  slot: MealSlot;
  now: number;
  id: string;
  nutrients: Nutrients;
}): MealEntryRecord {
  return {
    id: input.id,
    dayKey: dayKeyOf(input.now),
    slot: input.slot,
    foodName: input.rawName,
    normalizedName: normalizeFoodName(input.rawName),
    portionValue: input.portion.value,
    portionUnit: input.portion.unit,
    nutrients: input.nutrients,
    source: 'MANUAL',
    recordedAt: input.now,
  };
}

export async function saveMealEntry(entry: MealEntryRecord): Promise<void> {
  const { repositories } = requireRuntime();
  await repositories.meals.put(entry);
}

export async function removeMealEntry(id: string): Promise<void> {
  const { repositories } = requireRuntime();
  await repositories.meals.delete(id);
}

/** 记录里的份量（还原成 Portion） */
export function portionOfEntry(entry: MealEntryRecord): Portion {
  return { value: entry.portionValue, unit: entry.portionUnit as PortionUnit };
}

/** 读某一天的记录（按餐次分组） */
export interface DayMeals {
  dayKey: string;
  bySlot: Record<MealSlot, MealEntryRecord[]>;
  total: Nutrients;
  /** 记录条数，用于空状态判断 */
  count: number;
}

export async function loadDayMeals(now: number): Promise<DayMeals> {
  const { repositories } = requireRuntime();
  const dayKey = dayKeyOf(now);
  const rows = await repositories.meals.byDay(dayKey);

  const bySlot: Record<MealSlot, MealEntryRecord[]> = {
    BREAKFAST: [],
    LUNCH: [],
    DINNER: [],
    SNACK: [],
  };
  for (const row of rows) bySlot[row.slot].push(row);
  // 每餐内按录入时间排序，保持与添加顺序一致
  for (const slot of MEAL_SLOTS) bySlot[slot].sort((a, b) => a.recordedAt - b.recordedAt);

  return {
    dayKey,
    bySlot,
    total: sumNutrients(rows.map((r) => r.nutrients)),
    count: rows.length,
  };
}

/** 近 N 天的营养摄入（用于饮食页的趋势条） */
export interface DailyIntake {
  dayKey: string;
  nutrients: Nutrients;
  hasData: boolean;
}

export async function loadIntakeTrend(now: number, days: number): Promise<DailyIntake[]> {
  const { repositories } = requireRuntime();
  const out: DailyIntake[] = [];
  const todayStart = dayStartOf(now);

  for (let i = days - 1; i >= 0; i -= 1) {
    const ts = todayStart - i * 86_400_000;
    const dayKey = dayKeyOf(ts);
    const rows = await repositories.meals.byDay(dayKey);
    out.push({
      dayKey,
      nutrients: sumNutrients(rows.map((r) => r.nutrients)),
      hasData: rows.length > 0,
    });
  }
  return out;
}

/** 常吃食物排行（"再来一份"的来源） */
export interface FrequentFood {
  normalizedName: string;
  displayName: string;
  count: number;
  lastPortion: Portion;
}

export async function loadFrequentFoods(limit = 8): Promise<FrequentFood[]> {
  const { repositories } = requireRuntime();
  const all = await repositories.meals.all();

  const stats = new Map<string, FrequentFood & { lastAt: number }>();
  for (const row of all) {
    const existing = stats.get(row.normalizedName);
    if (existing) {
      existing.count += 1;
      if (row.recordedAt >= existing.lastAt) {
        existing.lastAt = row.recordedAt;
        existing.lastPortion = portionOfEntry(row);
        existing.displayName = row.foodName;
      }
    } else {
      stats.set(row.normalizedName, {
        normalizedName: row.normalizedName,
        displayName: row.foodName,
        count: 1,
        lastPortion: portionOfEntry(row),
        lastAt: row.recordedAt,
      });
    }
  }

  return [...stats.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ lastAt, ...rest }) => {
      void lastAt;
      return rest;
    });
}

/** 本地库的如实说明（空状态与「关于」页都要展示） */
export function foodDbDisclosure(): string {
  return `本地食物库共 ${FOOD_DB_META.itemCount} 种，${FOOD_DB_META.provenance}。${FOOD_DB_META.disclaimer}`;
}

import { useCallback, useEffect, useState } from 'react';
import type { MealEntryRecord, MealSlot, Nutrients, Portion } from '@petfocus/shared';
import type { WheelCategory } from '@petfocus/nutrition-db';
import {
  buildManualEntry,
  buildMealEntry,
  guessMealSlot,
  isDietStoreReady,
  loadDayMeals,
  loadFrequentFoods,
  removeMealEntry,
  saveMealEntry,
  loadIntakeTrend,
  type AddFoodOutcome,
  type DailyIntake,
  type DayMeals,
  type FrequentFood,
} from './usecases.ts';

export interface UseDietResult {
  now: number;
  meals: DayMeals | undefined;
  trend: DailyIntake[];
  frequent: FrequentFood[];
  slot: MealSlot;
  setSlot: (slot: MealSlot) => void;
  loading: boolean;
  loadError: string | undefined;
  /** 最近一次操作的反馈（成功与失败都放在这里） */
  feedback: AddFoodOutcome | undefined;
  clearFeedback: () => void;
  /** 添加一条食物（先展示结果，由调用方决定是否落盘） */
  add: (rawName: string, portion: Portion, slot: MealSlot) => Promise<AddFoodOutcome>;
  /** 手工补录（本地库未命中时） */
  addManual: (
    rawName: string,
    portion: Portion,
    slot: MealSlot,
    nutrients: Nutrients,
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

/** 等运行时就绪（与宠物模块同一套模式，原因见 AGENTS.md §0.5） */
const READY_POLL_MS = 50;
const READY_TIMEOUT_MS = 5_000;

/**
 * 饮食状态钩子。
 *
 * ⚠️ 与宠物模块同样的坑：React 的 effect 是子先父后，
 * 而 runtime 由父组件的 useBoot 设置。因此必须**轮询等待就绪**，
 * 否则会永久停在加载态（这个 bug 真实发生过）。
 */
export function useDiet(now: number): UseDietResult {
  const [meals, setMeals] = useState<DayMeals | undefined>(undefined);
  const [trend, setTrend] = useState<DailyIntake[]>([]);
  const [frequent, setFrequent] = useState<FrequentFood[]>([]);
  const [slot, setSlot] = useState<MealSlot>(() => guessMealSlot(now));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<AddFoodOutcome | undefined>(undefined);

  const reload = useCallback(async (): Promise<void> => {
    const [day, trendData, freq] = await Promise.all([
      loadDayMeals(now),
      loadIntakeTrend(now, 7),
      loadFrequentFoods(),
    ]);
    setMeals(day);
    setTrend(trendData);
    setFrequent(freq);
  }, [now]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    void (async () => {
      // 1) 等运行时就绪
      while (!cancelled && !isDietStoreReady()) {
        if (Date.now() - startedAt > READY_TIMEOUT_MS) {
          setLoadError('本机存储启动超时，饮食记录暂时无法读取。刷新页面可重试。');
          setLoading(false);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, READY_POLL_MS));
      }
      if (cancelled) return;

      // 2) 加载（此处失败就是真失败，必须显示出来）
      try {
        await reload();
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reload]);

  const add = useCallback(
    async (rawName: string, portion: Portion, targetSlot: MealSlot): Promise<AddFoodOutcome> => {
      const id = `meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const outcome = buildMealEntry({ rawName, portion, slot: targetSlot, now: Date.now(), id });
      setFeedback(outcome);
      if (outcome.entry) {
        await saveMealEntry(outcome.entry);
        await reload();
      }
      return outcome;
    },
    [reload],
  );

  const addManual = useCallback(
    async (
      rawName: string,
      portion: Portion,
      targetSlot: MealSlot,
      nutrients: Nutrients,
    ): Promise<void> => {
      const id = `meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry: MealEntryRecord = buildManualEntry({
        rawName,
        portion,
        slot: targetSlot,
        now: Date.now(),
        id,
        nutrients,
      });
      await saveMealEntry(entry);
      setFeedback({ ok: true, matched: false, message: `已手工记录「${rawName}」。` });
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await removeMealEntry(id);
      await reload();
    },
    [reload],
  );

  return {
    now,
    meals,
    trend,
    frequent,
    slot,
    setSlot,
    loading,
    loadError,
    feedback,
    clearFeedback: () => setFeedback(undefined),
    add,
    addManual,
    remove,
    reload,
  };
}

export type { WheelCategory };

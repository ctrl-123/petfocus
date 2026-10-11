import { useCallback, useEffect, useRef, useState } from 'react';
import { MOOD_LABELS, moodLevelOf, type InventoryLike, type PetMood } from '@petfocus/shared';
import { getRuntime } from '../../app/runtime.ts';
import { usePlatform } from '../../platform/index.ts';
import {
  advancePet,
  equipItem,
  feedPet,
  isPetStoreReady,
  loadInventory,
  loadOrCreatePet,
  petOnce,
  purchaseItem,
  savePet,
  type PetSnapshot,
} from './usecases.ts';

export interface UsePetResult {
  pet: PetSnapshot | undefined;
  inventory: InventoryLike[];
  mood: PetMood;
  moodLabel: string;
  /** 金币余额（宠物页与商城共用同一份，避免两处各查一次而不一致） */
  balance: number;
  loading: boolean;
  /**
   * 初始化失败的原因。
   * 保留它而不是静默吞掉：一个永远不结束的「正在唤醒宠物…」对用户毫无信息量，
   * 而把错误显示出来才能定位问题（NFR：不假装一切正常）。
   */
  loadError: string | undefined;
  /** 短暂反馈文案（抚摸/喂食/购买后展示） */
  feedback: string | undefined;
  petIt: () => void;
  feed: (itemId: string) => Promise<void>;
  purchase: (itemId: string) => Promise<boolean>;
  /** 装备一件已拥有的装扮；返回结果消息供 UI 就地提示 */
  equip: (itemId: string) => Promise<{ ok: boolean; message: string }>;
  refreshBalance: () => Promise<void>;
}

/** 状态推进间隔：5 分钟足够（衰减速率是每小时 1 点） */
const ADVANCE_INTERVAL_MS = 5 * 60_000;

/** 等待运行时就绪的轮询间隔与上限 */
const READY_POLL_MS = 50;
const READY_TIMEOUT_MS = 5_000;

/**
 * 宠物状态钩子。
 *
 * 关键行为：
 * - **等待运行时就绪后再加载**：React 的 effect 是子先父后，而 runtime 由父组件的
 *   useBoot 设置，所以子组件首次挂载时 runtime 还不存在。这里轮询等待而不是直接报错
 *   （早期版本因此在界面上永久停在「正在唤醒宠物…」）。
 * - 首次进入自动创建宠物（避免"没有宠物"的空状态）
 * - 定时推进三维衰减并落盘；**页面不可见时跳过**（省电，且避免后台标签页无意义写库）
 * - 余额由金币账本求和推导（追加型账本，不存在独立的余额字段）
 */
export function usePet(): UsePetResult {
  const { platform } = usePlatform();
  const [pet, setPet] = useState<PetSnapshot | undefined>(undefined);
  const [inventory, setInventory] = useState<InventoryLike[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<string | undefined>(undefined);
  const petRef = useRef<PetSnapshot | undefined>(undefined);
  const feedbackTimer = useRef(0);

  const showFeedback = useCallback((message: string): void => {
    setFeedback(message);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(undefined), 4000);
  }, []);

  const refreshBalance = useCallback(async (): Promise<void> => {
    if (!isPetStoreReady()) return;
    const { repositories } = getRuntime();
    setBalance(await repositories.coinLedger.balance());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    void (async () => {
      // 1) 等待运行时就绪（父组件的 boot effect 先跑完才会设置它）
      while (!cancelled && !isPetStoreReady()) {
        if (Date.now() - startedAt > READY_TIMEOUT_MS) {
          setLoadError('本机存储启动超时，宠物数据暂时无法读取。刷新页面可重试。');
          setLoading(false);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, READY_POLL_MS));
      }
      if (cancelled) return;

      // 2) 加载（此处失败就是真失败，必须显示出来）
      try {
        const now = Date.now();
        const [snapshot, inv] = await Promise.all([loadOrCreatePet(now), loadInventory()]);
        if (cancelled) return;
        petRef.current = snapshot;
        setPet(snapshot);
        setInventory(inv);
        await refreshBalance();
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(feedbackTimer.current);
    };
  }, [refreshBalance]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = petRef.current;
      if (!current) return;
      if (!platform.visibility.isVisible()) return;
      const now = Date.now();
      const advanced = advancePet(current, now);
      if (advanced === current) return;
      petRef.current = advanced;
      setPet(advanced);
      void savePet(advanced, now);
    }, ADVANCE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [platform]);

  const petIt = useCallback((): void => {
    const current = petRef.current;
    if (!current) return;
    void (async () => {
      const next = await petOnce(current, Date.now());
      petRef.current = next;
      setPet(next);
    })();
  }, []);

  const feed = useCallback(
    async (itemId: string): Promise<void> => {
      const current = petRef.current;
      if (!current) return;
      const result = await feedPet(current, itemId, Date.now());
      showFeedback(result.outcome.message);
      if (result.outcome.allowed) {
        petRef.current = result.snapshot;
        setPet(result.snapshot);
        setInventory(await loadInventory());
      }
    },
    [showFeedback],
  );

  const purchase = useCallback(
    async (itemId: string): Promise<boolean> => {
      const result = await purchaseItem(itemId, Date.now());
      showFeedback(result.decision.message);
      if (result.ok) {
        setInventory(result.inventory);
        setBalance(result.balance);
      }
      return result.ok;
    },
    [showFeedback],
  );

  const equip = useCallback(
    async (itemId: string): Promise<{ ok: boolean; message: string }> => {
      const current = petRef.current;
      if (!current) return { ok: false, message: '宠物还没准备好。' };
      const result = await equipItem(current, itemId, Date.now());
      showFeedback(result.message);
      if (result.ok) {
        petRef.current = result.snapshot;
        setPet(result.snapshot);
      }
      return { ok: result.ok, message: result.message };
    },
    [showFeedback],
  );

  const mood = pet ? moodLevelOf(pet.vitals, Date.now()) : 'CALM';

  return {
    pet,
    inventory,
    mood,
    moodLabel: MOOD_LABELS[mood],
    balance,
    loading,
    loadError,
    feedback,
    petIt,
    feed,
    purchase,
    equip,
    refreshBalance,
  };
}

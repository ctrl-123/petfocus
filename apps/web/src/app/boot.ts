/**
 * 应用启动：打开数据库、初始化设备身份、装配仓储。
 *
 * 关键行为（NFR-2.4 / 技术设计 5.3）：
 * - IndexedDB 不可用（隐私模式等）时**降级为内存仓储**，数据只存活于本次会话。
 *   此时 `persistent = false`，UI **必须**明确告诉用户「本次使用不会保存」，
 *   绝不静默假装已保存（AGENTS.md：不要骗用户）。
 * - 设备身份失败不阻塞应用：金币结算稍后重试，业务功能照常可用。
 * - **演示模式**（`?demo=1`）打开独立的 `petfocus-demo` 库并写入演示数据，
 *   与用户真实数据物理隔离，绝不混用（AGENTS.md 第 4 节）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DB_NAME,
  DEMO_DB_NAME,
  createDexieDeviceStorage,
  createDexieKeyValueStore,
  createMemoryRepositories,
  createMemoryKeyValueStore,
  createDexieRepositories,
  initDeviceIdentity,
  openDb,
  type DeviceIdentity,
  type KeyValueStore,
  type PetFocusDb,
  type Repositories,
} from '@petfocus/shared';
import { setRuntime, type Runtime } from './runtime.ts';

export type BootStatus = 'loading' | 'ready' | 'degraded' | 'failed';

export interface BootResult {
  status: BootStatus;
  /** true = 数据会保存到本机；false = 仅本次会话有效 */
  persistent: boolean;
  repositories?: Repositories;
  kv?: KeyValueStore;
  device?: DeviceIdentity;
  db?: PetFocusDb;
  /** 给用户看的说明（降级或失败时必填） */
  message?: string;
  /** 是否处于演示模式（数据在独立库里，可随时退出且不影响真实数据） */
  demo?: boolean;
}

const subtle = (globalThis.crypto?.subtle ?? undefined) as
  | Parameters<typeof initDeviceIdentity>[0]['subtle']
  | undefined;

const DEMO_FLAG_KEY = 'petfocus.demo';

/**
 * 是否进入演示模式。
 * 两种进入方式：带 `?demo=1` 链接，或此前点过「体验演示」并被记住。
 * 退出：`?demo=0` 会清除记忆。
 */
export function shouldUseDemoMode(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): boolean {
  try {
    const params = new URLSearchParams(search);
    const flag = params.get('demo');
    if (flag === '1') {
      storage.setItem(DEMO_FLAG_KEY, '1');
      return true;
    }
    if (flag === '0') {
      storage.removeItem(DEMO_FLAG_KEY);
      return false;
    }
    return storage.getItem(DEMO_FLAG_KEY) === '1';
  } catch {
    // 隐私模式下 localStorage 可能抛异常：此时按"不是演示模式"处理
    return false;
  }
}

/** 演示用设备 ID（不参与真实结算） */
const DEMO_DEVICE_ID = 'demo-device-00000000';

/**
 * 演示数据的版本号。
 *
 * ⚠️ **每次修改 `demo-data.ts` 的内容都必须递增这个数字**。
 *
 * 为什么需要它：演示库一旦写过数据，`tasks.count() > 0`，就再也不会重新 seed。
 * 于是"改了演示数据"在用户浏览器里**看不到效果**——他会以为改动没生效，
 * 而实际上只是旧数据还在。这个版本号存在 KV 里，不匹配就清库重写。
 */
const DEMO_DATA_VERSION = 2;

/** 打开演示库；数据缺失或版本过期时（重新）写入演示数据 */
async function bootDemo(): Promise<BootResult> {
  const db = await openDb(DEMO_DB_NAME);
  const repositories = createDexieRepositories(db);
  const kv = createDexieKeyValueStore(db);

  const seededVersion = await kv.get<number>('demo.dataVersion');
  const isEmpty = (await repositories.tasks.count()) === 0;
  const stale = seededVersion !== DEMO_DATA_VERSION;

  if (isEmpty || stale) {
    // ⚠️ 动态 import：演示数据里有几十条食物名与菜品名（约 10 KB），
    // 静态引入会把它打进首屏入口。守卫见 apps/web/src/bundle-budget.test.ts
    const { seedDemoData } = await import('./demo-data.ts');

    // 版本过期时先清空：seed 用的是固定 id，不清会留下已删除项的残骸
    // （例如上一版演示数据里存在、这一版不再生成的记录）
    if (stale && !isEmpty) await clearDemoData(db);

    await seedDemoData(db, Date.now());
    await kv.set('demo.dataVersion', DEMO_DATA_VERSION);
  }

  return {
    status: 'ready',
    persistent: true,
    repositories,
    kv,
    db,
    demo: true,
  };
}

/**
 * 清空演示库的业务表。
 * **只在演示库上调用**——真实库绝不能走这里（演示数据与真实数据物理隔离）。
 */
async function clearDemoData(db: PetFocusDb): Promise<void> {
  await Promise.all([
    db.tasks.clear(),
    db.sessions.clear(),
    db.coinLedger.clear(),
    db.quotaLedger.clear(),
    db.pet.clear(),
    db.inventory.clear(),
    db.mealEntries.clear(),
    db.fitnessRecords.clear(),
    db.fitnessCheckins.clear(),
    db.financeEntries.clear(),
    db.financeCategories.clear(),
    db.financeBudgets.clear(),
  ]);
}

/** 打开数据库并装配一切；失败时自动降级 */
export async function bootApplication(): Promise<BootResult> {
  // 0) 演示模式优先：它用的是另一个库，与真实数据完全隔离
  try {
    const demoWanted =
      typeof window !== 'undefined' &&
      shouldUseDemoMode(window.location.search, window.localStorage);
    if (demoWanted) {
      const result = await bootDemo();
      return {
        ...result,
        device: { deviceId: DEMO_DEVICE_ID, createdAt: Date.now(), registered: false } as DeviceIdentity,
      };
    }
  } catch {
    // 演示模式失败就继续走正常流程，不阻塞
  }

  // 1) 尝试 Dexie（持久化）
  try {
    const db = await openDb(DB_NAME);
    const kv = createDexieKeyValueStore(db);
    const repositories = createDexieRepositories(db);

    let device: DeviceIdentity | undefined;
    if (subtle) {
      try {
        device = await initDeviceIdentity({ subtle, storage: createDexieDeviceStorage(db) });
      } catch {
        // 设备身份失败不影响使用：金币结算会进队列重试
        device = undefined;
      }
    }

    return { status: 'ready', persistent: true, repositories, kv, db, ...(device ? { device } : {}) };
  } catch (error) {
    // 2) 降级为内存实现
    const kv = createMemoryKeyValueStore();
    const repositories = createMemoryRepositories();
    const reason = error instanceof Error ? error.message : String(error);

    let device: DeviceIdentity | undefined;
    if (subtle) {
      try {
        const store = createMemoryDeviceStorage();
        device = await initDeviceIdentity({ subtle, storage: store });
      } catch {
        device = undefined;
      }
    }

    return {
      status: 'degraded',
      persistent: false,
      repositories,
      kv,
      ...(device ? { device } : {}),
      message: `无法使用本机存储（${reason}），本次使用不会保存数据。关闭页面后记录会丢失。`,
    };
  }
}

/** 内存版设备身份存储（降级模式用；不持久化，刷新即失效） */
function createMemoryDeviceStorage(): Parameters<typeof initDeviceIdentity>[0]['storage'] {
  let value: DeviceIdentity | undefined;
  return {
    load: () => Promise.resolve(value),
    save: (identity) => {
      value = identity;
      return Promise.resolve();
    },
    clear: () => {
      value = undefined;
      return Promise.resolve();
    },
  };
}

export interface UseBootResult extends BootResult {
  /** 重新尝试持久化（用户可能刚退出了隐私模式） */
  retry: () => void;
}

export function useBoot(): UseBootResult {
  const [result, setResult] = useState<BootResult>({ status: 'loading', persistent: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResult({ status: 'loading', persistent: false });
    bootApplication()
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({
          status: 'failed',
          persistent: false,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // 启动完成后把仓储暴露给非 React 的调用方（usecases 层），避免到处透传
  useEffect(() => {
    if (result.status === 'ready' || result.status === 'degraded') {
      const runtime: Runtime = {
        repositories: result.repositories!,
        kv: result.kv!,
        persistent: result.persistent,
      };
      if (result.device) runtime.device = result.device;
      // 导出/导入需要数据库句柄；降级模式下没有它
      if (result.db) runtime.db = result.db;
      setRuntime(runtime);
    }
  }, [result]);

  return useMemo(() => ({ ...result, retry }), [result, retry]);
}

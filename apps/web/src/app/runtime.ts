/**
 * 运行时上下文：给非 React 的用例层（usecases）一个取仓储的入口。
 *
 * 为什么需要：组件里能用 useBoot()，但 usecase 是纯函数/类，
 * 逐个透传仓储会让调用链又长又脆。这里只放「启动后即固定不变」的引用，
 * 不放任何可变状态（可变状态归 React state 或 Zustand）。
 */
import type { DeviceIdentity, KeyValueStore, PetFocusDb, Repositories } from '@petfocus/shared';

export interface Runtime {
  repositories: Repositories;
  kv: KeyValueStore;
  /** false = 本次会话不保存（降级模式），UI 必须提示用户 */
  persistent: boolean;
  device?: DeviceIdentity;
  /** 数据库句柄：导出/导入快照需要它；降级模式下不存在 */
  db?: PetFocusDb;
}

let current: Runtime | undefined;

export function setRuntime(runtime: Runtime): void {
  current = runtime;
}

export function getRuntime(): Runtime {
  if (!current) {
    throw new Error('运行时尚未就绪：请确保在 boot 完成后调用 getRuntime()');
  }
  return current;
}

/** 需要判断是否已就绪时使用（例如事件回调可能早于启动完成触发） */
export function tryGetRuntime(): Runtime | undefined {
  return current;
}

/** 仅测试使用 */
export function resetRuntime(): void {
  current = undefined;
}

/**
 * @petfocus/shared 的统一出口。
 *
 * 约束（AGENTS.md 第 2 节）：本包必须保持零运行时依赖。
 * 领域层（domain/）不得 import React / Dexie / fetch / Supabase。
 */

export * from './types.ts';
export * from './calendar.ts';

/**
 * 配置常量同时以命名导出与命名空间导出暴露。
 * 命名导出便于 UI 直接取用（`DAY_BOUNDARY_HOUR`），命名空间便于整体查看（`config.QUOTA`）。
 */
export * from './config/index.ts';
export * as config from './config/index.ts';

export * from './domain/economy.ts';
export * from './domain/quota.ts';
export * from './domain/session-engine.ts';
export * from './domain/session-runner.ts';
export * from './domain/session-serialization.ts';
export * from './domain/pet-state.ts';
export * from './domain/stats.ts';
export * from './domain/nutrition.ts';
export * from './domain/tasks.ts';
export * from './domain/shop-catalog.ts';
export * from './domain/shop.ts';
export * from './domain/fitness.ts';
export * from './domain/finance.ts';
export * from './copy/index.ts';

// 数据层：注意 shared 的 domain/ 仍然零依赖；Dexie 只出现在这里
export * from './data/db.ts';
export * from './data/repositories.ts';
export * from './data/memory-repositories.ts';
export * from './data/kv-store.ts';
export * from './data/device-identity.ts';
export * from './data/dexie-stores.ts';
export * from './data/outbox.ts';
export * from './data/export-format.ts';
export * from './data/snapshot.ts';
export * from './data/leader-election.ts';

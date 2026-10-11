/**
 * 快照与恢复：把仓储里的数据打包成导出文件、以及从导出文件写回。
 *
 * 纯逻辑在 export-format.ts，本文件只负责与 Dexie 打交道（读写）。
 */
import type { PetFocusDb } from './db.ts';
import { SCHEMA_VERSION } from './db.ts';
import { dayKeyOf } from '../calendar.ts';
import {
  createExportFile,
  planImport,
  type ExportData,
  type ExportFile,
  type ImportMode,
  type ImportPlan,
} from './export-format.ts';

/** 从数据库读出全部业务数据快照 */
export async function snapshotData(db: PetFocusDb): Promise<ExportData> {
  const [
    tasks,
    sessions,
    coinLedger,
    quotaLedger,
    pet,
    meals,
    financeEntries,
    financeCategories,
    financeBudgets,
    fitnessRecords,
    fitnessCheckins,
    inventory,
    settings,
  ] = await Promise.all([
    db.tasks.toArray(),
    db.sessions.toArray(),
    db.coinLedger.toArray(),
    db.quotaLedger.toArray(),
    db.pet.toArray(),
    db.mealEntries.toArray(),
    db.financeEntries.toArray(),
    db.financeCategories.toArray(),
    db.financeBudgets.toArray(),
    db.fitnessRecords.toArray(),
    db.fitnessCheckins.toArray(),
    db.inventory.toArray(),
    db.settings.toArray(),
  ]);

  return {
    tasks,
    sessions,
    coinLedger,
    quotaLedger,
    pet,
    meals,
    financeEntries,
    financeCategories,
    financeBudgets,
    fitnessRecords,
    fitnessCheckins,
    inventory,
    settings,
  };
}

export interface BuildExportOptions {
  db: PetFocusDb;
  deviceId: string;
  now: number;
}

/** 打包成可下载的导出文件对象 */
export async function buildExportFile(options: BuildExportOptions): Promise<ExportFile> {
  const data = await snapshotData(options.db);
  return createExportFile({
    data,
    schemaVersion: SCHEMA_VERSION,
    deviceId: options.deviceId,
    now: options.now,
  });
}

/**
 * 评估「本次会话修复了多少跨天未完成待办」这类边界处理所需的最小工具。
 * 抽出成独立函数是为了让 M3 的每日边界逻辑可以直接复用，而不必再写一遍。
 */
export function dayKeyOfSession(startedAtWall: number): string {
  return dayKeyOf(startedAtWall);
}

/** 生成导入计划：读本地快照 + 传入的导出数据 */
export async function buildImportPlan(
  db: PetFocusDb,
  incoming: ExportData,
  mode: ImportMode,
): Promise<ImportPlan> {
  const local = await snapshotData(db);
  return planImport(local, incoming, mode);
}

/**
 * 应用导入计划。**单事务写入**，失败则整体回滚，不留半份数据。
 *
 * 注意：`replace` 模式会清空业务表；调用方必须已经拿到用户的二次确认
 * （并且在此之前提示用户先导出当前数据）。
 */
export async function applyImportPlan(db: PetFocusDb, plan: ImportPlan): Promise<void> {
  const d = plan.resolved;
  await db.transaction(
    'rw',
    [
      db.tasks,
      db.sessions,
      db.coinLedger,
      db.quotaLedger,
      db.pet,
      db.mealEntries,
      db.financeEntries,
      db.financeCategories,
      db.financeBudgets,
      db.fitnessRecords,
      db.fitnessCheckins,
      db.inventory,
      db.settings,
    ],
    async () => {
      if (plan.mode === 'replace') {
        await Promise.all([
          db.tasks.clear(),
          db.sessions.clear(),
          db.coinLedger.clear(),
          db.quotaLedger.clear(),
          db.pet.clear(),
          db.mealEntries.clear(),
          db.financeEntries.clear(),
          db.financeCategories.clear(),
          db.financeBudgets.clear(),
          db.fitnessRecords.clear(),
          db.fitnessCheckins.clear(),
          db.inventory.clear(),
          db.settings.clear(),
        ]);
      }

      // 合并模式下 resolved 已是「本地 + 新增」的全集，统一用 bulkPut 覆盖写即可
      await Promise.all([
        d.tasks.length > 0 ? db.tasks.bulkPut(d.tasks) : Promise.resolve(),
        d.sessions.length > 0 ? db.sessions.bulkPut(d.sessions) : Promise.resolve(),
        d.coinLedger.length > 0 ? db.coinLedger.bulkPut(d.coinLedger) : Promise.resolve(),
        d.quotaLedger.length > 0 ? db.quotaLedger.bulkPut(d.quotaLedger) : Promise.resolve(),
        d.pet.length > 0 ? db.pet.bulkPut(d.pet) : Promise.resolve(),
        d.meals.length > 0 ? db.mealEntries.bulkPut(d.meals) : Promise.resolve(),
        d.financeEntries.length > 0 ? db.financeEntries.bulkPut(d.financeEntries) : Promise.resolve(),
        d.financeCategories.length > 0 ? db.financeCategories.bulkPut(d.financeCategories) : Promise.resolve(),
        d.financeBudgets.length > 0 ? db.financeBudgets.bulkPut(d.financeBudgets) : Promise.resolve(),
        d.fitnessRecords.length > 0 ? db.fitnessRecords.bulkPut(d.fitnessRecords) : Promise.resolve(),
        d.fitnessCheckins.length > 0 ? db.fitnessCheckins.bulkPut(d.fitnessCheckins) : Promise.resolve(),
        d.inventory.length > 0 ? db.inventory.bulkPut(d.inventory) : Promise.resolve(),
        d.settings.length > 0 ? db.settings.bulkPut(d.settings) : Promise.resolve(),
      ]);
    },
  );
}

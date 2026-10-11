/**
 * 导出 / 导入的格式定义与纯逻辑（技术设计 5.3.4）。
 *
 * 设计要点：
 * 1. **数据可携带**：没有账号、没有云备份，导出 JSON 是用户唯一的迁移与备份手段。
 * 2. 导出文件带 `schemaVersion`；导入时先校验再迁移，绝不盲目写入。
 * 3. 两种导入模式：
 *    - `merge`（合并）：按 id 去重，**本地优先**（不覆盖用户当前数据）
 *    - `replace`（覆盖）：清空业务数据后写入（高风险，UI 必须二次确认）
 * 4. 设备 ID 的处理单独决策（见 decideDeviceId）：继承可延续服务端账本，重置则从零开始。
 * 5. ⚠️ 文件是**明文 JSON**（含记账金额、饮食记录），导出时 UI 必须提示用户妥善保管。
 */
import type {
  CoinLedgerRecord,
  FinanceBudgetRecord,
  FinanceCategoryRecord,
  FinanceEntryRecord,
  FitnessCheckinRecord,
  FitnessRecordRow,
  InventoryRecord,
  MealEntryRecord,
  PetRecord,
  QuotaLedgerRecord,
  SessionRecord,
  SettingsRecord,
  TaskRecord,
} from './db.ts';

/** 当前导出格式版本；不兼容变更时必须递增并写迁移 */
export const EXPORT_FORMAT_VERSION = 1;

/** 导出文件的业务数据部分 */
export interface ExportData {
  tasks: TaskRecord[];
  sessions: SessionRecord[];
  coinLedger: CoinLedgerRecord[];
  quotaLedger: QuotaLedgerRecord[];
  pet: PetRecord[];
  meals: MealEntryRecord[];
  financeEntries: FinanceEntryRecord[];
  financeCategories: FinanceCategoryRecord[];
  financeBudgets: FinanceBudgetRecord[];
  fitnessRecords: FitnessRecordRow[];
  fitnessCheckins: FitnessCheckinRecord[];
  inventory: InventoryRecord[];
  settings: SettingsRecord[];
}

export interface ExportFile {
  format: 'petfocus-export';
  formatVersion: number;
  /** IndexedDB schema 版本，用于导入时判断是否需要迁移 */
  schemaVersion: number;
  exportedAt: number;
  /** 设备 ID（不含任何密钥！） */
  deviceId: string;
  data: ExportData;
}

export interface CreateExportInput {
  data: ExportData;
  schemaVersion: number;
  deviceId: string;
  now: number;
}

export function createExportFile(input: CreateExportInput): ExportFile {
  return {
    format: 'petfocus-export',
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: input.schemaVersion,
    exportedAt: input.now,
    deviceId: input.deviceId,
    data: input.data,
  };
}

/** 导出内容的摘要，用于 UI 预览「这个文件里有什么」 */
export interface ExportSummary {
  tasks: number;
  sessions: number;
  coinEntries: number;
  quotaEntries: number;
  meals: number;
  financeEntries: number;
  fitnessRecords: number;
  hasPet: boolean;
}

export function summarizeExport(data: ExportData): ExportSummary {
  return {
    tasks: data.tasks.length,
    sessions: data.sessions.length,
    coinEntries: data.coinLedger.length,
    quotaEntries: data.quotaLedger.length,
    meals: data.meals.length,
    financeEntries: data.financeEntries.length,
    fitnessRecords: data.fitnessRecords.length,
    hasPet: data.pet.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────
// 校验
// ─────────────────────────────────────────────────────────────

export type ValidationFailure =
  | 'NOT_AN_OBJECT'
  | 'WRONG_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'MISSING_DATA'
  | 'CORRUPTED';

export interface ValidationResult {
  ok: boolean;
  failure?: ValidationFailure;
  /** 给用户看的说明 */
  message?: string;
  file?: ExportFile;
}

const DATA_KEYS: ReadonlyArray<keyof ExportData> = [
  'tasks',
  'sessions',
  'coinLedger',
  'quotaLedger',
  'pet',
  'meals',
  'financeEntries',
  'financeCategories',
  'financeBudgets',
  'fitnessRecords',
  'fitnessCheckins',
  'inventory',
  'settings',
];

/**
 * 校验导入文件。
 * 原则：宁可**拒绝导入并说明原因**，也不要写入半份损坏数据。
 */
export function validateExportFile(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, failure: 'NOT_AN_OBJECT', message: '文件内容不是合法的 JSON 对象' };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.format !== 'petfocus-export') {
    return { ok: false, failure: 'WRONG_FORMAT', message: '这不是 PetFocus 的导出文件' };
  }

  const version = obj.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, failure: 'CORRUPTED', message: '导出文件的格式版本号无效' };
  }
  if (version > EXPORT_FORMAT_VERSION) {
    return {
      ok: false,
      failure: 'UNSUPPORTED_VERSION',
      message: `该文件由更新版本的应用导出（格式 v${version}），当前版本只支持到 v${EXPORT_FORMAT_VERSION}。请先升级应用。`,
    };
  }

  const data = obj.data;
  if (typeof data !== 'object' || data === null) {
    return { ok: false, failure: 'MISSING_DATA', message: '导出文件缺少数据段' };
  }
  const dataObj = data as Record<string, unknown>;
  for (const key of DATA_KEYS) {
    const value = dataObj[key];
    if (!Array.isArray(value)) {
      return {
        ok: false,
        failure: 'CORRUPTED',
        message: `导出文件的数据段不完整：缺少或非法的字段「${key}」`,
      };
    }
  }

  if (typeof obj.deviceId !== 'string' || obj.deviceId.length === 0) {
    return { ok: false, failure: 'CORRUPTED', message: '导出文件缺少设备 ID' };
  }
  if (typeof obj.schemaVersion !== 'number' || typeof obj.exportedAt !== 'number') {
    return { ok: false, failure: 'CORRUPTED', message: '导出文件缺少 schemaVersion 或导出时间' };
  }

  return { ok: true, file: obj as unknown as ExportFile };
}

// ─────────────────────────────────────────────────────────────
// 合并 / 覆盖
// ─────────────────────────────────────────────────────────────

export type ImportMode = 'merge' | 'replace';

export interface MergeResult<T> {
  /** 最终要写入的完整集合 */
  values: T[];
  /** 实际新增的条数 */
  added: number;
  /** 因已存在而跳过的条数 */
  skipped: number;
}

/**
 * 合并同一实体集合：按 id 去重，**本地优先**。
 *
 * 为什么本地优先而不是"导入优先"：
 * 导入通常是「换电脑恢复」，而当前设备上可能已经有新产生的数据。
 * 用导入数据覆盖会静默丢掉本地新数据；保留本地则最坏情况是少了导出文件里的旧版本，
 * 而用户可以在导入前先导出一份当前数据（UI 会提示）。
 */
export function mergeById<T extends { id: string }>(
  local: ReadonlyArray<T>,
  incoming: ReadonlyArray<T>,
): MergeResult<T> {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  let added = 0;
  let skipped = 0;
  for (const item of incoming) {
    if (byId.has(item.id)) {
      skipped += 1;
      continue;
    }
    byId.set(item.id, item);
    added += 1;
  }
  return { values: [...byId.values()], added, skipped };
}

export interface ImportPlan {
  mode: ImportMode;
  data: ExportData;
  /** 各类数据的变更统计，供确认弹窗展示 */
  stats: {
    added: number;
    skipped: number;
    byEntity: Record<string, { added: number; skipped: number }>;
  };
  /** 合并模式下的最终集合；覆盖模式下等于导入数据 */
  resolved: ExportData;
}

function planEntity<T extends { id: string }>(
  local: ReadonlyArray<T>,
  incoming: ReadonlyArray<T>,
  mode: ImportMode,
): { values: T[]; added: number; skipped: number } {
  if (mode === 'replace') {
    return { values: [...incoming], added: incoming.length, skipped: 0 };
  }
  return mergeById(local, incoming);
}

const ENTITY_KEYS = DATA_KEYS;

/**
 * 生成导入计划（不写入任何数据）。
 * UI 先展示计划让用户确认，再调用 applyImport —— 避免"点一下就把数据改了"。
 */
export function planImport(
  local: ExportData,
  incoming: ExportData,
  mode: ImportMode,
): ImportPlan {
  const byEntity: Record<string, { added: number; skipped: number }> = {};
  const resolved = {} as ExportData;
  let added = 0;
  let skipped = 0;

  for (const key of ENTITY_KEYS) {
    const localList = local[key] as ReadonlyArray<{ id: string }>;
    const incomingList = incoming[key] as ReadonlyArray<{ id: string }>;
    const result = planEntity(localList, incomingList, mode);
    // 各实体类型不同，这里按 key 回写；类型安全性由 ENTITY_KEYS 与 ExportData 的对应关系保证。
    // 先转 unknown 再转 Record：ExportData 没有字符串索引签名，直接转换会被 TS 拒绝。
    (resolved as unknown as Record<string, unknown>)[key] = result.values;
    byEntity[key] = { added: result.added, skipped: result.skipped };
    added += result.added;
    skipped += result.skipped;
  }

  return { mode, data: incoming, stats: { added, skipped, byEntity }, resolved };
}

// ─────────────────────────────────────────────────────────────
// 设备 ID 决策
// ─────────────────────────────────────────────────────────────

export type DeviceIdDecision = 'KEEP_LOCAL' | 'ADOPT_IMPORTED' | 'CONFLICT';

export interface DeviceIdChoice {
  decision: DeviceIdDecision;
  /** 需要用户明确选择时为 true（UI 必须弹确认） */
  requiresConfirmation: boolean;
  message: string;
}

/**
 * 决定导入时用哪个设备 ID。
 *
 * 为什么重要：服务端的金币/配额账本按设备 ID 记账（ADR-010）。
 * - 同 ID：账本延续，金币与配额余额保持
 * - 换 ID：服务端视为新设备，**金币与配额从零开始**
 * 因此绝不能不问就决定。
 */
export function decideDeviceId(localDeviceId: string, importedDeviceId: string): DeviceIdChoice {
  if (localDeviceId === importedDeviceId) {
    return {
      decision: 'KEEP_LOCAL',
      requiresConfirmation: false,
      message: '这是本机自己的导出文件，设备身份一致。',
    };
  }
  return {
    decision: 'CONFLICT',
    requiresConfirmation: true,
    message:
      '导出文件来自另一台设备。继续使用本机身份，则服务端的金币与配额账本保持现状；' +
      '改用导入文件的身份，则金币与配额会切换成那份账本的余额（可能与本机显示的不同）。' +
      '请选择要保留哪一个。',
  };
}

/** 导出文件名：petfocus-导出-20260214-1530.json */
export function exportFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `petfocus-导出-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

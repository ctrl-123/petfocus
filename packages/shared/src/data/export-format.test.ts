/**
 * 导出/导入纯逻辑单测。
 * 重点：宁可拒绝导入也不要写半份损坏数据；设备 ID 冲突必须让用户决策。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPORT_FORMAT_VERSION,
  createExportFile,
  decideDeviceId,
  exportFileName,
  mergeById,
  planImport,
  summarizeExport,
  validateExportFile,
  type ExportData,
} from './export-format.ts';
import type { TaskRecord } from './db.ts';

const NOW = 1_770_000_000_000;

function emptyData(): ExportData {
  return {
    tasks: [],
    sessions: [],
    coinLedger: [],
    quotaLedger: [],
    pet: [],
    meals: [],
    financeEntries: [],
    financeCategories: [],
    financeBudgets: [],
    fitnessRecords: [],
    fitnessCheckins: [],
    inventory: [],
    settings: [],
  };
}

function task(id: string, title = id): TaskRecord {
  return {
    id,
    dayKey: '2026-02-14',
    title,
    startAt: NOW,
    plannedMs: 1_500_000,
    priority: 'MEDIUM',
    status: 'PENDING',
    linkedSessionIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function goodFile(): unknown {
  return createExportFile({
    data: { ...emptyData(), tasks: [task('t1')] },
    schemaVersion: 1,
    deviceId: 'dev-1',
    now: NOW,
  });
}

describe('createExportFile / summarizeExport', () => {
  it('生成带格式标识与版本的文件', () => {
    const file = goodFile() as ReturnType<typeof createExportFile>;
    assert.equal(file.format, 'petfocus-export');
    assert.equal(file.formatVersion, EXPORT_FORMAT_VERSION);
    assert.equal(file.schemaVersion, 1);
    assert.equal(file.deviceId, 'dev-1');
    assert.equal(file.exportedAt, NOW);
  });

  it('摘要统计各类条数', () => {
    const s = summarizeExport({ ...emptyData(), tasks: [task('a'), task('b')], meals: [] });
    assert.equal(s.tasks, 2);
    assert.equal(s.sessions, 0);
    assert.equal(s.hasPet, false);
  });
});

describe('validateExportFile：宁可拒绝也不写坏数据', () => {
  it('合法文件通过', () => {
    const r = validateExportFile(goodFile());
    assert.equal(r.ok, true);
    assert.ok(r.file);
  });

  it('非对象被拒', () => {
    for (const bad of [null, 'str', 42, undefined]) {
      const r = validateExportFile(bad);
      assert.equal(r.ok, false);
      assert.equal(r.failure, 'NOT_AN_OBJECT');
    }
  });

  it('格式标识不对被拒（避免误导入其他 JSON）', () => {
    const r = validateExportFile({ format: 'something-else', formatVersion: 1, data: emptyData() });
    assert.equal(r.ok, false);
    assert.equal(r.failure, 'WRONG_FORMAT');
    assert.match(r.message ?? '', /PetFocus/);
  });

  it('来自更新版本的文件被拒，并给出可操作提示', () => {
    const r = validateExportFile({ ...(goodFile() as object), formatVersion: EXPORT_FORMAT_VERSION + 1 });
    assert.equal(r.ok, false);
    assert.equal(r.failure, 'UNSUPPORTED_VERSION');
    assert.match(r.message ?? '', /升级/);
  });

  it('版本号非法被拒', () => {
    for (const v of [0, -1, 1.5, 'v1', null]) {
      const r = validateExportFile({ ...(goodFile() as object), formatVersion: v });
      assert.equal(r.ok, false);
    }
  });

  it('缺少数据段被拒', () => {
    const r = validateExportFile({ format: 'petfocus-export', formatVersion: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.failure, 'MISSING_DATA');
  });

  it('数据段缺字段被拒，并指出是哪个字段', () => {
    const broken = JSON.parse(JSON.stringify(goodFile())) as Record<string, unknown>;
    const data = broken.data as Record<string, unknown>;
    delete data.tasks;
    const r = validateExportFile(broken);
    assert.equal(r.ok, false);
    assert.equal(r.failure, 'CORRUPTED');
    assert.match(r.message ?? '', /tasks/);
  });

  it('数据段字段类型错误被拒', () => {
    const broken = JSON.parse(JSON.stringify(goodFile())) as Record<string, unknown>;
    (broken.data as Record<string, unknown>).sessions = 'not-an-array';
    assert.equal(validateExportFile(broken).ok, false);
  });

  it('缺设备 ID 或时间戳被拒', () => {
    const a = JSON.parse(JSON.stringify(goodFile())) as Record<string, unknown>;
    a.deviceId = '';
    assert.equal(validateExportFile(a).ok, false);

    const b = JSON.parse(JSON.stringify(goodFile())) as Record<string, unknown>;
    delete b.schemaVersion;
    assert.equal(validateExportFile(b).ok, false);
  });
});

describe('mergeById：本地优先去重', () => {
  it('新增缺失项、保留本地已有项', () => {
    const local = [task('t1', '本地标题')];
    const incoming = [task('t1', '导入标题'), task('t2', '新任务')];
    const r = mergeById(local, incoming);
    assert.equal(r.added, 1);
    assert.equal(r.skipped, 1);
    assert.equal(r.values.length, 2);
    const t1 = r.values.find((v) => v.id === 't1');
    assert.equal(t1?.title, '本地标题', '本地数据优先，不被导入覆盖');
  });

  it('空本地时全部导入', () => {
    const r = mergeById([], [task('a'), task('b')]);
    assert.equal(r.added, 2);
    assert.equal(r.skipped, 0);
  });

  it('空导入时不变', () => {
    const r = mergeById([task('a')], []);
    assert.equal(r.added, 0);
    assert.equal(r.values.length, 1);
  });

  it('不产生重复 id', () => {
    const r = mergeById([task('a'), task('a')], [task('a')]);
    assert.equal(new Set(r.values.map((v) => v.id)).size, r.values.length);
  });
});

describe('planImport：合并 / 覆盖两种模式', () => {
  it('merge：保留本地，追加导入中的新项', () => {
    const local = { ...emptyData(), tasks: [task('local-1')] };
    const incoming = { ...emptyData(), tasks: [task('local-1'), task('import-2')] };
    const plan = planImport(local, incoming, 'merge');
    assert.equal(plan.resolved.tasks.length, 2);
    assert.equal(plan.stats.byEntity.tasks?.added, 1);
    assert.equal(plan.stats.byEntity.tasks?.skipped, 1);
  });

  it('replace：完全以导入数据为准（本地被丢弃）', () => {
    const local = { ...emptyData(), tasks: [task('local-1')] };
    const incoming = { ...emptyData(), tasks: [task('import-2')] };
    const plan = planImport(local, incoming, 'replace');
    assert.deepEqual(plan.resolved.tasks.map((t) => t.id), ['import-2']);
    assert.equal(plan.stats.byEntity.tasks?.added, 1);
    assert.equal(plan.stats.byEntity.tasks?.skipped, 0);
  });

  it('统计汇总跨全部实体', () => {
    const local = { ...emptyData(), tasks: [task('t1')] };
    const incoming = {
      ...emptyData(),
      tasks: [task('t1'), task('t2')],
      sessions: [],
    };
    const plan = planImport(local, incoming, 'merge');
    assert.equal(plan.stats.added, 1);
    assert.equal(plan.stats.skipped, 1);
  });

  it('结果覆盖全部实体键（不会漏写导致数据丢失）', () => {
    const plan = planImport(emptyData(), emptyData(), 'merge');
    const keys = Object.keys(plan.resolved).sort();
    const expected = Object.keys(emptyData()).sort();
    assert.deepEqual(keys, expected);
  });
});

describe('decideDeviceId：设备身份冲突必须让用户决策 [ADR-010]', () => {
  it('同一设备：无需确认', () => {
    const c = decideDeviceId('dev-1', 'dev-1');
    assert.equal(c.decision, 'KEEP_LOCAL');
    assert.equal(c.requiresConfirmation, false);
  });

  it('不同设备：标记冲突并要求确认，说明两种选择的后果', () => {
    const c = decideDeviceId('dev-1', 'dev-2');
    assert.equal(c.decision, 'CONFLICT');
    assert.equal(c.requiresConfirmation, true);
    assert.match(c.message, /金币与配额/);
    assert.match(c.message, /请选择/);
  });
});

describe('exportFileName', () => {
  it('带日期时间且以 .json 结尾', () => {
    const name = exportFileName(NOW);
    assert.match(name, /^petfocus-导出-\d{8}-\d{4}\.json$/);
  });

  it('不同时间生成不同文件名', () => {
    assert.notEqual(exportFileName(NOW), exportFileName(NOW + 60_000));
  });
});

/**
 * 待办领域逻辑单测。重点验证每日首次填写的判定顺序（AC-2.2.x）与跨天处理。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  completionRate,
  findNextTask,
  findOverlaps,
  planRollover,
  shouldShowDailyForm,
  shouldShowPlanHint,
  shouldSuggestSplitting,
  sortTasksForDisplay,
  validateNewTask,
  type TaskLike,
} from './tasks.ts';
import { DAILY_FORM_START_HOUR, TASK_LIMITS } from '../config/index.ts';

const MIN = 60_000;

/** 本地时间构造器，避免时区漂移导致测试在别的机器上挂 */
function at(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

function task(id: string, partial: Partial<TaskLike> = {}): TaskLike {
  return {
    id,
    dayKey: '2026-02-14',
    title: id,
    startAt: at(2026, 2, 14, 10),
    plannedMs: 25 * MIN,
    priority: 'MEDIUM',
    status: 'PENDING',
    ...partial,
  };
}

describe('validateNewTask：表单校验 [NFR-5.4]', () => {
  const base = { title: '写实验报告', startAt: at(2026, 2, 14, 9), plannedMs: 25 * MIN, now: at(2026, 2, 14, 8) };

  it('合法输入通过并自动推导 dayKey', () => {
    const r = validateNewTask(base);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.values.title, '写实验报告');
    assert.equal(r.values.dayKey, '2026-02-14');
    assert.equal(r.values.priority, 'MEDIUM', '未指定时默认中优先级');
  });

  it('标题去首尾空白；纯空白视为空', () => {
    const ok = validateNewTask({ ...base, title: '  开会  ' });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.values.title, '开会');

    const empty = validateNewTask({ ...base, title: '   ' });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.deepEqual(empty.errors, [{ field: 'title', reason: 'EMPTY' }]);
  });

  it('标题过长被拒', () => {
    const r = validateNewTask({ ...base, title: 'x'.repeat(TASK_LIMITS.titleMaxLength + 1) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.errors[0]?.reason, 'TOO_LONG');
  });

  it('计划时长必须为正且不超过上限', () => {
    assert.equal(validateNewTask({ ...base, plannedMs: 0 }).ok, false);
    assert.equal(validateNewTask({ ...base, plannedMs: -1 }).ok, false);
    assert.equal(validateNewTask({ ...base, plannedMs: Number.NaN }).ok, false);
    assert.equal(validateNewTask({ ...base, plannedMs: TASK_LIMITS.plannedMsMax + 1 }).ok, false);
    assert.equal(validateNewTask({ ...base, plannedMs: TASK_LIMITS.plannedMsMax }).ok, true);
  });

  it('可同时报告多个字段错误', () => {
    const r = validateNewTask({ ...base, title: '', plannedMs: -5 });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.errors.length, 2);
      assert.deepEqual(r.errors.map((e) => e.field).sort(), ['plannedMs', 'title']);
    }
  });

  it('备注为空字符串时不写入（避免存空串污染数据）', () => {
    const r = validateNewTask({ ...base, note: '   ' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal('note' in r.values, false);

    const withNote = validateNewTask({ ...base, note: ' 带资料 ' });
    if (withNote.ok) assert.equal(withNote.values.note, '带资料');
  });

  it('凌晨时间归属前一天（04:00 边界）', () => {
    const r = validateNewTask({ ...base, startAt: at(2026, 2, 14, 2) });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.values.dayKey, '2026-02-13');
  });
});

describe('shouldShowDailyForm：判定顺序不可调换 [FR-2.2]', () => {
  const base = {
    now: at(2026, 2, 14, 9),
    todayTaskCount: 0,
    skippedToday: false,
    alreadyPromptedToday: false,
  };

  it('当天未填写且已过 07:00 → 弹（AC-2.2.1）', () => {
    const d = shouldShowDailyForm(base);
    assert.equal(d.show, true);
    if (d.show) assert.equal(d.reason, 'FIRST_OPEN_TODAY');
  });

  it('当天已有待办 → 不弹（AC-2.2.3）', () => {
    const d = shouldShowDailyForm({ ...base, todayTaskCount: 1 });
    assert.equal(d.show, false);
    if (!d.show) assert.equal(d.reason, 'ALREADY_FILLED');
  });

  it('早于 07:00 → 不弹，顺延（AC-2.2.2）', () => {
    const d = shouldShowDailyForm({ ...base, now: at(2026, 2, 14, DAILY_FORM_START_HOUR - 1, 59) });
    assert.equal(d.show, false);
    if (!d.show) assert.equal(d.reason, 'TOO_EARLY');
  });

  it('恰好 07:00 → 弹', () => {
    const d = shouldShowDailyForm({ ...base, now: at(2026, 2, 14, DAILY_FORM_START_HOUR) });
    assert.equal(d.show, true);
  });

  it('今天已跳过 → 不弹（AC-2.2.4）', () => {
    const d = shouldShowDailyForm({ ...base, skippedToday: true });
    assert.equal(d.show, false);
    if (!d.show) assert.equal(d.reason, 'SKIPPED_TODAY');
  });

  it('今天已弹过 → 不弹（防硬刷新重复弹）', () => {
    const d = shouldShowDailyForm({ ...base, alreadyPromptedToday: true });
    assert.equal(d.show, false);
    if (!d.show) assert.equal(d.reason, 'ALREADY_PROMPTED');
  });

  it('优先级：已填写 > 太早 > 已跳过', () => {
    // 已填写与凌晨同时成立时，报 ALREADY_FILLED
    const d1 = shouldShowDailyForm({
      ...base,
      now: at(2026, 2, 14, 3),
      todayTaskCount: 2,
      skippedToday: true,
    });
    assert.equal(d1.show, false);
    if (!d1.show) assert.equal(d1.reason, 'ALREADY_FILLED');

    // 凌晨 + 已跳过 → 报 TOO_EARLY（先判时间）
    const d2 = shouldShowDailyForm({ ...base, now: at(2026, 2, 14, 3), skippedToday: true });
    if (!d2.show) assert.equal(d2.reason, 'TOO_EARLY');
  });
});

describe('shouldShowPlanHint：跳过也要留痕 [AC-2.2.4]', () => {
  it('未填写且已过 07:00 → 显示提示条', () => {
    assert.equal(shouldShowPlanHint({ now: at(2026, 2, 14, 10), todayTaskCount: 0 }), true);
  });

  it('填写过 → 提示条消失', () => {
    assert.equal(shouldShowPlanHint({ now: at(2026, 2, 14, 10), todayTaskCount: 3 }), false);
  });

  it('凌晨不显示（与弹窗规则一致）', () => {
    assert.equal(shouldShowPlanHint({ now: at(2026, 2, 14, 5), todayTaskCount: 0 }), false);
  });
});

describe('sortTasksForDisplay：进行中置顶 [AC-2.3.2]', () => {
  it('进行中排最前，其余按开始时间升序', () => {
    const tasks = [
      task('c', { startAt: at(2026, 2, 14, 15) }),
      task('running', { startAt: at(2026, 2, 14, 14), status: 'RUNNING' }),
      task('a', { startAt: at(2026, 2, 14, 9) }),
    ];
    assert.deepEqual(sortTasksForDisplay(tasks).map((t) => t.id), ['running', 'a', 'c']);
  });

  it('不修改原数组', () => {
    const tasks = [task('b', { startAt: 2 }), task('a', { startAt: 1 })];
    const sorted = sortTasksForDisplay(tasks);
    assert.deepEqual(tasks.map((t) => t.id), ['b', 'a'], '原数组应保持不变');
    assert.deepEqual(sorted.map((t) => t.id), ['a', 'b']);
  });
});

describe('findOverlaps：时间冲突只提示不阻止 [AC-2.2.8]', () => {
  it('检出重叠并给出重叠时长', () => {
    const tasks = [
      task('a', { startAt: at(2026, 2, 14, 9), plannedMs: 60 * MIN }),
      task('b', { startAt: at(2026, 2, 14, 9, 30), plannedMs: 60 * MIN }),
    ];
    const overlaps = findOverlaps(tasks);
    assert.equal(overlaps.length, 1);
    assert.equal(overlaps[0]?.overlapMs, 30 * MIN);
  });

  it('首尾相接不算重叠', () => {
    const tasks = [
      task('a', { startAt: at(2026, 2, 14, 9), plannedMs: 60 * MIN }),
      task('b', { startAt: at(2026, 2, 14, 10), plannedMs: 60 * MIN }),
    ];
    assert.equal(findOverlaps(tasks).length, 0);
  });

  it('已完成/已跳过的不参与冲突检测', () => {
    const tasks = [
      task('a', { startAt: at(2026, 2, 14, 9), plannedMs: 60 * MIN }),
      task('b', { startAt: at(2026, 2, 14, 9, 30), plannedMs: 60 * MIN, status: 'DONE' }),
    ];
    assert.equal(findOverlaps(tasks).length, 0);
  });

  it('无冲突时返回空数组', () => {
    assert.deepEqual(findOverlaps([]), []);
  });
});

describe('findNextTask：首页状态横幅 [AC-2.3.4]', () => {
  it('优先返回进行中的任务', () => {
    const tasks = [
      task('later', { startAt: at(2026, 2, 14, 15) }),
      task('running', { startAt: at(2026, 2, 14, 9), status: 'RUNNING' }),
    ];
    assert.equal(findNextTask(tasks, at(2026, 2, 14, 10))?.id, 'running');
  });

  it('无进行中时返回最近一条未开始的待办', () => {
    const tasks = [
      task('past', { startAt: at(2026, 2, 14, 8) }),
      task('soon', { startAt: at(2026, 2, 14, 11) }),
      task('late', { startAt: at(2026, 2, 14, 16) }),
    ];
    assert.equal(findNextTask(tasks, at(2026, 2, 14, 10))?.id, 'soon');
  });

  it('全部已过期或无待办时返回 undefined', () => {
    assert.equal(findNextTask([task('past', { startAt: at(2026, 2, 14, 8) })], at(2026, 2, 14, 20)), undefined);
    assert.equal(findNextTask([], at(2026, 2, 14, 20)), undefined);
  });
});

describe('planRollover：跨天处理 [E15 / AC-2.3.5]', () => {
  it('标记更早日期未完成的待办，且不自动改写数据', () => {
    const tasks = [
      task('yesterday-pending', { dayKey: '2026-02-13', status: 'PENDING' }),
      task('yesterday-done', { dayKey: '2026-02-13', status: 'DONE' }),
      task('today-pending', { dayKey: '2026-02-14', status: 'PENDING' }),
    ];
    const decision = planRollover(tasks, '2026-02-14');
    assert.deepEqual(decision.toMiss, ['yesterday-pending']);
    assert.equal(decision.needsPrompt.length, 1);
  });

  it('进行中的旧任务也要处理', () => {
    const tasks = [task('old-running', { dayKey: '2026-02-12', status: 'RUNNING' })];
    assert.deepEqual(planRollover(tasks, '2026-02-14').toMiss, ['old-running']);
  });

  it('已完成/已跳过的旧任务不处理', () => {
    const tasks = [
      task('a', { dayKey: '2026-02-13', status: 'DONE' }),
      task('b', { dayKey: '2026-02-13', status: 'SKIPPED' }),
      task('c', { dayKey: '2026-02-13', status: 'MISSED' }),
    ];
    assert.deepEqual(planRollover(tasks, '2026-02-14').toMiss, []);
  });
});

describe('completionRate', () => {
  it('正常计算', () => {
    const tasks = [task('a', { status: 'DONE' }), task('b', { status: 'PENDING' })];
    assert.equal(completionRate(tasks), 0.5);
  });

  it('无任务时返回 null（不是 0，避免误显示 0%）', () => {
    assert.equal(completionRate([]), null);
  });
});

describe('shouldSuggestSplitting：连续多天未完成 [AC-2.3.5]', () => {
  it('连续 3 天同一标题都未完成 → 建议拆小', () => {
    const byDay = new Map<string, TaskLike[]>([
      ['2026-02-11', [task('a', { dayKey: '2026-02-11', title: '写论文', status: 'MISSED' })]],
      ['2026-02-12', [task('b', { dayKey: '2026-02-12', title: '写论文', status: 'MISSED' })]],
      ['2026-02-13', [task('c', { dayKey: '2026-02-13', title: '写论文', status: 'SKIPPED' })]],
    ]);
    assert.equal(shouldSuggestSplitting(byDay, '写论文', '2026-02-14', 3), true);
  });

  it('中间完成过一次 → 不触发', () => {
    const byDay = new Map<string, TaskLike[]>([
      ['2026-02-11', [task('a', { dayKey: '2026-02-11', title: '写论文', status: 'MISSED' })]],
      ['2026-02-12', [task('b', { dayKey: '2026-02-12', title: '写论文', status: 'DONE' })]],
      ['2026-02-13', [task('c', { dayKey: '2026-02-13', title: '写论文', status: 'MISSED' })]],
    ]);
    assert.equal(shouldSuggestSplitting(byDay, '写论文', '2026-02-14', 3), false);
  });

  it('不足天数 → 不触发', () => {
    const byDay = new Map<string, TaskLike[]>([
      ['2026-02-13', [task('c', { dayKey: '2026-02-13', title: '写论文', status: 'MISSED' })]],
    ]);
    assert.equal(shouldSuggestSplitting(byDay, '写论文', '2026-02-14', 3), false);
  });

  it('中断链（某天没有该标题）→ 不触发', () => {
    const byDay = new Map<string, TaskLike[]>([
      ['2026-02-11', [task('a', { dayKey: '2026-02-11', title: '写论文', status: 'MISSED' })]],
      ['2026-02-12', [task('b', { dayKey: '2026-02-12', title: '别的事', status: 'MISSED' })]],
      ['2026-02-13', [task('c', { dayKey: '2026-02-13', title: '写论文', status: 'MISSED' })]],
    ]);
    assert.equal(shouldSuggestSplitting(byDay, '写论文', '2026-02-14', 3), false);
  });
});

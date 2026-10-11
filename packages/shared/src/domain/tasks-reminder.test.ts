/**
 * 到点提醒与宽限期单测（FR-1.2 / AC-1.4.8）。
 *
 * 这是「到点自动进入专注」的唯一判定入口，时间边界错一秒就会导致
 * 「明明还没到点却弹专注」这类体验事故，因此边界必须逐个测。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  collectReminders,
  phaseOfTask,
  reminderKey,
  shouldNotify,
  type TaskLike,
} from './tasks.ts';
import { GRACE_PERIOD_MS, REMINDER_LEAD_MS } from '../config/index.ts';

const MIN = 60_000;
const T0 = new Date(2026, 1, 14, 9, 0, 0, 0).getTime(); // 计划 09:00 开始

function task(partial: Partial<TaskLike> = {}): TaskLike {
  return {
    id: 't1',
    dayKey: '2026-02-14',
    title: '写报告',
    startAt: T0,
    plannedMs: 25 * MIN,
    priority: 'MEDIUM',
    status: 'PENDING',
    ...partial,
  };
}

describe('phaseOfTask：阶段判定与边界', () => {
  it('远超之前 → UPCOMING', () => {
    assert.equal(phaseOfTask(task(), T0 - REMINDER_LEAD_MS - 1), 'UPCOMING');
  });

  it('提前 5 分钟整 → REMINDER（边界包含）', () => {
    assert.equal(phaseOfTask(task(), T0 - REMINDER_LEAD_MS), 'REMINDER');
  });

  it('到点前 1 分钟 → 仍是 REMINDER', () => {
    assert.equal(phaseOfTask(task(), T0 - MIN), 'REMINDER');
  });

  it('恰好到点 → GRACE（宽限期开始）', () => {
    assert.equal(phaseOfTask(task(), T0), 'GRACE');
  });

  it('宽限期内 → GRACE', () => {
    assert.equal(phaseOfTask(task(), T0 + GRACE_PERIOD_MS - 1), 'GRACE');
  });

  it('宽限期满 → DUE（应自动进入专注）', () => {
    assert.equal(phaseOfTask(task(), T0 + GRACE_PERIOD_MS), 'DUE');
  });

  it('计划时长结束 → OVERDUE', () => {
    assert.equal(phaseOfTask(task(), T0 + 25 * MIN), 'OVERDUE');
  });

  it('已完成的待办不再产生任何阶段（不打扰）', () => {
    for (const status of ['DONE', 'SKIPPED', 'MISSED'] as const) {
      assert.equal(phaseOfTask(task({ status }), T0), 'UPCOMING', `${status} 不应触发提醒`);
    }
  });

  it('进行中的待办仍会提醒', () => {
    assert.equal(phaseOfTask(task({ status: 'RUNNING' }), T0 + GRACE_PERIOD_MS), 'DUE');
  });
});

describe('collectReminders：筛查与去重', () => {
  it('只返回需要提醒的阶段（REMINDER / GRACE / DUE）', () => {
    const tasks: TaskLike[] = [
      task({ id: 'far', startAt: T0 + 60 * MIN }), // UPCOMING
      task({ id: 'soon', startAt: T0 + 3 * MIN }), // REMINDER（现在在 T0）
      task({ id: 'now', startAt: T0 }), // GRACE
      task({ id: 'due', startAt: T0 - GRACE_PERIOD_MS - 1 }), // DUE
      task({ id: 'past', startAt: T0 - 60 * MIN, plannedMs: 10 * MIN }), // OVERDUE
    ];
    const reminders = collectReminders(tasks, T0, new Set());
    assert.deepEqual(reminders.map((r) => r.taskId), ['due', 'now', 'soon']);
  });

  it('按开始时间升序（先处理更紧急的）', () => {
    const tasks: TaskLike[] = [
      task({ id: 'b', startAt: T0 }),
      task({ id: 'a', startAt: T0 - GRACE_PERIOD_MS - 1 }),
    ];
    assert.deepEqual(collectReminders(tasks, T0, new Set()).map((r) => r.taskId), ['a', 'b']);
  });

  it('已提醒过的「待办:阶段」不再重复返回', () => {
    const tasks: TaskLike[] = [task({ id: 't1', startAt: T0 })];
    const already = new Set([reminderKey('t1', 'GRACE')]);
    assert.equal(collectReminders(tasks, T0, already).length, 0);
  });

  it('同一待办的不同阶段是不同 key（宽限与到点各提醒一次）', () => {
    const tasks: TaskLike[] = [task({ id: 't1', startAt: T0 })];
    const already = new Set([reminderKey('t1', 'GRACE')]);
    const dueAt = T0 + GRACE_PERIOD_MS;
    const reminders = collectReminders(tasks, dueAt, already);
    assert.deepEqual(reminders.map((r) => r.phase), ['DUE']);
  });

  it('宽限期剩余时间计算正确', () => {
    const tasks: TaskLike[] = [task({ id: 't1', startAt: T0 })];
    const at = T0 + MIN;
    const reminders = collectReminders(tasks, at, new Set());
    assert.equal(reminders[0]?.graceRemainingMs, GRACE_PERIOD_MS - MIN);
  });

  it('不在宽限期时 graceRemainingMs 为 0', () => {
    const tasks: TaskLike[] = [task({ id: 't1', startAt: T0 + 2 * MIN })];
    const reminders = collectReminders(tasks, T0, new Set());
    assert.equal(reminders[0]?.phase, 'REMINDER');
    assert.equal(reminders[0]?.graceRemainingMs, 0);
  });

  it('空列表返回空数组', () => {
    assert.deepEqual(collectReminders([], T0, new Set()), []);
  });
});

describe('shouldNotify：通知克制 [PRD 4.3]', () => {
  it('REMINDER 与 GRACE 发通知', () => {
    assert.equal(shouldNotify('REMINDER'), true);
    assert.equal(shouldNotify('GRACE'), true);
  });

  it('DUE 阶段不再发通知（改为页面内强制引导）', () => {
    assert.equal(shouldNotify('DUE'), false);
  });

  it('UPCOMING 与 OVERDUE 不打扰', () => {
    assert.equal(shouldNotify('UPCOMING'), false);
    assert.equal(shouldNotify('OVERDUE'), false);
  });
});

describe('reminderKey：格式稳定', () => {
  it('为 待办id:阶段', () => {
    assert.equal(reminderKey('abc', 'GRACE'), 'abc:GRACE');
  });
});

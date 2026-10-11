/**
 * 待办集的领域逻辑。纯函数，零依赖。
 *
 * 对应 PRD FR-2：
 * - AC-2.2.1 当天未填写且当前 ≥ 07:00 → 弹出强制填写
 * - AC-2.2.2 早于 07:00 打开不弹，顺延到 07:00 后的首次打开
 * - AC-2.2.3 当天已填写过 → 不再弹
 * - AC-2.2.4 「今天先跳过」后当天不再弹，但保留提示条
 * - AC-2.2.8 时间冲突只提示、不阻止保存
 * - AC-2.3.5 跨天未完成自动标记并要求处理
 */
import { DAILY_FORM_START_HOUR, GRACE_PERIOD_MS, REMINDER_LEAD_MS, TASK_LIMITS } from '../config/index.ts';
import { dayKeyOf } from '../calendar.ts';
import type { Priority, TaskStatus } from '../types.ts';

/** 待办的领域视图：只含业务需要的字段 */
export interface TaskLike {
  id: string;
  dayKey: string;
  title: string;
  startAt: number;
  plannedMs: number;
  priority: Priority;
  status: TaskStatus;
  completedAt?: number;
}

/** 新建待办的输入 */
export interface NewTaskInput {
  title: string;
  /** 计划开始（墙钟） */
  startAt: number;
  /** 预计时长，默认由调用方从 config 取 */
  plannedMs: number;
  priority?: Priority;
  note?: string;
  now: number;
}

export interface NewTaskValues {
  dayKey: string;
  title: string;
  startAt: number;
  plannedMs: number;
  priority: Priority;
  note?: string;
}

export type ValidationError =
  | { field: 'title'; reason: 'EMPTY' | 'TOO_LONG' }
  | { field: 'plannedMs'; reason: 'NOT_POSITIVE' | 'TOO_LONG' }
  | { field: 'startAt'; reason: 'INVALID' };

export const TASK_LIMITS_LOCAL = TASK_LIMITS;

/**
 * 校验并归一化新建待办输入。
 * 返回 `{ ok: true, values }` 或 `{ ok: false, errors }`——不用抛异常，
 * 便于表单逐字段展示错误（NFR-5.4：错误提示与字段关联）。
 */
export function validateNewTask(
  input: NewTaskInput,
): { ok: true; values: NewTaskValues } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const title = input.title.trim();

  if (title.length === 0) errors.push({ field: 'title', reason: 'EMPTY' });
  else if (title.length > TASK_LIMITS.titleMaxLength) errors.push({ field: 'title', reason: 'TOO_LONG' });

  if (!Number.isFinite(input.plannedMs) || input.plannedMs <= 0) {
    errors.push({ field: 'plannedMs', reason: 'NOT_POSITIVE' });
  } else if (input.plannedMs > TASK_LIMITS.plannedMsMax) {
    errors.push({ field: 'plannedMs', reason: 'TOO_LONG' });
  }

  if (!Number.isFinite(input.startAt)) errors.push({ field: 'startAt', reason: 'INVALID' });

  if (errors.length > 0) return { ok: false, errors };

  const values: NewTaskValues = {
    dayKey: dayKeyOf(input.startAt),
    title,
    startAt: input.startAt,
    plannedMs: input.plannedMs,
    priority: input.priority ?? 'MEDIUM',
  };
  if (input.note !== undefined && input.note.trim().length > 0) values.note = input.note.trim();
  return { ok: true, values };
}

// ─────────────────────────────────────────────────────────────
// 每日首次填写（FR-2.2）
// ─────────────────────────────────────────────────────────────

export type DailyFormDecision =
  | { show: true; reason: 'FIRST_OPEN_TODAY' }
  | { show: false; reason: 'ALREADY_FILLED' | 'TOO_EARLY' | 'SKIPPED_TODAY' | 'ALREADY_PROMPTED' };

export interface DailyFormInput {
  now: number;
  /** 当天已有的待办数（>0 视为已填写） */
  todayTaskCount: number;
  /** 当天是否已点过「今天先跳过」 */
  skippedToday: boolean;
  /** 当天是否已经弹过一次（用户硬刷新时避免重复弹） */
  alreadyPromptedToday: boolean;
}

/**
 * 是否应该弹出「今日待办填写」。
 *
 * 判定顺序（不可调换，否则会出现「凌晨弹窗」这类体验灾难）：
 * 1. 已填写 → 不弹（AC-2.2.3）
 * 2. 早于 07:00 → 不弹，顺延（AC-2.2.2）
 * 3. 今天已跳过 → 不弹（AC-2.2.4）
 * 4. 今天已弹过 → 不弹（防刷新重复弹）
 * 5. 否则 → 弹（AC-2.2.1）
 */
export function shouldShowDailyForm(input: DailyFormInput): DailyFormDecision {
  if (input.todayTaskCount > 0) return { show: false, reason: 'ALREADY_FILLED' };

  const hour = new Date(input.now).getHours();
  if (hour < DAILY_FORM_START_HOUR) return { show: false, reason: 'TOO_EARLY' };

  if (input.skippedToday) return { show: false, reason: 'SKIPPED_TODAY' };
  if (input.alreadyPromptedToday) return { show: false, reason: 'ALREADY_PROMPTED' };

  return { show: true, reason: 'FIRST_OPEN_TODAY' };
}

/**
 * 当天是否还需要显示「今天还没排计划」提示条（AC-2.2.4）。
 * 未填写就提示（不论是否点过跳过，只是文案不同：跳过过则文案更轻）。
 */
export function shouldShowPlanHint(input: {
  now: number;
  todayTaskCount: number;
}): boolean {
  if (input.todayTaskCount > 0) return false;
  const hour = new Date(input.now).getHours();
  if (hour < DAILY_FORM_START_HOUR) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// 列表与状态
// ─────────────────────────────────────────────────────────────

/** 默认排序：进行中置顶，其余按开始时间升序（AC-2.3.2） */
export function sortTasksForDisplay<T extends TaskLike>(tasks: ReadonlyArray<T>): T[] {
  const weight = (t: TaskLike): number => (t.status === 'RUNNING' ? 0 : 1);
  return [...tasks].sort((a, b) => {
    const w = weight(a) - weight(b);
    if (w !== 0) return w;
    return a.startAt - b.startAt;
  });
}

/** 找出时间重叠的待办对（AC-2.2.8：只提示，不阻止保存） */
export interface TaskOverlap {
  firstId: string;
  secondId: string;
  overlapMs: number;
}

export function findOverlaps<T extends TaskLike>(tasks: ReadonlyArray<T>): TaskOverlap[] {
  const active = tasks.filter((t) => t.status === 'PENDING' || t.status === 'RUNNING');
  const sorted = [...active].sort((a, b) => a.startAt - b.startAt);
  const overlaps: TaskOverlap[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a || !b) continue;
    const aEnd = a.startAt + a.plannedMs;
    const overlapMs = Math.min(aEnd, b.startAt + b.plannedMs) - b.startAt;
    if (overlapMs > 0) {
      overlaps.push({ firstId: a.id, secondId: b.id, overlapMs });
    }
  }
  return overlaps;
}

/** 下一条要做的待办（首页状态横幅用，AC-2.3.4） */
export function findNextTask<T extends TaskLike>(
  tasks: ReadonlyArray<T>,
  now: number,
): T | undefined {
  const running = tasks.find((t) => t.status === 'RUNNING');
  if (running) return running;
  return tasks
    .filter((t) => t.status === 'PENDING' && t.startAt >= now)
    .sort((a, b) => a.startAt - b.startAt)[0];
}

// ─────────────────────────────────────────────────────────────
// 跨天处理（E15 / AC-2.3.5）
// ─────────────────────────────────────────────────────────────

export interface RolloverDecision {
  /** 应被标记为 MISSED 的待办 id */
  toMiss: string[];
  /** 需要询问用户如何处理的待办 */
  needsPrompt: TaskLike[];
}

/**
 * 跨天滚动：上一（或更早）自然日仍未完成的待办。
 * 只做「标记 + 询问」，**不自动删除或改写**——数据处置必须由用户决定。
 */
export function planRollover(
  tasks: ReadonlyArray<TaskLike>,
  todayKey: string,
): RolloverDecision {
  const stale = tasks.filter(
    (t) => t.dayKey < todayKey && (t.status === 'PENDING' || t.status === 'RUNNING'),
  );
  return {
    toMiss: stale.map((t) => t.id),
    needsPrompt: stale,
  };
}

/** 完成率（用于卡片与复盘） */
export function completionRate(tasks: ReadonlyArray<TaskLike>): number | null {
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.status === 'DONE').length;
  return done / tasks.length;
}

/** 当天已产出的金币条数之外，还需要判断「连续 3 天未完成」以给出拆小建议（AC-2.3.5） */
export function shouldSuggestSplitting(
  tasksByDay: ReadonlyMap<string, ReadonlyArray<TaskLike>>,
  title: string,
  todayKey: string,
  lookbackDays: number,
): boolean {
  let consecutiveMissed = 0;
  const keys = [...tasksByDay.keys()].sort().reverse();
  const beforeToday = keys.filter((k) => k < todayKey);
  for (const key of beforeToday) {
    const dayTasks = tasksByDay.get(key) ?? [];
    const same = dayTasks.filter((t) => t.title === title);
    if (same.length === 0) break;
    if (same.every((t) => t.status === 'MISSED' || t.status === 'SKIPPED')) consecutiveMissed += 1;
    else break;
    if (consecutiveMissed >= lookbackDays) break;
  }
  return consecutiveMissed >= lookbackDays;
}

// ─────────────────────────────────────────────────────────────
// 到点提醒与宽限期（FR-1.2 / AC-1.4.8）
// ─────────────────────────────────────────────────────────────

export type TaskPhase =
  /** 还没到提醒时间 */
  | 'UPCOMING'
  /** 到了「提前 5 分钟」提醒窗口，但还没到点 */
  | 'REMINDER'
  /** 到点了，处于 3 分钟宽限期 */
  | 'GRACE'
  /** 已到点且宽限期已过（应自动进入专注） */
  | 'DUE'
  /** 已过了整个计划时长 */
  | 'OVERDUE';

/**
 * 判断某条待办此刻处于哪个阶段。
 *
 * 这是「到点自动进入专注」的唯一判定入口——所有提醒、宽限、自动进入
 * 都必须基于它，避免各处各写一套时间比较（口径漂移）。
 */
export function phaseOfTask(task: TaskLike, now: number): TaskPhase {
  if (task.status === 'DONE' || task.status === 'SKIPPED' || task.status === 'MISSED') {
    // 已处理的待办不再触发任何提醒
    return 'UPCOMING';
  }
  const start = task.startAt;
  const end = start + task.plannedMs;
  if (now >= end) return 'OVERDUE';
  if (now >= start + GRACE_PERIOD_MS) return 'DUE';
  if (now >= start) return 'GRACE';
  if (now >= start - REMINDER_LEAD_MS) return 'REMINDER';
  return 'UPCOMING';
}

export interface TaskReminder {
  taskId: string;
  title: string;
  phase: TaskPhase;
  startAt: number;
  /** 距开始还有多久（已开始则为负） */
  msUntilStart: number;
  /** 宽限期还剩多久；不在宽限期时为 0 */
  graceRemainingMs: number;
}

/**
 * 选出此刻需要提醒用户的待办。
 *
 * `alreadyNotifiedIds` 用于防止重复打扰：同一条待办的同一个阶段只提醒一次
 * （PRD 4.3「通知克制原则」：单日系统级通知 ≤ 8 条）。
 */
export function collectReminders<T extends TaskLike>(
  tasks: ReadonlyArray<T>,
  now: number,
  alreadyNotifiedIds: ReadonlySet<string>,
): TaskReminder[] {
  const reminders: TaskReminder[] = [];
  for (const task of tasks) {
    const phase = phaseOfTask(task, now);
    if (phase === 'UPCOMING' || phase === 'OVERDUE') continue;
    const key = `${task.id}:${phase}`;
    if (alreadyNotifiedIds.has(key)) continue;

    const graceStart = task.startAt + GRACE_PERIOD_MS;
    reminders.push({
      taskId: task.id,
      title: task.title,
      phase,
      startAt: task.startAt,
      msUntilStart: task.startAt - now,
      graceRemainingMs: phase === 'GRACE' ? Math.max(0, graceStart - now) : 0,
    });
  }
  return reminders.sort((a, b) => a.startAt - b.startAt);
}

/** 提醒的唯一键：`待办id:阶段`，用于持久化「已提醒过」 */
export function reminderKey(taskId: string, phase: TaskPhase): string {
  return `${taskId}:${phase}`;
}

/** 该阶段是否应触发系统级通知（宽限期与到点都通知一次，其余不打扰） */
export function shouldNotify(phase: TaskPhase): boolean {
  return phase === 'REMINDER' || phase === 'GRACE';
}

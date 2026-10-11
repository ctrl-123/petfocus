/**
 * 待办的持久化用例层。
 *
 * 职责边界（AGENTS.md 第 2 节）：
 * - 业务规则在 `@petfocus/shared` 的 domain（已单测）
 * - 本文件只做「调用规则 + 读写仓储 + 组装记录」
 * - React 组件只负责渲染与交互，不写规则
 */
import {
  dayKeyOf,
  newIdempotencyKey,
  validateNewTask,
  type NewTaskInput,
  type TaskRecord,
  type ValidationError,
} from '@petfocus/shared';
import { getRuntime } from '../../app/runtime.ts';

/** 默认预计时长（25 分钟）。只影响 UI 默认值，不参与任何结算计算 */
const DEFAULT_PLANNED_MS = 25 * 60_000;

export interface CreateTaskOutcome {
  ok: boolean;
  task?: TaskRecord;
  errors?: ValidationError[];
}

function makeRecord(values: {
  dayKey: string;
  title: string;
  startAt: number;
  plannedMs: number;
  priority: TaskRecord['priority'];
  note?: string;
}, now: number): TaskRecord {
  const record: TaskRecord = {
    id: newIdempotencyKey(),
    dayKey: values.dayKey,
    title: values.title,
    startAt: values.startAt,
    plannedMs: values.plannedMs,
    priority: values.priority,
    status: 'PENDING',
    linkedSessionIds: [],
    createdAt: now,
    updatedAt: now,
  };
  if (values.note !== undefined) record.note = values.note;
  return record;
}

/** 新建一条待办：先校验（规则在 domain），再落库 */
export async function createTask(input: NewTaskInput): Promise<CreateTaskOutcome> {
  const validated = validateNewTask(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };

  const { repositories } = getRuntime();
  const record = makeRecord(validated.values, input.now);
  await repositories.tasks.put(record);
  return { ok: true, task: record };
}

/** 批量新建（每日填写表单一次提交多条） */
export async function createTasks(inputs: ReadonlyArray<NewTaskInput>): Promise<{
  created: TaskRecord[];
  errorsByIndex: Map<number, ValidationError[]>;
}> {
  const created: TaskRecord[] = [];
  const errorsByIndex = new Map<number, ValidationError[]>();
  for (const [index, input] of inputs.entries()) {
    const result = await createTask(input);
    if (result.ok && result.task) created.push(result.task);
    else if (result.errors) errorsByIndex.set(index, result.errors);
  }
  return { created, errorsByIndex };
}

export type TaskPatch = Partial<Pick<TaskRecord, 'title' | 'startAt' | 'plannedMs' | 'priority' | 'note' | 'status'>>;

/** 更新待办（自动维护 updatedAt） */
export async function updateTask(id: string, patch: TaskPatch, now: number): Promise<TaskRecord | undefined> {
  const { repositories } = getRuntime();
  const existing = await repositories.tasks.get(id);
  if (!existing) return undefined;
  const next: TaskRecord = { ...existing, ...patch, updatedAt: now };
  // 归属日必须用共享的 04:00 规则推导，不能自己写一份（否则统计口径会漂移）
  if (patch.startAt !== undefined) next.dayKey = dayKeyOf(patch.startAt);
  await repositories.tasks.put(next);
  return next;
}

/**
 * 标记完成。返回是否成功。
 * 注意：金币发放不在这里——它属于结算流程（走 outbox 与服务端），
 * 由 M4/M8 的结算用例负责，避免"本地随便发币"。
 */
export async function completeTask(id: string, now: number): Promise<TaskRecord | undefined> {
  return updateTask(id, { status: 'DONE' }, now);
}

/** 顺延到新时间（保留原记录，不新建） */
export async function deferTask(id: string, newStartAt: number, now: number): Promise<TaskRecord | undefined> {
  const updated = await updateTask(id, { startAt: newStartAt, status: 'PENDING' }, now);
  if (updated) {
    await getRuntime().repositories.tasks.put({ ...updated, deferredTo: newStartAt });
  }
  return updated;
}

/** 跳过（需原因，PRD AC-2.3.3） */
export async function skipTask(
  id: string,
  reason: NonNullable<TaskRecord['skipReason']>,
  now: number,
): Promise<TaskRecord | undefined> {
  const updated = await updateTask(id, { status: 'SKIPPED' }, now);
  if (updated) {
    await getRuntime().repositories.tasks.put({ ...updated, skipReason: reason });
  }
  return updated;
}

/** 软删除（AGENTS.md 第 6 节：只做软删除） */
export async function deleteTask(id: string, now: number): Promise<void> {
  const { repositories } = getRuntime();
  const existing = await repositories.tasks.get(id);
  if (!existing) return;
  await repositories.tasks.put({ ...existing, deletedAt: now, updatedAt: now });
}

/** 读取当天待办（过滤软删除） */
export async function listTodayTasks(dayKey: string): Promise<TaskRecord[]> {
  const rows = await getRuntime().repositories.tasks.byDay(dayKey);
  return rows.filter((r) => r.deletedAt === undefined);
}

/** 读取最近若干天的待办，用于「连续未完成」建议（AC-2.3.5） */
export async function listTasksByDay(
  dayKeys: ReadonlyArray<string>,
): Promise<Map<string, TaskRecord[]>> {
  const result = new Map<string, TaskRecord[]>();
  for (const key of dayKeys) {
    result.set(key, await listTodayTasks(key));
  }
  return result;
}

export { DEFAULT_PLANNED_MS };

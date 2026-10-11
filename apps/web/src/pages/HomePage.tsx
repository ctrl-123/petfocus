import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DAY_BOUNDARY_HOUR,
  PENALTY,
  dayKeyOf,
  findNextTask,
  formatDuration,
  planRollover,
  shouldShowDailyForm,
  shouldShowPlanHint,
  type TaskRecord,
} from '@petfocus/shared';
import { Button } from '../components/Button.tsx';
import { getRuntime } from '../app/runtime.ts';
import { usePlatform } from '../platform/index.ts';
import { DailyTaskForm } from '../features/tasks/DailyTaskForm.tsx';
import { TaskList } from '../features/tasks/TaskList.tsx';
import { useTaskReminders } from '../features/tasks/use-task-reminders.ts';
import {
  completeTask,
  deferTask,
  deleteTask,
  listTodayTasks,
  skipTask,
} from '../features/tasks/usecases.ts';

/** KV 键：记录「今天是否已弹过/已跳过」，避免刷新导致重复弹窗 */
const KV_PROMPTED_DAY = 'tasks.formPromptedDay';
const KV_SKIPPED_DAY = 'tasks.formSkippedDay';

/** 顺延的默认偏移（1 小时后） */
const DEFER_OFFSET_MS = 60 * 60_000;

interface HomePageProps {
  now: number;
  /** 平台能力的如实说明（由 App 统一提供，避免首页自己重复探测） */
  capabilityDescription: string;
  /** 启动专注/锁机会话（会话状态由 App 持有，见 App.tsx 的说明） */
  onStartSession: (input: { kind: 'FOCUS' | 'LOCK'; plannedMs: number; title: string; taskId?: string; plannedStartAt?: number }) => void;
  /** 宠物面板（由 App 注入，含余额与商城入口） */
  petSlot?: ReactNode;
}

export function HomePage({ now, capabilityDescription, onStartSession, petSlot }: HomePageProps): JSX.Element {
  const todayKey = useMemo(() => dayKeyOf(now), [now]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [skippedToday, setSkippedToday] = useState(false);
  const [rolloverCount, setRolloverCount] = useState(0);

  const reload = useCallback(async (): Promise<TaskRecord[]> => {
    const fresh = await listTodayTasks(todayKey);
    setTasks(fresh);
    return fresh;
  }, [todayKey]);

  // 启动后读取状态并决定是否弹「今日填写」
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { kv, repositories } = getRuntime();
      const [skipped, prompted] = await Promise.all([
        kv.get<string>(KV_SKIPPED_DAY),
        kv.get<string>(KV_PROMPTED_DAY),
      ]);
      const fresh = await reload();

      // 跨天未完成检查（AC-2.3.5）：只统计、只提示，不自动改写用户数据
      const all = await repositories.tasks.all();
      const rollover = planRollover(
        all.map((t) => ({
          id: t.id,
          dayKey: t.dayKey,
          title: t.title,
          startAt: t.startAt,
          plannedMs: t.plannedMs,
          priority: t.priority,
          status: t.status,
        })),
        todayKey,
      );

      if (cancelled) return;
      setSkippedToday(skipped === todayKey);
      setRolloverCount(rollover.toMiss.length);
      setLoaded(true);

      const decision = shouldShowDailyForm({
        now,
        todayTaskCount: fresh.length,
        skippedToday: skipped === todayKey,
        alreadyPromptedToday: prompted === todayKey,
      });
      if (decision.show) {
        setFormOpen(true);
        await kv.set(KV_PROMPTED_DAY, todayKey);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 只在进入当天时重跑一次；now 变化（秒级）不应重新弹窗
  }, [todayKey, reload]);

  const handleSaved = async (): Promise<void> => {
    setFormOpen(false);
    await reload();
  };

  const handleSkipForm = async (): Promise<void> => {
    const { kv } = getRuntime();
    await kv.set(KV_SKIPPED_DAY, todayKey);
    setSkippedToday(true);
    setFormOpen(false);
  };

  const handleComplete = async (id: string): Promise<void> => {
    await completeTask(id, Date.now());
    await reload();
  };

  const handleDefer = async (id: string): Promise<void> => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    await deferTask(id, task.startAt + DEFER_OFFSET_MS, Date.now());
    await reload();
  };

  const handleSkip = async (id: string): Promise<void> => {
    // 跳过必须留原因（AC-2.3.3）。这里给一个最小可用的选择，完整原因面板放 M4。
    await skipTask(id, 'OTHER', Date.now());
    await reload();
  };

  const handleDelete = async (id: string): Promise<void> => {
    await deleteTask(id, Date.now());
    await reload();
  };

  const nextTask = findNextTask(
    tasks.map((t) => ({
      id: t.id,
      dayKey: t.dayKey,
      title: t.title,
      startAt: t.startAt,
      plannedMs: t.plannedMs,
      priority: t.priority,
      status: t.status,
    })),
    now,
  );
  const doneCount = tasks.filter((t) => t.status === 'DONE').length;
  const showHint = loaded && shouldShowPlanHint({ now, todayTaskCount: tasks.length });

  // 到点提醒：页面存活时精确；页面关闭时无法触发（浏览器硬限制，已在 UI 说明）
  const { platform } = usePlatform();
  const { active: reminder, dismiss: dismissReminder } = useTaskReminders(
    tasks.map((t) => ({
      id: t.id,
      dayKey: t.dayKey,
      title: t.title,
      startAt: t.startAt,
      plannedMs: t.plannedMs,
      priority: t.priority,
      status: t.status,
    })),
    now,
    platform,
  );

  /** 从一条待办启动专注：带上计划时长与开始时间（用于准时判定） */
  const startFocusForTask = (task: TaskRecord): void => {
    onStartSession({
      kind: 'FOCUS',
      plannedMs: task.plannedMs,
      title: task.title,
      taskId: task.id,
      plannedStartAt: task.startAt,
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-ink-900">今天</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          {todayKey} · 已完成 {doneCount}/{tasks.length}
        </p>
      </header>

      {/* 状态横幅（AC-2.3.4）：空闲时显示下一项与倒计时 */}
      <section
        aria-live="polite"
        className="mb-4 rounded-card bg-white/70 p-4 ring-1 ring-ink-200"
      >
        {nextTask ? (
          <div>
            <p className="text-xs text-ink-400">下一项</p>
            <p className="mt-0.5 font-medium text-ink-900">
              {formatClock(nextTask.startAt)} {nextTask.title}
            </p>
            <p className="mt-1 text-sm text-ink-500">
              {nextTask.startAt > now
                ? `还有 ${formatDuration(nextTask.startAt - now)}`
                : '已到计划时间'}
            </p>
          </div>
        ) : (
          <p className="text-ink-500">
            {tasks.length === 0 ? '今天还没有安排。' : '今天的安排都处理完了。'}
          </p>
        )}
      </section>

      {/* 宠物：首页的情感锚点，也是本页的主角之一（PRD FR-6.2.2：不遮挡待办与操作按钮） */}
      {petSlot ? <div className="mb-4">{petSlot}</div> : null}

      {showHint ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-card bg-amber-soft/30 p-3">
          <p className="text-sm text-ink-700">
            {skippedToday ? '今天还没排计划 · 现在排也来得及' : '今天还没排计划 · 花 30 秒排一下'}
          </p>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            去排计划
          </Button>
        </div>
      ) : null}

      {rolloverCount > 0 ? (
        <div className="mb-4 rounded-card bg-clay-soft/20 p-3">
          <p className="text-sm text-clay-deep">
            有 {rolloverCount} 件之前没做完的事。要不要把它拆小一点？
          </p>
        </div>
      ) : null}

      {/* 到点提醒横幅（AC-1.4.8 宽限期 / FR-1.2 提前提醒） */}
      {reminder ? (
        <section
          aria-live="assertive"
          className="mb-4 rounded-card bg-amber-soft/40 p-4 ring-1 ring-amber-base"
        >
          <p className="text-xs text-ink-500">
            {reminder.phase === 'REMINDER' ? '即将开始' : '到点了'}
          </p>
          <p className="mt-0.5 font-medium text-ink-900">{reminder.title}</p>
          <p className="mt-1 text-sm text-ink-600">
            {reminder.phase === 'REMINDER'
              ? `${formatDuration(Math.max(0, reminder.msUntilStart))}后开始`
              : reminder.phase === 'GRACE'
                ? `还有 ${Math.ceil(reminder.graceRemainingMs / 1000)} 秒准备时间，之后会自动进入专注`
                : '该开始专注了'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                const task = tasks.find((t) => t.id === reminder.taskId);
                if (task) startFocusForTask(task);
              }}
            >
              现在开始专注
            </Button>
            <Button variant="ghost" size="sm" onClick={dismissReminder}>
              稍后
            </Button>
          </div>
        </section>
      ) : null}

      {/* 软约束状态如实标注（AGENTS.md 原则 1：绝不假装有拦截能力） */}
      <p className="mb-4 rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-500">{capabilityDescription}</p>

      {/* 锁机入口：没有待办时主动把自己关起来（FR-3） */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card bg-white/70 p-3 ring-1 ring-ink-200">
        <span className="text-sm text-ink-600">没有待办时，也可以主动锁机：</span>
        {[25, 45, 60, 90].map((minutes) => (
          <Button
            key={minutes}
            variant="outline"
            size="sm"
            onClick={() =>
              onStartSession({
                kind: 'LOCK',
                plannedMs: minutes * 60_000,
                title: `锁机 ${minutes} 分钟`,
                plannedStartAt: Date.now(),
              })
            }
          >
            {minutes} 分钟
          </Button>
        ))}
      </div>

      <TaskList
        tasks={tasks}
        now={now}
        onStartFocus={startFocusForTask}
        onComplete={(id) => void handleComplete(id)}
        onDefer={(id) => void handleDefer(id)}
        onSkip={(id) => void handleSkip(id)}
        onDelete={(id) => void handleDelete(id)}
      />

      <DailyTaskForm
        open={formOpen}
        now={now}
        onSaved={() => void handleSaved()}
        onSkip={() => void handleSkipForm()}
      />

      {/* 内部自检信息：不占用用户注意力，但排查时有据可依 */}
      <p className="mt-6 text-center text-[11px] text-ink-300">
        自然日边界 {DAY_BOUNDARY_HOUR}:00 · 越界罚 {PENALTY.breachCoin} 币
      </p>
    </div>
  );
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

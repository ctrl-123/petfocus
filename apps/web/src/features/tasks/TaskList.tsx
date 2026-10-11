import { formatDuration, sortTasksForDisplay, type TaskRecord } from '@petfocus/shared';
import { Button } from '../../components/Button.tsx';

interface TaskListProps {
  tasks: ReadonlyArray<TaskRecord>;
  now: number;
  onComplete: (id: string) => void;
  onDefer: (id: string) => void;
  onSkip: (id: string) => void;
  onDelete: (id: string) => void;
  /** 立即开始这条待办的专注（不必等到点） */
  onStartFocus: (task: TaskRecord) => void;
}

const STATUS_LABEL: Record<TaskRecord['status'], string> = {
  PENDING: '待开始',
  RUNNING: '进行中',
  DONE: '已完成',
  DEFERRED: '已顺延',
  SKIPPED: '已跳过',
  MISSED: '未完成',
};

const STATUS_CLASS: Record<TaskRecord['status'], string> = {
  PENDING: 'bg-ink-100 text-ink-600',
  RUNNING: 'bg-amber-soft/40 text-amber-deep',
  DONE: 'bg-moss-soft/40 text-moss-deep',
  DEFERRED: 'bg-ink-100 text-ink-500',
  SKIPPED: 'bg-ink-100 text-ink-400',
  MISSED: 'bg-clay-soft/30 text-clay-deep',
};

function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 今日待办列表（PRD FR-2.3）。
 *
 * 无障碍要点（NFR-5.1）：
 * - 每条待办的操作都是真实 <button>，Tab 可依次到达
 * - 状态不只靠颜色区分，同时有文字标签（NFR-5.2）
 */
export function TaskList({
  tasks,
  now,
  onComplete,
  onDefer,
  onSkip,
  onDelete,
  onStartFocus,
}: TaskListProps): JSX.Element {
  const visible = tasks.filter((t) => t.deletedAt === undefined);
  const sorted = sortTasksForDisplay(visible);

  if (sorted.length === 0) {
    return (
      <div className="rounded-card bg-white/60 p-6 text-center ring-1 ring-ink-200">
        <p className="text-ink-500">今天还没有安排。</p>
        <p className="mt-1 text-sm text-ink-400">排一件小事也算开始了。</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {sorted.map((task) => {
        const isDone = task.status === 'DONE';
        const isSkipped = task.status === 'SKIPPED';
        const isOverdue = !isDone && !isSkipped && task.startAt + task.plannedMs < now;
        return (
          <li
            key={task.id}
            className={[
              'animate-fade-up rounded-card bg-white/80 p-3 ring-1 transition',
              task.status === 'RUNNING' ? 'ring-amber-base' : 'ring-ink-200',
              isDone || isSkipped ? 'opacity-60' : '',
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <div className="w-14 shrink-0 pt-0.5 text-center">
                <div className="text-[15px] font-semibold tabular-nums text-ink-800">
                  {formatClock(task.startAt)}
                </div>
                <div className="text-[11px] text-ink-400">{formatDuration(task.plannedMs)}</div>
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={[
                    'break-words font-medium',
                    isDone ? 'text-ink-400 line-through' : 'text-ink-900',
                  ].join(' ')}
                >
                  {task.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${STATUS_CLASS[task.status]}`}>
                    {STATUS_LABEL[task.status]}
                  </span>
                  {task.priority === 'HIGH' ? (
                    <span className="rounded-full bg-clay-soft/30 px-2 py-0.5 text-clay-deep">重要</span>
                  ) : null}
                  {isOverdue ? (
                    <span className="rounded-full bg-clay-soft/30 px-2 py-0.5 text-clay-deep">
                      已过计划时间
                    </span>
                  ) : null}
                  {task.note ? <span className="text-ink-400">{task.note}</span> : null}
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                {!isDone && !isSkipped ? (
                  <Button size="sm" onClick={() => onStartFocus(task)}>
                    开始专注
                  </Button>
                ) : null}
                {!isDone && !isSkipped ? (
                  <Button variant="outline" size="sm" onClick={() => onComplete(task.id)}>
                    完成
                  </Button>
                ) : null}
                {!isDone && !isSkipped ? (
                  <Button variant="outline" size="sm" onClick={() => onDefer(task.id)}>
                    顺延
                  </Button>
                ) : null}
                {!isDone && !isSkipped ? (
                  <Button variant="ghost" size="sm" onClick={() => onSkip(task.id)}>
                    跳过
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`删除「${task.title}」`}
                  onClick={() => onDelete(task.id)}
                >
                  ✕
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 首页的「随手加一件」快速输入。
 *
 * ── 为什么需要它 ──
 * 每日首次打开会弹出排计划表单，但**新任务是在一天中间冒出来的**：
 * 临时来个活、老板加个需求、突然想起来一件事。
 * 如果只能靠那个每日弹窗加，用户就得等到第二天，或者去改已有待办——
 * 结果就是"干脆不记了"，而待办集一旦不完整，整个统计与专注都失去意义。
 *
 * ── 设计取舍 ──
 * - **一个输入框**，靠自然语言解析（`quick-input.ts`，确定性规则，不调 AI）
 *   输入「写周报 45分钟」，立刻能看出解析成了什么
 * - **提交后自动聚焦**，方便连着加好几件
 * - **解析结果可见**：用户能看见"我这句话被理解成了什么"，而不是默默猜
 * - 不遮挡其它操作：它就是一个普通表单块，不是模态框
 */
import { useCallback, useRef, useState } from 'react';
import { formatDuration, type TaskRecord, type ValidationError } from '@petfocus/shared';
import { Button } from '../../components/Button.tsx';
import { parseQuickInput } from './quick-input.ts';
import { createTask } from './usecases.ts';

interface QuickAddTaskProps {
  now: number;
  /** 添加成功后回调（用于刷新列表） */
  onAdded: (task: TaskRecord) => void | Promise<void>;
}

const DEFAULT_PLANNED_MS = 25 * 60_000;

/** 把「9点30分」落到具体时间戳；没解析出时间就用当前时刻 */
function startAtOf(now: number, hour: number | undefined, minute: number | undefined): number {
  if (hour === undefined) return now;
  const d = new Date(now);
  d.setHours(hour, minute ?? 0, 0, 0);
  return d.getTime();
}

/**
 * 把领域层的校验错误翻译成人话。
 * 领域层只给出 `{field, reason}` 这种机器可读的结构（便于表单逐字段标注），
 * 面向用户的措辞是 UI 的职责——所以映射放在这里，而不是让 domain 里塞中文文案。
 */
function messageOf(error: ValidationError): string {
  if (error.field === 'title') {
    return error.reason === 'EMPTY' ? '写点什么吧。' : '标题有点长，精简一下。';
  }
  if (error.field === 'plannedMs') {
    return '时长得是正数，而且不能太长。';
  }
  return '开始时间不太对，换个时间试试。';
}

export function QuickAddTask({ now, onAdded }: QuickAddTaskProps): JSX.Element {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const preview = text.trim().length > 0 ? parseQuickInput(text) : undefined;

  const submit = useCallback(async (): Promise<void> => {
    const raw = text.trim();
    if (raw.length === 0 || busy) return;

    const parsed = parseQuickInput(raw);
    setBusy(true);
    setError(undefined);
    try {
      const result = await createTask({
        title: parsed.title,
        startAt: startAtOf(now, parsed.hour, parsed.minute),
        plannedMs: parsed.plannedMs ?? DEFAULT_PLANNED_MS,
        priority: parsed.priority ?? 'MEDIUM',
        now,
      });

      if (!result.ok || !result.task) {
        // 校验失败时把领域层给的原因如实翻译出来，不自己编一句笼统的话
        const first = result.errors?.[0];
        setError(first ? messageOf(first) : '这条没加上，检查一下标题。');
        return;
      }

      setText('');
      setFeedback(
        parsed.parsed
          ? `已加上「${result.task.title}」· ${formatDuration(result.task.plannedMs)}`
          : `已加上「${result.task.title}」`,
      );
      await onAdded(result.task);
      // 连着加下一件是常见动作，所以把焦点留在输入框
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [text, busy, now, onAdded]);

  return (
    <section
      aria-label="快速添加待办"
      className="mb-4 rounded-card bg-white/70 p-3 ring-1 ring-ink-200"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only-focusable">新待办内容</span>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="随手加一件：写周报 45分钟"
            className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
          />
        </label>
        <Button onClick={() => void submit()} disabled={text.trim().length === 0 || busy}>
          {busy ? '加…' : '添加'}
        </Button>
      </div>

      {/*
        解析预览：让用户看见"这句话被理解成了什么"。
        只在真的解析出内容时才显示——否则每敲一个字都闪一条提示，很吵。
      */}
      {preview?.parsed ? (
        <p className="mt-2 text-xs text-ink-500">
          理解成：
          <b className="ml-1 text-ink-700">{preview.title}</b>
          {preview.hour !== undefined ? (
            <span className="ml-2">
              {String(preview.hour).padStart(2, '0')}:
              {String(preview.minute ?? 0).padStart(2, '0')}
            </span>
          ) : null}
          {preview.plannedMs !== undefined ? (
            <span className="ml-2">{formatDuration(preview.plannedMs)}</span>
          ) : null}
          {preview.priority !== undefined ? (
            <span className="ml-2">
              {preview.priority === 'HIGH' ? '高优先' : preview.priority === 'LOW' ? '低优先' : '中优先'}
            </span>
          ) : null}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-clay-deep">
          {error}
        </p>
      ) : null}

      {feedback ? (
        <p aria-live="polite" className="mt-2 text-xs text-moss-deep">
          {feedback}
        </p>
      ) : null}

      <p className="mt-1.5 text-[11px] text-ink-400">
        可以带时间和时长，例如「下午3点 复习英语 40分钟」。
      </p>
    </section>
  );
}

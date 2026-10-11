import { useMemo, useState } from 'react';
import { DAY_BOUNDARY_HOUR, dayStartOf, formatDuration } from '@petfocus/shared';
import { Button } from '../../components/Button.tsx';
import { Modal } from '../../components/Modal.tsx';
import { parseQuickInput, resolveStartAt } from './quick-input.ts';
import { createTasks, DEFAULT_PLANNED_MS } from './usecases.ts';
import type { NewTaskInput, Priority } from '@petfocus/shared';

interface DraftRow {
  key: string;
  /** 用户输入的原始文本（可能含时间/时长） */
  text: string;
  hour: number;
  minute: number;
  plannedMs: number;
  priority: Priority;
  /** 是否经过速记解析（用于提示「可修改」） */
  parsed: boolean;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: '重要',
  MEDIUM: '一般',
  LOW: '不急',
};

function newDraft(now: number): DraftRow {
  const d = new Date(now);
  return {
    key: `draft-${Math.random().toString(36).slice(2, 9)}`,
    text: '',
    hour: d.getHours(),
    minute: 0,
    plannedMs: DEFAULT_PLANNED_MS,
    priority: 'MEDIUM',
    parsed: false,
  };
}

interface DailyTaskFormProps {
  open: boolean;
  now: number;
  onSaved: (count: number) => void;
  onSkip: () => void;
}

/**
 * 今日待办填写表单（PRD FR-2.2）。
 *
 * 强制模态：`dismissOnOverlay={false}`，必须「保存」或「今天先跳过」（AC-2.2.1）。
 * 支持速记输入，解析结果**可编辑**（AC-2.2.6：「解析结果可编辑」）。
 */
export function DailyTaskForm({ open, now, onSaved, onSkip }: DailyTaskFormProps): JSX.Element {
  const [rows, setRows] = useState<DraftRow[]>(() => [newDraft(now)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const dayStart = useMemo(() => dayStartOf(now, DAY_BOUNDARY_HOUR), [now]);

  const updateRow = (key: string, patch: Partial<DraftRow>): void => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  /** 速记输入：回车即新增一行，并尽量把时间/时长/优先级解析出来 */
  const handleQuickAdd = (key: string, raw: string): void => {
    const parsed = parseQuickInput(raw);
    setRows((prev) => {
      const index = prev.findIndex((r) => r.key === key);
      if (index < 0) return prev;
      const current = prev[index];
      if (!current) return prev;
      const updated: DraftRow = {
        ...current,
        text: parsed.title,
        plannedMs: parsed.plannedMs ?? current.plannedMs,
        priority: parsed.priority ?? current.priority,
        parsed: parsed.parsed,
        hour: parsed.hour ?? current.hour,
        minute: parsed.minute ?? current.minute,
      };
      const next = [...prev];
      next[index] = updated;
      // 有实质内容时自动追加一个空行，方便连续录入
      if (updated.text.trim().length > 0) next.push(newDraft(now));
      return next;
    });
  };

  const filledRows = rows.filter((r) => r.text.trim().length > 0);

  const handleSave = async (): Promise<void> => {
    if (filledRows.length === 0) {
      setError('至少填一件事再保存；也可以点「今天先跳过」。');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const inputs: NewTaskInput[] = filledRows.map((row) => ({
        title: row.text,
        startAt: resolveStartAt(dayStart, row.hour, row.minute, DAY_BOUNDARY_HOUR),
        plannedMs: row.plannedMs,
        priority: row.priority,
        now,
      }));
      const { created, errorsByIndex } = await createTasks(inputs);
      if (errorsByIndex.size > 0) {
        const firstError = [...errorsByIndex.values()][0]?.[0];
        setError(
          firstError?.reason === 'TOO_LONG'
            ? '有内容太长了，请精简后再保存。'
            : '有内容没填完整，请检查事件名。',
        );
        return;
      }
      onSaved(created.length);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} titleId="daily-form-title">
      <h2 id="daily-form-title" className="text-lg font-semibold text-ink-900">
        今天打算做什么？
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        填完今天就不用再纠结了。可以直接写「9点 写实验报告 1小时」，我会自动识别时间和时长。
      </p>

      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-xl bg-white/70 p-3 ring-1 ring-ink-200">
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`time-${row.key}`}>
                开始时间
              </label>
              <input
                id={`time-${row.key}`}
                type="time"
                value={`${String(row.hour).padStart(2, '0')}:${String(row.minute).padStart(2, '0')}`}
                onChange={(event) => {
                  const [h, m] = event.target.value.split(':');
                  updateRow(row.key, { hour: Number(h ?? 0), minute: Number(m ?? 0) });
                }}
                className="rounded-lg border border-ink-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
              />

              <label className="sr-only" htmlFor={`text-${row.key}`}>
                事件
              </label>
              <input
                id={`text-${row.key}`}
                type="text"
                value={row.text}
                placeholder="事件名（如：写实验报告）"
                onChange={(event) => updateRow(row.key, { text: event.target.value, parsed: false })}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  handleQuickAdd(row.key, row.text);
                }}
                className="min-w-[8rem] flex-1 rounded-lg border border-ink-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
              />

              <label className="sr-only" htmlFor={`dur-${row.key}`}>
                预计时长
              </label>
              <select
                id={`dur-${row.key}`}
                value={row.plannedMs}
                onChange={(event) => updateRow(row.key, { plannedMs: Number(event.target.value) })}
                className="rounded-lg border border-ink-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
              >
                {[
                  { ms: 15 * 60_000, label: '15 分钟' },
                  { ms: 25 * 60_000, label: '25 分钟' },
                  { ms: 45 * 60_000, label: '45 分钟' },
                  { ms: 60 * 60_000, label: '1 小时' },
                  { ms: 90 * 60_000, label: '1.5 小时' },
                  { ms: 120 * 60_000, label: '2 小时' },
                ].map((option) => (
                  <option key={option.ms} value={option.ms}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor={`prio-${row.key}`}>
                优先级
              </label>
              <select
                id={`prio-${row.key}`}
                value={row.priority}
                onChange={(event) => updateRow(row.key, { priority: event.target.value as Priority })}
                className="rounded-lg border border-ink-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
              >
                {(['HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>

              {rows.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="删除这一行"
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                >
                  ✕
                </Button>
              ) : null}
            </div>

            {row.parsed ? (
              <p className="mt-1.5 text-xs text-moss-deep">
                已识别为 {String(row.hour).padStart(2, '0')}:{String(row.minute).padStart(2, '0')} ·{' '}
                {formatDuration(row.plannedMs)}，可手动调整。
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, newDraft(now)])}>
          + 再加一件
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-clay-deep">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onSkip} disabled={saving}>
          今天先跳过
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : `保存（${filledRows.length} 件）`}
        </Button>
      </div>
    </Modal>
  );
}

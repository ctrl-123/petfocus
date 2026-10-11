import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEMO_DB_NAME,
  EXPORT_REMINDER_DAYS,
  buildExportFile,
  buildImportPlan,
  applyImportPlan,
  decideDeviceId,
  exportFileName,
  shouldRemindExport,
  summarizeExport,
  validateExportFile,
  type ExportFile,
  type ExportSummary,
  type ImportMode,
  type ImportPlan,
} from '@petfocus/shared';
import { Button } from '../components/Button.tsx';
import { getRuntime, tryGetRuntime } from '../app/runtime.ts';

interface DataPageProps {
  now: number;
  /** 当前是否处于演示模式 */
  demo: boolean;
}

type ImportStage = 'IDLE' | 'PICKED' | 'PLANNED';

/**
 * 数据管理页。
 *
 * 三件事（PRD FR-8 / 技术设计 5.3.4）：
 * 1. **导出**：数据只在本机，换设备只能靠导出文件
 * 2. **导入**：先给计划让用户确认，再落盘（绝不"点一下就把数据改了"）
 * 3. **演示模式**：独立库、真实感数据，让评审者一点就能看到完整功能
 *
 * 隐私提示（AGENTS.md 第 6 节）：导出文件是**明文 JSON**，必须如实告知。
 */
export function DataPage({ now, demo }: DataPageProps): JSX.Element {
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<ExportSummary | undefined>(undefined);
  const [lastExportAt, setLastExportAt] = useState<number | undefined>(undefined);
  const [feedback, setFeedback] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // 导入流程
  const [stage, setStage] = useState<ImportStage>('IDLE');
  const [picked, setPicked] = useState<ExportFile | undefined>(undefined);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [plan, setPlan] = useState<ImportPlan | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const runtime = tryGetRuntime();
    if (!runtime || !runtime.db) return;
    const file = await buildExportFile({
      db: runtime.db,
      deviceId: runtime.device?.deviceId ?? 'unknown',
      now: Date.now(),
    });
    setSummary(summarizeExport(file.data));
    const stored = await runtime.kv.get<number>('data.lastExportAt');
    setLastExportAt(typeof stored === 'number' ? stored : undefined);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const onExport = async (): Promise<void> => {
    try {
      const runtime = getRuntime();
      if (!runtime.db) {
        setError('当前是降级模式（数据不落盘），无法导出。');
        return;
      }
      const file = await buildExportFile({
        db: runtime.db,
        deviceId: runtime.device?.deviceId ?? 'unknown',
        now: Date.now(),
      });

      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exportFileName(Date.now());
      anchor.click();
      URL.revokeObjectURL(url);

      await runtime.kv.set('data.lastExportAt', Date.now());
      setLastExportAt(Date.now());
      setFeedback(`已导出 ${exportFileName(Date.now())}。文件是明文 JSON，请自行妥善保管。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const onPickFile = (file: File | undefined): void => {
    if (!file) return;
    setError(undefined);
    setFeedback(undefined);
    void (async () => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;

        // 用共享的校验器，不自己写一遍字段检查
        const result = validateExportFile(parsed);
        if (!result.ok || !result.file) {
          setError(`这个文件不能导入：${result.message ?? '格式不对'}`);
          setStage('IDLE');
          return;
        }
        setPicked(result.file);
        setStage('PICKED');
        setPlan(undefined);
      } catch (caught) {
        setError(`读取失败：${caught instanceof Error ? caught.message : String(caught)}`);
        setStage('IDLE');
      }
    })();
  };

  const onPlan = async (): Promise<void> => {
    const runtime = tryGetRuntime();
    if (!runtime?.db || !picked) return;
    try {
      const next = await buildImportPlan(runtime.db, picked.data, mode);
      setPlan(next);
      setStage('PLANNED');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const onApply = async (): Promise<void> => {
    const runtime = tryGetRuntime();
    if (!runtime?.db || !plan) return;
    try {
      await applyImportPlan(runtime.db, plan);
      setFeedback(
        `导入完成：新增 ${plan.stats.added} 条，跳过 ${plan.stats.skipped} 条。刷新页面即可看到。`,
      );
      setStage('IDLE');
      setPicked(undefined);
      setPlan(undefined);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const deviceChoice = picked
    ? decideDeviceId(tryGetRuntime()?.device?.deviceId ?? '', picked.deviceId)
    : undefined;

  const daysSinceExport = lastExportAt === undefined ? undefined : Math.floor((now - lastExportAt) / 86_400_000);
  const remindExport = shouldRemindExport(lastExportAt, now);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <h1 className="mb-4 text-xl font-semibold text-ink-900">数据管理</h1>

      {error ? (
        <p role="alert" className="mb-4 rounded-card bg-clay-soft/25 p-4 text-sm text-clay-deep">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p aria-live="polite" className="mb-4 rounded-card bg-moss-soft/30 p-4 text-sm text-moss-deep">
          {feedback}
        </p>
      ) : null}

      {/* ── 演示模式 ── */}
      <section className="mb-5 rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
        <h2 className="text-sm font-medium text-ink-700">演示模式</h2>
        <p className="mt-1 text-sm text-ink-600">
          用一份「像真用过一阵子」的数据看完整功能：连续 12 天健身打卡、两周的专注记录、
          20 多笔账、7 天的饮食记录。
        </p>
        <p className="mt-1 text-xs text-ink-500">
          演示数据存在**独立数据库**（{DEMO_DB_NAME}）里，与你的真实数据物理隔离，
          随时退出、互不影响。
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {demo ? (
            <>
              <span className="rounded-full bg-amber-soft/40 px-2 py-0.5 text-xs text-amber-deep">
                当前正在演示模式
              </span>
              <a
                href="?demo=0"
                className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm text-ink-700 transition hover:bg-ink-100"
              >
                退出演示，回到我的数据
              </a>
            </>
          ) : (
            <a
              href="?demo=1"
              className="rounded-lg bg-amber-base px-3 py-1.5 text-sm font-medium text-ink-900 transition hover:brightness-105"
            >
              体验演示数据
            </a>
          )}
        </div>
        {!demo ? (
          <p className="mt-2 text-xs text-ink-400">
            演示模式不会被记住——下次打开仍然是你的真实数据。
          </p>
        ) : null}
      </section>

      {/* ── 导出 ── */}
      <section className="mb-5 rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
        <h2 className="text-sm font-medium text-ink-700">导出备份</h2>
        <p className="mt-1 text-sm text-ink-600">
          数据只存在这台设备上，不会上传。要换电脑或重装浏览器，只能靠导出文件。
        </p>

        {remindExport ? (
          <p className="mt-2 rounded-lg bg-amber-soft/25 p-3 text-xs text-ink-700">
            {daysSinceExport === undefined
              ? `已经有一阵子没备份了。建议每 ${EXPORT_REMINDER_DAYS} 天导出一次。`
              : `上次导出是 ${daysSinceExport} 天前，建议每 ${EXPORT_REMINDER_DAYS} 天备份一次。`}
          </p>
        ) : lastExportAt !== undefined ? (
          <p className="mt-2 text-xs text-ink-400">
            上次导出：{daysSinceExport} 天前
          </p>
        ) : null}

        {ready && summary ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Count label="待办" value={summary.tasks} />
            <Count label="专注会话" value={summary.sessions} />
            <Count label="金币流水" value={summary.coinEntries} />
            <Count label="饮食记录" value={summary.meals} />
            <Count label="账目" value={summary.financeEntries} />
            <Count label="健身记录" value={summary.fitnessRecords} />
            <Count label="宠物" value={summary.hasPet ? 1 : 0} />
            <Count label="配额记录" value={summary.quotaEntries} />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-ink-400">正在统计数据量…</p>
        )}

        <div className="mt-3">
          <Button onClick={() => void onExport()}>导出为 JSON 文件</Button>
        </div>
        <p className="mt-2 text-xs text-clay-deep">
          ⚠️ 导出文件是**明文 JSON**（包含你的记账与饮食记录），请自行妥善保管，不要随手发给别人。
        </p>
      </section>

      {/* ── 导入 ── */}
      <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
        <h2 className="text-sm font-medium text-ink-700">导入备份</h2>
        <p className="mt-1 text-sm text-ink-600">
          导入前会先给你一份「将要发生什么」的计划，确认后才写入。
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => onPickFile(event.target.files?.[0])}
            className="hidden"
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            选择备份文件
          </Button>
          {picked ? (
            <span className="text-xs text-ink-500">
              已选择：{picked.data.tasks.length} 条待办 · {picked.data.sessions.length} 条会话
            </span>
          ) : null}
        </div>

        {picked && stage !== 'IDLE' ? (
          <div className="mt-3 rounded-lg bg-ink-100 p-3">
            <fieldset>
              <legend className="text-xs text-ink-600">导入方式</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {(
                  [
                    ['merge', '合并', '保留本机已有的，只补充新记录'],
                    ['replace', '覆盖', '清空本机业务数据，完全用备份替换'],
                  ] as ReadonlyArray<[ImportMode, string, string]>
                ).map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={[
                      'cursor-pointer rounded-lg border px-3 py-1.5 text-sm',
                      mode === value
                        ? 'border-amber-base bg-amber-soft/30 text-ink-900'
                        : 'border-ink-300 text-ink-600',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => {
                        setMode(value);
                        setStage('PICKED');
                        setPlan(undefined);
                      }}
                      className="sr-only"
                    />
                    {label}
                    <span className="ml-1 text-[11px] text-ink-400">{hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === 'replace' ? (
              <p className="mt-2 text-xs text-clay-deep">
                覆盖会清空本机业务数据。**请先导出当前数据**再继续。
              </p>
            ) : null}

            {deviceChoice?.decision === 'CONFLICT' ? (
              <p className="mt-2 text-xs text-ink-500">{deviceChoice.message}</p>
            ) : null}

            {stage === 'PICKED' ? (
              <div className="mt-3">
                <Button size="sm" onClick={() => void onPlan()}>
                  生成导入计划
                </Button>
              </div>
            ) : null}

            {plan ? (
              <div className="mt-3">
                <p className="text-xs text-ink-600">
                  将要发生：新增 <b>{plan.stats.added}</b> 条，跳过 <b>{plan.stats.skipped}</b> 条（已存在）。
                </p>
                <ul className="mt-2 space-y-0.5 text-[11px] text-ink-500">
                  {Object.entries(plan.stats.byEntity)
                    .filter(([, v]) => v.added > 0 || v.skipped > 0)
                    .map(([key, v]) => (
                      <li key={key}>
                        {entityLabel(key)}：新增 {v.added} · 跳过 {v.skipped}
                      </li>
                    ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => void onApply()}>
                    确认导入
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStage('PICKED');
                      setPlan(undefined);
                    }}
                  >
                    再想想
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <p className="mt-4 text-xs text-ink-400">
        本应用没有账号系统：身份只是一个本机生成的匿名设备标识，业务数据全部存在这台设备上。
        换设备请用上面的导出/导入，我们不做云端同步。
      </p>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="tabular-nums font-medium text-ink-900">{value}</dd>
    </div>
  );
}

/** 实体键 → 中文名（导入计划里给用户看） */
function entityLabel(key: string): string {
  const labels: Record<string, string> = {
    tasks: '待办',
    sessions: '专注会话',
    coinLedger: '金币流水',
    quotaLedger: '配额记录',
    pet: '宠物',
    meals: '饮食记录',
    financeEntries: '账目',
    financeCategories: '记账分类',
    financeBudgets: '预算',
    fitnessRecords: '健身记录',
    fitnessCheckins: '健身打卡',
    inventory: '背包',
    settings: '设置',
  };
  return labels[key] ?? key;
}

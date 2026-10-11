import { useCallback, useEffect, useState } from 'react';
import {
  FITNESS_PRESETS,
  FITNESS_UNIT_LABELS,
  MODULE_COIN,
  type FitnessRangeSummary,
  type MilestoneStatus,
  type StreakResult,
} from '@petfocus/shared';
import { Button } from '../components/Button.tsx';
import {
  addRecord,
  checkIn,
  isFitnessStoreReady,
  loadCheckinStrip,
  loadOverview,
  loadRangeSummary,
  removeRecord,
  type CheckinDay,
} from '../features/fitness/usecases.ts';

interface FitnessPageProps {
  now: number;
}

/** 等运行时就绪（与宠物/饮食同一套模式，见 AGENTS.md §0.5） */
const READY_POLL_MS = 50;
const READY_TIMEOUT_MS = 5_000;

interface FitnessState {
  streak: StreakResult;
  milestone: MilestoneStatus;
  todayRecords: Awaited<ReturnType<typeof loadOverview>>['todayRecords'];
  todaySummary: Awaited<ReturnType<typeof loadOverview>>['todaySummary'];
  strip: CheckinDay[];
  range: FitnessRangeSummary;
}

/**
 * 健身打卡页（PRD FR-5.1）。
 *
 * 设计原则：
 * - **今天还没打卡不断签**（domain 已实现），因此永远不会一打开就看到"连续 0 天"
 * - **不羞辱**：断签后不出现"你放弃了"这类话，只显示当前天数
 * - 重复打卡不报错也不重复给币，只提示"今天已经打过了"
 */
export function FitnessPage({ now }: FitnessPageProps): JSX.Element {
  const [state, setState] = useState<FitnessState | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<string | undefined>(undefined);

  // 添加动作记录的表单
  const [itemName, setItemName] = useState('');
  const [unit, setUnit] = useState<string>('REPS');
  const [value, setValue] = useState('20');

  const reload = useCallback(async (): Promise<void> => {
    const [overview, strip, range] = await Promise.all([
      loadOverview(now),
      loadCheckinStrip(now, 14),
      loadRangeSummary(now, 30),
    ]);
    setState({
      streak: overview.streak,
      milestone: overview.milestone,
      todayRecords: overview.todayRecords,
      todaySummary: overview.todaySummary,
      strip,
      range,
    });
  }, [now]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    void (async () => {
      while (!cancelled && !isFitnessStoreReady()) {
        if (Date.now() - startedAt > READY_TIMEOUT_MS) {
          setLoadError('本机存储启动超时，健身记录暂时无法读取。刷新页面可重试。');
          setLoading(false);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, READY_POLL_MS));
      }
      if (cancelled) return;
      try {
        await reload();
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reload]);

  const onCheckIn = async (): Promise<void> => {
    const result = await checkIn(Date.now());
    setFeedback(result.message);
    await reload();
  };

  const onAddRecord = async (): Promise<void> => {
    const result = await addRecord(
      { itemName, unit, value: Number(value) || 0 },
      Date.now(),
    );
    setFeedback(result.message);
    if (result.ok) setItemName('');
    await reload();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900">健身打卡</h1>
      </header>

      {loading ? (
        <p className="text-sm text-ink-500" role="status">
          正在读取本机记录…
        </p>
      ) : loadError ? (
        <p role="alert" className="rounded-card bg-clay-soft/25 p-4 text-sm text-clay-deep">
          健身数据读取失败：{loadError}
        </p>
      ) : state ? (
        <div className="space-y-5">
          {/* 连续天数与打卡 */}
          <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-ink-500">连续打卡</p>
                <p className="mt-0.5 text-3xl font-semibold tabular-nums text-ink-900">
                  {state.streak.current}
                  <span className="ml-1 text-base font-normal text-ink-500">天</span>
                </p>
                {state.streak.longest > state.streak.current ? (
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    历史最长 {state.streak.longest} 天
                  </p>
                ) : null}
              </div>

              <Button
                onClick={() => void onCheckIn()}
                variant={state.streak.checkedInToday ? 'outline' : 'primary'}
              >
                {state.streak.checkedInToday ? '今天已打卡' : '打卡'}
              </Button>
            </div>

            {/* 近 14 天 */}
            <div className="mt-3 flex gap-1" role="img" aria-label="近 14 天打卡情况">
              {state.strip.map((day) => (
                <div
                  key={day.dayKey}
                  className={[
                    'h-6 flex-1 rounded-sm',
                    day.checkedIn ? 'bg-moss-base' : day.hasRecords ? 'bg-amber-soft' : 'bg-ink-200',
                  ].join(' ')}
                  title={`${day.dayKey}：${day.checkedIn ? '已打卡' : day.hasRecords ? '有记录但未打卡' : '无记录'}`}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400">
              绿色为已打卡。今天还没打卡不会断签，别忘了就行。
            </p>

            {/* 里程碑进度 */}
            {state.milestone.next ? (
              <div className="mt-3 rounded-lg bg-amber-soft/25 p-3">
                <p className="text-xs text-ink-700">
                  再连续 <b>{state.milestone.daysToNext}</b> 天可达成「
                  {state.milestone.next.days} 天」里程碑，额外 +{state.milestone.next.coin} 金币。
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200">
                  <div
                    className="h-full rounded-full bg-amber-base"
                    style={{
                      width: `${Math.min(100, (state.streak.current / state.milestone.next.days) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-moss-soft/25 p-3 text-xs text-moss-deep">
                所有里程碑都达成了。这不太容易。
              </p>
            )}

            {feedback ? (
              <p aria-live="polite" className="mt-3 rounded-lg bg-ink-100 p-3 text-sm text-ink-700">
                {feedback}
              </p>
            ) : null}
          </section>

          {/* 添加动作记录 */}
          <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
            <h2 className="text-sm font-medium text-ink-700">记一次训练</h2>

            {/* 常用动作快捷选择 */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FITNESS_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setItemName(preset.name);
                    setUnit(preset.unit);
                    setValue(String(preset.defaultValue));
                  }}
                  className="rounded-lg border border-ink-300 px-2 py-1 text-xs text-ink-600 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-[9rem] flex-1">
                <span className="text-xs text-ink-500">动作</span>
                <input
                  type="text"
                  value={itemName}
                  onChange={(event) => setItemName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void onAddRecord();
                  }}
                  placeholder="例如：跑步 / 俯卧撑"
                  className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                />
              </label>

              <label className="w-24">
                <span className="text-xs text-ink-500">数量</span>
                <input
                  type="number"
                  min="0"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                />
              </label>

              <label className="w-24">
                <span className="text-xs text-ink-500">单位</span>
                <select
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink-300 px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                >
                  {Object.entries(FITNESS_UNIT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <Button onClick={() => void onAddRecord()}>记录</Button>
            </div>

            <p className="mt-2 text-[11px] text-ink-400">
              每打卡一次 +{MODULE_COIN.fitnessCheckin} 金币；每天前 {MODULE_COIN.fitnessRecordDailyMax}{' '}
              条记录各 +{MODULE_COIN.fitnessRecordPerItem} 金币。
            </p>
          </section>

          {/* 今天的记录 */}
          <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
            <h2 className="text-sm font-medium text-ink-700">
              今天的训练（{state.todaySummary.recordedCount} 条）
            </h2>
            {state.todayRecords.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">还没有记录。动一下，然后记下来。</p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {Object.entries(state.todaySummary.byUnit).map(([u, total]) => (
                    <span key={u} className="tabular-nums text-ink-700">
                      {FITNESS_UNIT_LABELS[u] ?? u} {total}
                    </span>
                  ))}
                </div>
                <ul className="mt-2 divide-y divide-ink-200">
                  {state.todayRecords.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="text-sm text-ink-800">{row.itemName}</span>
                      <span className="text-sm tabular-nums text-ink-600">
                        {row.value} {FITNESS_UNIT_LABELS[row.unit] ?? row.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            await removeRecord(row.id);
                            await reload();
                          })();
                        }}
                        aria-label={`删除 ${row.itemName}`}
                        className="rounded px-1.5 text-ink-400 transition hover:text-clay-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* 近 30 天 */}
          <section className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200">
            <h2 className="text-sm font-medium text-ink-700">近 30 天</h2>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-ink-500">打卡天数</p>
                <p className="tabular-nums font-medium text-ink-900">{state.range.checkinDays} 天</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">记录条数</p>
                <p className="tabular-nums font-medium text-ink-900">{state.range.recordCount}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">打卡率</p>
                <p className="tabular-nums font-medium text-ink-900">
                  {Math.round((state.range.checkinDays / 30) * 100)}%
                </p>
              </div>
            </div>

            {state.range.byItem.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {state.range.byItem.slice(0, 6).map((item) => (
                  <li
                    key={`${item.itemName}-${item.unit}`}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink-700">{item.itemName}</span>
                    <span className="tabular-nums text-ink-500">
                      共 {item.total} {FITNESS_UNIT_LABELS[item.unit] ?? item.unit} · {item.sessions} 次
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-500">这 30 天还没有训练记录。</p>
            )}
          </section>

          {/* 无障碍：把日历条的内容也做成可读文本 */}
          <table className="sr-only-focusable">
            <caption>近 14 天打卡明细</caption>
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">状态</th>
              </tr>
            </thead>
            <tbody>
              {state.strip.map((day) => (
                <tr key={day.dayKey}>
                  <th scope="row">{day.dayKey}</th>
                  <td>{day.checkedIn ? '已打卡' : day.hasRecords ? '有记录未打卡' : '无记录'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-[11px] text-ink-400">
            数据只存本机。记录仅供参考，不构成训练建议。
          </p>
        </div>
      ) : null}
    </div>
  );
}

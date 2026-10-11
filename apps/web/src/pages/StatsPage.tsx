import { useCallback, useEffect, useState } from 'react';
import {
  focusHeatLevel,
  formatDuration,
  type DailyStat,
  type HeatLevel,
  type HourBucket,
  type StatRange,
  type StatsSummary,
} from '@petfocus/shared';
import { DailyFocusChart, FocusCalendar, HourChart, StatCard } from '../features/stats/charts.tsx';
import {
  RANGE_PRESET_LABELS,
  loadComparison,
  loadCoverage,
  loadHourDistribution,
  loadRangeStats,
  makePresetRange,
  type DataCoverage,
  type RangePreset,
  type RangeStats,
} from '../features/stats/usecases.ts';

interface StatsPageProps {
  now: number;
}

const PRESETS: RangePreset[] = ['TODAY', 'LAST_7', 'LAST_30', 'THIS_MONTH'];

/**
 * 统计页（PRD FR-4）。
 *
 * 设计原则：
 * - **如实**：没有数据就说还没有记录，不画空图暗示"你什么都没做"（AGENTS.md 原则 2）
 * - **不羞辱**：违规时长只作事实呈现，不配"你太爱分心了"这类评语
 * - **有结论**：不只给图，还给一句可行动的结论（例如"你的高效时段是 09:00"）
 * - 每个图表都有文本等价物（NFR-5.2）
 */
export function StatsPage({ now }: StatsPageProps): JSX.Element {
  const [preset, setPreset] = useState<RangePreset>('LAST_7');
  const [stats, setStats] = useState<RangeStats | undefined>(undefined);
  const [previous, setPrevious] = useState<StatsSummary | undefined>(undefined);
  const [focusDelta, setFocusDelta] = useState<number | null | undefined>(undefined);
  const [hours, setHours] = useState<HourBucket[]>([]);
  const [coverage, setCoverage] = useState<DataCoverage | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextPreset: RangePreset): Promise<void> => {
      setLoading(true);
      setError(undefined);
      try {
        const range: StatRange = makePresetRange(now, nextPreset);
        const [current, hourBuckets, cover] = await Promise.all([
          loadRangeStats(range),
          loadHourDistribution(range),
          loadCoverage(),
        ]);
        // 环比：对比同样长度的上一个区间
        const comparison = await loadComparison(current, range.dayKeys.length);

        setStats(current);
        setHours(hourBuckets);
        setCoverage(cover);
        setPrevious(comparison.previous.summary);
        setFocusDelta(comparison.focusDelta);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(false);
      }
    },
    [now],
  );

  useEffect(() => {
    void load(preset);
  }, [load, preset]);

  const levels: Array<{ dayKey: string; level: HeatLevel; focusMs: number }> = (
    stats?.daily ?? []
  ).map((d: DailyStat) => ({
    dayKey: d.dayKey,
    focusMs: d.focusMs,
    level: focusHeatLevel(d.focusMs),
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900">统计</h1>
      </header>

      {/* 区间切换 */}
      <div role="tablist" aria-label="统计区间" className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={preset === item}
            onClick={() => setPreset(item)}
            className={[
              'rounded-lg px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep',
              preset === item
                ? 'bg-amber-base text-ink-900'
                : 'border border-ink-300 text-ink-600 hover:bg-ink-100',
            ].join(' ')}
          >
            {RANGE_PRESET_LABELS[item]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-ink-500" role="status">
          正在读取本机记录…
        </p>
      ) : error ? (
        <p role="alert" className="rounded-card bg-clay-soft/25 p-4 text-sm text-clay-deep">
          统计读取失败：{error}
        </p>
      ) : coverage?.isEmpty ? (
        // 空状态：如实说明，不画空图（避免"你什么都没做"的暗示）
        <section className="rounded-card bg-white/70 p-5 ring-1 ring-ink-200">
          <h2 className="font-medium text-ink-900">还没有可以统计的记录</h2>
          <p className="mt-2 text-sm text-ink-600">
            完成第一次专注或第一件待办之后，这里就会出现你的数据。
          </p>
          <p className="mt-1 text-sm text-ink-500">
            所有记录都只存在这台设备上，不会上传。
          </p>
          <p className="mt-3 text-sm text-ink-500">去侧边栏的「首页」记第一件待办吧。</p>
        </section>
      ) : stats ? (
        <div className="space-y-5">
          {/* 摘要 */}
          <section aria-labelledby="summary-title">
            <h2 id="summary-title" className="mb-2 text-sm font-medium text-ink-700">
              这段时间
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard
                label="专注时长"
                value={formatDuration(stats.summary.focusMs)}
                delta={focusDelta ?? undefined}
              />
              <StatCard
                label="完成任务"
                value={`${stats.summary.tasksDone}/${stats.summary.tasksPlanned}`}
                hint={
                  stats.summary.completionRate === null
                    ? '这段时间没有排计划'
                    : `完成率 ${Math.round(stats.summary.completionRate * 100)}%`
                }
              />
              <StatCard label="锁机时长" value={formatDuration(stats.summary.lockMs)} />
              <StatCard
                label="有记录的天数"
                value={`${stats.summary.activeDays} 天`}
                hint={`共 ${stats.daily.length} 天`}
              />
            </div>
          </section>

          {/* 每日专注 */}
          <section
            aria-labelledby="daily-title"
            className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200"
          >
            <h2 id="daily-title" className="mb-3 text-sm font-medium text-ink-700">
              每日专注
            </h2>
            <DailyFocusChart daily={stats.daily} />
          </section>

          {/* 专注日历 */}
          <section
            aria-labelledby="calendar-title"
            className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200"
          >
            <h2 id="calendar-title" className="mb-3 text-sm font-medium text-ink-700">
              专注日历
            </h2>
            <FocusCalendar levels={levels} />
          </section>

          {/* 时段分布 */}
          <section
            aria-labelledby="hour-title"
            className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200"
          >
            <h2 id="hour-title" className="mb-3 text-sm font-medium text-ink-700">
              你什么时候最坐得住
            </h2>
            <HourChart buckets={hours} />
          </section>

          {/* 金币与违规：只陈述事实，不评价 */}
          <section
            aria-labelledby="coin-title"
            className="rounded-card bg-white/70 p-4 ring-1 ring-ink-200"
          >
            <h2 id="coin-title" className="mb-3 text-sm font-medium text-ink-700">
              金币与配额
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-500">获得</dt>
                <dd className="tabular-nums font-medium text-moss-deep">
                  +{stats.summary.coinEarned}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">消耗</dt>
                <dd className="tabular-nums font-medium text-clay-deep">
                  −{stats.summary.coinSpent}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">用掉的退出机会</dt>
                <dd className="tabular-nums font-medium text-ink-900">
                  {stats.summary.quotaConsumed}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">离开累计</dt>
                <dd className="tabular-nums font-medium text-ink-900">
                  {stats.summary.violationMs > 0
                    ? formatDuration(stats.summary.violationMs)
                    : '无'}
                </dd>
              </div>
            </dl>
            {previous ? (
              <p className="mt-3 text-xs text-ink-400">
                上一区间：专注 {formatDuration(previous.focusMs)} · 完成{' '}
                {previous.tasksDone}/{previous.tasksPlanned}
              </p>
            ) : null}
          </section>

          {coverage?.firstDayKey ? (
            <p className="text-xs text-ink-400">
              本机最早的记录是 {coverage.firstDayKey}，共 {coverage.sessionCount} 次会话、
              {coverage.taskCount} 条待办。数据只存本机。
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

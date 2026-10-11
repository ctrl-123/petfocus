/**
 * 统计图表组件。**自己画 SVG，不引入图表库**。
 *
 * 为什么不用现成图表库：
 * - 体积预算只剩不到 10 KB（AGENTS.md：首屏 JS ≤ 350 KB）
 * - NFR-5.2 要求「图表必须提供文本等价物」，多数库默认做不到，自绘反而更直接
 *
 * 无障碍要求（NFR-5.2）：每个图表都配一个视觉隐藏但可被读屏读到的数据表。
 * 颜色不是唯一的信息载体——柱状图同时有数值标签与 title。
 */
import { formatDuration, type DailyStat, type HeatLevel, type HourBucket } from '@petfocus/shared';
import { BarChart, BarChartLabels } from './BarChart.tsx';
import { CHART_COLORS } from './chart-theme.ts';

// ─────────────────────────────────────────────────────────────
// 每日专注柱状图
// ─────────────────────────────────────────────────────────────

interface DailyFocusChartProps {
  daily: ReadonlyArray<DailyStat>;
  /** 用于把柱高换算成像素 */
  maxMs?: number;
}

export function DailyFocusChart({ daily, maxMs }: DailyFocusChartProps): JSX.Element {
  if (daily.length === 0) {
    return <p className="text-sm text-ink-400">这个区间还没有数据。</p>;
  }

  const peak = maxMs ?? Math.max(...daily.map((d) => d.focusMs), 1);
  const showLabels = daily.length <= 10;

  return (
    <figure className="m-0">
      {/* 用 SVG 柱状图：柱高是算出来的像素坐标，不依赖父元素的百分比高度 */}
      <BarChart
        ariaLabel="每日专注时长柱状图"
        maxValue={peak}
        series={[
          {
            name: '专注',
            color: CHART_COLORS.amberBase,
            values: daily.map((d) => ({
              key: d.dayKey,
              value: d.focusMs,
              title: `${d.dayKey}：专注 ${formatDuration(d.focusMs)}`,
            })),
          },
        ]}
      />
      {showLabels ? (
        <BarChartLabels labels={daily.map((d) => d.dayKey.slice(8))} />
      ) : null}
      <figcaption className="mt-2 text-xs text-ink-500">
        峰值 {formatDuration(peak)} · 共 {daily.length} 天
      </figcaption>

      <DailyTable daily={daily} />
    </figure>
  );
}

/** 图表的文本等价物：读屏可读、可被搜索 */
function DailyTable({ daily }: { daily: ReadonlyArray<DailyStat> }): JSX.Element {
  return (
    <table className="sr-only-focusable">
      <caption>每日统计明细</caption>
      <thead>
        <tr>
          <th scope="col">日期</th>
          <th scope="col">专注</th>
          <th scope="col">锁机</th>
          <th scope="col">待办完成</th>
          <th scope="col">金币</th>
        </tr>
      </thead>
      <tbody>
        {daily.map((d) => (
          <tr key={d.dayKey}>
            <th scope="row">{d.dayKey}</th>
            <td>{formatDuration(d.focusMs)}</td>
            <td>{formatDuration(d.lockMs)}</td>
            <td>
              {d.tasksDone}/{d.tasksPlanned}
            </td>
            <td>{d.coinEarned}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────
// 专注日历热力图（PRD FR-4.2）
// ─────────────────────────────────────────────────────────────

const HEAT_CLASS: Record<HeatLevel, string> = {
  0: 'bg-ink-200',
  1: 'bg-amber-soft',
  2: 'bg-amber-base',
  3: 'bg-amber-deep',
  4: 'bg-clay-deep',
};

const HEAT_LABEL: Record<HeatLevel, string> = {
  0: '无',
  1: '少于 30 分钟',
  2: '30 分钟到 1 小时',
  3: '1 到 2 小时',
  4: '2 小时以上',
};

interface FocusCalendarProps {
  /** 与 daily 对应的热度等级（由领域函数算出） */
  levels: ReadonlyArray<{ dayKey: string; level: HeatLevel; focusMs: number }>;
}

/**
 * 日历热力图。
 * 布局按**周行**排列（每行 7 格），而不是 GitHub 那种按列展开——
 * 本项目移动端优先，横向布局在窄屏上会溢出。
 */
export function FocusCalendar({ levels }: FocusCalendarProps): JSX.Element {
  const weeks: Array<typeof levels> = [];
  for (let i = 0; i < levels.length; i += 7) {
    weeks.push(levels.slice(i, i + 7));
  }

  return (
    <figure className="m-0">
      <div className="space-y-1" role="img" aria-label="专注日历热力图">
        {weeks.map((week, index) => (
          <div key={index} className="flex gap-1">
            {week.map((cell) => (
              <div
                key={cell.dayKey}
                className={`h-4 flex-1 rounded-sm ${HEAT_CLASS[cell.level]}`}
                title={`${cell.dayKey}：${HEAT_LABEL[cell.level]}`}
              />
            ))}
            {/* 补足 7 格，保持列对齐 */}
            {Array.from({ length: 7 - week.length }, (_, i) => (
              <div key={`pad-${i}`} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
        <span>少</span>
        {([0, 1, 2, 3, 4] as HeatLevel[]).map((level) => (
          <span key={level} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${HEAT_CLASS[level]}`} aria-hidden="true" />
            <span className="sr-only-focusable">{HEAT_LABEL[level]}</span>
          </span>
        ))}
        <span>多</span>
      </figcaption>

      <table className="sr-only-focusable">
        <caption>专注日历明细</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">专注时长</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((cell) => (
            <tr key={cell.dayKey}>
              <th scope="row">{cell.dayKey}</th>
              <td>{formatDuration(cell.focusMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// ─────────────────────────────────────────────────────────────
// 时段分布（PRD AC-4.3：找出"你的黄金时段"）
// ─────────────────────────────────────────────────────────────

interface HourChartProps {
  buckets: ReadonlyArray<HourBucket>;
}

export function HourChart({ buckets }: HourChartProps): JSX.Element {
  /** 某时段的总专注（Focus + Lock 都算"坐得住"的时间） */
  const totalOf = (b: HourBucket): number => b.focusMs + b.lockMs;
  const labelOf = (b: HourBucket): string => `${String(b.hour).padStart(2, '0')}:00`;

  const used = buckets.filter((b) => totalOf(b) > 0);
  if (used.length === 0) {
    return <p className="text-sm text-ink-400">这个区间还没有专注记录。</p>;
  }

  const peak = Math.max(...buckets.map(totalOf), 1);
  /** 找出最长的时段，给出一句结论（比让用户自己看柱子有用） */
  const best = used.reduce((a, b) => (totalOf(b) > totalOf(a) ? b : a));
  const bestLabel = labelOf(best);

  return (
    <figure className="m-0">
      <BarChart
        ariaLabel="按时段分布的专注时长"
        height={112}
        maxValue={peak}
        series={[
          {
            name: '专注',
            // 最高的时段用绿色突出，其余用主色；无数据用中性色
            color: CHART_COLORS.amberBase,
            values: buckets.map((b) => ({
              key: String(b.hour),
              value: totalOf(b),
              color:
                labelOf(b) === bestLabel
                  ? CHART_COLORS.mossBase
                  : totalOf(b) > 0
                    ? CHART_COLORS.amberBase
                    : CHART_COLORS.empty,
              title: `${labelOf(b)}：${formatDuration(totalOf(b))}`,
            })),
          },
        ]}
      />
      {/* 只标 0/6/12/18 点，24 个标签在窄屏上会糊在一起 */}
      <BarChartLabels labels={buckets.map((b) => String(b.hour))} every={6} />
      <figcaption className="mt-2 text-xs text-ink-600">
        你的高效时段是 <b className="text-moss-deep">{bestLabel}</b>（累计{' '}
        {formatDuration(totalOf(best))}）
      </figcaption>

      <table className="sr-only-focusable">
        <caption>时段分布明细</caption>
        <thead>
          <tr>
            <th scope="col">时段</th>
            <th scope="col">专注时长</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.hour}>
              <th scope="row">{labelOf(b)}</th>
              <td>{formatDuration(totalOf(b))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// ─────────────────────────────────────────────────────────────
// 摘要卡片
// ─────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  /**
   * 环比变化，三种状态语义不同：
   * - `number`：有可比数据，正负表示升降
   * - `null`  ：上期没有数据，无法比较（显示「—」，**不**造一个假增长）
   * - 缺省    ：这个指标不展示环比
   */
  delta?: number | null | undefined;
  hint?: string;
}

export function StatCard({ label, value, delta, hint }: StatCardProps): JSX.Element {
  const hasDelta = typeof delta === 'number';
  return (
    <div className="rounded-card bg-white/70 p-3 ring-1 ring-ink-200">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900">{value}</p>
      {hasDelta ? (
        <p
          className={[
            'mt-0.5 text-[11px] tabular-nums',
            delta >= 0 ? 'text-moss-deep' : 'text-clay-deep',
          ].join(' ')}
        >
          {delta >= 0 ? '↑' : '↓'} {Math.abs(Math.round(delta * 100))}% 环比
        </p>
      ) : delta === null ? (
        <p className="mt-0.5 text-[11px] text-ink-400">— 上期无数据</p>
      ) : null}
      {hint ? <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p> : null}
    </div>
  );
}

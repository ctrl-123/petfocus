/**
 * SVG 柱状图。**所有统计图表都走这一个组件**。
 *
 * ── 为什么是 SVG 而不是 div + CSS 百分比高度（真实踩过的 bug）──
 * 原先的写法是：
 *   <div className="flex h-32 items-end">
 *     <div className="flex flex-col justify-end">        ← 高度 auto
 *       <div style={{ height: '60%' }} />                 ← 百分比无处可依 → 塌成 0
 * 结果：三张图（每日专注 / 近 7 天热量 / 近 14 天收支）**全是空的**，
 * 只有坐标轴标签在。而「专注日历」用的是固定 `h-4`，所以它能正常显示。
 *
 * 百分比高度只在**父元素有确定高度**时才解析。修法有两种：
 * 给中间层加 `h-full`，或改用 SVG。这里选 SVG，因为：
 * 1. 柱子的 y 与 height 是**算出来的绝对坐标**，不存在"父元素高度未定"的类别问题
 * 2. 与 `stats/charts.tsx` 里其它自绘图一致（不引入图表库，见 AGENTS.md §0.0.1）
 * 3. 无双轴对齐误差，柱顶不会出现 1px 缝隙
 *
 * ── 无障碍（NFR-5.2）──
 * 图表本身 `role="img"` 带 `aria-label`，且**必须**由调用方另外提供文本等价物。
 * 这个组件负责画，但隐藏数据表的渲染交给各页面（它们的列定义不同）。
 */
import { CHART_COLORS, CHART_FONT_SIZE } from './chart-theme.ts';

export interface BarSeriesValue {
  key: string;
  value: number;
  /** 显示用的短标签（如日期 "05"） */
  label?: string;
  title?: string;
  color?: string;
}

export interface BarSeries {
  name: string;
  values: ReadonlyArray<BarSeriesValue>;
  color: string;
  /** 柱顶是否画圆角 */
  rounded?: boolean;
}

interface BarChartProps {
  series: ReadonlyArray<BarSeries>;
  /** 图表高度（px） */
  height?: number;
  /** 每个数据组占的宽度（px），用于算总宽 */
  groupWidth?: number;
  /** 无障碍描述 */
  ariaLabel: string;
  /** Y 轴最大值；缺省时取所有系列的最大值 */
  maxValue?: number;
  /** 是否画一条基线 */
  baseline?: boolean;
}

/** 柱顶圆角半径 */
const BAR_RADIUS = 0;
/** 同一组内多根柱之间的间距 */
const INNER_GAP = 1.5;
/** 组与组之间的额外间距 */
const GROUP_GAP = 2.5;
/** 顶部留白，避免最高的柱子贴住容器上沿 */
const TOP_PADDING = 2;
/** 基线高度 */
const BASELINE_HEIGHT = 1;

/**
 * 计算一根柱子的矩形。**这是本文件的核心，也是原 bug 的修复点**：
 * 高度由「值 / 最大值 × 可用高度」算出真实像素，而不是交给 CSS 百分比。
 */
function barRect(input: {
  value: number;
  maxValue: number;
  usableHeight: number;
  x: number;
  width: number;
  /** 值为 0 时也画一条细线，让人看得出"这天确实没有"，而不是"图坏了" */
  emptyLineHeight: number;
}): { x: number; y: number; width: number; height: number } {
  const { value, maxValue, usableHeight, x, width, emptyLineHeight } = input;
  const safeMax = maxValue <= 0 ? 1 : maxValue;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  // 有值但很小时，至少给 emptyLineHeight 的高度，否则几乎看不见
  const rawHeight = value > 0 ? Math.max(emptyLineHeight, ratio * usableHeight) : emptyLineHeight;
  const height = Math.min(usableHeight, rawHeight);
  // SVG 的 y 轴向下，所以从顶部开始算
  const y = TOP_PADDING + (usableHeight - height);
  return { x, y, width, height };
}

export function BarChart({
  series,
  height = 128,
  groupWidth = 24,
  ariaLabel,
  maxValue,
  baseline = true,
}: BarChartProps): JSX.Element {
  const groupCount = Math.max(0, ...series.map((s) => s.values.length));
  if (groupCount === 0) {
    return <p className="text-sm text-ink-400">这个区间还没有数据。</p>;
  }

  const usableHeight = height - TOP_PADDING - (baseline ? BASELINE_HEIGHT : 0);
  const seriesCount = Math.max(1, series.length);
  const totalWidth = groupCount * groupWidth;
  const innerWidth = (groupWidth - GROUP_GAP - INNER_GAP * (seriesCount - 1)) / seriesCount;
  const barWidth = Math.max(1, innerWidth);

  const computedMax =
    maxValue !== undefined && maxValue > 0
      ? maxValue
      : Math.max(1, ...series.flatMap((s) => s.values.map((v) => v.value)));

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      className="block"
    >
      {series.map((s, seriesIndex) =>
        s.values.map((point, groupIndex) => {
          const x = groupIndex * groupWidth + GROUP_GAP / 2 + seriesIndex * (barWidth + INNER_GAP);
          const rect = barRect({
            value: point.value,
            maxValue: computedMax,
            usableHeight,
            x,
            width: barWidth,
            emptyLineHeight: 2,
          });
          const color = point.color ?? (point.value > 0 ? s.color : CHART_COLORS.empty);
          return (
            <rect
              key={`${s.name}-${point.key}`}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill={color}
              rx={s.rounded === false ? 0 : BAR_RADIUS}
            >
              {point.title ? <title>{point.title}</title> : null}
            </rect>
          );
        }),
      )}

      {baseline ? (
        <rect
          x={0}
          y={height - BASELINE_HEIGHT}
          width={totalWidth}
          height={BASELINE_HEIGHT}
          fill={CHART_COLORS.grid}
        />
      ) : null}
    </svg>
  );
}

interface BarChartLabelsProps {
  labels: ReadonlyArray<string>;
  /** 每隔几个显示一个，避免窄屏糊成一团 */
  every?: number;
}

/** 柱状图下方的标签行（与 BarChart 的 groupWidth 对齐） */
export function BarChartLabels({ labels, every = 1 }: BarChartLabelsProps): JSX.Element {
  return (
    <div className="mt-1 flex">
      {labels.map((label, index) => (
        <span
          key={`${label}-${index}`}
          className="min-w-0 flex-1 text-center text-[10px] tabular-nums"
          style={{ color: CHART_COLORS.textMuted, fontSize: CHART_FONT_SIZE }}
        >
          {index % every === 0 ? label : ''}
        </span>
      ))}
    </div>
  );
}

/**
 * 折线图（用于"趋势"类数据）。
 * 与柱状图同一套坐标计算，只是把柱换成折线。
 */
interface LineChartProps {
  values: ReadonlyArray<{ key: string; value: number; title?: string }>;
  height?: number;
  color?: string;
  ariaLabel: string;
}

export function LineChart({
  values,
  height = 120,
  color = CHART_COLORS.amberBase,
  ariaLabel,
}: LineChartProps): JSX.Element {
  if (values.length === 0) {
    return <p className="text-sm text-ink-400">这个区间还没有数据。</p>;
  }

  const width = Math.max(100, values.length * 24);
  const usableHeight = height - TOP_PADDING * 2;
  const max = Math.max(1, ...values.map((v) => v.value));

  const points = values.map((v, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const ratio = Math.max(0, Math.min(1, v.value / max));
    const y = TOP_PADDING + (usableHeight - ratio * usableHeight);
    return { x, y, ...v };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      className="block"
    >
      <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {points.map((p) => (
        <circle key={p.key} cx={p.x} cy={p.y} r={2.5} fill={color}>
          {p.title ? <title>{p.title}</title> : null}
        </circle>
      ))}
    </svg>
  );
}

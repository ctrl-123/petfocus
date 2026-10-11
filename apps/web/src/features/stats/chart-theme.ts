/**
 * 图表配色与几何常量。
 *
 * ⚠️ 为什么颜色要在这里重复写一遍（Tailwind 配置里已有）：
 * 图表改用 SVG 后，颜色通过 `fill` 属性传入，**不再走 CSS 类名**。
 * 而 Tailwind 对动态拼接的类名会做内容扫描清除（AGENTS.md §0.6 踩过一次），
 * 因此这里用显式常量，是唯一可靠的做法。
 * 取值必须与 `apps/web/tailwind.config.js` 的 `colors` 保持一致。
 */
export const CHART_COLORS = {
  /** 中性/无数据 */
  empty: '#e4d9d0',
  /** 主强调（专注、支出以外的主色） */
  amberSoft: '#f6c177',
  amberBase: '#e8a33d',
  amberDeep: '#b87a1f',
  /** 成功/完成 */
  mossBase: '#7ba05b',
  mossDeep: '#557a3a',
  /** 警示 */
  claySoft: '#d99a86',
  clayBase: '#c06a4d',
  /** 文字 */
  textMuted: '#a8927f',
  grid: '#e4d9d0',
} as const;

/** 文字用的通用 SVG 属性（中文字体回退与 Tailwind 的 fontFamily 一致） */
export const CHART_FONT_SIZE = 10;

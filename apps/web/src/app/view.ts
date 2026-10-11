/**
 * 视图类型集中定义。
 *
 * 为什么单独一个文件：`App.tsx` 与 `Sidebar.tsx` 都要用它，
 * 放在 App 里会导致 Sidebar 反向依赖 App（循环导入）。
 */
export type View = 'HOME' | 'SHOP' | 'STATS' | 'DIET' | 'FITNESS' | 'FINANCE' | 'DATA';

/** 侧边栏与其它入口展示用的中文名 */
export const VIEW_LABELS: Record<View, string> = {
  HOME: '首页',
  SHOP: '宠物商城',
  STATS: '统计',
  DIET: '饮食',
  FITNESS: '健身',
  FINANCE: '记账',
  DATA: '数据管理',
};

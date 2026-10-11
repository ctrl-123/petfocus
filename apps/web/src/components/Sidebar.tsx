/**
 * 侧边栏导航。
 *
 * 结构（对齐需求方给的草图）：
 * - 「首页」= 待办集 + 宠物面板（当前展示的那一页）
 * - 四个专项模块各自独立：统计 / 饮食 / 健身 / 记账
 * - 「商城」是宠物的附属页面，也放在这里便于直达
 *
 * 无障碍（NFR-5.2）：
 * - 用 `<nav>` + `aria-current="page"` 表达当前位置，而不是只靠颜色
 * - 全部是真实 `<button>`，Tab 可依次走完
 * - 移动端（<768px）折叠成顶部横向滚动条，不隐藏功能
 */
import type { View } from '../app/view.ts';

interface NavItem {
  view: View;
  label: string;
  icon: string;
  /** 一句话说明，桌面端 hover/移动端不显示 */
  hint: string;
}

/** 主导航：首页与四个专项模块 */
const MAIN_ITEMS: ReadonlyArray<NavItem> = [
  { view: 'HOME', label: '首页', icon: '🏠', hint: '待办集与宠物' },
  { view: 'STATS', label: '统计', icon: '📊', hint: '专注、任务与趋势' },
  { view: 'DIET', label: '饮食', icon: '🍜', hint: '记录与食物转盘' },
  { view: 'FITNESS', label: '健身', icon: '🏃', hint: '打卡与训练记录' },
  { view: 'FINANCE', label: '记账', icon: '💰', hint: '收支与预算' },
];

/** 附属页面：宠物的商城与数据管理，与"专项模块"分开列 */
const SECONDARY_ITEMS: ReadonlyArray<NavItem> = [
  { view: 'SHOP', label: '宠物商城', icon: '🛍️', hint: '装扮、食物与试穿' },
  { view: 'DATA', label: '数据管理', icon: '💾', hint: '导出、导入与演示模式' },
];

interface SidebarProps {
  current: View;
  onNavigate: (view: View) => void;
  /** 宠物余额：侧面显示，让用户随时知道有多少币 */
  balance: number;
}

export function Sidebar({ current, onNavigate, balance }: SidebarProps): JSX.Element {
  const renderItem = (item: NavItem): JSX.Element => {
    const active = current === item.view;
    return (
      <li key={item.view}>
        <button
          type="button"
          onClick={() => onNavigate(item.view)}
          aria-current={active ? 'page' : undefined}
          className={[
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep',
            // 选中态同时用背景、描边与字重表达，不只靠颜色
            active
              ? 'bg-amber-soft/40 font-medium text-ink-900 ring-1 ring-amber-base'
              : 'text-ink-600 hover:bg-ink-100',
          ].join(' ')}
        >
          <span aria-hidden="true" className="text-lg">
            {item.icon}
          </span>
          <span className="flex-1 whitespace-nowrap">{item.label}</span>
        </button>
      </li>
    );
  };

  return (
    <nav
      aria-label="主导航"
      className={[
        'shrink-0 border-ink-200 bg-white/60',
        // 移动端：顶部横向滚动条
        'border-b px-3 py-2',
        // 桌面端：加宽的左侧栏，让站点名与导航都更舒展
        'md:h-screen md:w-64 md:overflow-y-auto md:border-b-0 md:border-r md:px-4 md:py-6',
      ].join(' ')}
    >
      {/*
        站点名是整个应用的身份标识，因此给它最大的视觉权重：
        大字号 + 品牌色渐变背景 + 宠物图标。导航项刻意弱于它一个层级。
      */}
      <a
        href="/"
        className="mb-4 hidden items-center gap-3 rounded-xl bg-gradient-to-br from-amber-soft/60 to-amber-soft/20 px-3 py-3 no-underline ring-1 ring-amber-base/40 transition hover:from-amber-soft/80 md:flex"
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/80 text-2xl shadow-sm"
        >
          🐻
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-bold leading-tight tracking-tight text-ink-900">
            自律岛
          </span>
          <span className="mt-0.5 block text-[11px] leading-tight text-ink-500">个人工作台</span>
        </span>
      </a>

      {/* 移动端只显示一个精简的品牌行（横向导航条高度有限） */}
      <div className="mb-2 flex items-center gap-2 md:hidden">
        <span aria-hidden="true" className="text-lg">
          🐻
        </span>
        <span className="text-lg font-bold tracking-tight text-ink-900">自律岛</span>
        <span className="ml-auto text-xs tabular-nums text-amber-deep">{balance}</span>
      </div>

      <div className="mb-2 hidden items-center justify-between px-1 md:flex">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">功能</span>
        <span className="text-xs tabular-nums text-amber-deep">{balance} 币</span>
      </div>

      <ul className="flex gap-1 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible">
        {MAIN_ITEMS.map(renderItem)}
      </ul>

      <div className="mt-1 border-t border-ink-200 pt-1 md:mt-4 md:pt-4">
        <span className="mb-2 hidden px-1 text-[11px] font-medium uppercase tracking-wider text-ink-400 md:block">
          其他
        </span>
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible">
          {SECONDARY_ITEMS.map(renderItem)}
        </ul>
      </div>

      <div className="mt-4 hidden rounded-lg bg-ink-100/70 p-3 md:block">
        <p className="text-[11px] leading-relaxed text-ink-500">
          <span className="font-medium text-ink-700">数据只存本机</span>
          <br />
          没有账号，也不上传。换设备用「数据管理」里的导出/导入。
        </p>
      </div>
    </nav>
  );
}

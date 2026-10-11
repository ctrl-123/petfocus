/**
 * 图表渲染的静态守卫。
 *
 * ── 为什么需要这个测试 ──
 * 曾经有一个 bug：三张图表（每日专注 / 近 7 天热量 / 近 14 天收支）**在页面上完全是空的**，
 * 只有坐标轴标签在。typecheck 通过、lint 通过、全部单元测试通过、构建也成功
 * ——只有人肉打开页面才看得出来。
 *
 * 根因：柱子的高度用了 CSS 百分比（`style={{ height: '60%' }}`），
 * 而它的**父元素高度是 `auto`**。百分比高度只在父元素有确定高度时才解析，
 * 于是所有柱子塌成 0 高度。
 *
 * 修法：改用 SVG 绝对坐标（`features/stats/BarChart.tsx`）。
 *
 * 这个测试从**源码**层面守住它：禁止再出现"百分比高度 + 无确定高度的父元素"这种组合。
 * 之所以测源码而不是产物：产物里的类名是压缩过的，规则难写且易误报。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(import.meta.dirname, '..', '..');

function collectTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsx(full, acc);
    } else if (entry.endsWith('.tsx')) {
      acc.push(full);
    }
  }
  return acc;
}

const FILES = collectTsx(SRC_ROOT);

/**
 * 去掉注释再检查。
 * 必须这样做：`BarChart.tsx` 的文档注释里**故意**写了那个出错的写法当反例，
 * 不剔注释就会把说明文字当成违规代码。
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('图表渲染守卫：禁止百分比高度', () => {
  it('找到了足够多的 tsx 文件（确认扫描逻辑没坏）', () => {
    assert.ok(FILES.length > 15, `只扫到 ${FILES.length} 个 tsx，路径可能不对`);
  });

  it('没有任何组件用 CSS 百分比设置高度', () => {
    /**
     * 匹配形如 style={{ height: `${expr}%` }} 或 height: '50%' 的写法。
     * 这是导致三张图表全空的根因：父元素高度为 auto 时百分比无法解析。
     */
    const percentHeight = /height:\s*(?:`[^`]*\$\{[^}]*\}[^`]*%`|'[^']*%'|"[^"]*%")/;
    const offenders: string[] = [];

    for (const file of FILES) {
      const source = stripComments(readFileSync(file, 'utf8'));
      source.split(/\r?\n/).forEach((line, index) => {
        if (percentHeight.test(line)) {
          offenders.push(`${path.relative(SRC_ROOT, file)}:${index + 1} → ${line.trim()}`);
        }
      });
    }

    assert.deepEqual(
      offenders,
      [],
      `发现百分比高度（会在父元素高度为 auto 时塌成 0，导致图表全空）：\n${offenders.join('\n')}\n` +
        '请改用 apps/web/src/features/stats/BarChart.tsx（SVG 绝对坐标）。',
    );
  });

  it('柱状图统一走 BarChart 组件（统计 / 记账 / 饮食）', () => {
    const users = FILES.filter((file) => {
      if (file.endsWith('BarChart.tsx')) return false;
      return stripComments(readFileSync(file, 'utf8')).includes('<BarChart');
    }).map((file) => path.relative(SRC_ROOT, file));

    assert.ok(
      users.length >= 3,
      `应有至少 3 个文件使用 BarChart（统计/记账/饮食），实际 ${users.length}：${users.join(', ')}`,
    );
    for (const required of ['features/stats/charts.tsx', 'pages/DietPage.tsx', 'pages/FinancePage.tsx']) {
      assert.ok(
        users.some((u) => u.endsWith(required.replace(/\//g, path.sep))),
        `${required} 应当使用 BarChart`,
      );
    }
  });
});

describe('SVG 图表必须提供文本等价物（NFR-5.2）', () => {
  it('BarChart 组件带 role=img 与 aria-label', () => {
    const source = readFileSync(path.join(SRC_ROOT, 'features/stats/BarChart.tsx'), 'utf8');
    assert.ok(source.includes('role="img"'), 'BarChart 必须声明 role="img"');
    assert.ok(source.includes('aria-label={ariaLabel}'), 'BarChart 必须接受 aria-label');
  });

  it('每个用 BarChart 的页面都另有隐藏数据表', () => {
    for (const file of FILES) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('<BarChart')) continue;
      const rel = path.relative(SRC_ROOT, file);
      assert.ok(
        source.includes('sr-only-focusable'),
        `${rel} 用了 BarChart 但没有提供 sr-only-focusable 的文本等价物（NFR-5.2）`,
      );
    }
  });
});

describe('图表配色不依赖动态类名', () => {
  it('颜色来自 chart-theme 常量，而不是拼接的 Tailwind 类名', () => {
    /**
     * Tailwind 会清除动态拼接的类名（AGENTS.md §0.6 踩过一次）。
     * SVG 的 fill 属性必须用显式色值。
     */
    const source = readFileSync(path.join(SRC_ROOT, 'features/stats/BarChart.tsx'), 'utf8');
    assert.ok(source.includes('chart-theme.ts'), 'BarChart 必须引用 chart-theme 的色值常量');
    // 不允许出现 fill={`bg-...`} 这种把类名当颜色用的情况
    assert.ok(!/fill=\{`[^`]*bg-/.test(source), 'fill 不能用 Tailwind 类名');
  });

  it('chart-theme 的色值与 tailwind.config 一致', () => {
    const theme = readFileSync(path.join(SRC_ROOT, 'features/stats/chart-theme.ts'), 'utf8');
    const tailwind = readFileSync(path.resolve(SRC_ROOT, '..', 'tailwind.config.js'), 'utf8');

    // 抽查关键色值，确保两处没有漂移
    const pairs: ReadonlyArray<[string, string]> = [
      ['amberBase', '#e8a33d'],
      ['amberSoft', '#f6c177'],
      ['mossBase', '#7ba05b'],
      ['clayBase', '#c06a4d'],
      ['empty', '#e4d9d0'],
    ];
    for (const [name, hex] of pairs) {
      assert.ok(theme.includes(hex), `chart-theme 缺少 ${name} 的色值 ${hex}`);
      assert.ok(
        tailwind.includes(hex) || name === 'empty',
        `tailwind.config.js 里找不到 ${hex}（chart-theme 与主题色漂移了）`,
      );
    }
  });
});

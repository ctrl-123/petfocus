/**
 * 体积预算守卫（技术设计第 9 节 / NFR：首屏 JS ≤ 350 KB 未压缩）。
 *
 * 为什么需要它：预算已经被吃到 95% 以上，「再多引一个库」就超。
 * 这类问题在 typecheck、lint、单测里全都看不出来，只有构建产物能反映。
 * 人工盯着 dist 大小不可靠，因此用测试钉住。
 *
 * 判定方式：**入口 chunk**（排除按需加载的分块）是首屏必须下载的部分。
 * 懒加载的区块（ShopPanel / SessionPage / StatsPage）不计入首屏预算。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const distDir = path.join(process.cwd(), 'apps/web/dist');
const assetsDir = path.join(distDir, 'assets');

/** 首屏 JS 预算（KB，未压缩），与技术设计第 9 节一致 */
const ENTRY_BUDGET_KB = 350;
/** 首屏 CSS 预算（KB）—— 给一个宽松上限，主要防止样式失控膨胀 */
const CSS_BUDGET_KB = 60;

interface ChunkInfo {
  name: string;
  sizeKb: number;
}

function listAssets(): ChunkInfo[] | undefined {
  if (!existsSync(assetsDir)) return undefined;
  return readdirSync(assetsDir)
    .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    .map((f) => ({
      name: f,
      sizeKb: statSync(path.join(assetsDir, f)).size / 1024,
    }));
}

/**
 * 入口 chunk = 文件名形如 `index-<hash>.js` 的那个。
 * Vite 对入口用入口名（这里是 index），懒加载块用组件名。
 */
function entryChunk(assets: ChunkInfo[], ext: string): ChunkInfo | undefined {
  return assets.find((a) => a.name.startsWith('index-') && a.name.endsWith(ext));
}

describe('构建体积预算', () => {
  const assets = listAssets();

  it('已产出构建结果（未构建时跳过而非失败）', (t) => {
    if (!assets) {
      t.skip('dist/assets 不存在，先运行 pnpm build');
      return;
    }
    assert.ok(assets.length > 0);
  });

  it(`入口 JS 不超过 ${ENTRY_BUDGET_KB} KB`, (t) => {
    if (!assets) {
      t.skip('未构建，跳过');
      return;
    }
    const entry = entryChunk(assets, '.js');
    assert.ok(entry, '找不到入口 JS chunk');
    assert.ok(
      entry.sizeKb <= ENTRY_BUDGET_KB,
      `入口 JS 已达 ${entry.sizeKb.toFixed(1)} KB，超出 ${ENTRY_BUDGET_KB} KB 预算。` +
        `请把新功能改为按需加载，或先清理无用依赖。`,
    );
  });

  it(`入口 CSS 不超过 ${CSS_BUDGET_KB} KB`, (t) => {
    if (!assets) {
      t.skip('未构建，跳过');
      return;
    }
    const entry = entryChunk(assets, '.css');
    assert.ok(entry, '找不到入口 CSS');
    assert.ok(entry.sizeKb <= CSS_BUDGET_KB, `CSS 已达 ${entry.sizeKb.toFixed(1)} KB`);
  });

  it('存在按需加载的分块（证明分包没有退化）', (t) => {
    if (!assets) {
      t.skip('未构建，跳过');
      return;
    }
    const js = assets.filter((a) => a.name.endsWith('.js'));
    const lazy = js.filter((a) => !a.name.startsWith('index-'));
    assert.ok(
      lazy.length >= 3,
      `按需加载分块只有 ${lazy.length} 个（期望商城/会话/统计各一块）。` +
        `检查是否有人把懒加载模块又静态 import 了——那会让分包失效。`,
    );
  });

  it('懒加载分块本身不含入口 chunk（避免重复打包）', (t) => {
    if (!assets) {
      t.skip('未构建，跳过');
      return;
    }
    const entry = entryChunk(assets, '.js');
    assert.ok(entry);
    for (const asset of assets.filter((a) => a.name.endsWith('.js') && !a.name.startsWith('index-'))) {
      assert.ok(
        asset.sizeKb < entry.sizeKb,
        `${asset.name}（${asset.sizeKb.toFixed(1)} KB）比入口还大，分包可能有问题`,
      );
    }
  });

  it('HTML 引用了入口 JS（产物自洽）', (t) => {
    if (!assets) {
      t.skip('未构建，跳过');
      return;
    }
    const html = readFileSync(path.join(distDir, 'index.html'), 'utf8');
    assert.ok(/<script[^>]+type="module"[^>]+src=/.test(html), 'HTML 未引用模块脚本');
    assert.ok(html.includes('assets/'), 'HTML 未引用 assets 目录');
  });

  it('食物库没有被拖进首屏入口（真实踩过的坑）', (t) => {
    if (!assets) {
      t.skip('未构建，跳过');
      return;
    }
    const entry = entryChunk(assets, '.js');
    assert.ok(entry);
    const code = readFileSync(path.join(assetsDir, entry.name), 'utf8');

    /*
     * 背景：`useDiet` 一旦在 App 里静态调用，就会链式把 nutrition-db 的
     * FOOD_DB（500+ 条食物数据）打进入口，实测 +77 KB 直接超标。
     * 这里用几个只可能来自食物库的中文名做哨兵：
     * 入口里出现它们，说明食物库被同步引入了。
     */
    const foodSentinels = ['西红柿炒蛋', '方便面', '宫保鸡丁', '肥牛片'];
    const leaked = foodSentinels.filter((name) => code.includes(name));
    assert.deepEqual(
      leaked,
      [],
      `食物库被同步打进入口（发现：${leaked.join('、')}）。` +
        `请确认 useDiet / FOOD_DB 只出现在按需加载的页面里，不要提到 App.tsx。`,
    );
  });
});

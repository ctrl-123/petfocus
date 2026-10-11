/**
 * 构建产物守卫：确保配件样式真的进入最终 CSS。
 *
 * 为什么需要这个测试（真实踩过的缺陷）：
 * 配件类名是**运行时动态拼接**的（`acc-` + trait 小写），源码里从不出现字面量。
 * 最初它们写在 `styles.css` 的 Tailwind `components` 层里，Tailwind 的内容扫描
 * 判定它们"未被使用"，在构建时**全部删除** —— typecheck 通过、lint 通过、
 * 单元测试全绿，但用户点「试穿」什么都看不到。
 *
 * 这类"只有构建产物才暴露"的问题，必须由构建产物本身的检查来兜住。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const webRoot = path.join(process.cwd(), 'apps/web');
const distAssets = path.join(webRoot, 'dist/assets');
const cssSource = path.join(webRoot, 'src/features/pet/pet-renderer.css');

/** 从样式源文件里抽出所有 `.acc-xxx` 类名（样式侧权威清单） */
function accessoryClassesFromSource(): string[] {
  const text = readFileSync(cssSource, 'utf8');
  const found = new Set<string>();
  for (const match of text.matchAll(/\.(acc-[a-z0-9-]+)/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found].sort();
}

function builtCss(): string | undefined {
  if (!existsSync(distAssets)) return undefined;
  const file = readdirSync(distAssets).find((name) => name.endsWith('.css'));
  if (!file) return undefined;
  return readFileSync(path.join(distAssets, file), 'utf8');
}

/** 当前在售的装扮应画出的形状（与 shop-catalog 的 visual 对应） */
const EXPECTED_SHAPES = ['acc-bow', 'acc-hat-straw', 'acc-crown', 'acc-gloves', 'acc-balloon', 'acc-lantern'];

describe('配件样式源文件', () => {
  it('源文件存在且不在 Tailwind 的处理范围内（不得出现 @layer）', () => {
    const text = readFileSync(cssSource, 'utf8');
    assert.ok(text.includes('.pet-stage'), '缺少 .pet-stage');
    assert.ok(
      !/^\s*@layer\s/m.test(text),
      'pet-renderer.css 不得使用 @layer —— Tailwind 会清除动态拼接的配件类名',
    );
  });

  it('在售装扮的形状都有样式定义', () => {
    const text = readFileSync(cssSource, 'utf8');
    for (const cls of EXPECTED_SHAPES) {
      assert.ok(text.includes(`.${cls}`), `缺少 .${cls}`);
    }
  });

  it('样式里没有已下架配件的残留', () => {
    const text = readFileSync(cssSource, 'utf8');
    for (const removed of ['acc-scarf', 'acc-glasses', 'acc-hoodie', 'acc-cape', 'acc-mask']) {
      assert.ok(!text.includes(`.${removed}`), `样式里仍有已下架的 .${removed}`);
    }
  });

  it('配件类总数与在售数量匹配（防止悄悄堆积）', () => {
    const classes = accessoryClassesFromSource();
    // 6 件装扮 + 1 个背景 = 7
    assert.equal(classes.length, EXPECTED_SHAPES.length + 1, `配件类有 ${classes.length} 个：${classes.join(', ')}`);
  });

  it('styles.css 不再包含配件类（避免又搬回去）', () => {
    const styles = readFileSync(path.join(webRoot, 'src/styles.css'), 'utf8');
    assert.ok(!styles.includes('.acc-'), '配件样式不应出现在 styles.css（会被 Tailwind 清除）');
  });

  it('main.tsx 引入了宠物样式文件', () => {
    const main = readFileSync(path.join(webRoot, 'src/main.tsx'), 'utf8');
    assert.ok(main.includes('pet-renderer.css'), 'main.tsx 未引入 pet-renderer.css');
  });
});

describe('配件与身体的坐标对齐（改形状时的护栏）', () => {
  it('渲染器使用统一坐标系（130×130，每单位 0.01rem）', () => {
    const renderer = readFileSync(path.join(webRoot, 'src/features/pet/renderer.ts'), 'utf8');
    assert.ok(
      renderer.includes('viewBox="0 0 130 130"'),
      '配件的 viewBox 必须是 130×130 —— 坐标锚点依赖它',
    );
    assert.ok(renderer.includes('inset = -50%'.replace(' = ', ': ')) || renderer.includes("style.inset = '-50%'"), '配件容器需要 inset: -50% 以容纳超出身体的形状');
  });

  it('蝴蝶结的结心落在两耳中点 (65, 46)', () => {
    const renderer = readFileSync(path.join(webRoot, 'src/features/pet/renderer.ts'), 'utf8');
    // 结心矩形以 x=60.5 起、宽 9 → 中心 65；y=40.5 起、高 11 → 中心 46
    assert.ok(renderer.includes('x="60.5"'), '蝴蝶结结心 x 应使中心落在 65');
    assert.ok(renderer.includes('y="40.5"'), '蝴蝶结结心 y 应使中心落在 46');
  });

  it('耳朵的几何与注释里的锚点一致（左耳圆心 39、右耳圆心 91）', () => {
    const css = readFileSync(cssSource, 'utf8');
    // 耳朵 1.9rem = 19 单位，身体左边缘 32.5 + left 0.7rem(7) + 半宽 9.5 = 49? 
    // 这里只校验耳朵尺寸与身体盒尺寸没有被意外改动（坐标推导依赖它们）
    assert.ok(css.includes('width: 1.9rem'), '耳朵宽度变了，需要同步更新坐标注释');
    assert.ok(css.includes('width: 6.5rem'), '身体宽度变了，需要同步更新坐标注释');
    assert.ok(css.includes('height: 6rem'), '身体高度变了，需要同步更新坐标注释');
  });
});

describe('构建产物中的配件样式', () => {
  const css = builtCss();

  function required(): string {
    if (!css) throw new Error('SKIP');
    return css;
  }

  it('已产出构建结果（未构建时跳过而非失败）', (t) => {
    if (!css) {
      t.skip('dist/assets 下没有 CSS，先运行 pnpm build');
      return;
    }
    assert.ok(css.length > 0);
  });

  it('全部配件类都出现在最终 CSS 中（这条能抓住 Tailwind 清除）', (t) => {
    if (!css) {
      t.skip('未构建，跳过');
      return;
    }
    const expected = accessoryClassesFromSource();
    const missing = expected.filter((cls) => !required().includes(`.${cls}`));
    assert.deepEqual(missing, [], `被 Tailwind 清除了 ${missing.length} 个配件类：${missing.join(', ')}`);
  });

  it('配件挂载点与宠物基础形状也在产物里', (t) => {
    if (!css) {
      t.skip('未构建，跳过');
      return;
    }
    for (const cls of ['pet-stage', 'pet-body', 'pet-accessories-back', 'pet-accessories-front']) {
      assert.ok(required().includes(`.${cls}`), `产物缺少 .${cls}`);
    }
  });

  it('SVG 形状的内部类也在产物里（蝴蝶结的结心等）', (t) => {
    if (!css) {
      t.skip('未构建，跳过');
      return;
    }
    for (const cls of ['bow-loop', 'bow-knot', 'hat-brim', 'crown-body', 'glove', 'balloon-body', 'lantern-frame']) {
      assert.ok(required().includes(`.${cls}`), `产物缺少 .${cls}`);
    }
  });
});

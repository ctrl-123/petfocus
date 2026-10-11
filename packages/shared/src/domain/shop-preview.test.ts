/**
 * 装扮目录与试穿预览的测试。
 *
 * 这份目录经过一次「大删减」：曾有 22 件装扮、27 种绘制特征，
 * 但多数 CSS 画法经需求方预览后判定"奇怪"，最终只保留 6 件确认好看的。
 * 因此这里的断言重点从"数量多"改成**"每一件都必须画得出来、且与身体对齐"**。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HAND_ITEMS,
  HEAD_ITEMS,
  OUTFIT_ITEMS,
  SHOP_CATALOG,
  SLOT_ORDER,
  declaredTraits,
  findShopItem,
  isEquippable,
} from './shop-catalog.ts';
import {
  activePartIds,
  canEquip,
  mergeEquipment,
  previewEquip,
  sanitizeEquipment,
  type Equipment,
} from './shop.ts';
import type { EquipSlot } from '../types.ts';

/** PRD 17.2 的装扮价格区间 */
const OUTFIT_PRICE_MIN = 150;
const OUTFIT_PRICE_MAX = 2000;

/** 当前实际有商品的部位 */
const STOCKED_SLOTS: ReadonlyArray<EquipSlot> = ['HEAD', 'HAND'];

/** 各部位的商品（用于逐部位校验） */
const BY_SLOT: Record<string, ReadonlyArray<(typeof OUTFIT_ITEMS)[number]>> = {
  HEAD: HEAD_ITEMS,
  HAND: HAND_ITEMS,
};

/** 读宠物渲染样式文件（跨包，用路径解析而不是相对 import） */
function petRendererCss(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cssPath = path.resolve(
    here,
    '../../../../apps/web/src/features/pet/pet-renderer.css',
  );
  return readFileSync(cssPath, 'utf8');
}

describe('装扮目录：少而精', () => {
  it('只保留经过预览确认的 6 件装扮', () => {
    assert.equal(OUTFIT_ITEMS.length, 6, `装扮数量应为 6，实际 ${OUTFIT_ITEMS.length}`);
  });

  it('只保留头部与手持两个部位（面部/身体的画法已下架重做）', () => {
    assert.deepEqual(SLOT_ORDER, ['HEAD', 'HAND', 'BACKGROUND']);
    assert.ok(HEAD_ITEMS.length > 0);
    assert.ok(HAND_ITEMS.length > 0);
  });

  it('每个在售部位至少有 2 件可选', () => {
    for (const slot of STOCKED_SLOTS) {
      const items = BY_SLOT[slot] ?? [];
      assert.ok(items.length >= 2, `${slot} 只有 ${items.length} 件`);
    }
  });

  it('保留的正是需求方选定的那几件', () => {
    const ids = OUTFIT_ITEMS.map((i) => i.id).sort();
    assert.deepEqual(ids, [
      'outfit-balloon',
      'outfit-bow',
      'outfit-crown',
      'outfit-gloves',
      'outfit-hat-straw',
      'outfit-lantern',
    ]);
  });

  it('未保留的商品确实已下架（防止误留）', () => {
    for (const removed of ['outfit-scarf', 'outfit-glasses', 'outfit-hoodie', 'outfit-mask']) {
      assert.equal(findShopItem(removed), undefined, `${removed} 应已下架`);
    }
  });

  it('价格落在 PRD 17.2 的 150–2000 区间内', () => {
    for (const item of OUTFIT_ITEMS) {
      assert.ok(
        item.price >= OUTFIT_PRICE_MIN && item.price <= OUTFIT_PRICE_MAX,
        `${item.name} 价格 ${item.price} 越界`,
      );
    }
  });

  it('有入门款（≤220 币），保证"攒一攒就能买"', () => {
    const cheapest = Math.min(...OUTFIT_ITEMS.map((i) => i.price));
    assert.ok(cheapest <= 220, `最便宜要 ${cheapest} 币，门槛偏高`);
  });

  it('有高档奋斗目标（≥1500 币）', () => {
    const dearest = Math.max(...OUTFIT_ITEMS.map((i) => i.price));
    assert.ok(dearest >= 1500, `最贵只有 ${dearest} 币，缺少长期目标`);
  });
});

describe('可预览性：每一件都必须画得出来', () => {
  it('所有装扮都有部位与绘制特征', () => {
    for (const item of OUTFIT_ITEMS) {
      assert.ok(item.slot !== undefined, `${item.name} 缺少部位`);
      assert.ok(item.visual !== undefined, `${item.name} 缺少 visual，无法预览`);
      assert.equal(isEquippable(item), true, `${item.name} 应可装备`);
    }
  });

  it('每个声明的绘制特征都在 pet-renderer.css 里有实现（防止画不出来）', () => {
    const css = petRendererCss();
    const missing: string[] = [];
    for (const trait of declaredTraits()) {
      // trait → 类名：小写并把下划线换成连字符
      const cls = `acc-${trait.toLowerCase().replace(/_/g, '-')}`;
      if (!css.includes(`.${cls}`)) missing.push(`${trait}(.${cls})`);
    }
    assert.deepEqual(missing, [], `以下绘制特征没有样式实现：${missing.join(', ')}`);
  });

  it('pet-renderer.css 里没有多余的配件类（防止样式残留）', () => {
    const css = petRendererCss();
    const declared = new Set(
      declaredTraits().map((t) => `acc-${t.toLowerCase().replace(/_/g, '-')}`),
    );
    const inCss = new Set(
      [...css.matchAll(/\.(acc-[a-z0-9-]+)/g)].map((m) => m[1]).filter(Boolean) as string[],
    );
    const orphans = [...inCss].filter((cls) => !declared.has(cls));
    assert.deepEqual(orphans, [], `样式里有已下架配件的残留：${orphans.join(', ')}`);
  });

  it('同部位内没有重复的绘制特征（否则两件看起来一样）', () => {
    for (const slot of STOCKED_SLOTS) {
      const traits = (BY_SLOT[slot] ?? []).map((i) => i.visual);
      assert.equal(new Set(traits).size, traits.length, `${slot} 存在重复的绘制特征`);
    }
  });
});

describe('previewEquip：试穿是纯显示层行为', () => {
  it('可试穿的装扮返回该部位的覆盖', () => {
    assert.deepEqual(previewEquip(findShopItem('outfit-hat-straw')), { HEAD: 'outfit-hat-straw' });
    assert.deepEqual(previewEquip(findShopItem('outfit-bow')), { HEAD: 'outfit-bow' });
  });

  it('食物/道具不能试穿（没有部位）', () => {
    assert.equal(previewEquip(findShopItem('food-apple')), undefined);
    assert.equal(previewEquip(findShopItem('item-candy')), undefined);
  });

  it('未知商品与已下架商品都返回 undefined 而不是抛异常', () => {
    assert.equal(previewEquip(undefined), undefined);
    assert.equal(previewEquip(findShopItem('outfit-scarf')), undefined);
  });

  it('不适配当前模型的装扮不允许试穿（画不出来就不能假装能预览）', () => {
    const incompatible = { ...OUTFIT_ITEMS[0]!, id: 'x', modelCompat: 'NONE' as const };
    assert.equal(previewEquip(incompatible), undefined);
  });

  it('没有任何一件在售装扮是不可试穿的', () => {
    for (const item of OUTFIT_ITEMS) {
      assert.ok(previewEquip(item) !== undefined, `${item.name} 无法试穿`);
    }
  });

  it('试穿不要求拥有（函数签名里根本没有背包参数）', () => {
    assert.deepEqual(previewEquip(findShopItem('outfit-crown')), { HEAD: 'outfit-crown' });
  });

  it('试穿不会让 canEquip 认为已拥有', () => {
    const hat = findShopItem('outfit-hat-straw');
    assert.ok(hat);
    const decision = canEquip(hat, [], {});
    assert.equal(decision.allowed, false);
    assert.equal(decision.rejection, 'NOT_OWNED');
  });
});

describe('mergeEquipment / activePartIds', () => {
  it('试穿覆盖优先于真实装备，其余部位保持真实装备', () => {
    const equipped: Equipment = { HAND: 'outfit-lantern' };
    const preview: Equipment = { HEAD: 'outfit-crown' };
    assert.deepEqual(mergeEquipment(equipped, preview), {
      HAND: 'outfit-lantern',
      HEAD: 'outfit-crown',
    });
  });

  it('试穿与真实装备同部位时以试穿为准（这正是预览的意义）', () => {
    assert.equal(
      mergeEquipment({ HEAD: 'outfit-hat-straw' }, { HEAD: 'outfit-crown' }).HEAD,
      'outfit-crown',
    );
  });

  it('无试穿时原样返回（内容相同）', () => {
    const equipped: Equipment = { HEAD: 'outfit-bow' };
    assert.deepEqual(mergeEquipment(equipped, undefined), equipped);
  });

  it('装备为 undefined 时也能合并试穿（宠物数据未加载完的场景）', () => {
    assert.deepEqual(mergeEquipment(undefined, { HEAD: 'outfit-crown' }), { HEAD: 'outfit-crown' });
  });

  it('两者都为 undefined 时返回空对象而不是 undefined', () => {
    assert.deepEqual(mergeEquipment(undefined, undefined), {});
  });

  it('不修改传入的装备表', () => {
    const equipped: Equipment = { HEAD: 'outfit-bow' };
    mergeEquipment(equipped, { HEAD: 'outfit-crown' });
    assert.equal(equipped.HEAD, 'outfit-bow');
  });

  it('activePartIds 过滤 null 与空字符串', () => {
    assert.deepEqual(activePartIds({ HEAD: 'a', FACE: null, BODY: '', HAND: 'b' }).sort(), ['a', 'b']);
  });

  it('activePartIds 对空装备返回空数组', () => {
    assert.deepEqual(activePartIds({}), []);
  });

  it('头部与手持可同时试穿（合并后都生效）', () => {
    const merged = mergeEquipment(
      previewEquip(findShopItem('outfit-bow')),
      previewEquip(findShopItem('outfit-balloon')),
    );
    assert.equal(merged.HEAD, 'outfit-bow');
    assert.equal(merged.HAND, 'outfit-balloon');
  });
});

describe('sanitizeEquipment：商品下架后状态要能自愈', () => {
  it('丢掉已下架的部件', () => {
    assert.deepEqual(sanitizeEquipment({ HEAD: 'outfit-scarf' }), {});
  });

  it('保留仍然有效的部件', () => {
    assert.deepEqual(sanitizeEquipment({ HEAD: 'outfit-crown' }), { HEAD: 'outfit-crown' });
  });

  it('混合情况下只清掉失效的（用户不会因此丢掉其他装扮）', () => {
    const result = sanitizeEquipment({
      HEAD: 'outfit-scarf', // 已下架
      HAND: 'outfit-lantern', // 有效
    });
    assert.deepEqual(result, { HAND: 'outfit-lantern' });
  });

  it('清掉 null 与空字符串', () => {
    assert.deepEqual(sanitizeEquipment({ HEAD: null, HAND: '' }), {});
  });

  it('清掉无法绘制的商品（有部位但没 visual）', () => {
    // 用一件真实存在的、无 visual 的商品来验证分支
    const noVisual = SHOP_CATALOG.find((i) => i.slot !== undefined && i.visual === undefined);
    if (noVisual?.slot) {
      const slot: EquipSlot = noVisual.slot;
      assert.deepEqual(sanitizeEquipment({ [slot]: noVisual.id }), {});
    }
  });

  it('空装备返回空对象', () => {
    assert.deepEqual(sanitizeEquipment({}), {});
  });

  it('不修改传入对象', () => {
    const input: Equipment = { HEAD: 'outfit-scarf' };
    sanitizeEquipment(input);
    assert.equal(input.HEAD, 'outfit-scarf');
  });
});

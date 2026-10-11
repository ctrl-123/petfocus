/**
 * 商城与宠物领域逻辑单测。
 * 重点：价格区间与 PRD 一致、金币绝不为负、非叠加商品不可重复购买、装饰适配性守卫。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_LABELS,
  FOOD_ITEMS,
  FURNITURE_ITEMS,
  ITEM_ITEMS,
  OUTFIT_ITEMS,
  SHOP_CATALOG,
  SLOT_LABELS,
  findShopItem,
  isFreeItem,
} from './shop-catalog.ts';
import {
  MAX_OUTFIT_PRESETS,
  applyPurchase,
  canClearWilting,
  canEquip,
  canPurchase,
  consumeOne,
  equippedItem,
  feedWithItem,
  itemsByCategory,
  petOnce,
  quantityOf,
  randomOutfit,
  saveOutfitPreset,
  tickPet,
  unequip,
  wiltingExplanation,
  type Equipment,
  type InventoryLike,
} from './shop.ts';
import { initialVitals } from './pet-state.ts';
import { PENALTY } from '../config/index.ts';
import type { ShopCategory } from '../types.ts';

const NOW = new Date(2026, 1, 14, 10, 0, 0, 0).getTime();
const MIN = 60_000;

function inv(itemId: string, quantity = 1): InventoryLike {
  return { itemId, quantity };
}

describe('商品表完整性（PRD 17.2 的价格区间）', () => {
  it('四个分类都有商品，且都有中文标签', () => {
    const categories: ShopCategory[] = ['FOOD', 'OUTFIT', 'FURNITURE', 'ITEM'];
    for (const category of categories) {
      assert.ok(itemsByCategory(category).length > 0, `${category} 分类没有商品`);
      assert.ok(CATEGORY_LABELS[category].length > 0);
    }
  });

  it('食物价格落在 30–260（PRD 17.2）', () => {
    for (const item of FOOD_ITEMS) {
      assert.ok(item.price >= 30 && item.price <= 260, `${item.name} 价格 ${item.price} 越界`);
    }
  });

  it('装扮价格落在 150–2000（PRD 17.2）', () => {
    for (const item of OUTFIT_ITEMS) {
      assert.ok(item.price >= 150 && item.price <= 2000, `${item.name} 价格 ${item.price} 越界`);
    }
  });

  it('家具价格落在 0–1500（0 为默认场景）', () => {
    for (const item of FURNITURE_ITEMS) {
      assert.ok(item.price >= 0 && item.price <= 1500, `${item.name} 价格 ${item.price} 越界`);
    }
    assert.equal(FURNITURE_ITEMS.filter(isFreeItem).length, 1, '应恰好有一个免费默认场景');
  });

  it('商品 id 唯一', () => {
    const ids = SHOP_CATALOG.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('装扮都有部位，且部位标签齐全', () => {
    for (const item of OUTFIT_ITEMS) {
      assert.ok(item.slot !== undefined, `${item.name} 缺少部位`);
      assert.ok(SLOT_LABELS[item.slot].length > 0);
      assert.equal(item.stackable, false, '装扮不应可叠加');
    }
  });

  it('食物与道具可叠加', () => {
    for (const item of [...FOOD_ITEMS, ...ITEM_ITEMS]) {
      assert.equal(item.stackable, true, `${item.name} 应可叠加`);
    }
  });

  it('换装类商品不标 FULL（因为靠叠加层实现，见 ADR-006）', () => {
    for (const item of OUTFIT_ITEMS) {
      assert.notEqual(item.modelCompat, 'FULL', `${item.name} 不应声称模型内建支持`);
    }
  });

  it('findShopItem 可查到，未知 id 返回 undefined', () => {
    assert.equal(findShopItem('food-apple')?.name, '苹果');
    assert.equal(findShopItem('nope'), undefined);
  });
});

describe('canPurchase：购买决策', () => {
  const apple = findShopItem('food-apple'); // 30 币，可叠加
  const hat = findShopItem('outfit-hat-straw'); // 150 币，不可叠加

  it('余额充足时允许，并给出余额变化文案', () => {
    const d = canPurchase(apple, 100, []);
    assert.equal(d.allowed, true);
    assert.equal(d.price, 30);
    assert.equal(d.balanceAfter, 70);
    assert.match(d.message, /花费 30/);
    assert.match(d.message, /70/);
  });

  it('余额不足时拒绝，并说明还差多少', () => {
    const d = canPurchase(apple, 10, []);
    assert.equal(d.allowed, false);
    assert.equal(d.rejection, 'INSUFFICIENT_COIN');
    assert.match(d.message, /还差 20/);
  });

  it('余额恰好等于价格时允许（边界）', () => {
    assert.equal(canPurchase(apple, 30, []).allowed, true);
    assert.equal(canPurchase(apple, 29, []).allowed, false);
  });

  it('非叠加商品已拥有时拒绝（避免误扣币）', () => {
    const d = canPurchase(hat, 1000, [inv('outfit-hat-straw')]);
    assert.equal(d.allowed, false);
    assert.equal(d.rejection, 'ALREADY_OWNED');
  });

  it('可叠加商品已拥有时仍可再买', () => {
    assert.equal(canPurchase(apple, 100, [inv('food-apple', 5)]).allowed, true);
  });

  it('免费默认商品不进入购买流程', () => {
    const free = SHOP_CATALOG.find(isFreeItem);
    const d = canPurchase(free, 1000, []);
    assert.equal(d.allowed, false);
    assert.equal(d.rejection, 'FREE_ITEM');
  });

  it('与模型不兼容的商品拒绝购买', () => {
    const incompatible = { ...OUTFIT_ITEMS[0]!, id: 'x-incompat', modelCompat: 'NONE' as const };
    const d = canPurchase(incompatible, 9999, []);
    assert.equal(d.allowed, false);
    assert.equal(d.rejection, 'INCOMPATIBLE_WITH_MODEL');
  });

  it('未知商品拒绝且不抛异常', () => {
    assert.equal(canPurchase(undefined, 9999, []).rejection, 'UNKNOWN_ITEM');
  });

  it('不变量：任何情况下 balanceAfter 都不为负', () => {
    for (const balance of [0, 1, 29, 30, 150, 10_000]) {
      for (const item of SHOP_CATALOG) {
        const d = canPurchase(item, balance, []);
        if (d.allowed && d.balanceAfter !== undefined) {
          assert.ok(d.balanceAfter >= 0, `${item.name} 在余额 ${balance} 时算出负余额`);
        }
      }
    }
  });
});

describe('applyPurchase / consumeOne / quantityOf', () => {
  it('首次购买新建条目', () => {
    const item = findShopItem('food-apple')!;
    const next = applyPurchase([], item);
    assert.deepEqual(next, [{ itemId: 'food-apple', quantity: 1 }]);
  });

  it('可叠加商品累加数量', () => {
    const item = findShopItem('food-apple')!;
    const next = applyPurchase([inv('food-apple', 2)], item);
    assert.equal(quantityOf(next, 'food-apple'), 3);
  });

  it('非叠加商品数量保持 1（即便数据异常已有多份）', () => {
    const item = findShopItem('outfit-hat-straw')!;
    const next = applyPurchase([inv('outfit-hat-straw', 5)], item);
    assert.equal(quantityOf(next, 'outfit-hat-straw'), 1);
  });

  it('consumeOne 递减，归零后移除条目', () => {
    const one = consumeOne([inv('food-apple', 1)], 'food-apple');
    assert.equal(one.length, 0);
    const two = consumeOne([inv('food-apple', 2)], 'food-apple');
    assert.equal(quantityOf(two, 'food-apple'), 1);
  });

  it('consumeOne 对不存在的商品是空操作', () => {
    const before = [inv('food-apple', 1)];
    const after = consumeOne(before, 'nope');
    assert.equal(quantityOf(after, 'food-apple'), 1);
  });

  it('不修改传入数组（纯函数）', () => {
    const before = [inv('food-apple', 3)];
    applyPurchase(before, findShopItem('food-apple')!);
    consumeOne(before, 'food-apple');
    assert.equal(before[0]?.quantity, 3, '原数组不应被修改');
  });
});

describe('canEquip / unequip / equippedItem', () => {
  const hat = findShopItem('outfit-hat-straw')!;
  const apple = findShopItem('food-apple')!;

  it('已拥有的装扮可以装备', () => {
    const d = canEquip(hat, [inv('outfit-hat-straw')], {});
    assert.equal(d.allowed, true);
    assert.equal(d.equipment?.HEAD, 'outfit-hat-straw');
  });

  it('未拥有的装扮不能装备', () => {
    const d = canEquip(hat, [], {});
    assert.equal(d.allowed, false);
    assert.equal(d.rejection, 'NOT_OWNED');
  });

  it('免费默认家具可直接装备（视为已拥有）', () => {
    const free = SHOP_CATALOG.find(isFreeItem)!;
    assert.equal(canEquip(free, [], {}).allowed, true);
  });

  it('非装扮类商品不能装备', () => {
    const d = canEquip(apple, [inv('food-apple')], {});
    assert.equal(d.allowed, false);
    assert.equal(d.rejection, 'NOT_EQUIPMENT');
  });

  it('装备会替换同部位（不会同时戴两顶帽子）', () => {
    const crown = findShopItem('outfit-crown')!;
    const d = canEquip(crown, [inv('outfit-crown')], { HEAD: 'outfit-hat-straw' });
    assert.equal(d.equipment?.HEAD, 'outfit-crown');
  });

  it('unequip 置空该部位，其他部位不受影响', () => {
    const current: Equipment = { HEAD: 'outfit-hat-straw', BODY: 'outfit-scarf' };
    const next = unequip(current, 'HEAD');
    assert.equal(next.HEAD, null);
    assert.equal(next.BODY, 'outfit-scarf');
  });

  it('equippedItem 查得到已装备商品', () => {
    assert.equal(equippedItem({ HEAD: 'outfit-hat-straw' }, 'HEAD')?.name, '草帽');
    assert.equal(equippedItem({}, 'HEAD'), undefined);
    assert.equal(equippedItem({ HEAD: null }, 'HEAD'), undefined);
  });
});

describe('randomOutfit：只用已拥有且适配的装扮', () => {
  it('结果只包含已拥有的装扮 id', () => {
    const owned = [inv('outfit-bow'), inv('outfit-gloves')];
    for (const r of [0, 0.25, 0.75, 1]) {
      const outfit = randomOutfit(owned, {}, () => r);
      for (const id of Object.values(outfit)) {
        if (id === null || id === undefined) continue;
        assert.ok(
          ['outfit-bow', 'outfit-gloves'].includes(id),
          `随机结果含未拥有的商品：${id}`,
        );
      }
    }
  });

  it('随机源为 0（总是 < 0.5）时全部换上', () => {
    const owned = [inv('outfit-bow'), inv('outfit-gloves')];
    const outfit = randomOutfit(owned, {}, () => 0);
    assert.equal(outfit.HEAD, 'outfit-bow');
    assert.equal(outfit.HAND, 'outfit-gloves');
  });

  it('空背包时结果不变（不产生无效装备）', () => {
    const current: Equipment = { HEAD: 'outfit-bow' };
    assert.deepEqual(randomOutfit([], current, () => 0), current);
  });

  it('已下架的商品不会被换上（目录变化后自愈）', () => {
    const owned = [inv('outfit-scarf')]; // 已下架
    assert.deepEqual(randomOutfit(owned, {}, () => 0), {});
  });

  it('不修改传入的装备表', () => {
    const current: Equipment = { HEAD: 'outfit-bow' };
    randomOutfit([inv('outfit-gloves')], current, () => 0);
    assert.deepEqual(current, { HEAD: 'outfit-bow' });
  });
});

describe('saveOutfitPreset：最多 3 套', () => {
  it('未满时追加', () => {
    const r = saveOutfitPreset([{ HEAD: 'a' }], { HEAD: 'b' });
    assert.equal(r.presets.length, 2);
    assert.equal(r.replaced, false);
  });

  it('满 3 套后替换最早的（shift 而非报错）', () => {
    const full: Equipment[] = [{ HEAD: 'a' }, { HEAD: 'b' }, { HEAD: 'c' }];
    const r = saveOutfitPreset(full, { HEAD: 'd' });
    assert.equal(r.presets.length, MAX_OUTFIT_PRESETS);
    assert.equal(r.replaced, true);
    assert.equal(r.presets[0]?.HEAD, 'b', '最早的应被移除');
    assert.equal(r.presets[2]?.HEAD, 'd');
  });

  it('保存的是当前造型的副本（后续修改不影响预设）', () => {
    const current: Equipment = { HEAD: 'a' };
    const r = saveOutfitPreset([], current);
    current.HEAD = 'changed';
    assert.equal(r.presets[0]?.HEAD, 'a');
  });
});

describe('feedWithItem：喂食与用药', () => {
  it('喂食叠加效果并消耗一个', () => {
    // 从较低的饱食度开始，避免触顶而看不出效果差异
    const hungry = { ...initialVitals(), satiety: 40 };
    const out = feedWithItem(hungry, [inv('food-bento')], 'food-bento', NOW);
    assert.equal(out.allowed, true);
    assert.equal(out.vitals?.satiety, 65); // 40 + 25
    assert.equal(quantityOf(out.inventory ?? [], 'food-bento'), 0, '最后一个应被移除');
  });

  it('饱食度会封顶在 100（不会溢出）', () => {
    const full = { ...initialVitals(), satiety: 80 };
    const out = feedWithItem(full, [inv('food-bento')], 'food-bento', NOW);
    assert.equal(out.vitals?.satiety, 100, '80 + 25 应被夹到 100');
  });

  it('仍有剩余时数量递减而非清空', () => {
    const out = feedWithItem(initialVitals(), [inv('food-apple', 3)], 'food-apple', NOW);
    assert.equal(quantityOf(out.inventory ?? [], 'food-apple'), 2);
  });

  it('没有库存时拒绝', () => {
    const out = feedWithItem(initialVitals(), [], 'food-bento', NOW);
    assert.equal(out.allowed, false);
    assert.match(out.message, /背包里没有/);
  });

  it('提神糖可提前解除蔫状态（越界的恢复路径）', () => {
    const wilting = { ...initialVitals(), wiltingUntil: NOW + PENALTY.wiltingMs };
    assert.equal(canClearWilting(wilting, NOW), true);
    const out = feedWithItem(wilting, [inv('item-candy')], 'item-candy', NOW);
    assert.equal(out.allowed, true);
    assert.equal(out.vitals?.wiltingUntil, undefined, '蔫状态应被解除');
  });

  it('普通食物不能解除蔫状态', () => {
    const wilting = { ...initialVitals(), wiltingUntil: NOW + PENALTY.wiltingMs };
    const out = feedWithItem(wilting, [inv('food-cake')], 'food-cake', NOW);
    assert.equal(out.vitals?.wiltingUntil, NOW + PENALTY.wiltingMs);
  });

  it('装扮类不能喂食', () => {
    const out = feedWithItem(initialVitals(), [inv('outfit-hat-straw')], 'outfit-hat-straw', NOW);
    assert.equal(out.allowed, false);
  });

  it('canClearWilting：未蔫或已过期时为 false', () => {
    assert.equal(canClearWilting(initialVitals(), NOW), false);
    assert.equal(canClearWilting({ ...initialVitals(), wiltingUntil: NOW - 1 }, NOW), false);
  });
});

describe('tickPet：推进状态并清理过期的蔫标记', () => {
  it('时间前进后饱食度下降', () => {
    const next = tickPet(initialVitals(), NOW, NOW + 10 * 60 * MIN / 60);
    assert.ok(next.satiety < initialVitals().satiety);
  });

  it('蔫状态未到期时保留标记', () => {
    const v = { ...initialVitals(), wiltingUntil: NOW + 10 * MIN };
    const next = tickPet(v, NOW, NOW + MIN);
    assert.equal(next.wiltingUntil, NOW + 10 * MIN);
  });

  it('蔫状态到期后清除标记', () => {
    const v = { ...initialVitals(), wiltingUntil: NOW + MIN };
    const next = tickPet(v, NOW, NOW + MIN);
    assert.equal(next.wiltingUntil, undefined);
  });

  it('永不产生负值（长时间离线）', () => {
    const next = tickPet(initialVitals(), NOW, NOW + 90 * 24 * 60 * MIN);
    assert.ok(next.mood >= 0 && next.satiety >= 0 && next.energy >= 0);
  });
});

describe('petOnce：抚摸回补心情', () => {
  it('心情上升且不超过 100', () => {
    const low = petOnce({ ...initialVitals(), mood: 10 });
    assert.ok(low.mood > 10);
    const high = petOnce({ ...initialVitals(), mood: 100 });
    assert.equal(high.mood, 100);
  });
});

describe('wiltingExplanation：文案不得羞辱 [AGENTS.md 原则 2]', () => {
  it('说明事实与恢复方式', () => {
    const text = wiltingExplanation();
    assert.match(text, /蔫/);
    assert.match(text, /不会离开你/);
    assert.match(text, /提神糖/);
  });

  it('不含指责性表述', () => {
    const text = wiltingExplanation();
    for (const bad of ['懒', '失败', '对不起', '活该']) {
      assert.ok(!text.includes(bad), `文案含「${bad}」`);
    }
  });
});

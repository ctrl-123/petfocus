/**
 * 商城商品表（PRD 17.2 的完整数值定义）。
 *
 * 数值只能出现在这里（AGENTS.md 第 3.2 节）。价格区间与 PRD 一致：
 * - 食物 30–260
 * - 装扮：基础 150–400 / 进阶 400–900 / 稀有 900–2000
 * - 家具 300–1500（0 为默认场景）
 *
 * ⚠️ 装扮只保留**验证过效果、画得好看**的少数几件。
 * 曾经有 22 件装扮、27 种绘制特征，但多数 CSS 画法经需求方预览后判定"奇怪"。
 * 教训：**宁可少而精，不要多而糙**——粗糙的装扮不会激励用户攒币，只会让人觉得敷衍。
 * 每新增一件装扮，必须同时在 `pet-renderer.css` 里补上对应绘制，并有测试守卫生死。
 *
 * ⚠️ `visual` 的用途：驱动**装扮预览**的绘制。每个配件必须能被画出来，
 * 否则"预览"就是骗人的（AGENTS.md 原则 1：不假装有能力）。
 */
import type { EquipSlot, ShopCategory } from '../types.ts';

/**
 * 配件的绘制特征。
 * 每个取值都必须在 `apps/web/src/features/pet/pet-renderer.css` 里有对应实现，
 * 且由 `apps/web/src/features/pet/pet-css-build.test.ts` 校验一致性。
 */
export type AccessoryTrait =
  /** 蝴蝶结：双耳之间的头顶 */
  | 'BOW'
  /** 草帽：宽帽檐 + 帽顶 */
  | 'HAT_STRAW'
  /** 发光皇冠：三尖 + 光晕 */
  | 'CROWN'
  /** 小手套：身体两侧的两只手 */
  | 'GLOVES'
  /** 气球：飘在身侧上方，带一根线 */
  | 'BALLOON'
  /** 提灯：身侧带光晕的灯 */
  | 'LANTERN'
  /** 暖色房间：默认场景 */
  | 'SCENE_ROOM';

export interface ShopItemDef {
  id: string;
  category: ShopCategory;
  name: string;
  description: string;
  price: number;
  icon: string;
  effects?: { satiety?: number; mood?: number; energy?: number; clearsWilting?: boolean };
  slot?: EquipSlot;
  /** 绘制特征；有 `slot` 的装扮必须有它，否则无法预览 */
  visual?: AccessoryTrait;
  modelCompat: 'FULL' | 'PARTIAL' | 'NONE';
  rarity: 'COMMON' | 'RARE' | 'EPIC';
  stackable: boolean;
}

// ─────────────────────────────────────────────────────────────
// 食物 [PRD 17.2：30 / 60 / 120 / 260]
// ─────────────────────────────────────────────────────────────

export const FOOD_ITEMS: ReadonlyArray<ShopItemDef> = [
  {
    id: 'food-apple',
    category: 'FOOD',
    name: '苹果',
    description: '随手就能给的小零食，饱食度 +10。',
    price: 30,
    icon: '🍎',
    effects: { satiety: 10 },
    modelCompat: 'FULL',
    rarity: 'COMMON',
    stackable: true,
  },
  {
    id: 'food-bento',
    category: 'FOOD',
    name: '便当',
    description: '一顿正经饭，饱食度 +25、心情 +3。',
    price: 60,
    icon: '🍱',
    effects: { satiety: 25, mood: 3 },
    modelCompat: 'FULL',
    rarity: 'COMMON',
    stackable: true,
  },
  {
    id: 'food-cake',
    category: 'FOOD',
    name: '蛋糕',
    description: '甜的东西会让人（和宠物）心情变好，饱食度 +50、心情 +8。',
    price: 120,
    icon: '🍰',
    effects: { satiety: 50, mood: 8 },
    modelCompat: 'FULL',
    rarity: 'RARE',
    stackable: true,
  },
  {
    id: 'food-hotpot',
    category: 'FOOD',
    name: '火锅',
    description: '大餐。饱食度直接拉满，心情 +15。',
    price: 260,
    icon: '🍲',
    effects: { satiety: 100, mood: 15 },
    modelCompat: 'FULL',
    rarity: 'EPIC',
    stackable: true,
  },
];

// ─────────────────────────────────────────────────────────────
// 道具
// ─────────────────────────────────────────────────────────────

export const ITEM_ITEMS: ReadonlyArray<ShopItemDef> = [
  {
    id: 'item-candy',
    category: 'ITEM',
    name: '提神糖',
    description: '立刻解除宠物的「蔫」状态，不用等 30 分钟。',
    price: 30,
    icon: '🍬',
    effects: { clearsWilting: true, mood: 5 },
    modelCompat: 'FULL',
    rarity: 'COMMON',
    stackable: true,
  },
  {
    id: 'item-double-coin',
    category: 'ITEM',
    name: '双倍金币卡',
    description: '接下来 60 分钟的收益翻倍。每天限用 1 张。',
    price: 400,
    icon: '🎫',
    modelCompat: 'FULL',
    rarity: 'RARE',
    stackable: true,
  },
];

// ─────────────────────────────────────────────────────────────
// 装扮（6 件，全部经过预览确认）
// ─────────────────────────────────────────────────────────────

export const HEAD_ITEMS: ReadonlyArray<ShopItemDef> = [
  {
    id: 'outfit-bow',
    category: 'OUTFIT',
    name: '蝴蝶结',
    description: '系在两只耳朵中间。入门款，但很上镜。',
    price: 150,
    icon: '🎀',
    slot: 'HEAD',
    visual: 'BOW',
    modelCompat: 'PARTIAL',
    rarity: 'COMMON',
    stackable: false,
  },
  {
    id: 'outfit-hat-straw',
    category: 'OUTFIT',
    name: '草帽',
    description: '宽帽檐，看起来像刚出门散步回来。',
    price: 220,
    icon: '👒',
    slot: 'HEAD',
    visual: 'HAT_STRAW',
    modelCompat: 'PARTIAL',
    rarity: 'COMMON',
    stackable: false,
  },
  {
    id: 'outfit-crown',
    category: 'OUTFIT',
    name: '发光皇冠',
    description: '攒了很久才买得起的那种。戴上会发光。',
    price: 1600,
    icon: '👑',
    slot: 'HEAD',
    visual: 'CROWN',
    modelCompat: 'PARTIAL',
    rarity: 'EPIC',
    stackable: false,
  },
];

export const HAND_ITEMS: ReadonlyArray<ShopItemDef> = [
  {
    id: 'outfit-gloves',
    category: 'OUTFIT',
    name: '小手套',
    description: '两只手都戴上，天冷的时候很实用。',
    price: 200,
    icon: '🧤',
    slot: 'HAND',
    visual: 'GLOVES',
    modelCompat: 'PARTIAL',
    rarity: 'COMMON',
    stackable: false,
  },
  {
    id: 'outfit-balloon',
    category: 'OUTFIT',
    name: '气球',
    description: '它会一直抬头看着这个。飘在身侧，有根线牵着。',
    price: 450,
    icon: '🎈',
    slot: 'HAND',
    visual: 'BALLOON',
    modelCompat: 'PARTIAL',
    rarity: 'RARE',
    stackable: false,
  },
  {
    id: 'outfit-lantern',
    category: 'OUTFIT',
    name: '提灯',
    description: '深夜专注的时候，它是亮的。',
    price: 760,
    icon: '🏮',
    slot: 'HAND',
    visual: 'LANTERN',
    modelCompat: 'PARTIAL',
    rarity: 'RARE',
    stackable: false,
  },
];

export const OUTFIT_ITEMS: ReadonlyArray<ShopItemDef> = [...HEAD_ITEMS, ...HAND_ITEMS];

// ─────────────────────────────────────────────────────────────
// 家具 / 背景
// ─────────────────────────────────────────────────────────────

export const FURNITURE_ITEMS: ReadonlyArray<ShopItemDef> = [
  {
    id: 'furn-room',
    category: 'FURNITURE',
    name: '暖色房间',
    description: '默认场景，一盏台灯、一张桌子。',
    price: 0,
    icon: '🛋️',
    slot: 'BACKGROUND',
    visual: 'SCENE_ROOM',
    modelCompat: 'FULL',
    rarity: 'COMMON',
    stackable: false,
  },
];

export const SHOP_CATALOG: ReadonlyArray<ShopItemDef> = [
  ...FOOD_ITEMS,
  ...ITEM_ITEMS,
  ...OUTFIT_ITEMS,
  ...FURNITURE_ITEMS,
];

export const CATEGORY_LABELS: Record<ShopCategory, string> = {
  FOOD: '食物',
  OUTFIT: '装扮',
  FURNITURE: '家具',
  ITEM: '道具',
};

/**
 * 部位标签。
 * 目前只用到 HEAD / HAND / BACKGROUND：
 * 面部与身体的画法在预览中被判定不自然，相关商品已下架（保留类型以便将来重做）。
 */
export const SLOT_LABELS: Record<EquipSlot, string> = {
  HEAD: '头部',
  BODY: '身体',
  FACE: '面部',
  HAND: '手持',
  BACKGROUND: '背景',
};

/** 当前实际有商品的部位（商城按此顺序展示子分组） */
export const SLOT_ORDER: ReadonlyArray<EquipSlot> = ['HEAD', 'HAND', 'BACKGROUND'];

export function findShopItem(id: string): ShopItemDef | undefined {
  return SHOP_CATALOG.find((item) => item.id === id);
}

/** 免费商品（价格为 0 的默认家具）不应被"购买"，而是默认拥有 */
export function isFreeItem(item: ShopItemDef): boolean {
  return item.price <= 0;
}

/** 可装备的商品（有部位且有绘制特征，因此可预览） */
export function isEquippable(item: ShopItemDef): boolean {
  return item.slot !== undefined && item.visual !== undefined;
}

/** 商品表中的全部绘制特征（供样式一致性测试使用） */
export function declaredTraits(): AccessoryTrait[] {
  const traits = new Set<AccessoryTrait>();
  for (const item of SHOP_CATALOG) {
    if (item.visual) traits.add(item.visual);
  }
  return [...traits].sort();
}

/**
 * 商城与宠物的领域逻辑：购买决策、装备、喂食、状态推进。纯函数，零依赖。
 *
 * 经济约束（PRD 17.2 / 17.3）：
 * - 金币**绝不为负**（余额不足就买不了，不产生负债）
 * - 重复购买非叠加商品**不允许**（避免误扣币）
 * - 免费商品（默认家具）视为已拥有，不进入购买流程
 */
import { PENALTY, PET, TIME_UNITS } from '../config/index.ts';
import type { EquipSlot, PetMood, PetVitals, ShopCategory } from '../types.ts';
import { SHOP_CATALOG, findShopItem, isFreeItem, type ShopItemDef } from './shop-catalog.ts';
import { decayVitals, feedVitals, petVitals, cheerVitals, type FeedEffects } from './pet-state.ts';

// ─────────────────────────────────────────────────────────────
// 购买
// ─────────────────────────────────────────────────────────────

export type PurchaseRejection =
  | 'UNKNOWN_ITEM'
  | 'INSUFFICIENT_COIN'
  | 'ALREADY_OWNED'
  | 'FREE_ITEM'
  | 'INCOMPATIBLE_WITH_MODEL';

export interface PurchaseDecision {
  allowed: boolean;
  rejection?: PurchaseRejection;
  /** 允许购买时：花费的金币与购买后余额 */
  price?: number;
  balanceAfter?: number;
  /** 给用户看的一句说明（AC-6.3.4：二次确认弹窗要显示"花费 X，余额将变为 Y"） */
  message: string;
}

export interface InventoryLike {
  itemId: string;
  quantity: number;
}

/**
 * 判断能否购买。**不修改任何状态**，只给决策。
 */
export function canPurchase(
  item: ShopItemDef | undefined,
  balance: number,
  owned: ReadonlyArray<InventoryLike>,
): PurchaseDecision {
  if (!item) {
    return { allowed: false, rejection: 'UNKNOWN_ITEM', message: '找不到这件商品。' };
  }
  if (isFreeItem(item)) {
    return { allowed: false, rejection: 'FREE_ITEM', message: '这件是默认拥有的，不需要购买。' };
  }
  if (item.modelCompat === 'NONE') {
    return {
      allowed: false,
      rejection: 'INCOMPATIBLE_WITH_MODEL',
      message: '当前宠物模型不支持这件装扮，暂时无法购买。',
    };
  }
  const existing = quantityOf(owned, item.id);
  if (!item.stackable && existing > 0) {
    return { allowed: false, rejection: 'ALREADY_OWNED', message: '你已经拥有它了。' };
  }
  if (balance < item.price) {
    const short = item.price - balance;
    return {
      allowed: false,
      rejection: 'INSUFFICIENT_COIN',
      message: `还差 ${short} 金币。先完成一个待办，就能给它买这个了。`,
    };
  }
  return {
    allowed: true,
    price: item.price,
    balanceAfter: balance - item.price,
    message: `花费 ${item.price} 金币，余额将变为 ${balance - item.price}。`,
  };
}

/** 购买后的库存变化（叠加类累加数量，非叠加类置为 1） */
export function applyPurchase(
  owned: ReadonlyArray<InventoryLike>,
  item: ShopItemDef,
): InventoryLike[] {
  const index = owned.findIndex((o) => o.itemId === item.id);
  if (index < 0) return [...owned, { itemId: item.id, quantity: 1 }];
  const next = [...owned];
  const existing = next[index];
  if (!existing) return next;
  next[index] = { ...existing, quantity: item.stackable ? existing.quantity + 1 : 1 };
  return next;
}

/** 消耗一个叠加类道具（喂食/用药）；数量归零时从背包移除 */
export function consumeOne(owned: ReadonlyArray<InventoryLike>, itemId: string): InventoryLike[] {
  const index = owned.findIndex((o) => o.itemId === itemId);
  if (index < 0) return [...owned];
  const next = [...owned];
  const existing = next[index];
  if (!existing) return next;
  const quantity = existing.quantity - 1;
  if (quantity <= 0) {
    next.splice(index, 1);
    return next;
  }
  next[index] = { ...existing, quantity };
  return next;
}

/** 背包里某件商品的数量 */
export function quantityOf(owned: ReadonlyArray<InventoryLike>, itemId: string): number {
  return owned.find((o) => o.itemId === itemId)?.quantity ?? 0;
}

/** 按分类取商品（商城 tab 用） */
export function itemsByCategory(category: ShopCategory): ReadonlyArray<ShopItemDef> {
  return SHOP_CATALOG.filter((item) => item.category === category);
}

// ─────────────────────────────────────────────────────────────
// 装备（换装）
// ─────────────────────────────────────────────────────────────

export type Equipment = Partial<Record<EquipSlot, string | null>>;

export type EquipRejection = 'UNKNOWN_ITEM' | 'NOT_OWNED' | 'NOT_EQUIPMENT' | 'INCOMPATIBLE_WITH_MODEL';

export interface EquipDecision {
  allowed: boolean;
  rejection?: EquipRejection;
  message: string;
  /** 允许装备时的新装备表 */
  equipment?: Equipment;
}

/**
 * 判断能否装备。
 * 注意：`modelCompat === 'NONE'` 时**拒绝**，UI 也应标注「暂不适配」（AC-6.3.5）。
 */
export function canEquip(
  item: ShopItemDef | undefined,
  owned: ReadonlyArray<InventoryLike>,
  current: Equipment,
): EquipDecision {
  if (!item) return { allowed: false, rejection: 'UNKNOWN_ITEM', message: '找不到这件商品。' };
  if (item.slot === undefined) {
    return { allowed: false, rejection: 'NOT_EQUIPMENT', message: '这件不是装扮。' };
  }
  // 免费默认家具视为已拥有
  if (!isFreeItem(item) && quantityOf(owned, item.id) <= 0) {
    return { allowed: false, rejection: 'NOT_OWNED', message: '还没有这件装扮。' };
  }
  if (item.modelCompat === 'NONE') {
    return { allowed: false, rejection: 'INCOMPATIBLE_WITH_MODEL', message: '当前模型不支持这件装扮。' };
  }
  return {
    allowed: true,
    message: `已换上「${item.name}」。`,
    equipment: { ...current, [item.slot]: item.id },
  };
}

/** 卸下某个部位 */
export function unequip(current: Equipment, slot: EquipSlot): Equipment {
  return { ...current, [slot]: null };
}

// ─────────────────────────────────────────────────────────────
// 装扮预览（试穿）
// ─────────────────────────────────────────────────────────────

/**
 * 试穿：把某件**尚未拥有**的装扮临时穿上看看效果。
 *
 * 设计约束（很重要）：
 * - 试穿**不消耗金币、不写入背包、不改变已拥有状态**——它纯粹是一层显示覆盖
 * - 试穿覆盖只作用于单一件的部位，与真实装备合并展示
 * - 不适配当前模型的装扮（`modelCompat === 'NONE'`）不允许试穿，
 *   因为画不出来却让用户"预览"等于骗人（AGENTS.md 原则 1）
 *
 * 目的：让用户先看到效果再决定攒币，而不是盲目消费（PRD 6.3 激励循环）。
 */
export function previewEquip(item: ShopItemDef | undefined): Equipment | undefined {
  if (!item) return undefined;
  if (item.slot === undefined || item.visual === undefined) return undefined;
  if (item.modelCompat === 'NONE') return undefined;
  return { [item.slot]: item.id };
}

/**
 * 合并真实装备与试穿覆盖：试穿优先，其余部位保持真实装备。
 *
 * `equipped` 允许为 undefined：调用方（UI）在宠物数据尚未加载时没有装备可传，
 * 此时试穿仍应能显示。返回的也保证不是 undefined，省去调用方到处判空。
 */
export function mergeEquipment(
  equipped: Equipment | undefined,
  preview: Equipment | undefined,
): Equipment {
  const base = equipped ?? {};
  if (!preview) return base;
  return { ...base, ...preview };
}

/** 把装备表转成"当前生效的部件 id 列表"（渲染器只需要这个） */
export function activePartIds(equipment: Equipment): string[] {
  const ids: string[] = [];
  for (const slot of Object.keys(equipment) as EquipSlot[]) {
    const id = equipment[slot];
    if (typeof id === 'string' && id.length > 0) ids.push(id);
  }
  return ids;
}

/** 当前装备里某个部位的商品（用于展示与校验） */
export function equippedItem(current: Equipment, slot: EquipSlot): ShopItemDef | undefined {
  const id = current[slot];
  return id === undefined || id === null ? undefined : findShopItem(id);
}

/**
 * 清理装备表：丢掉已下架或无法绘制的部件。
 *
 * 为什么需要它：商品会下架（本项目就下架过 16 件装扮）。
 * 用户本机可能仍存着旧装备，若原样回读会出现"穿着一个不存在的东西"——
 * 界面上什么也看不到，但装备位被占着，用户无法理解也无法修复。
 * 因此读取时静默清理，让状态自愈。
 */
export function sanitizeEquipment(current: Equipment): Equipment {
  const next: Equipment = {};
  for (const slot of Object.keys(current) as EquipSlot[]) {
    const id = current[slot];
    if (typeof id !== 'string' || id.length === 0) continue;
    const item = findShopItem(id);
    if (!item) continue; // 已下架
    if (item.slot === undefined || item.visual === undefined) continue; // 无法绘制
    if (item.modelCompat === 'NONE') continue;
    next[slot] = id;
  }
  return next;
}

/**
 * 一键随机造型：只用**已拥有、有部位、且与模型适配**的装扮。
 * 随机源可注入，保证测试确定性（AGENTS.md 3.1）。
 */
export function randomOutfit(
  owned: ReadonlyArray<InventoryLike>,
  current: Equipment,
  random: () => number = Math.random,
): Equipment {
  const candidates = owned
    .map((o) => findShopItem(o.itemId))
    .filter(
      (item): item is ShopItemDef =>
        item !== undefined && item.slot !== undefined && item.modelCompat !== 'NONE',
    );

  const next: Equipment = { ...current };
  for (const item of candidates) {
    if (!item.slot) continue;
    if (random() < PET.randomOutfitSwapChance) next[item.slot] = item.id;
    else if (next[item.slot] === item.id) next[item.slot] = null;
  }
  return next;
}

/** 造型预设：最多保存 3 套（PRD AC-6.3.5） */
export const MAX_OUTFIT_PRESETS = 3;

export function saveOutfitPreset(
  presets: ReadonlyArray<Equipment>,
  current: Equipment,
): { presets: Equipment[]; replaced: boolean } {
  if (presets.length < MAX_OUTFIT_PRESETS) {
    return { presets: [...presets, { ...current }], replaced: false };
  }
  // 满了替换最早的一套：避免用户被数量限制卡住（PRD 未规定替换策略）
  const next = presets.slice(1);
  next.push({ ...current });
  return { presets: next, replaced: true };
}

// ─────────────────────────────────────────────────────────────
// 喂食与用药
// ─────────────────────────────────────────────────────────────

export interface FeedingOutcome {
  allowed: boolean;
  message: string;
  vitals?: PetVitals;
  inventory?: InventoryLike[];
}

/**
 * 喂食/用药。效果取自商品表；`提神糖` 可提前解除蔫状态（AC-1.4.7 的恢复路径）。
 */
export function feedWithItem(
  vitals: PetVitals,
  owned: ReadonlyArray<InventoryLike>,
  itemId: string,
  now: number,
): FeedingOutcome {
  const item = findShopItem(itemId);
  if (!item) return { allowed: false, message: '找不到这件东西。' };
  if (quantityOf(owned, itemId) <= 0) return { allowed: false, message: '背包里没有这件东西。' };
  if (item.category !== 'FOOD' && item.category !== 'ITEM') {
    return { allowed: false, message: '这个不能吃。' };
  }
  const effects: FeedEffects = item.effects ?? {};
  return {
    allowed: true,
    message: `它吃掉了「${item.name}」。`,
    vitals: feedVitals(vitals, effects, now),
    inventory: consumeOne(owned, itemId),
  };
}

/** 是否处于蔫状态（可用道具提前恢复） */
export function canClearWilting(vitals: PetVitals, now: number): boolean {
  return vitals.wiltingUntil !== undefined && now < vitals.wiltingUntil;
}

/** 抚摸：回补少量心情（真实交互的计分在 UI 层做冷却控制） */
export function petOnce(vitals: PetVitals): PetVitals {
  return petVitals(vitals);
}

/** 完成待办/专注：回补心情 */
export function cheerOnce(vitals: PetVitals): PetVitals {
  return cheerVitals(vitals);
}

// ─────────────────────────────────────────────────────────────
// 状态推进（宠物页定时调用）
// ─────────────────────────────────────────────────────────────

/**
 * 按时间推进宠物状态：衰减 + 蔫状态到期清理，合并成一次调用。
 * 状态只会「蔫」，**永不死亡、永不降级到无法恢复**（AGENTS.md 原则 3）。
 */
export function tickPet(vitals: PetVitals, lastTickAt: number, now: number): PetVitals {
  const decayed = decayVitals({ vitals, lastTickAt, now });
  if (decayed.wiltingUntil !== undefined && now >= decayed.wiltingUntil) {
    // 构造新对象而不是解构：解构会留下一个未使用的局部变量，触发 lint 报错
    const cleared: PetVitals = {
      mood: decayed.mood,
      satiety: decayed.satiety,
      energy: decayed.energy,
    };
    return cleared;
  }
  return decayed;
}

// ─────────────────────────────────────────────────────────────
// 展示文案与常量
// ─────────────────────────────────────────────────────────────

/** 新用户的默认宠物名 [PRD AC-6.2.9] */
export const INITIAL_PET_NAME = '豆豆';

/** 心情档位展示文案 */
export const MOOD_LABELS: Record<PetMood, string> = {
  HAPPY: '很精神',
  CALM: '还好',
  WILTING: '有点蔫',
};

/** 等级上限 */
export const MAX_LEVEL = PET.maxLevel;

/**
 * 蔫状态说明：**只说事实与恢复方式，不做任何指责**（AGENTS.md 原则 2）。
 */
export function wiltingExplanation(): string {
  return `配额用尽后强行退出，宠物会蔫 ${
    PENALTY.wiltingMs / TIME_UNITS.MS_PER_MINUTE
  } 分钟。它不会离开你，抚摸或喂「提神糖」就能提前恢复。`;
}

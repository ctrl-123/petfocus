/**
 * 宠物的用例层：读写仓储 + 调用领域规则。
 *
 * 职责边界（AGENTS.md 第 2 节）：业务规则在 `@petfocus/shared` 的 domain（已单测）；
 * 本文件只做「调用规则 + 读写仓储」，不写任何数值或公式。
 */
import {
  INITIAL_PET_NAME,
  applyPurchase,
  canEquip,
  canPurchase,
  consumeOne,
  dayKeyOf,
  expToNextLevel,
  feedWithItem,
  findShopItem,
  initialVitals,
  levelOf,
  petVitals,
  sanitizeEquipment,
  tickPet,
  type Equipment,
  type FeedingOutcome,
  type InventoryLike,
  type PetVitals,
  type PurchaseDecision,
  type ShopItemDef,
} from '@petfocus/shared';
import { getRuntime, tryGetRuntime } from '../../app/runtime.ts';

/**
 * 宠物相关的初始化是否已具备条件。
 *
 * 为什么需要它：React 的 effect 是**子组件先执行、父组件后执行**，
 * 而 runtime 是在父组件（App 的 useBoot）的 effect 里设置的。
 * 因此子组件第一次挂载时 runtime 还不存在，直接调用会抛
 * 「运行时尚未就绪」。调用方应当先判断本函数，未就绪时等条件变化再重试。
 */
export function isPetStoreReady(): boolean {
  return tryGetRuntime() !== undefined;
}

/** 运行时未就绪时抛出的错误标识，便于 UI 区分「等一会就好」与「真的坏了」 */
export const RUNTIME_NOT_READY = 'RUNTIME_NOT_READY';

function requireRuntime(): ReturnType<typeof getRuntime> {
  const runtime = tryGetRuntime();
  if (!runtime) {
    const error = new Error(RUNTIME_NOT_READY);
    error.name = RUNTIME_NOT_READY;
    throw error;
  }
  return runtime;
}

/** 宠物快照：仓储行结构在用例层的领域视图 */
export interface PetSnapshot {
  name: string;
  vitals: PetVitals;
  equipped: Equipment;
  outfits: Equipment[];
  interactedCount: number;
  completedTasks: number;
  lastTickAt: number;
}

/** 从仓储读宠物；不存在则**按初始值创建**（首次进入时调用） */
export async function loadOrCreatePet(now: number): Promise<PetSnapshot> {
  const { repositories } = requireRuntime();
  const existing = await repositories.pet.get();

  if (!existing) {
    const vitals = initialVitals();
    await repositories.pet.put({
      id: 'singleton',
      name: INITIAL_PET_NAME,
      level: 1,
      exp: 0,
      mood: vitals.mood,
      satiety: vitals.satiety,
      energy: vitals.energy,
      equipped: {},
      outfits: [],
      lastTickAt: now,
      interactedCount: 0,
      completedTasks: 0,
      updatedAt: now,
    });
    return {
      name: INITIAL_PET_NAME,
      vitals,
      equipped: {},
      outfits: [],
      interactedCount: 0,
      completedTasks: 0,
      lastTickAt: now,
    };
  }

  const vitals: PetVitals = {
    mood: existing.mood,
    satiety: existing.satiety,
    energy: existing.energy,
    ...(existing.wiltingUntil === undefined ? {} : { wiltingUntil: existing.wiltingUntil }),
  };

  return {
    name: existing.name,
    vitals,
    equipped: sanitizeEquipment((existing.equipped ?? {}) as Equipment),
    outfits: (existing.outfits ?? []) as Equipment[],
    interactedCount: existing.interactedCount ?? 0,
    completedTasks: existing.completedTasks ?? 0,
    lastTickAt: existing.lastTickAt,
  };
}

/** 落盘一份宠物快照（等级与升级进度由计数推导，不单独存储真相） */
export async function savePet(snapshot: PetSnapshot, now: number): Promise<void> {
  const { repositories } = requireRuntime();
  await repositories.pet.put({
    id: 'singleton',
    name: snapshot.name,
    level: levelOf(snapshot.interactedCount, snapshot.completedTasks),
    exp: expToNextLevel(snapshot.interactedCount, snapshot.completedTasks),
    mood: snapshot.vitals.mood,
    satiety: snapshot.vitals.satiety,
    energy: snapshot.vitals.energy,
    ...(snapshot.vitals.wiltingUntil === undefined ? {} : { wiltingUntil: snapshot.vitals.wiltingUntil }),
    equipped: snapshot.equipped,
    outfits: snapshot.outfits,
    lastTickAt: snapshot.lastTickAt,
    interactedCount: snapshot.interactedCount,
    completedTasks: snapshot.completedTasks,
    updatedAt: now,
  });
}

/**
 * 单纯推进时间：衰减 + 蔫状态清理。
 * 同一毫秒内不重复推进，避免无意义写入。
 */
export function advancePet(snapshot: PetSnapshot, now: number): PetSnapshot {
  if (now <= snapshot.lastTickAt) return snapshot;
  return {
    ...snapshot,
    vitals: tickPet(snapshot.vitals, snapshot.lastTickAt, now),
    lastTickAt: now,
  };
}

/**
 * 抚摸一次：回补心情并累加互动计数。
 *
 * 注意这里**重新读一次库**而不是直接用传入的快照：
 * 连点抚摸（或抚摸与喂食几乎同时发生）时，两边都基于旧快照做「读-改-写」会互相覆盖，
 * 导致计数少加。以库里的最新计数为基准做加法可以避免这种丢失更新。
 */
export async function petOnce(snapshot: PetSnapshot, now: number): Promise<PetSnapshot> {
  const latest = await loadOrCreatePet(now);
  const advanced = advancePet(latest, now);
  const next: PetSnapshot = {
    ...advanced,
    vitals: petVitals(advanced.vitals),
    interactedCount: latest.interactedCount + 1,
  };
  await savePet(next, now);
  void snapshot; // 参数保留是为了调用方语义清晰（表示"抚摸这只宠物"）
  return next;
}

/** 读背包（只返回有数量的条目） */
export async function loadInventory(): Promise<InventoryLike[]> {
  const { repositories } = requireRuntime();
  const rows = await repositories.inventory.all();
  return rows.filter((r) => r.quantity > 0).map((r) => ({ itemId: r.itemId, quantity: r.quantity }));
}

/** 落盘背包：以传入集合为准，被清空的条目会被移除 */
export async function saveInventory(items: ReadonlyArray<InventoryLike>): Promise<void> {
  const { repositories } = requireRuntime();
  const existing = await repositories.inventory.all();
  const acquiredAt = new Map(existing.map((row) => [row.itemId, row.acquiredAt]));

  await repositories.inventory.bulkPut(
    items.map((item) => ({
      id: item.itemId,
      itemId: item.itemId,
      quantity: item.quantity,
      acquiredAt: acquiredAt.get(item.itemId) ?? Date.now(),
    })),
  );

  const keep = new Set(items.map((i) => i.itemId));
  for (const row of existing) {
    if (!keep.has(row.itemId)) await repositories.inventory.delete(row.id);
  }
}

export interface PurchaseResult {
  ok: boolean;
  decision: PurchaseDecision;
  inventory: InventoryLike[];
  /** 购买后的余额（失败时等于原余额） */
  balance: number;
}

/**
 * 购买商品：**先判断 → 写金币流水 → 写背包**。
 * 金币是追加型账本，余额由求和推导，因此不会出现"余额字段与流水不一致"。
 */
export async function purchaseItem(itemId: string, now: number): Promise<PurchaseResult> {
  const { repositories } = requireRuntime();
  const item = findShopItem(itemId);
  const [balance, inventory] = await Promise.all([
    repositories.coinLedger.balance(),
    loadInventory(),
  ]);

  const decision = canPurchase(item, balance, inventory);
  if (!decision.allowed || !item) {
    return { ok: false, decision, inventory, balance };
  }

  await repositories.coinLedger.put({
    id: `purchase-${itemId}-${now}`,
    kind: 'PURCHASE',
    amount: -(decision.price ?? item.price),
    balanceAfter: decision.balanceAfter ?? balance,
    refId: itemId,
    dayKey: dayKeyOf(now),
    serverTime: 0,
    confirmed: false,
    note: item.name,
  });

  const nextInventory = applyPurchase(inventory, item);
  await saveInventory(nextInventory);

  return { ok: true, decision, inventory: nextInventory, balance: decision.balanceAfter ?? balance };
}

/** 喂食/用药：先算效果，再扣库存与落盘 */
export async function feedPet(
  snapshot: PetSnapshot,
  itemId: string,
  now: number,
): Promise<{ outcome: FeedingOutcome; snapshot: PetSnapshot }> {
  const inventory = await loadInventory();
  const outcome = feedWithItem(snapshot.vitals, inventory, itemId, now);
  if (!outcome.allowed || !outcome.vitals) {
    return { outcome, snapshot };
  }
  const next: PetSnapshot = { ...advancePet(snapshot, now), vitals: outcome.vitals };
  await savePet(next, now);
  if (outcome.inventory) await saveInventory(outcome.inventory);
  return { outcome, snapshot: next };
}

/** 换装（装备） */
export async function equipItem(
  snapshot: PetSnapshot,
  itemId: string,
  now: number,
): Promise<{ ok: boolean; message: string; snapshot: PetSnapshot }> {
  const inventory = await loadInventory();
  const decision = canEquip(findShopItem(itemId), inventory, snapshot.equipped);
  if (!decision.allowed || !decision.equipment) {
    return { ok: false, message: decision.message, snapshot };
  }
  const next: PetSnapshot = { ...snapshot, equipped: decision.equipment };
  await savePet(next, now);
  return { ok: true, message: decision.message, snapshot: next };
}

/** 只消耗库存（供喂食之外的场景与测试使用） */
export async function consumeInventoryItem(itemId: string): Promise<InventoryLike[]> {
  const inventory = await loadInventory();
  const next = consumeOne(inventory, itemId);
  await saveInventory(next);
  return next;
}

/** 供 UI 展示的等级信息 */
export function levelInfoOf(snapshot: PetSnapshot): { level: number; expToNext: number } {
  return {
    level: levelOf(snapshot.interactedCount, snapshot.completedTasks),
    expToNext: expToNextLevel(snapshot.interactedCount, snapshot.completedTasks),
  };
}

/** 商品购买判断（UI 渲染禁用态与提示用） */
export function purchaseDecisionFor(
  item: ShopItemDef | undefined,
  balance: number,
  inventory: ReadonlyArray<InventoryLike>,
): PurchaseDecision {
  return canPurchase(item, balance, inventory);
}

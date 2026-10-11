/**
 * 宠物用例层集成测试。
 *
 * 为什么必须测这一层：`usecases.ts` 是 UI 与仓储之间的唯一通道，
 * 而它**同时依赖运行时（getRuntime）与 Dexie schema**——这两处任一处不匹配，
 * 用户看到的就是一个永远不结束的「正在唤醒宠物…」。
 * 单元测试测不到这种问题（因为领域层是纯函数），所以这里用真实 Dexie + fake-indexeddb 跑。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { closeDb, deleteDb, openDb, type PetFocusDb } from '../../../../../packages/shared/src/data/db.ts';
import { createDexieRepositories } from '../../../../../packages/shared/src/data/dexie-stores.ts';
import { createDexieKeyValueStore } from '../../../../../packages/shared/src/data/dexie-stores.ts';
import { setRuntime, resetRuntime } from '../../app/runtime.ts';
import { findShopItem } from '@petfocus/shared';
import {
  RUNTIME_NOT_READY,
  advancePet,
  equipItem,
  feedPet,
  isPetStoreReady,
  levelInfoOf,
  loadInventory,
  loadOrCreatePet,
  petOnce,
  purchaseItem,
  saveInventory,
  savePet,
} from './usecases.ts';

const NOW = new Date(2026, 1, 14, 10, 0, 0, 0).getTime();
const MIN = 60_000;

let db: PetFocusDb | undefined;
let dbName = '';

beforeEach(async () => {
  dbName = `pf-pet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db = await openDb(dbName);
  setRuntime({
    repositories: createDexieRepositories(db),
    kv: createDexieKeyValueStore(db),
    persistent: true,
  });
});

afterEach(async () => {
  if (db) closeDb(db);
  if (dbName) await deleteDb(dbName);
  db = undefined;
  resetRuntime();
});

describe('运行时就绪守卫（回归：曾经永久停在「正在唤醒宠物…」）', () => {
  it('runtime 未设置时 isPetStoreReady() 为 false', () => {
    resetRuntime();
    assert.equal(isPetStoreReady(), false);
  });

  it('runtime 设置后 isPetStoreReady() 为 true', () => {
    assert.equal(isPetStoreReady(), true);
  });

  it('未就绪时抛出可识别的 RUNTIME_NOT_READY，而不是难以理解的内部错误', async () => {
    // 这条是本 bug 的核心：React 的 effect 是子先父后，
    // 子组件（宠物面板）首次挂载时父组件的 boot 还没设置 runtime。
    resetRuntime();
    await assert.rejects(
      () => loadOrCreatePet(NOW),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, RUNTIME_NOT_READY);
        return true;
      },
    );
  });

  it('未就绪时 loadInventory / purchaseItem 也走同一条守卫', async () => {
    resetRuntime();
    await assert.rejects(() => loadInventory());
    await assert.rejects(() => purchaseItem('food-apple', NOW));
  });

  it('就绪后恢复正常（说明守卫不会误伤正常路径）', async () => {
    const pet = await loadOrCreatePet(NOW);
    assert.equal(pet.name, '豆豆');
  });
});

describe('loadOrCreatePet：首次进入自动创建', () => {
  it('空库时创建宠物并落盘（不会一直"正在唤醒"）', async () => {
    const pet = await loadOrCreatePet(NOW);
    assert.equal(pet.name, '豆豆');
    assert.equal(pet.interactedCount, 0);
    assert.deepEqual(pet.equipped, {});
    assert.deepEqual(pet.outfits, []);
    assert.ok(pet.vitals.satiety > 0, '初始饱食度应大于 0');

    // 落盘验证：第二次读应拿到同一条记录
    const again = await loadOrCreatePet(NOW + 1000);
    assert.equal(again.name, '豆豆');
  });

  it('已有记录时读取而不覆盖（互动计数保留）', async () => {
    const first = await petOnce(await loadOrCreatePet(NOW), NOW + MIN);
    assert.equal(first.interactedCount, 1);
    const loaded = await loadOrCreatePet(NOW + 2 * MIN);
    assert.equal(loaded.interactedCount, 1, '不应被重置');
  });

  it('蔫状态能被正确读回', async () => {
    const pet = await loadOrCreatePet(NOW);
    const wilting = { ...pet, vitals: { ...pet.vitals, wiltingUntil: NOW + 30 * MIN } };
    await savePet(wilting, NOW);
    const loaded = await loadOrCreatePet(NOW + MIN);
    assert.equal(loaded.vitals.wiltingUntil, NOW + 30 * MIN);
  });
});

describe('loadInventory / saveInventory：背包读写', () => {
  it('空库返回空数组', async () => {
    assert.deepEqual(await loadInventory(), []);
  });

  it('写入后可读回，且只返回有数量的条目', async () => {
    await saveInventory([
      { itemId: 'food-apple', quantity: 3 },
      { itemId: 'food-bento', quantity: 0 },
    ]);
    const inv = await loadInventory();
    assert.equal(inv.length, 1, '数量为 0 的条目不应返回');
    assert.equal(inv[0]?.itemId, 'food-apple');
    assert.equal(inv[0]?.quantity, 3);
  });

  it('以传入集合为准：被移除的条目会从库里删除', async () => {
    await saveInventory([{ itemId: 'food-apple', quantity: 2 }, { itemId: 'item-candy', quantity: 1 }]);
    await saveInventory([{ itemId: 'food-apple', quantity: 2 }]);
    const inv = await loadInventory();
    assert.deepEqual(inv.map((i) => i.itemId), ['food-apple']);
  });

  it('重复写入同一商品不会产生重复行', async () => {
    await saveInventory([{ itemId: 'food-apple', quantity: 1 }]);
    await saveInventory([{ itemId: 'food-apple', quantity: 5 }]);
    const inv = await loadInventory();
    assert.equal(inv.length, 1);
    assert.equal(inv[0]?.quantity, 5);
  });
});

describe('purchaseItem：购买与账本一致性', () => {
  it('金币不足时拒绝，且不写入任何数据', async () => {
    const result = await purchaseItem('food-apple', NOW);
    assert.equal(result.ok, false);
    assert.equal(result.decision.rejection, 'INSUFFICIENT_COIN');
    assert.deepEqual(await loadInventory(), [], '失败的购买不应写入背包');
  });

  it('余额充足时扣币并入库，余额由账本派生', async () => {
    const { repositories } = (await import('../../app/runtime.ts')).getRuntime();
    await repositories.coinLedger.put({
      id: 'earn-1',
      kind: 'FOCUS_DONE',
      amount: 100,
      balanceAfter: 100,
      dayKey: '2026-02-14',
      serverTime: 0,
      confirmed: false,
    });

    const result = await purchaseItem('food-apple', NOW);
    assert.equal(result.ok, true);
    assert.equal(result.balance, 70);
    assert.equal(await repositories.coinLedger.balance(), 70);

    const inv = await loadInventory();
    assert.equal(inv[0]?.itemId, 'food-apple');
    assert.equal(inv[0]?.quantity, 1);
  });

  it('叠加类商品可重复购买，数量累加', async () => {
    const { repositories } = (await import('../../app/runtime.ts')).getRuntime();
    await repositories.coinLedger.put({
      id: 'earn-1',
      kind: 'FOCUS_DONE',
      amount: 200,
      balanceAfter: 200,
      dayKey: '2026-02-14',
      serverTime: 0,
      confirmed: false,
    });
    await purchaseItem('food-apple', NOW);
    await purchaseItem('food-apple', NOW + 1);
    const inv = await loadInventory();
    assert.equal(inv.find((i) => i.itemId === 'food-apple')?.quantity, 2);
    assert.equal(await repositories.coinLedger.balance(), 140);
  });

  it('非叠加商品重复购买被拒绝（不会白扣币）', async () => {
    const { repositories } = (await import('../../app/runtime.ts')).getRuntime();
    const crown = findShopItem('outfit-crown');
    assert.ok(crown, '测试依赖皇冠这件装扮存在');
    // 余额要足够买下最贵的那件，否则测的是"金币不足"而不是"重复购买"
    const startingBalance = crown.price + 400;
    await repositories.coinLedger.put({
      id: 'earn-1',
      kind: 'FOCUS_DONE',
      amount: startingBalance,
      balanceAfter: startingBalance,
      dayKey: '2026-02-14',
      serverTime: 0,
      confirmed: false,
    });

    const first = await purchaseItem('outfit-crown', NOW);
    assert.equal(first.ok, true, `首次购买应成功（余额 ${startingBalance}，价格 ${crown.price}）`);
    const afterFirst = await repositories.coinLedger.balance();
    assert.equal(afterFirst, startingBalance - crown.price);

    const second = await purchaseItem('outfit-crown', NOW + 1);
    assert.equal(second.ok, false);
    assert.equal(second.decision.rejection, 'ALREADY_OWNED');
    assert.equal(await repositories.coinLedger.balance(), afterFirst, '第二次不应扣币');
  });

  it('未知商品不会崩，返回拒绝', async () => {
    const result = await purchaseItem('does-not-exist', NOW);
    assert.equal(result.ok, false);
    assert.equal(result.decision.rejection, 'UNKNOWN_ITEM');
  });
});

describe('feedPet：喂食改状态并扣库存', () => {
  it('喂食提升饱食度并消耗一个', async () => {
    await saveInventory([{ itemId: 'food-apple', quantity: 2 }]);
    const pet = await loadOrCreatePet(NOW);
    const hungry = { ...pet, vitals: { ...pet.vitals, satiety: 40 } };
    await savePet(hungry, NOW);

    const { outcome, snapshot } = await feedPet(hungry, 'food-apple', NOW + MIN);
    assert.equal(outcome.allowed, true);
    assert.equal(snapshot.vitals.satiety, 50); // 40 + 10
    assert.equal((await loadInventory())[0]?.quantity, 1);

    // 落盘验证
    const reloaded = await loadOrCreatePet(NOW + 2 * MIN);
    assert.ok(reloaded.vitals.satiety >= 40, '饱食度应被保存');
  });

  it('没有库存时拒绝且不改变状态', async () => {
    const pet = await loadOrCreatePet(NOW);
    const { outcome, snapshot } = await feedPet(pet, 'food-apple', NOW);
    assert.equal(outcome.allowed, false);
    assert.equal(snapshot, pet, '状态不应改变');
  });

  it('提神糖解除蔫状态并持久化', async () => {
    await saveInventory([{ itemId: 'item-candy', quantity: 1 }]);
    const pet = await loadOrCreatePet(NOW);
    const wilting = { ...pet, vitals: { ...pet.vitals, wiltingUntil: NOW + 30 * MIN } };
    await savePet(wilting, NOW);

    await feedPet(wilting, 'item-candy', NOW + MIN);
    const reloaded = await loadOrCreatePet(NOW + 2 * MIN);
    assert.equal(reloaded.vitals.wiltingUntil, undefined);
  });
});

describe('equipItem：换装持久化', () => {
  it('已拥有的装扮可装备并落盘', async () => {
    await saveInventory([{ itemId: 'outfit-hat-straw', quantity: 1 }]);
    const pet = await loadOrCreatePet(NOW);
    const result = await equipItem(pet, 'outfit-hat-straw', NOW);
    assert.equal(result.ok, true);
    assert.equal(result.snapshot.equipped.HEAD, 'outfit-hat-straw');

    const reloaded = await loadOrCreatePet(NOW + MIN);
    assert.equal(reloaded.equipped.HEAD, 'outfit-hat-straw');
  });

  it('未拥有的装扮拒绝装备', async () => {
    const pet = await loadOrCreatePet(NOW);
    const result = await equipItem(pet, 'outfit-crown', NOW);
    assert.equal(result.ok, false);
    assert.equal(result.snapshot, pet);
  });
});

describe('petOnce / advancePet / levelInfoOf', () => {
  it('抚摸累加计数并落盘', async () => {
    const pet = await loadOrCreatePet(NOW);
    await petOnce(pet, NOW + MIN);
    await petOnce(pet, NOW + 2 * MIN);
    const reloaded = await loadOrCreatePet(NOW + 3 * MIN);
    assert.equal(reloaded.interactedCount, 2);
  });

  it('传入陈旧快照也不会丢失计数（连点抚摸的场景）', async () => {
    // 模拟 UI 连续抚摸：两次都基于同一份 stale 数据，
    // 若实现是"以传入快照为准覆盖写"，第二次会把第一次的计数抹掉。
    const stale = await loadOrCreatePet(NOW);
    await petOnce(stale, NOW + MIN);
    const second = await petOnce(stale, NOW + 2 * MIN);
    assert.equal(second.interactedCount, 2, '第二次不应把第一次的计数覆盖掉');
  });

  it('advancePet 在同一时刻是空操作（不产生无意义写入）', async () => {
    const pet = await loadOrCreatePet(NOW);
    assert.equal(advancePet(pet, NOW), pet);
  });

  it('advancePet 时间前进后饱食度下降', async () => {
    const pet = await loadOrCreatePet(NOW);
    const next = advancePet(pet, NOW + 60 * MIN);
    assert.ok(next.vitals.satiety < pet.vitals.satiety);
    assert.equal(next.lastTickAt, NOW + 60 * MIN);
  });

  it('levelInfoOf 给出等级与升级进度', async () => {
    const pet = await loadOrCreatePet(NOW);
    const info = levelInfoOf(pet);
    assert.equal(info.level, 1);
    assert.ok(info.expToNext > 0);
  });

  it('等级不会因互动过多而无限增长（有上限）', async () => {
    const pet = { ...(await loadOrCreatePet(NOW)), interactedCount: 100_000, completedTasks: 100_000 };
    const info = levelInfoOf(pet);
    assert.ok(info.level <= 10, `等级应被限制，实际 ${info.level}`);
  });
});

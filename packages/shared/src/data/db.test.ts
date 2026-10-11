/**
 * 数据库与持久化存储单测。
 * 使用 fake-indexeddb 在 Node 下模拟 IndexedDB（已验证可用）。
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DB_NAME, DEMO_DB_NAME, deleteDb, isDbAvailable, openDb, closeDb, type PetFocusDb } from './db.ts';
import {
  EXPORT_REMINDER_DAYS,
  createDexieDeviceStorage,
  createDexieKeyValueStore,
  daysSinceExport,
  getLastExportAt,
  markExported,
  shouldRemindExport,
} from './dexie-stores.ts';
import { initDeviceIdentity, loadDeviceIdentity, signRequest, verifyRequestSignature } from './device-identity.ts';
import { KV_KEYS } from './kv-store.ts';

const subtle = globalThis.crypto.subtle as unknown as Parameters<typeof initDeviceIdentity>[0]['subtle'];
const DAY = 86_400_000;
const NOW = 1_770_000_000_000;

const opened: string[] = [];
async function freshDb(name = `pf-test-${Date.now()}-${Math.random().toString(36).slice(2)}`): Promise<PetFocusDb> {
  const db = await openDb(name);
  opened.push(name);
  return db;
}

afterEach(async () => {
  while (opened.length > 0) {
    const name = opened.pop();
    if (name) await deleteDb(name);
  }
});

describe('schema：表与索引', () => {
  it('默认库名与演示库名不同（演示数据物理隔离）', () => {
    assert.equal(DB_NAME, 'petfocus');
    assert.equal(DEMO_DB_NAME, 'petfocus-demo');
    assert.notEqual(DB_NAME, DEMO_DB_NAME);
  });

  it('能打开并写入各业务表', async () => {
    const db = await freshDb();

    await db.tasks.put({
      id: 't1',
      dayKey: '2026-02-14',
      title: '写实验报告',
      startAt: NOW,
      plannedMs: 2_700_000,
      priority: 'HIGH',
      status: 'PENDING',
      linkedSessionIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.mealEntries.put({
      id: 'm1',
      dayKey: '2026-02-14',
      slot: 'LUNCH',
      foodName: '米饭',
      normalizedName: '米饭',
      portionValue: 150,
      portionUnit: 'GRAM',
      nutrients: { kcal: 174, proteinG: 3.9, fatG: 0.5, carbG: 38.9 },
      source: 'LOCAL_DB',
      recordedAt: NOW,
    });
    await db.financeEntries.put({
      id: 'f1',
      dayKey: '2026-02-14',
      type: 'EXPENSE',
      amountCents: 2350,
      categoryId: 'food',
      occurredAt: NOW,
    });

    assert.equal(await db.tasks.count(), 1);
    assert.equal(await db.mealEntries.count(), 1);
    assert.equal(await db.financeEntries.count(), 1);
    closeDb(db);
  });

  it('复合索引可用于查询（[dayKey+status]）', async () => {
    const db = await freshDb();
    const base = {
      dayKey: '2026-02-14',
      startAt: NOW,
      plannedMs: 1_500_000,
      priority: 'MEDIUM' as const,
      linkedSessionIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.tasks.bulkPut([
      { ...base, id: 'a', title: 'A', status: 'DONE' },
      { ...base, id: 'b', title: 'B', status: 'PENDING' },
      { ...base, id: 'c', title: 'C', status: 'DONE' },
    ]);
    const done = await db.tasks.where('[dayKey+status]').equals(['2026-02-14', 'DONE']).toArray();
    assert.equal(done.length, 2);
    closeDb(db);
  });

  it('金额以整数「分」存储，无浮点误差', async () => {
    const db = await freshDb();
    await db.financeEntries.put({
      id: 'f2',
      dayKey: '2026-02-14',
      type: 'EXPENSE',
      amountCents: 1_999, // 19.99 元
      categoryId: 'food',
      occurredAt: NOW,
    });
    const row = await db.financeEntries.get('f2');
    assert.equal(row?.amountCents, 1999);
    assert.equal(Number.isInteger(row?.amountCents), true);
    // 19.99 元 = 1999 分；用浮点存会是 19.989999999999998
    assert.equal((row?.amountCents ?? 0) / 100, 19.99);
    closeDb(db);
  });

  it('结算队列（outbox）只接受四类出网操作', async () => {
    const db = await freshDb();
    for (const [i, kind] of (['SETTLE', 'CONSUME_QUOTA', 'CLAIM_GRANT', 'AI_NUTRITION'] as const).entries()) {
      await db.outbox.put({
        id: `o${i}`,
        kind,
        payloadJson: '{}',
        status: 'PENDING',
        attempts: 0,
        nextRetryAt: NOW,
        createdAt: NOW,
      });
    }
    const pending = await db.outbox.where('[status+nextRetryAt]').below(['PENDING', NOW + 1]).toArray();
    assert.equal(pending.length, 4);
    closeDb(db);
  });

  it('isDbAvailable 在可用环境下返回 true', async () => {
    assert.equal(await isDbAvailable(`pf-avail-${Date.now()}`), true);
  });
});

describe('设备身份持久化（Dexie 实现）', () => {
  it('完整生命周期：创建 → 保存 → 重新打开仍可读 → 可签名', async () => {
    const name = `pf-device-${Date.now()}`;
    const db1 = await openDb(name);
    opened.push(name);

    const deps = { subtle, storage: createDexieDeviceStorage(db1), now: () => NOW };
    const created = await initDeviceIdentity(deps);
    assert.equal(created.registered, false);

    // 关闭并用同一库名重新打开，模拟「关掉浏览器再进来」
    closeDb(db1);
    const db2 = await openDb(name);
    const deps2 = { subtle, storage: createDexieDeviceStorage(db2), now: () => NOW };

    const reloaded = await loadDeviceIdentity(deps2);
    assert.ok(reloaded, '重新打开后应能读回身份');
    assert.equal(reloaded.deviceId, created.deviceId);
    assert.equal(reloaded.createdAt, NOW);

    // 关键：取回的不可导出密钥仍可用于签名，且签名可被自身校验
    const headers = await signRequest(deps2, reloaded, '{"coin":10}');
    const verified = await verifyRequestSignature(deps2, reloaded, '{"coin":10}', headers);
    assert.equal(verified.valid, true);

    closeDb(db2);
  });

  it('密钥以不可导出形式存回（extractable === false）', async () => {
    const db = await freshDb();
    const deps = { subtle, storage: createDexieDeviceStorage(db), now: () => NOW };
    const identity = await initDeviceIdentity(deps);
    const row = await db.rawKv.get('device.identity');
    const key = row?.value as { extractable?: boolean; type?: string } | undefined;
    assert.equal(key?.type, 'secret');
    assert.equal(key?.extractable, false);
    void identity;
    closeDb(db);
  });

  it('clear 后读不到身份（重置设备 ID 的语义）', async () => {
    const db = await freshDb();
    const storage = createDexieDeviceStorage(db);
    const deps = { subtle, storage, now: () => NOW };
    await initDeviceIdentity(deps);
    assert.ok(await storage.load());
    await storage.clear();
    assert.equal(await storage.load(), undefined);
    closeDb(db);
  });

  it('元数据损坏时返回 undefined 而不是抛错', async () => {
    const db = await freshDb();
    await db.kv.put({ key: 'device.identity', valueJson: '{ 这不是合法 JSON' });
    await db.rawKv.put({ key: 'device.identity', value: {} });
    const storage = createDexieDeviceStorage(db);
    assert.equal(await storage.load(), undefined);
    closeDb(db);
  });
});

describe('KV 存储与导出提醒 [NFR-2.4]', () => {
  it('存取任意 JSON 值', async () => {
    const db = await freshDb();
    const kv = createDexieKeyValueStore(db);
    await kv.set('some.key', { a: 1, b: ['x'] });
    assert.deepEqual(await kv.get('some.key'), { a: 1, b: ['x'] });
    await kv.delete('some.key');
    assert.equal(await kv.get('some.key'), undefined);
    closeDb(db);
  });

  it('值损坏时返回 undefined', async () => {
    const db = await freshDb();
    const kv = createDexieKeyValueStore(db);
    await db.kv.put({ key: 'bad', valueJson: 'not json' });
    assert.equal(await kv.get('bad'), undefined);
    closeDb(db);
  });

  it('记录导出时间并按天数判断是否提醒', async () => {
    const db = await freshDb();
    const kv = createDexieKeyValueStore(db);

    assert.equal(await getLastExportAt(kv), undefined);
    assert.equal(shouldRemindExport(undefined, NOW), true, '从未导出过应提醒');

    await markExported(kv, NOW);
    assert.equal(await getLastExportAt(kv), NOW);
    assert.equal(daysSinceExport(NOW, NOW), 0);
    assert.equal(shouldRemindExport(NOW, NOW), false);

    // 差一天到阈值：不提醒
    assert.equal(shouldRemindExport(NOW, NOW + (EXPORT_REMINDER_DAYS - 1) * DAY), false);
    // 到达阈值：提醒
    assert.equal(shouldRemindExport(NOW, NOW + EXPORT_REMINDER_DAYS * DAY), true);
    closeDb(db);
  });

  it('时间倒流时 daysSinceExport 不为负', () => {
    assert.equal(daysSinceExport(NOW, NOW - 10 * DAY), 0);
    assert.equal(daysSinceExport(Number.NaN, NOW), undefined);
  });

  it('KV_KEYS 覆盖关键用途', () => {
    assert.equal(KV_KEYS.DEVICE_ID, 'device.id');
    assert.equal(KV_KEYS.LAST_EXPORT_AT, 'data.lastExportAt');
  });
});

describe('演示数据物理隔离 [技术设计 5.8]', () => {
  it('演示库与真实库互不可见', async () => {
    const realName = `pf-real-${Date.now()}`;
    const demoName = `pf-demo-${Date.now()}`;
    const real = await openDb(realName);
    const demo = await openDb(demoName);
    opened.push(realName, demoName);

    await real.tasks.put({
      id: 'real-task',
      dayKey: '2026-02-14',
      title: '真实待办',
      startAt: NOW,
      plannedMs: 1_500_000,
      priority: 'HIGH',
      status: 'PENDING',
      linkedSessionIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    await demo.tasks.put({
      id: 'demo-task',
      dayKey: '2026-02-14',
      title: '演示待办',
      startAt: NOW,
      plannedMs: 1_500_000,
      priority: 'LOW',
      status: 'DONE',
      linkedSessionIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });

    assert.equal(await real.tasks.count(), 1);
    assert.equal((await real.tasks.get('demo-task')), undefined, '真实库不应看到演示数据');
    assert.equal((await demo.tasks.get('real-task')), undefined, '演示库不应看到真实数据');

    closeDb(real);
    closeDb(demo);
  });
});

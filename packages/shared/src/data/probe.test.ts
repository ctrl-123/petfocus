/**
 * 环境探针：验证 dexie + fake-indexeddb 在 Node 测试环境下可用。
 * 这是 M2 的前置条件——若不可用，数据层要么换实现、要么测试改用内存仓储。
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface Row {
  id: string;
  dayKey: string;
  value: number;
  nested: { tags: string[] };
}

class ProbeDb extends Dexie {
  rows!: Dexie.Table<Row, string>;

  constructor() {
    super('petfocus-probe');
    this.version(1).stores({ rows: 'id, dayKey, value' });
  }
}

describe('探针：fake-indexeddb + Dexie 在 Node 下可用', () => {
  it('能打开数据库、写入、按索引查询', async () => {
    const db = new ProbeDb();
    await db.open();
    await db.rows.bulkPut([
      { id: 'a', dayKey: '2026-02-14', value: 1, nested: { tags: ['x', 'y'] } },
      { id: 'b', dayKey: '2026-02-14', value: 2, nested: { tags: ['z'] } },
      { id: 'c', dayKey: '2026-02-15', value: 3, nested: { tags: [] } },
    ]);

    const onDay = await db.rows.where('dayKey').equals('2026-02-14').toArray();
    assert.equal(onDay.length, 2);

    const one = await db.rows.get('a');
    assert.deepEqual(one?.nested.tags, ['x', 'y'], '嵌套对象应完整保存');

    const byRange = await db.rows.where('value').above(1).toArray();
    assert.equal(byRange.length, 2);

    db.close();
  });

  it('支持事务与 count', async () => {
    const db = new ProbeDb();
    await db.open();
    await db.transaction('rw', db.rows, async () => {
      await db.rows.put({ id: 't1', dayKey: '2026-02-14', value: 10, nested: { tags: [] } });
      await db.rows.put({ id: 't2', dayKey: '2026-02-14', value: 20, nested: { tags: [] } });
    });
    const count = await db.rows.count();
    assert.ok(count >= 2);
    db.close();
  });

  it('支持版本迁移（version 1 → 2）', async () => {
    const name = `petfocus-migrate-${Date.now()}`;

    class V1 extends Dexie {
      rows!: Dexie.Table<{ id: string; dayKey: string }, string>;
      constructor() {
        super(name);
        this.version(1).stores({ rows: 'id, dayKey' });
      }
    }
    const v1 = new V1();
    await v1.open();
    await v1.rows.put({ id: 'm1', dayKey: '2026-02-14' });
    v1.close();

    let upgraded = 0;
    class V2 extends Dexie {
      rows!: Dexie.Table<{ id: string; dayKey: string; status: string }, string>;
      constructor() {
        super(name);
        this.version(1).stores({ rows: 'id, dayKey' });
        this.version(2)
          .stores({ rows: 'id, dayKey, status' })
          .upgrade(async (tx) => {
            await tx
              .table('rows')
              .toCollection()
              .modify((row: { status?: string }) => {
                row.status = 'PENDING';
                upgraded += 1;
              });
          });
      }
    }
    const v2 = new V2();
    await v2.open();
    const migrated = await v2.rows.get('m1');
    assert.equal(upgraded, 1, 'upgrade 回调应执行一次');
    assert.equal(migrated?.status, 'PENDING', '旧数据应被补上新字段');
    v2.close();
    await Dexie.delete(name);
  });

  it('CryptoKey（不可导出）能否经 IndexedDB 结构化克隆后取回', async () => {
    // 这决定设备签名私钥能否安全存放：能则用不可导出密钥，不能则退回可导出+加密
    const name = `petfocus-crypto-${Date.now()}`;
    class KeyDb extends Dexie {
      keys!: Dexie.Table<{ id: string; key: CryptoKey }, string>;
      constructor() {
        super(name);
        this.version(1).stores({ keys: 'id' });
      }
    }
    const db = new KeyDb();
    await db.open();

    const generated = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    assert.equal(generated.extractable, false, '密钥应为不可导出');

    await db.keys.put({ id: 'device', key: generated });

    const loaded = await db.keys.get('device');
    assert.ok(loaded, '应能取回记录');

    // fake-indexeddb 的结构化克隆能力决定这里能否通过
    if (loaded && typeof loaded.key === 'object' && 'algorithm' in loaded.key) {
      const sig = await crypto.subtle.sign('HMAC', loaded.key, new TextEncoder().encode('hello'));
      assert.ok(sig.byteLength > 0, '取回的密钥应可用于签名');
    } else {
      assert.fail(`CryptoKey 未能被结构化克隆保留：${typeof loaded?.key}`);
    }

    db.close();
    await Dexie.delete(name);
  });
});

/**
 * 键值存储单测。
 * 内存实现有两个真实用途：降级模式（IndexedDB 不可用）与测试，
 * 所以它必须和 Dexie 实现有完全一致的行为语义。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { KV_KEYS, createMemoryKeyValueStore } from './kv-store.ts';

describe('createMemoryKeyValueStore', () => {
  it('set / get 往返', async () => {
    const store = createMemoryKeyValueStore();
    await store.set('a', { n: 1, list: ['x'] });
    assert.deepEqual(await store.get('a'), { n: 1, list: ['x'] });
  });

  it('未设置的键返回 undefined', async () => {
    const store = createMemoryKeyValueStore();
    assert.equal(await store.get('missing'), undefined);
  });

  it('可存原始类型与 null', async () => {
    const store = createMemoryKeyValueStore();
    await store.set('num', 42);
    await store.set('str', 'text');
    await store.set('bool', false);
    await store.set('nil', null);
    assert.equal(await store.get('num'), 42);
    assert.equal(await store.get('str'), 'text');
    assert.equal(await store.get('bool'), false);
    assert.equal(await store.get('nil'), null);
  });

  it('同键覆盖', async () => {
    const store = createMemoryKeyValueStore();
    await store.set('k', 1);
    await store.set('k', 2);
    assert.equal(await store.get('k'), 2);
  });

  it('delete 只删指定键', async () => {
    const store = createMemoryKeyValueStore();
    await store.set('a', 1);
    await store.set('b', 2);
    await store.delete('a');
    assert.equal(await store.get('a'), undefined);
    assert.equal(await store.get('b'), 2);
  });

  it('clear 清空全部', async () => {
    const store = createMemoryKeyValueStore();
    await store.set('a', 1);
    await store.set('b', 2);
    await store.clear();
    assert.equal(await store.get('a'), undefined);
    assert.equal(await store.get('b'), undefined);
  });

  it('可保存不可 JSON 序列化的值（结构化克隆语义）', async () => {
    // 内存实现直接存引用；这也是 CryptoKey 能被存放的前提（Dexie 侧走 rawKv）
    const store = createMemoryKeyValueStore();
    const fn = (): number => 1;
    await store.set('fn', fn);
    assert.equal(await store.get<typeof fn>('fn'), fn);
  });
});

describe('KV_KEYS：键名集中定义，避免各处拼字符串', () => {
  it('关键键存在且命名稳定（改动会影响已发布用户的本地数据读取）', () => {
    assert.equal(KV_KEYS.DEVICE_ID, 'device.id');
    assert.equal(KV_KEYS.DEVICE_SIGNING_KEY, 'device.signingKey');
    assert.equal(KV_KEYS.DEVICE_REGISTERED, 'device.registered');
    assert.equal(KV_KEYS.LAST_SETTLE_AT, 'settle.lastAt');
    assert.equal(KV_KEYS.LAST_EXPORT_AT, 'data.lastExportAt');
    assert.equal(KV_KEYS.SCHEMA_VERSION, 'data.schemaVersion');
  });

  it('所有键互不重复', () => {
    const values = Object.values(KV_KEYS);
    assert.equal(new Set(values).size, values.length);
  });
});

/**
 * 设备身份单测。
 *
 * 用 Node 内置的 WebCrypto（globalThis.crypto.subtle）——Node 20+ 默认提供，
 * 与浏览器的 subtle 接口一致，因此这些测试能真实反映线上行为。
 *
 * 重点验证：
 * 1. 身份只创建一次、可持久化
 * 2. 签名可被同一身份验证；篡改 body 或时间戳会被拒
 * 3. 时间窗（±5 分钟）语义
 * 4. 密钥不可导出（ADR-010 的强化点）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIGNATURE_WINDOW_MS,
  initDeviceIdentity,
  loadDeviceIdentity,
  markRegistered,
  newIdempotencyKey,
  resetDeviceIdentity,
  signRequest,
  signaturePayload,
  verifyRequestSignature,
  type DeviceIdentity,
  type DeviceIdentityDeps,
  type DeviceIdentityStorage,
} from './device-identity.ts';

/** 内存身份存储（生产用 IndexedDB 实现，见 device-store.ts） */
function createMemoryStorage(): DeviceIdentityStorage & { peek(): DeviceIdentity | undefined } {
  let value: DeviceIdentity | undefined;
  return {
    load: () => Promise.resolve(value),
    save: (identity) => {
      value = identity;
      return Promise.resolve();
    },
    clear: () => {
      value = undefined;
      return Promise.resolve();
    },
    peek: () => value,
  };
}

const subtle = globalThis.crypto.subtle as unknown as DeviceIdentityDeps['subtle'];

let uuidCounter = 0;
function deps(nowValue = 1_770_000_000_000): DeviceIdentityDeps & { setNow(n: number): void } {
  let now = nowValue;
  return {
    subtle,
    storage: createMemoryStorage(),
    now: () => now,
    randomUuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
    setNow(n: number) {
      now = n;
    },
  };
}

describe('initDeviceIdentity：身份生命周期', () => {
  it('首次调用创建身份，含 ID / 密钥 / 时间戳 / 未登记标记', async () => {
    const d = deps();
    const id = await initDeviceIdentity(d);
    assert.match(id.deviceId, /^[0-9a-f-]{36}$/);
    assert.equal(id.registered, false);
    assert.equal(id.createdAt, 1_770_000_000_000);
    assert.ok(id.signingKey, '应生成签名密钥');
  });

  it('重复调用返回同一身份（不重复生成）', async () => {
    const d = deps();
    const first = await initDeviceIdentity(d);
    const second = await initDeviceIdentity(d);
    assert.equal(second.deviceId, first.deviceId);
    assert.equal(second.signingKey, first.signingKey);
  });

  it('loadDeviceIdentity 不隐式创建', async () => {
    const d = deps();
    assert.equal(await loadDeviceIdentity(d), undefined);
    await initDeviceIdentity(d);
    assert.ok(await loadDeviceIdentity(d));
  });

  it('密钥不可导出（ADR-010：DevTools 也读不出密钥字节）', async () => {
    const d = deps();
    const id = await initDeviceIdentity(d);
    const key = id.signingKey as { extractable: boolean; type: string };
    assert.equal(key.type, 'secret');
    assert.equal(key.extractable, false, '密钥必须不可导出');
  });

  it('markRegistered 更新登记状态并持久化', async () => {
    const d = deps();
    const created = await initDeviceIdentity(d);
    const updated = await markRegistered(d, true);
    assert.equal(updated?.registered, true);
    assert.equal(updated?.deviceId, created.deviceId, '不应改变设备 ID');
    assert.equal((await loadDeviceIdentity(d))?.registered, true);
  });

  it('markRegistered 在无身份时返回 undefined', async () => {
    assert.equal(await markRegistered(deps(), true), undefined);
  });

  it('resetDeviceIdentity 生成全新身份（旧账本将失联）', async () => {
    const d = deps();
    const before = await initDeviceIdentity(d);
    await markRegistered(d, true);
    const after = await resetDeviceIdentity(d);
    assert.notEqual(after.deviceId, before.deviceId);
    assert.equal(after.registered, false);
  });
});

describe('signRequest：签名生成', () => {
  it('产出三个必需的头，时间戳为当前时间', async () => {
    const d = deps(1_770_000_123_456);
    const id = await initDeviceIdentity(d);
    const headers = await signRequest(d, id, '{"a":1}');
    assert.equal(headers['x-device-id'], id.deviceId);
    assert.equal(headers['x-ts'], '1770000123456');
    assert.ok(headers['x-device-sig'].length > 0);
  });

  it('签名是 base64 的 32 字节 HMAC-SHA256', async () => {
    const d = deps();
    const id = await initDeviceIdentity(d);
    const headers = await signRequest(d, id, 'body');
    const bytes = Buffer.from(headers['x-device-sig'], 'base64');
    assert.equal(bytes.length, 32);
  });

  it('同一 body 在不同时间戳下签名不同（防重放）', async () => {
    const d = deps(1000);
    const id = await initDeviceIdentity(d);
    const first = await signRequest(d, id, 'body');
    d.setNow(2000);
    const second = await signRequest(d, id, 'body');
    assert.notEqual(first['x-device-sig'], second['x-device-sig']);
  });

  it('body 不同则签名不同', async () => {
    const d = deps();
    const id = await initDeviceIdentity(d);
    const a = await signRequest(d, id, '{"coin":1}');
    const b = await signRequest(d, id, '{"coin":999}');
    assert.notEqual(a['x-device-sig'], b['x-device-sig']);
  });

  it('不同身份签同一内容结果不同', async () => {
    const d1 = deps();
    const d2 = deps();
    const id1 = await initDeviceIdentity(d1);
    const id2 = await initDeviceIdentity(d2);
    const s1 = await signRequest(d1, id1, 'body');
    const s2 = await signRequest(d2, id2, 'body');
    assert.notEqual(s1['x-device-sig'], s2['x-device-sig']);
  });
});

describe('verifyRequestSignature：校验与时间窗', () => {
  it('合法签名通过', async () => {
    const d = deps();
    const id = await initDeviceIdentity(d);
    const headers = await signRequest(d, id, '{"x":1}');
    const result = await verifyRequestSignature(d, id, '{"x":1}', headers);
    assert.equal(result.valid, true);
  });

  it('body 被篡改 → MISMATCH', async () => {
    const d = deps();
    const id = await initDeviceIdentity(d);
    const headers = await signRequest(d, id, '{"coin":10}');
    const result = await verifyRequestSignature(d, id, '{"coin":99999}', headers);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'MISMATCH');
  });

  it('时间戳过旧（超过 5 分钟）→ STALE_TIMESTAMP', async () => {
    const d = deps(1_000_000);
    const id = await initDeviceIdentity(d);
    const headers = await signRequest(d, id, 'body');
    const result = await verifyRequestSignature(d, id, 'body', headers, 1_000_000 + SIGNATURE_WINDOW_MS + 1);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'STALE_TIMESTAMP');
  });

  it('时间戳来自未来（超过 5 分钟）→ FUTURE_TIMESTAMP', async () => {
    const d = deps(1_000_000);
    const id = await initDeviceIdentity(d);
    const headers = await signRequest(d, id, 'body');
    const result = await verifyRequestSignature(d, id, 'body', headers, 1_000_000 - SIGNATURE_WINDOW_MS - 1);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'FUTURE_TIMESTAMP');
  });

  it('时间窗边界内通过（恰好 5 分钟）', async () => {
    const d = deps(1_000_000);
    const id = await initDeviceIdentity(d);
    const headers = await signRequest(d, id, 'body');
    const result = await verifyRequestSignature(d, id, 'body', headers, 1_000_000 + SIGNATURE_WINDOW_MS);
    assert.equal(result.valid, true);
  });

  it('时间戳非法 → MISMATCH', async () => {
    const d = deps();
    const id = await initDeviceIdentity(d);
    const result = await verifyRequestSignature(d, id, 'body', {
      'x-device-id': id.deviceId,
      'x-ts': 'not-a-number',
      'x-device-sig': 'xxx',
    });
    assert.equal(result.valid, false);
  });
});

describe('工具函数', () => {
  it('signaturePayload 拼接格式固定为 ts.body', () => {
    assert.equal(signaturePayload(123, '{"a":1}'), '123.{"a":1}');
  });

  it('newIdempotencyKey 生成 UUID', () => {
    const key = newIdempotencyKey(() => 'fixed-key');
    assert.equal(key, 'fixed-key');
    assert.match(newIdempotencyKey(), /^[0-9a-f-]{36}$/);
  });
});

describe('端到端：换机导入后新身份无法通过旧签名校验', () => {
  it('导入到新设备生成新身份时，旧签名失效', async () => {
    const oldDeps = deps();
    const oldIdentity = await initDeviceIdentity(oldDeps);
    const oldHeaders = await signRequest(oldDeps, oldIdentity, '{"coin":10}');

    // 新设备：全新身份
    const newDeps = deps();
    const newIdentity = await initDeviceIdentity(newDeps);
    const result = await verifyRequestSignature(newDeps, newIdentity, '{"coin":10}', oldHeaders);
    assert.equal(result.valid, false);
  });
});

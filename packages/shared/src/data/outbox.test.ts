/**
 * 结算队列（outbox）单测。
 * 重点：只允许 4 类出网操作、幂等入队、指数退避、DEAD 不静默丢弃。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  OUTBOX_KINDS,
  OUTBOX_POLICY,
  backoffFor,
  enqueue,
  markFailed,
  markInFlight,
  markSucceeded,
  needsAttention,
  selectDue,
  summarizeOutbox,
} from './outbox.ts';
import type { OutboxRecord } from './db.ts';

const NOW = 1_770_000_000_000;

function rec(partial: Partial<OutboxRecord> & { id: string }): OutboxRecord {
  return {
    kind: 'SETTLE',
    payloadJson: '{}',
    status: 'PENDING',
    attempts: 0,
    nextRetryAt: NOW,
    createdAt: NOW,
    ...partial,
  };
}

describe('enqueue：只承载结算与 AI 请求 [AGENTS.md 第 4 节]', () => {
  it('白名单恰好是四类出网操作', () => {
    assert.deepEqual([...OUTBOX_KINDS], ['SETTLE', 'CONSUME_QUOTA', 'CLAIM_GRANT', 'AI_NUTRITION']);
  });

  it('入队后状态为 PENDING、尝试次数为 0', () => {
    const next = enqueue([], { kind: 'SETTLE', payload: { a: 1 }, id: 's1', now: NOW });
    assert.equal(next.length, 1);
    assert.equal(next[0]?.status, 'PENDING');
    assert.equal(next[0]?.attempts, 0);
    assert.equal(next[0]?.nextRetryAt, NOW);
    assert.equal(next[0]?.payloadJson, '{"a":1}');
  });

  it('幂等：同 id 重复入队不会产生第二条', () => {
    const once = enqueue([], { kind: 'SETTLE', payload: { n: 1 }, id: 's1', now: NOW });
    const twice = enqueue(once, { kind: 'SETTLE', payload: { n: 2 }, id: 's1', now: NOW + 1000 });
    assert.equal(twice.length, 1);
    assert.equal(twice[0]?.payloadJson, '{"n":1}', '应保留首次入队的内容');
  });

  it('不同类型可用同一 id（幂等键按 id 全局唯一）', () => {
    const a = enqueue([], { kind: 'SETTLE', payload: {}, id: 'x', now: NOW });
    const b = enqueue(a, { kind: 'AI_NUTRITION', payload: {}, id: 'x', now: NOW });
    assert.equal(b.length, 1);
  });
});

describe('selectDue：可处理项筛选', () => {
  it('只取到期的 PENDING/FAILED，按 nextRetryAt 升序', () => {
    const records = [
      rec({ id: 'a', nextRetryAt: NOW + 5000 }),
      rec({ id: 'b', nextRetryAt: NOW - 1000 }),
      rec({ id: 'c', status: 'FAILED', nextRetryAt: NOW }),
      rec({ id: 'd', status: 'DEAD', nextRetryAt: NOW - 9999 }),
    ];
    const due = selectDue(records, NOW);
    assert.deepEqual(due.map((r) => r.id), ['b', 'c']);
  });

  it('IN_FLIGHT 未超时不重复领取（防止双发）', () => {
    const records = [rec({ id: 'a', status: 'IN_FLIGHT', nextRetryAt: NOW - 1000 })];
    assert.equal(selectDue(records, NOW).length, 0);
  });

  it('IN_FLIGHT 超时后可重新领取（进程崩溃恢复）', () => {
    const records = [
      rec({ id: 'a', status: 'IN_FLIGHT', nextRetryAt: NOW - OUTBOX_POLICY.inFlightTimeoutMs - 1 }),
    ];
    assert.equal(selectDue(records, NOW).length, 1);
  });

  it('遵守批量上限', () => {
    const many = Array.from({ length: 50 }, (_, i) => rec({ id: `r${i}`, nextRetryAt: NOW }));
    assert.equal(selectDue(many, NOW, 5).length, 5);
    assert.equal(selectDue(many, NOW).length, OUTBOX_POLICY.batchSize);
  });
});

describe('状态流转', () => {
  it('markInFlight 增加尝试次数并把 nextRetryAt 当作领取时刻', () => {
    const after = markInFlight([rec({ id: 'a' })], 'a', NOW + 100);
    assert.equal(after[0]?.status, 'IN_FLIGHT');
    assert.equal(after[0]?.attempts, 1);
    assert.equal(after[0]?.nextRetryAt, NOW + 100);
  });

  it('markSucceeded 从队列移除', () => {
    const after = markSucceeded([rec({ id: 'a' }), rec({ id: 'b' })], 'a');
    assert.deepEqual(after.map((r) => r.id), ['b']);
  });

  it('失败后进入 FAILED 并安排退避重试', () => {
    const inFlight = markInFlight([rec({ id: 'a' })], 'a', NOW);
    const { records, dead } = markFailed(inFlight, 'a', 'network down', NOW, () => 0.5);
    assert.equal(dead, false);
    assert.equal(records[0]?.status, 'FAILED');
    assert.equal(records[0]?.lastError, 'network down');
    assert.ok((records[0]?.nextRetryAt ?? 0) > NOW, '应安排到未来重试');
  });

  it('超过最大尝试次数进入 DEAD（不静默丢弃）', () => {
    let records: OutboxRecord[] = [rec({ id: 'a', attempts: OUTBOX_POLICY.maxAttempts })];
    const result = markFailed(records, 'a', 'still failing', NOW, () => 0.5);
    records = result.records;
    assert.equal(result.dead, true);
    assert.equal(records[0]?.status, 'DEAD');
    assert.equal(records[0]?.lastError, 'still failing');
  });

  it('DEAD 之后不再被领取', () => {
    const dead = [rec({ id: 'a', status: 'DEAD', attempts: 99, nextRetryAt: 0 })];
    assert.equal(selectDue(dead, NOW).length, 0);
  });
});

describe('backoffFor：指数退避', () => {
  it('随尝试次数增长，且被上限夹住', () => {
    const noJitter = (): number => 0.5; // 抖动系数取中值 1.0
    assert.equal(backoffFor(1, noJitter), 2_000);
    assert.equal(backoffFor(2, noJitter), 4_000);
    assert.equal(backoffFor(3, noJitter), 8_000);
    assert.equal(backoffFor(50, noJitter), OUTBOX_POLICY.maxBackoffMs);
  });

  it('抖动范围在 ±20% 内', () => {
    const low = backoffFor(1, () => 0);
    const high = backoffFor(1, () => 1);
    assert.equal(low, 1_600);
    assert.equal(high, 2_400);
  });

  it('永不返回负数或非有限值', () => {
    for (const attempts of [0, 1, 5, 100]) {
      const v = backoffFor(attempts, () => 0.5);
      assert.ok(Number.isFinite(v) && v >= 0);
    }
  });
});

describe('needsAttention / summarizeOutbox', () => {
  it('DEAD 或尝试次数达上限的条目需要提醒用户', () => {
    const records = [
      rec({ id: 'a' }),
      rec({ id: 'b', status: 'DEAD' }),
      rec({ id: 'c', attempts: OUTBOX_POLICY.maxAttempts, status: 'FAILED' }),
    ];
    assert.deepEqual(needsAttention(records).map((r) => r.id), ['b', 'c']);
  });

  it('统计各状态数量与总尝试次数', () => {
    const stats = summarizeOutbox([
      rec({ id: 'a', status: 'PENDING', attempts: 0 }),
      rec({ id: 'b', status: 'IN_FLIGHT', attempts: 2 }),
      rec({ id: 'c', status: 'FAILED', attempts: 3 }),
      rec({ id: 'd', status: 'DEAD', attempts: 8 }),
    ]);
    assert.deepEqual(stats, { pending: 1, inFlight: 1, failed: 1, dead: 1, totalAttempts: 13 });
  });

  it('空队列统计全为 0', () => {
    assert.deepEqual(summarizeOutbox([]), { pending: 0, inFlight: 0, failed: 0, dead: 0, totalAttempts: 0 });
  });
});

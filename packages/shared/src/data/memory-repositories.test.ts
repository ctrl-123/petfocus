/**
 * 内存仓储单测。
 * 这层是领域测试与「隐私模式降级」的共同基础，所以行为必须与 Dexie 实现一致。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryRepositories } from './memory-repositories.ts';
import type { CoinLedgerRecord, OutboxRecord, SessionRecord, TaskRecord } from './db.ts';

const NOW = 1_770_000_000_000;
const MIN = 60_000;

function task(id: string, partial: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    dayKey: '2026-02-14',
    title: id,
    startAt: NOW,
    plannedMs: 25 * MIN,
    priority: 'MEDIUM',
    status: 'PENDING',
    linkedSessionIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

function session(id: string, partial: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id,
    kind: 'FOCUS',
    status: 'SETTLED',
    title: '专注',
    plannedMs: 25 * MIN,
    startedAtMonotonic: NOW,
    startedAtWall: NOW,
    pausedIntervals: [],
    violations: [],
    effectiveMs: 25 * MIN,
    exitKind: 'NONE',
    rewardCoin: 20,
    updatedAt: NOW,
    ...partial,
  };
}

function coin(id: string, amount: number, partial: Partial<CoinLedgerRecord> = {}): CoinLedgerRecord {
  return {
    id,
    kind: amount >= 0 ? 'FOCUS_DONE' : 'PURCHASE',
    amount,
    balanceAfter: 0,
    dayKey: '2026-02-14',
    serverTime: NOW,
    confirmed: true,
    ...partial,
  };
}

describe('通用 CRUD', () => {
  it('put / get / delete / count / clear', async () => {
    const repos = createMemoryRepositories();
    await repos.tasks.put(task('t1'));
    assert.equal((await repos.tasks.get('t1'))?.id, 't1');
    assert.equal(await repos.tasks.count(), 1);

    await repos.tasks.put(task('t1', { title: '改名' }));
    assert.equal((await repos.tasks.get('t1'))?.title, '改名', '同 id 应覆盖');
    assert.equal(await repos.tasks.count(), 1);

    await repos.tasks.delete('t1');
    assert.equal(await repos.tasks.get('t1'), undefined);

    await repos.tasks.bulkPut([task('a'), task('b')]);
    assert.equal(await repos.tasks.count(), 2);
    await repos.tasks.clear();
    assert.equal(await repos.tasks.count(), 0);
  });

  it('bulkPut 与 all 保持数据完整', async () => {
    const repos = createMemoryRepositories();
    await repos.tasks.bulkPut([task('a'), task('b'), task('c')]);
    const all = await repos.tasks.all();
    assert.equal(all.length, 3);
    assert.deepEqual(all.map((t) => t.id).sort(), ['a', 'b', 'c']);
  });
});

describe('TaskRepository', () => {
  it('byDay 按 dayKey 过滤', async () => {
    const repos = createMemoryRepositories();
    await repos.tasks.bulkPut([
      task('a', { dayKey: '2026-02-14' }),
      task('b', { dayKey: '2026-02-15' }),
      task('c', { dayKey: '2026-02-14' }),
    ]);
    const day = await repos.tasks.byDay('2026-02-14');
    assert.deepEqual(day.map((t) => t.id).sort(), ['a', 'c']);
  });

  it('byStatus 用于跨天处理（找出所有未完成）', async () => {
    const repos = createMemoryRepositories();
    await repos.tasks.bulkPut([
      task('a', { status: 'PENDING' }),
      task('b', { status: 'DONE' }),
      task('c', { status: 'PENDING' }),
    ]);
    assert.deepEqual((await repos.tasks.byStatus('PENDING')).map((t) => t.id).sort(), ['a', 'c']);
  });
});

describe('SessionRepository', () => {
  it('findUnsettled 返回最近一个未结算会话（冷启动恢复用）', async () => {
    const repos = createMemoryRepositories();
    await repos.sessions.bulkPut([
      session('old', { status: 'SETTLED', startedAtWall: NOW - 100 * MIN }),
      session('running', { status: 'RUNNING', startedAtWall: NOW - 10 * MIN }),
      session('paused', { status: 'PAUSED', startedAtWall: NOW - 5 * MIN }),
    ]);
    const found = await repos.sessions.findUnsettled();
    assert.equal(found?.id, 'paused', '应取最近的那个');
  });

  it('全部已结算时返回 undefined', async () => {
    const repos = createMemoryRepositories();
    await repos.sessions.put(session('s1', { status: 'SETTLED' }));
    assert.equal(await repos.sessions.findUnsettled(), undefined);
  });

  it('SCHEDULED（宽限期）也算未结算', async () => {
    const repos = createMemoryRepositories();
    await repos.sessions.put(session('s1', { status: 'SCHEDULED' }));
    assert.equal((await repos.sessions.findUnsettled())?.id, 's1');
  });

  it('byDay 使用 04:00 自然日边界（复用 calendar，不复制逻辑）', async () => {
    const repos = createMemoryRepositories();
    // 本地时间 2026-02-14 03:00 → 归属 2026-02-13
    const earlyMorning = new Date(2026, 1, 14, 3, 0, 0).getTime();
    const midday = new Date(2026, 1, 14, 12, 0, 0).getTime();
    await repos.sessions.bulkPut([
      session('early', { startedAtWall: earlyMorning }),
      session('noon', { startedAtWall: midday }),
    ]);
    assert.deepEqual((await repos.sessions.byDay('2026-02-13')).map((s) => s.id), ['early']);
    assert.deepEqual((await repos.sessions.byDay('2026-02-14')).map((s) => s.id), ['noon']);
  });

  it('byKind 区分专注与锁机', async () => {
    const repos = createMemoryRepositories();
    await repos.sessions.bulkPut([
      session('f1', { kind: 'FOCUS' }),
      session('l1', { kind: 'LOCK' }),
    ]);
    assert.deepEqual((await repos.sessions.byKind('LOCK')).map((s) => s.id), ['l1']);
  });
});

describe('CoinLedgerRepository：余额不变量（INV-4）', () => {
  it('balance 为所有金额之和', async () => {
    const repos = createMemoryRepositories();
    await repos.coinLedger.bulkPut([coin('a', 46), coin('b', 18), coin('c', -50)]);
    assert.equal(await repos.coinLedger.balance(), 14);
  });

  it('异常数据导致负余额时夹到 0（余额绝不为负）', async () => {
    const repos = createMemoryRepositories();
    await repos.coinLedger.bulkPut([coin('a', 10), coin('b', -100)]);
    assert.equal(await repos.coinLedger.balance(), 0);
  });

  it('earnedOnDay 只累计当日正数且排除演示数据', async () => {
    const repos = createMemoryRepositories();
    await repos.coinLedger.bulkPut([
      coin('a', 46, { dayKey: '2026-02-14' }),
      coin('b', 18, { dayKey: '2026-02-14' }),
      coin('c', -50, { dayKey: '2026-02-14' }),
      coin('d', 999, { dayKey: '2026-02-14', kind: 'DEMO' }),
      coin('e', 100, { dayKey: '2026-02-15' }),
    ]);
    assert.equal(await repos.coinLedger.earnedOnDay('2026-02-14'), 64);
  });

  it('byRef 用于幂等校验（同一会话不应重复入账）', async () => {
    const repos = createMemoryRepositories();
    await repos.coinLedger.bulkPut([
      coin('a', 46, { refId: 's1' }),
      coin('b', 18, { refId: 's2' }),
    ]);
    assert.equal((await repos.coinLedger.byRef('s1')).length, 1);
    assert.equal((await repos.coinLedger.byRef('nope')).length, 0);
  });
});

describe('OutboxRepository.due', () => {
  it('只返回到期项并按时间升序，遵守上限', async () => {
    const repos = createMemoryRepositories();
    const base: Omit<OutboxRecord, 'id' | 'nextRetryAt'> = {
      kind: 'SETTLE',
      payloadJson: '{}',
      status: 'PENDING',
      attempts: 0,
      createdAt: NOW,
    };
    await repos.outbox.bulkPut([
      { ...base, id: 'future', nextRetryAt: NOW + 60_000 },
      { ...base, id: 'now', nextRetryAt: NOW },
      { ...base, id: 'past', nextRetryAt: NOW - 60_000 },
      { ...base, id: 'dead', status: 'DEAD', nextRetryAt: NOW - 999 },
    ]);
    const due = await repos.outbox.due(NOW, 10);
    assert.deepEqual(due.map((r) => r.id), ['past', 'now']);
  });
});

describe('clearAll：清业务数据但保住设备身份 [ADR-010]', () => {
  it('清空业务表，保留 kv（设备身份与导出时间）', async () => {
    const repos = createMemoryRepositories();
    await repos.tasks.put(task('t1'));
    await repos.sessions.put(session('s1'));
    await repos.coinLedger.put(coin('c1', 10));
    await repos.kv.set('device.identity', '{"deviceId":"dev-1"}');
    await repos.kv.set('data.lastExportAt', String(NOW));

    await repos.clearAll();

    assert.equal(await repos.tasks.count(), 0);
    assert.equal(await repos.sessions.count(), 0);
    assert.equal(await repos.coinLedger.count(), 0);
    assert.ok(await repos.kv.get('device.identity'), '设备身份必须保留，否则服务端账本失联');
    assert.ok(await repos.kv.get('data.lastExportAt'));
  });
});

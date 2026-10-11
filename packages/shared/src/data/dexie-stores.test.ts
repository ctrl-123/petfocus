/**
 * Dexie 仓储集成测试。
 *
 * 为什么要写这层：`createDexieRepositories` 是**应用实际使用的持久化路径**，
 * 而内存实现只用于测试与降级。两者若有行为差异，用户遇到的是真实的数据问题
 * （例如统计口径不一致、当日金币算错）。因此这里用 fake-indexeddb 做真实读写验证。
 *
 * 覆盖重点：
 * 1. 每个 byDay / byKind / query 的索引查询与内存实现结果一致
 * 2. 金币余额不变量（≥ 0）与当日产出统计（排除 DEMO）
 * 3. 事务写入（clearAll 不清 kv，保住设备身份）
 * 4. 软删除过滤、未结算会话查找
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { openDb, closeDb, deleteDb, type PetFocusDb } from './db.ts';
import { createDexieRepositories } from './dexie-stores.ts';
import type { CoinLedgerRecord, OutboxRecord, SessionRecord, TaskRecord } from './db.ts';

const NOW = new Date(2026, 1, 14, 10, 0, 0, 0).getTime();
const MIN = 60_000;

const opened: string[] = [];
async function freshDb(): Promise<PetFocusDb> {
  const name = `pf-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function task(id: string, partial: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    dayKey: '2026-02-14',
    title: `任务 ${id}`,
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

describe('TaskRepository（Dexie 实现）', () => {
  it('byDay 使用 dayKey 索引', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.tasks.bulkPut([
      task('a', { dayKey: '2026-02-14' }),
      task('b', { dayKey: '2026-02-15' }),
      task('c', { dayKey: '2026-02-14' }),
    ]);
    const day = await repos.tasks.byDay('2026-02-14');
    assert.deepEqual(day.map((t) => t.id).sort(), ['a', 'c']);
    closeDb(db);
  });

  it('byStatus 用于跨天处理', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.tasks.bulkPut([
      task('a', { status: 'PENDING' }),
      task('b', { status: 'DONE' }),
      task('c', { status: 'PENDING' }),
    ]);
    assert.deepEqual((await repos.tasks.byStatus('PENDING')).map((t) => t.id).sort(), ['a', 'c']);
    closeDb(db);
  });

  it('通用 CRUD 与 bulkPut 空数组安全', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.tasks.bulkPut([]);
    assert.equal(await repos.tasks.count(), 0);

    await repos.tasks.put(task('x'));
    assert.equal((await repos.tasks.get('x'))?.id, 'x');
    await repos.tasks.delete('x');
    assert.equal(await repos.tasks.get('x'), undefined);
    closeDb(db);
  });
});

describe('SessionRepository（Dexie 实现）', () => {
  it('findUnsettled 返回最近未结算会话', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.sessions.bulkPut([
      session('settled', { status: 'SETTLED', startedAtWall: NOW - 100 * MIN }),
      session('running', { status: 'RUNNING', startedAtWall: NOW - 10 * MIN }),
      session('paused', { status: 'PAUSED', startedAtWall: NOW - 5 * MIN }),
    ]);
    assert.equal((await repos.sessions.findUnsettled())?.id, 'paused');
    closeDb(db);
  });

  it('无未结算会话时返回 undefined', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.sessions.put(session('s', { status: 'SETTLED' }));
    assert.equal(await repos.sessions.findUnsettled(), undefined);
    closeDb(db);
  });

  it('byDay 遵守 04:00 自然日边界（与内存实现一致）', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    const earlyMorning = new Date(2026, 1, 14, 3, 0, 0).getTime();
    const midday = new Date(2026, 1, 14, 12, 0, 0).getTime();
    await repos.sessions.bulkPut([
      session('early', { startedAtWall: earlyMorning }),
      session('noon', { startedAtWall: midday }),
    ]);
    assert.deepEqual((await repos.sessions.byDay('2026-02-13')).map((s) => s.id), ['early']);
    assert.deepEqual((await repos.sessions.byDay('2026-02-14')).map((s) => s.id), ['noon']);
    closeDb(db);
  });

  it('byKind 区分专注与锁机', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.sessions.bulkPut([session('f', { kind: 'FOCUS' }), session('l', { kind: 'LOCK' })]);
    assert.deepEqual((await repos.sessions.byKind('LOCK')).map((s) => s.id), ['l']);
    closeDb(db);
  });
});

describe('CoinLedgerRepository（Dexie 实现）：余额不变量 INV-4', () => {
  it('balance 为金额之和', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.coinLedger.bulkPut([coin('a', 46), coin('b', 18), coin('c', -50)]);
    assert.equal(await repos.coinLedger.balance(), 14);
    closeDb(db);
  });

  it('异常数据导致负余额时夹到 0', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.coinLedger.bulkPut([coin('a', 10), coin('b', -100)]);
    assert.equal(await repos.coinLedger.balance(), 0);
    closeDb(db);
  });

  it('earnedOnDay 只算当日正数且排除 DEMO 演示数据', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.coinLedger.bulkPut([
      coin('a', 46, { dayKey: '2026-02-14' }),
      coin('b', 18, { dayKey: '2026-02-14' }),
      coin('c', -50, { dayKey: '2026-02-14' }),
      coin('d', 999, { dayKey: '2026-02-14', kind: 'DEMO' }),
      coin('e', 100, { dayKey: '2026-02-15' }),
    ]);
    assert.equal(await repos.coinLedger.earnedOnDay('2026-02-14'), 64);
    closeDb(db);
  });

  it('byRef 支持幂等校验', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.coinLedger.bulkPut([coin('a', 46, { refId: 's1' }), coin('b', 18, { refId: 's2' })]);
    assert.equal((await repos.coinLedger.byRef('s1')).length, 1);
    assert.equal((await repos.coinLedger.byRef('none')).length, 0);
    closeDb(db);
  });
});

describe('QuotaLedgerRepository（Dexie 实现）', () => {
  it('query 使用复合索引 [scope+periodKey]', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.quotaLedger.bulkPut([
      { id: 'q1', scope: 'FOCUS_DAILY', kind: 'GRANT', periodKey: '2026-02-14', serverTime: NOW, confirmed: true },
      { id: 'q2', scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: '2026-02-14', serverTime: NOW, confirmed: true },
      { id: 'q3', scope: 'FOCUS_MONTHLY', kind: 'GRANT', periodKey: '2026-02', serverTime: NOW, confirmed: true },
    ]);
    const daily = await repos.quotaLedger.query('FOCUS_DAILY', '2026-02-14');
    assert.deepEqual(daily.map((q) => q.id).sort(), ['q1', 'q2']);
    assert.equal((await repos.quotaLedger.query('LOCK_MONTHLY', '2026-02')).length, 0);
    assert.equal((await repos.quotaLedger.allEntries()).length, 3);
    closeDb(db);
  });

  it('bySession 找到某会话消耗的配额', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.quotaLedger.bulkPut([
      { id: 'q1', scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: '2026-02-14', sessionId: 's1', serverTime: NOW, confirmed: true },
      { id: 'q2', scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: '2026-02-14', sessionId: 's2', serverTime: NOW, confirmed: true },
    ]);
    assert.deepEqual((await repos.quotaLedger.bySession('s1')).map((q) => q.id), ['q1']);
    closeDb(db);
  });
});

describe('OutboxRepository（Dexie 实现）', () => {
  it('due 按 nextRetryAt 升序返回可处理项', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
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
    closeDb(db);
  });

  it('遵守批量上限', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.outbox.bulkPut(
      Array.from({ length: 30 }, (_, i) => ({
        id: `o${i}`,
        kind: 'SETTLE' as const,
        payloadJson: '{}',
        status: 'PENDING' as const,
        attempts: 0,
        nextRetryAt: NOW,
        createdAt: NOW,
      })),
    );
    assert.equal((await repos.outbox.due(NOW, 5)).length, 5);
    closeDb(db);
  });
});

describe('其余仓储与 clearAll', () => {
  it('宠物单例读写', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.pet.put({
      id: 'singleton',
      name: '豆豆',
      level: 1,
      exp: 0,
      mood: 70,
      satiety: 80,
      energy: 80,
      equipped: {},
      outfits: [],
      lastTickAt: NOW,
      interactedCount: 0,
      completedTasks: 0,
      updatedAt: NOW,
    });
    assert.equal((await repos.pet.get())?.name, '豆豆');
    await repos.pet.clear();
    assert.equal(await repos.pet.get(), undefined);
    closeDb(db);
  });

  it('settings 单例与 kv（原样存储）', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.settings.put({ id: 'singleton', json: '{"theme":"DARK"}', updatedAt: NOW });
    assert.equal((await repos.settings.get())?.json, '{"theme":"DARK"}');

    await repos.kv.set('device.identity', '{"deviceId":"d1"}');
    assert.equal((await repos.kv.get('device.identity'))?.valueJson, '{"deviceId":"d1"}');
    closeDb(db);
  });

  it('记账分类按 order 排序', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.finance.putCategory({ id: 'c2', name: '交通', icon: 'bus', type: 'EXPENSE', isBuiltin: true, order: 2 });
    await repos.finance.putCategory({ id: 'c1', name: '餐饮', icon: 'food', type: 'EXPENSE', isBuiltin: true, order: 1 });
    const cats = await repos.finance.categories();
    assert.deepEqual(cats.map((c) => c.id), ['c1', 'c2']);
    closeDb(db);
  });

  it('健身打卡写入与读取', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.fitness.putCheckin({ id: 'k1', dayKey: '2026-02-14', checkedAt: NOW, streakAtTime: 3 });
    assert.equal((await repos.fitness.checkins()).length, 1);
    closeDb(db);
  });

  it('clearAll 清业务表但**保留 kv**（设备身份不能丢，见 ADR-010）', async () => {
    const db = await freshDb();
    const repos = createDexieRepositories(db);
    await repos.tasks.put(task('t1'));
    await repos.sessions.put(session('s1'));
    await repos.coinLedger.put(coin('c1', 10));
    await repos.kv.set('device.identity', '{"deviceId":"d1"}');
    await repos.kv.set('data.lastExportAt', String(NOW));

    await repos.clearAll();

    assert.equal(await repos.tasks.count(), 0);
    assert.equal(await repos.sessions.count(), 0);
    assert.equal(await repos.coinLedger.count(), 0);
    assert.ok(await repos.kv.get('device.identity'), '设备身份必须保留');
    assert.ok(await repos.kv.get('data.lastExportAt'), '导出时间应保留');
    closeDb(db);
  });
});

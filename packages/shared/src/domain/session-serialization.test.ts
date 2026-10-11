/**
 * 会话序列化单测。
 *
 * 这层的风险不是"能不能存"，而是**损坏数据能不能被拒绝**：
 * 若把半截损坏状态当有效会话恢复，界面会显示错误的剩余时间，
 * 比丢一次会话糟得多。因此测试重点在"必须拒绝什么"。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { packRunner, unpackRunner, parseSkipReason } from './session-serialization.ts';
import { startRunner, settleSession, noteLeave, noteReturn } from './session-runner.ts';
import { countedViolations, totalViolationMs } from './session-engine.ts';
import { PENALTY } from '../config/index.ts';

const MIN = 60_000;
const WALL = new Date(2026, 1, 14, 10, 0, 0, 0).getTime();
const KEYS = { daily: '2026-02-14', monthly: '2026-02' } as const;

function runner(plannedMs = 45 * MIN) {
  return startRunner({
    kind: 'FOCUS',
    plannedMs,
    title: '写报告',
    taskId: 't1',
    nowMonotonic: WALL,
    nowWall: WALL,
    plannedStartAt: WALL,
  });
}

describe('packRunner → unpackRunner：往返一致', () => {
  it('基本字段完整保留', () => {
    const original = runner();
    const restored = unpackRunner(packRunner(original));
    assert.ok(restored);
    assert.equal(restored.title, '写报告');
    assert.equal(restored.taskId, 't1');
    assert.equal(restored.punctual, true);
    assert.equal(restored.session.kind, 'FOCUS');
    assert.equal(restored.session.status, 'RUNNING');
    assert.equal(restored.session.plannedMs, 45 * MIN);
    assert.equal(restored.session.startedAtMonotonic, WALL);
    assert.equal(restored.session.startedAtWall, WALL);
    assert.deepEqual(restored.session.pausedIntervals, []);
    assert.deepEqual(restored.session.violations, []);
  });

  it('自由专注（无待办）不写入 taskId 字段', () => {
    const original = startRunner({
      kind: 'LOCK',
      plannedMs: 60 * MIN,
      title: '锁机',
      nowMonotonic: WALL,
      nowWall: WALL,
    });
    const packed = packRunner(original);
    assert.equal('taskId' in packed, false, '缺省字段不应被写成 undefined');
    const restored = unpackRunner(packed);
    assert.ok(restored);
    assert.equal(restored.taskId, undefined);
  });

  it('未闭合的暂停区间与违规候选都能往返', () => {
    let s = runner();
    s = noteLeave(s, WALL, WALL, 'VISIBILITY');
    s = noteReturn(s, WALL + 60_000, WALL + 60_000).state; // 60 秒 → 计违规
    s = noteLeave(s, WALL + 120_000, WALL + 120_000, 'NATIVE', 'wechat.exe');

    const restored = unpackRunner(packRunner(s));
    assert.ok(restored);

    // 设计说明：开启违规时会先写入一条 durationMs=0 的**候选**记录
    // （保留"何时开始离开"这个事实），闭合时若未达阈值再撤回。
    // 因此这里数组有 2 条：1 条已计数 + 1 条未闭合候选。
    assert.equal(restored.session.violations.length, 2);
    const counted = countedViolations(restored.session.violations);
    assert.equal(counted.length, 1, '只有 1 条达到阈值被计数');
    assert.equal(counted[0]?.durationMs, 60_000);
    assert.equal(counted[0]?.source, 'VISIBILITY');
    assert.equal(counted[0]?.endedAt, WALL + 60_000);

    const open = restored.session.violations.find((v) => v.endedAt === undefined);
    assert.ok(open, '未闭合候选应被保留');
    assert.equal(open.durationMs, 0);
    assert.equal(open.detail, 'wechat.exe');
    assert.equal(open.source, 'NATIVE');

    // 暂停区间：1 条已闭合 + 1 条未闭合
    assert.equal(restored.session.pausedIntervals.length, 2);
    assert.equal(restored.session.pausedIntervals[1]?.to, undefined);

    assert.equal(totalViolationMs(restored.session.violations), 60_000, '未闭合候选对总时长无贡献');
  });

  it('已结算状态连同 settlement 一起往返', () => {
    const ctx = {
      nowMonotonic: WALL + 45 * MIN,
      nowWall: WALL + 45 * MIN,
      quotaLedger: [],
      dailyEarnedCoin: 0,
      coinBalance: 500,
      skipsUsedToday: 0,
      priorLockSessionsToday: 0,
      periodKeys: KEYS,
    };
    const settled = settleSession({ state: runner(), exitKind: 'BREACH', ctx }).state;
    const restored = unpackRunner(packRunner(settled));
    assert.ok(restored);
    assert.equal(restored.session.status, 'SETTLED');
    assert.equal(restored.session.endedAt, WALL + 45 * MIN);
    assert.ok(restored.settlement);
    assert.equal(restored.settlement.reward.total, 0, '越界收益为 0');
    assert.equal(restored.settlement.breachDeduction, PENALTY.breachCoin);
    assert.equal(restored.settlement.exitKind, 'BREACH');
  });

  it('序列化结果可被 JSON 往返（实际存 KV 时会发生）', () => {
    const restored = unpackRunner(JSON.parse(JSON.stringify(packRunner(runner()))));
    assert.ok(restored);
    assert.equal(restored.title, '写报告');
  });
});

describe('unpackRunner：必须拒绝损坏数据', () => {
  const good = (): Record<string, unknown> => JSON.parse(JSON.stringify(packRunner(runner()))) as Record<string, unknown>;

  it('拒绝非对象', () => {
    for (const bad of [null, undefined, 'str', 42, []]) {
      assert.equal(unpackRunner(bad), undefined);
    }
  });

  it('拒绝缺少 session', () => {
    assert.equal(unpackRunner({ title: 'x', punctual: true }), undefined);
  });

  it('拒绝非法的会话类型', () => {
    const v = good();
    (v.session as Record<string, unknown>).kind = 'SLEEP';
    assert.equal(unpackRunner(v), undefined);
  });

  it('拒绝非法的状态（防止状态机被外部数据污染）', () => {
    const v = good();
    (v.session as Record<string, unknown>).status = 'DONE';
    assert.equal(unpackRunner(v), undefined);
  });

  it('拒绝非法的时间戳与计划时长', () => {
    for (const field of ['plannedMs', 'startedAtMonotonic', 'startedAtWall']) {
      const v = good();
      (v.session as Record<string, unknown>)[field] = 'not-a-number';
      assert.equal(unpackRunner(v), undefined, `${field} 非法时应拒绝`);
    }
    const zero = good();
    (zero.session as Record<string, unknown>).plannedMs = 0;
    assert.equal(unpackRunner(zero), undefined, '计划时长为 0 的会话无意义');
    const negative = good();
    (negative.session as Record<string, unknown>).plannedMs = -1;
    assert.equal(unpackRunner(negative), undefined);
  });

  it('拒绝缺失或类型错误的 title / punctual', () => {
    const a = good();
    delete a.title;
    assert.equal(unpackRunner(a), undefined);
    const b = good();
    b.punctual = 'yes';
    assert.equal(unpackRunner(b), undefined);
  });

  it('拒绝非法来源的违规记录', () => {
    const v = good();
    (v.session as Record<string, unknown>).violations = [
      { startedAt: WALL, durationMs: 1000, source: 'MAGIC' },
    ];
    assert.equal(unpackRunner(v), undefined);
  });

  it('拒绝结构错误的暂停区间', () => {
    const v = good();
    (v.session as Record<string, unknown>).pausedIntervals = [{ from: 'x' }];
    assert.equal(unpackRunner(v), undefined);
    const w = good();
    (w.session as Record<string, unknown>).pausedIntervals = 'nope';
    assert.equal(unpackRunner(w), undefined);
  });

  it('settlement 损坏时丢弃它但保留会话（会话本身仍可用）', () => {
    const v = good();
    v.settlement = { effectiveMs: 'bad' };
    const restored = unpackRunner(v);
    assert.ok(restored, '会话本体有效就应恢复');
    assert.equal(restored.settlement, undefined, '损坏的结算结果应被丢弃');
  });

  it('空的 taskId 视为无关联（不产生空字符串脏数据）', () => {
    const v = good();
    v.taskId = '';
    const restored = unpackRunner(v);
    assert.ok(restored);
    assert.equal(restored.taskId, undefined);
  });

  it('NaN 与 Infinity 被视为非法', () => {
    const v = good();
    (v.session as Record<string, unknown>).plannedMs = Number.NaN;
    assert.equal(unpackRunner(v), undefined);
    const w = good();
    (w.session as Record<string, unknown>).startedAtWall = Number.POSITIVE_INFINITY;
    assert.equal(unpackRunner(w), undefined);
  });
});

describe('parseSkipReason', () => {
  it('接受合法原因', () => {
    assert.equal(parseSkipReason('MEETING'), 'MEETING');
    assert.equal(parseSkipReason('ILLNESS'), 'ILLNESS');
  });

  it('拒绝非法值与空值', () => {
    assert.equal(parseSkipReason('WHATEVER'), undefined);
    assert.equal(parseSkipReason(undefined), undefined);
    assert.equal(parseSkipReason(42), undefined);
  });
});

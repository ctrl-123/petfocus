/**
 * 多标签页选主单测（E19：防止两个标签页重复计时与重复入账）。
 * 重点是**确定性**：两个实例在相同信息下必须得出同一个主，不能僵持。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEADER_POLICY,
  campaign,
  canAct,
  createLeaderState,
  evaluateLeadership,
  isLeader,
  makeHeartbeat,
  onHeartbeat,
} from './leader-election.ts';

const T0 = 1_770_000_000_000;

describe('初始状态与竞选', () => {
  it('初始无主，自己不是主', () => {
    const s = createLeaderState('A', T0);
    assert.equal(s.leaderId, undefined);
    assert.equal(isLeader(s), false);
    assert.equal(canAct(s), false);
  });

  it('campaign 后自己成为主，term 自增', () => {
    const s = campaign(createLeaderState('A', T0), T0);
    assert.equal(s.leaderId, 'A');
    assert.equal(isLeader(s), true);
    assert.equal(canAct(s), true);
    assert.equal(s.term, 1);
  });

  it('重复竞选 term 持续自增', () => {
    let s = createLeaderState('A', T0);
    s = campaign(s, T0);
    s = campaign(s, T0 + 1);
    assert.equal(s.term, 2);
  });
});

describe('心跳合并：term 大者优先，同 term 按实例 ID 字典序决定', () => {
  it('收到更高 term 的心跳 → 承认对主', () => {
    const s = campaign(createLeaderState('A', T0), T0); // A 为主，term 1
    const next = onHeartbeat(s, { instanceId: 'B', term: 2, at: T0 + 1 }, T0 + 1);
    assert.equal(next.leaderId, 'B');
    assert.equal(next.term, 2);
  });

  it('收到更低 term 的心跳 → 保持自己为主', () => {
    let s = campaign(createLeaderState('A', T0), T0);
    s = { ...s, term: 5 };
    const next = onHeartbeat(s, { instanceId: 'B', term: 2, at: T0 + 1 }, T0 + 1);
    assert.equal(next.leaderId, 'A');
  });

  it('term 相同时按实例 ID 字典序决定（双方结论一致，不僵持）', () => {
    // A 先自认主（term 1）
    const a = campaign(createLeaderState('A', T0), T0);
    // B 也自认主（term 1）
    const b = campaign(createLeaderState('B', T0), T0);

    // A 收到 B 的心跳：'B' > 'A' → A 让位给 B
    const aAfter = onHeartbeat(a, { instanceId: 'B', term: 1, at: T0 + 1 }, T0 + 1);
    // B 收到 A 的心跳：'A' < 'B' → B 保持为主
    const bAfter = onHeartbeat(b, { instanceId: 'A', term: 1, at: T0 + 1 }, T0 + 1);

    assert.equal(aAfter.leaderId, 'B');
    assert.equal(bAfter.leaderId, 'B');
    assert.equal(aAfter.leaderId, bAfter.leaderId, '双方必须收敛到同一个主');
  });

  it('无主时收到任何心跳都接受对方为主', () => {
    const s = createLeaderState('A', T0);
    const next = onHeartbeat(s, { instanceId: 'B', term: 0, at: T0 }, T0);
    assert.equal(next.leaderId, 'B');
  });

  it('忽略自己的心跳', () => {
    const s = campaign(createLeaderState('A', T0), T0);
    assert.equal(onHeartbeat(s, { instanceId: 'A', term: 9, at: T0 + 1 }, T0 + 1), s);
  });

  it('主收到自己的心跳会被忽略（自己不需要为自己刷新心跳时间）', () => {
    const s = campaign(createLeaderState('A', T0), T0);
    const next = onHeartbeat(s, { instanceId: 'A', term: 1, at: T0 + 1 }, T0 + 1);
    assert.equal(next, s, '应原样返回同一对象');
    assert.equal(next.lastLeaderHeartbeatAt, T0, '时间戳不变；只有对主的心跳才刷新它');
  });
});

describe('evaluateLeadership：主失联检测', () => {
  it('心跳未超时 → 保持不变', () => {
    const s = campaign(createLeaderState('A', T0), T0);
    const next = evaluateLeadership(s, T0 + LEADER_POLICY.leaderTimeoutMs);
    assert.equal(next.leaderId, 'A');
  });

  it('心跳超时 → 清空主，允许重新竞选', () => {
    const s = campaign(createLeaderState('A', T0), T0);
    const next = evaluateLeadership(s, T0 + LEADER_POLICY.leaderTimeoutMs + 1);
    assert.equal(next.leaderId, undefined);
    assert.equal(canAct(next), false);
  });

  it('主崩溃后另一实例可接管', () => {
    // A 是主，B 是跟随者
    let b = createLeaderState('B', T0);
    b = onHeartbeat(b, { instanceId: 'A', term: 1, at: T0 }, T0);
    assert.equal(b.leaderId, 'A');
    assert.equal(canAct(b), false);

    // A 崩溃：B 在超时后清空主并竞选
    let after = evaluateLeadership(b, T0 + LEADER_POLICY.leaderTimeoutMs + 1);
    assert.equal(after.leaderId, undefined);
    after = campaign(after, T0 + LEADER_POLICY.leaderTimeoutMs + 2);
    assert.equal(after.leaderId, 'B');
    assert.equal(canAct(after), true);
  });

  it('无主状态下 evaluate 不改变任何东西', () => {
    const s = createLeaderState('A', T0);
    assert.deepEqual(evaluateLeadership(s, T0 + 10 * LEADER_POLICY.leaderTimeoutMs), s);
  });
});

describe('makeHeartbeat', () => {
  it('广播自己的实例 ID、term 与时间', () => {
    const s = campaign(createLeaderState('A', T0), T0);
    const hb = makeHeartbeat(s, T0 + 5);
    assert.equal(hb.instanceId, 'A');
    assert.equal(hb.term, 1);
    assert.equal(hb.at, T0 + 5);
    assert.equal(hb.believesLeaderId, 'A');
  });

  it('无主时不带 believesLeaderId', () => {
    const hb = makeHeartbeat(createLeaderState('A', T0), T0);
    assert.equal(hb.believesLeaderId, undefined);
  });
});

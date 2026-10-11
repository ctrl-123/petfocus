/**
 * 会话引擎单测 —— 覆盖技术设计 5.1 节与不变量 INV-1 ~ INV-7。
 * 重点验证：计时靠单调时钟、违规阈值语义、时钟偏差检测、崩溃恢复。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  closeViolation,
  computeTick,
  createSession,
  formatRemaining,
  isViolationCounted,
  openPauseFrom,
  openViolation,
  pausedMsOf,
  reconstructSession,
  totalViolationMs,
  violationRatio,
  type SessionState,
} from './session-engine.ts';
import { VIOLATION_THRESHOLD_MS } from '../config/index.ts';
import { createFakeClock } from '../test/fake-clock.ts';

const MIN = 60_000;
const SEC = 1_000;

function makeSession(plannedMs: number, clock = createFakeClock()): { session: SessionState; clock: ReturnType<typeof createFakeClock> } {
  const session = createSession({
    kind: 'FOCUS',
    plannedMs,
    nowMonotonic: clock.monotonic(),
    nowWall: clock.wall(),
  });
  return { session, clock };
}

describe('computeTick：有效时长推导（ADR-003 的核心）', () => {
  it('刚创建时全部归零', () => {
    const { session, clock } = makeSession(25 * MIN);
    const t = computeTick({ session, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.effectiveMs, 0);
    assert.equal(t.pausedMs, 0);
    assert.equal(t.remainingMs, 25 * MIN);
    assert.equal(t.progress, 0);
    assert.equal(t.shouldSettle, false);
  });

  it('时间自然流逝后有效时长同步增长', () => {
    const { session, clock } = makeSession(25 * MIN);
    clock.advance(10 * MIN);
    const t = computeTick({ session, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.effectiveMs, 10 * MIN);
    assert.equal(t.remainingMs, 15 * MIN);
    assert.equal(t.progress, 0.4);
  });

  it('有效时长不超过计划时长（INV-2），超时后 remaining 为 0 且应结算', () => {
    const { session, clock } = makeSession(25 * MIN);
    clock.advance(40 * MIN);
    const t = computeTick({ session, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.effectiveMs, 25 * MIN);
    assert.equal(t.remainingMs, 0);
    assert.equal(t.shouldSettle, true);
    assert.equal(t.progress, 1);
    assert.equal(t.elapsedTotalMs, 40 * MIN); // 原始流逝如实记录
  });

  it('已闭合的暂停区间从有效时长中扣除', () => {
    const { session: base, clock } = makeSession(30 * MIN);
    const paused: SessionState = {
      ...base,
      pausedIntervals: [{ from: clock.monotonic(), to: clock.monotonic() + 5 * MIN }],
    };
    clock.advance(20 * MIN);
    const t = computeTick({ session: paused, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.pausedMs, 5 * MIN);
    assert.equal(t.effectiveMs, 15 * MIN); // 20 − 5
    assert.equal(t.isPaused, false);
  });

  it('未闭合的暂停区间持续累加，并标记 isPaused', () => {
    const { session: base, clock } = makeSession(30 * MIN);
    clock.advance(10 * MIN);
    const paused: SessionState = { ...base, pausedIntervals: [{ from: clock.monotonic() }] };
    clock.advance(5 * MIN);
    const t = computeTick({ session: paused, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.isPaused, true);
    assert.equal(t.pausedMs, 5 * MIN);
    assert.equal(t.effectiveMs, 10 * MIN); // 暂停期间不再增长
  });

  it('暂停期间的时钟前进不会增加有效时长（反复 tick 幂等）', () => {
    const { session: base, clock } = makeSession(30 * MIN);
    const paused: SessionState = { ...base, pausedIntervals: [{ from: clock.monotonic() }] };
    clock.advance(7 * MIN);
    const a = computeTick({ session: paused, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    const b = computeTick({ session: paused, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(a.effectiveMs, b.effectiveMs);
    assert.equal(a.effectiveMs, 0);
  });
});

describe('时钟偏差检测 [技术设计 E4]', () => {
  it('正常流逝时偏差接近 0，不触发告警', () => {
    const { session, clock } = makeSession(30 * MIN);
    clock.advance(10 * MIN);
    const t = computeTick({ session, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.clockSkewMs, 0);
    assert.equal(t.clockAltered, false);
  });

  it('用户把系统时间往前拨 1 小时 → 检出偏差并告警', () => {
    const { session, clock } = makeSession(30 * MIN);
    clock.advanceWallOnly(60 * MIN);
    const t = computeTick({ session, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.clockSkewMs, 60 * MIN);
    assert.equal(t.clockAltered, true);
    // 关键：计时不受影响（单调时钟未动）
    assert.equal(t.effectiveMs, 0);
  });

  it('偏差在容差内不告警（拖动前后小幅漂移）', () => {
    const { session, clock } = makeSession(30 * MIN);
    clock.advanceWallOnly(30 * SEC);
    const t = computeTick({ session, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.clockAltered, false);
  });
});

describe('违规区间：开启与闭合的阈值语义 [PRD AC-1.4.1 ③]', () => {
  it('切走不足 30 秒 → 不算违规，区间与记录都被撤回', () => {
    const { session, clock } = makeSession(30 * MIN);
    const opened = openViolation(session, clock.monotonic(), clock.wall(), 'VISIBILITY');
    assert.equal(opened.pausedIntervals.length, 1);
    assert.equal(opened.violations.length, 1);

    clock.advance(20 * SEC); // 不足阈值
    const { session: closed, counted, durationMs } = closeViolation(opened, clock.monotonic(), clock.wall());
    assert.equal(counted, false);
    assert.equal(durationMs, 20 * SEC);
    assert.equal(closed.pausedIntervals.length, 0, '应撤回暂停区间');
    assert.equal(closed.violations.length, 0, '应撤回违规记录');
    assert.equal(closed.status, 'RUNNING');
  });

  it('切走满 30 秒 → 计为违规并转为 PAUSED', () => {
    const { session, clock } = makeSession(30 * MIN);
    const opened = openViolation(session, clock.monotonic(), clock.wall(), 'BLUR');
    clock.advance(VIOLATION_THRESHOLD_MS);
    const { session: closed, counted } = closeViolation(opened, clock.monotonic(), clock.wall());
    assert.equal(counted, true);
    assert.equal(closed.pausedIntervals.length, 1);
    assert.equal(closed.pausedIntervals[0]?.to, clock.monotonic());
    assert.equal(closed.violations.length, 1);
    assert.equal(closed.violations[0]?.durationMs, VIOLATION_THRESHOLD_MS);
    assert.equal(closed.violations[0]?.endedAt, clock.wall());
    assert.equal(closed.status, 'PAUSED');
  });

  it('已暂停时重复的开启事件被忽略（不产生嵌套区间）', () => {
    const { session, clock } = makeSession(30 * MIN);
    const once = openViolation(session, clock.monotonic(), clock.wall(), 'VISIBILITY');
    clock.advance(5 * SEC);
    const twice = openViolation(once, clock.monotonic(), clock.wall(), 'BLUR');
    assert.equal(twice.pausedIntervals.length, 1);
    assert.equal(twice.violations.length, 1);
    assert.equal(twice, once, '应原样返回同一对象');
  });

  it('没有未闭合区间时闭合操作是空操作', () => {
    const { session, clock } = makeSession(30 * MIN);
    const r = closeViolation(session, clock.monotonic(), clock.wall());
    assert.equal(r.counted, false);
    assert.equal(r.session, session);
  });

  it('多次违规累计，总时长与占比正确', () => {
    const { session, clock } = makeSession(60 * MIN);
    let s = session;
    // 第一次：40 秒（计入）
    s = openViolation(s, clock.monotonic(), clock.wall(), 'VISIBILITY');
    clock.advance(40 * SEC);
    s = closeViolation(s, clock.monotonic(), clock.wall()).session;
    // 恢复运行
    s = { ...s, status: 'RUNNING' };
    // 第二次：10 秒（不计入）
    s = openViolation(s, clock.monotonic(), clock.wall(), 'BLUR');
    clock.advance(10 * SEC);
    s = closeViolation(s, clock.monotonic(), clock.wall()).session;

    assert.equal(s.violations.length, 1);
    assert.equal(totalViolationMs(s.violations), 40 * SEC);
    // 有效时长 = 50s（50s 运行） − 40s（暂停）= 10s
    const t = computeTick({ session: s, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.effectiveMs, 10 * SEC);
    assert.equal(violationRatio(t.effectiveMs, s.violations), 0.8);
  });

  it('原生模式可携带被拦截的进程名', () => {
    const { session, clock } = makeSession(30 * MIN);
    const s = openViolation(session, clock.monotonic(), clock.wall(), 'NATIVE', 'wechat.exe');
    assert.equal(s.violations[0]?.detail, 'wechat.exe');
    assert.equal(s.violations[0]?.source, 'NATIVE');
  });
});

describe('openPauseFrom / pausedMsOf 辅助函数', () => {
  it('无区间时返回 undefined 与 0', () => {
    assert.equal(openPauseFrom([]), undefined);
    assert.equal(pausedMsOf([], 1000), 0);
  });

  it('取最后一个未闭合区间；闭合区间被忽略', () => {
    assert.equal(openPauseFrom([{ from: 10, to: 20 }, { from: 30 }]), 30);
    assert.equal(openPauseFrom([{ from: 10, to: 20 }]), undefined);
  });

  it('未闭合区间按传入的当前单调时钟收口', () => {
    assert.equal(pausedMsOf([{ from: 100 }], 400), 300);
    assert.equal(pausedMsOf([{ from: 100, to: 250 }, { from: 300 }], 500), 350);
  });
});

describe('reconstructSession：冷启动恢复 [E2 / E3]', () => {
  it('无存储状态 → NONE', () => {
    assert.equal(reconstructSession(undefined, 1000, 1000).action, 'NONE');
  });

  it('已结算/已放弃的会话不再处理', () => {
    const { session } = makeSession(25 * MIN);
    assert.equal(reconstructSession({ ...session, status: 'SETTLED' }, 2000, 2000).action, 'NONE');
    assert.equal(reconstructSession({ ...session, status: 'ABANDONED' }, 2000, 2000).action, 'NONE');
  });

  it('未超时 → 恢复为 RUNNING', () => {
    const { session, clock } = makeSession(25 * MIN);
    clock.advance(5 * MIN);
    const r = reconstructSession(session, clock.monotonic(), clock.wall());
    assert.equal(r.action, 'RESUME_RUNNING');
    assert.equal(r.session?.status, 'RUNNING');
  });

  it('已超时 → 进入 AWAITING_SETTLEMENT（不自动发币）', () => {
    const { session, clock } = makeSession(25 * MIN);
    clock.advance(26 * MIN);
    const r = reconstructSession(session, clock.monotonic(), clock.wall());
    assert.equal(r.action, 'AUTO_SETTLE');
    assert.equal(r.session?.status, 'AWAITING_SETTLEMENT');
    assert.ok(r.message);
  });

  it('页面关闭期间留下未闭合区间 → 收口到计划结束时刻，不超过它', () => {
    const { session: base, clock } = makeSession(25 * MIN);
    clock.advance(5 * MIN);
    const hanging: SessionState = { ...base, pausedIntervals: [{ from: clock.monotonic() }] };
    clock.advance(60 * MIN); // 关闭了很久
    const r = reconstructSession(hanging, clock.monotonic(), clock.wall());
    const closed = r.session?.pausedIntervals[0];
    assert.ok(closed?.to !== undefined, '未闭合区间必须被收口');
    // 收口点不超过 startedAtMonotonic + plannedMs
    assert.equal(closed?.to, base.startedAtMonotonic + base.plannedMs);
    assert.equal(r.action, 'AUTO_SETTLE');
  });

  it('检测到系统时间被改动 → PROMPT_ABANDONED 并提示', () => {
    const { session, clock } = makeSession(25 * MIN);
    clock.advanceWallOnly(2 * 60 * MIN);
    const r = reconstructSession(session, clock.monotonic(), clock.wall());
    assert.equal(r.action, 'PROMPT_ABANDONED');
    assert.equal(r.session?.status, 'PAUSED');
    assert.match(r.message ?? '', /系统时间/);
  });

  it('休眠场景：单调时钟前进、墙钟同步前进 → 正常恢复（E3）', () => {
    const { session, clock } = makeSession(25 * MIN);
    clock.advance(8 * MIN); // 两种时钟一起走，等同真实休眠后的表现
    const r = reconstructSession(session, clock.monotonic(), clock.wall());
    assert.equal(r.action, 'RESUME_RUNNING');
    const t = computeTick({ session: r.session!, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(t.effectiveMs, 8 * MIN);
  });
});

describe('createSession：构造与校验', () => {
  it('默认状态为 RUNNING，可指定 SCHEDULED（宽限期）', () => {
    const clock = createFakeClock();
    const s1 = createSession({ kind: 'FOCUS', plannedMs: MIN, nowMonotonic: clock.monotonic(), nowWall: clock.wall() });
    assert.equal(s1.status, 'RUNNING');
    const s2 = createSession({
      kind: 'LOCK',
      plannedMs: MIN,
      nowMonotonic: clock.monotonic(),
      nowWall: clock.wall(),
      status: 'SCHEDULED',
    });
    assert.equal(s2.status, 'SCHEDULED');
    assert.equal(s2.kind, 'LOCK');
  });

  it('计划时长必须为正（INV 保护）', () => {
    const clock = createFakeClock();
    assert.throws(() => createSession({ kind: 'FOCUS', plannedMs: 0, nowMonotonic: 0, nowWall: 0 }), /必须为正数/);
    assert.throws(() => createSession({ kind: 'FOCUS', plannedMs: -1, nowMonotonic: 0, nowWall: 0 }), /必须为正数/);
    void clock;
  });
});

describe('isViolationCounted / formatRemaining', () => {
  it('阈值边界：恰好 30 秒计入，29.999 秒不计', () => {
    assert.equal(isViolationCounted(VIOLATION_THRESHOLD_MS), true);
    assert.equal(isViolationCounted(VIOLATION_THRESHOLD_MS - 1), false);
  });

  it('剩余时间格式化补零，负数按 00:00', () => {
    assert.equal(formatRemaining(0), '00:00');
    assert.equal(formatRemaining(59 * SEC), '00:59');
    assert.equal(formatRemaining(25 * MIN), '25:00');
    assert.equal(formatRemaining(25 * MIN + 30 * SEC), '25:30');
    assert.equal(formatRemaining(-5000), '00:00');
    // 向上取整：剩 1ms 也显示 00:01，避免明明没结束却显示 00:00
    assert.equal(formatRemaining(1), '00:01');
  });
});

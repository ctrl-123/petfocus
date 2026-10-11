/**
 * 会话运行器单测。
 *
 * 覆盖 M4 的核心业务规则：
 * - 状态流转（SCHEDULED → RUNNING ⇄ PAUSED → SETTLED）
 * - 退出决策三档：配额内无损 / 本次跳过 / 越界重罚
 * - 结算：收益计算、罚款不为负、日上限
 * - 冷启动恢复
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  beginRunning,
  describeExitOptions,
  describeProgress,
  isTerminal,
  noteLeave,
  noteReturn,
  planExit,
  recoverRunner,
  resumeRunning,
  settleSession,
  shouldAutoSettle,
  startRunner,
  type RunnerContext,
  type RunnerState,
} from './session-runner.ts';
import { grantEntries } from './quota.ts';
import { PENALTY, QUOTA, VIOLATION_THRESHOLD_MS } from '../config/index.ts';
import type { QuotaEntry } from '../types.ts';

const MIN = 60_000;
const SEC = 1_000;
const NOW_WALL = new Date(2026, 1, 14, 10, 0, 0, 0).getTime();
const NOW_MONO = NOW_WALL;
const KEYS = { daily: '2026-02-14', monthly: '2026-02' } as const;

/** 足额发放的配额账本（专注每日 1 + 每月 5 + 锁机每月 5） */
function fullLedger(): QuotaEntry[] {
  return grantEntries(['FOCUS_DAILY', 'FOCUS_MONTHLY', 'LOCK_MONTHLY'], KEYS);
}

function context(overrides: Partial<RunnerContext> = {}): RunnerContext {
  return {
    nowMonotonic: NOW_MONO,
    nowWall: NOW_WALL,
    quotaLedger: fullLedger(),
    dailyEarnedCoin: 0,
    coinBalance: 500,
    skipsUsedToday: 0,
    priorLockSessionsToday: 0,
    periodKeys: KEYS,
    ...overrides,
  };
}

/**
 * 构造运行器。
 *
 * 注意 `exactOptionalPropertyTypes` 下「显式传 undefined」与「缺省该字段」不等价，
 * 因此这里用条件展开来**省略**字段，而不是传 undefined。
 */
type RunnerOverrides = Partial<Omit<Parameters<typeof startRunner>[0], 'taskId' | 'plannedStartAt'>> & {
  /** 传 null 表示「明确不关联待办」（自由专注） */
  taskId?: string | null;
  /** 传 null 表示「明确不提供计划时间」 */
  plannedStartAt?: number | null;
};

function runner(overrides: RunnerOverrides = {}): RunnerState {
  const { taskId, plannedStartAt, ...rest } = overrides;
  const input: Parameters<typeof startRunner>[0] = {
    kind: 'FOCUS',
    plannedMs: 45 * MIN,
    title: '写报告',
    nowMonotonic: NOW_MONO,
    nowWall: NOW_WALL,
    ...rest,
  };
  if (taskId !== null) input.taskId = taskId ?? 't1';
  if (plannedStartAt !== null) input.plannedStartAt = plannedStartAt ?? NOW_WALL;
  return startRunner(input);
}

describe('startRunner：创建与准时判定', () => {
  it('默认直接 RUNNING，并判定准时', () => {
    const r = runner();
    assert.equal(r.session.status, 'RUNNING');
    assert.equal(r.punctual, true);
    assert.equal(r.taskId, 't1');
  });

  it('到点自动进入时以 SCHEDULED 开始（走宽限期）', () => {
    const r = runner({ startAsScheduled: true });
    assert.equal(r.session.status, 'SCHEDULED');
  });

  it('偏离计划时间超过 ±2 分钟则不算准时', () => {
    assert.equal(runner({ plannedStartAt: NOW_WALL + 2 * MIN }).punctual, true);
    assert.equal(runner({ plannedStartAt: NOW_WALL + 2 * MIN + 1 }).punctual, false);
    assert.equal(runner({ plannedStartAt: NOW_WALL - 3 * MIN }).punctual, false);
  });

  it('未提供计划时间时不算准时（不虚报加成）', () => {
    assert.equal(runner({ plannedStartAt: null }).punctual, false);
  });

  it('自由专注（无关联待办）', () => {
    const r = runner({ taskId: null });
    assert.equal(r.taskId, undefined);
  });
});

describe('状态流转', () => {
  it('SCHEDULED → RUNNING', () => {
    const r = beginRunning(runner({ startAsScheduled: true }));
    assert.equal(r.session.status, 'RUNNING');
  });

  it('非 SCHEDULED 时 beginRunning 是空操作', () => {
    const r = runner();
    assert.equal(beginRunning(r), r);
  });

  it('切走不足阈值：不计违规，状态仍为 RUNNING', () => {
    let r = runner();
    r = noteLeave(r, NOW_MONO, NOW_WALL, 'VISIBILITY');
    const ret = noteReturn(r, NOW_MONO + 20 * SEC, NOW_WALL + 20 * SEC);
    assert.equal(ret.counted, false);
    assert.equal(ret.state.session.violations.length, 0);
    assert.equal(ret.state.session.status, 'RUNNING');
  });

  it('切走超过阈值：计违规并转 PAUSED', () => {
    let r = runner();
    r = noteLeave(r, NOW_MONO, NOW_WALL, 'BLUR');
    const ret = noteReturn(r, NOW_MONO + VIOLATION_THRESHOLD_MS, NOW_WALL + VIOLATION_THRESHOLD_MS);
    assert.equal(ret.counted, true);
    assert.equal(ret.state.session.violations.length, 1);
    assert.equal(ret.state.session.status, 'PAUSED');
  });

  it('resumeRunning：PAUSED → RUNNING', () => {
    let r = runner();
    r = noteLeave(r, NOW_MONO, NOW_WALL, 'BLUR');
    r = noteReturn(r, NOW_MONO + 60 * SEC, NOW_WALL + 60 * SEC).state;
    const resumed = resumeRunning(r);
    assert.equal(resumed.session.status, 'RUNNING');
  });

  it('原生模式可带被拦截进程名', () => {
    const r = noteLeave(runner(), NOW_MONO, NOW_WALL, 'NATIVE', 'wechat.exe');
    assert.equal(r.session.violations[0]?.detail, 'wechat.exe');
  });

  it('isTerminal 判定', () => {
    assert.equal(isTerminal(runner()), false);
    const { state } = settleSession({ state: runner(), exitKind: 'NATURAL', ctx: context() });
    assert.equal(isTerminal(state), true);
  });

  it('shouldAutoSettle：时间到才为 true', () => {
    const r = runner({ plannedMs: 25 * MIN });
    assert.equal(shouldAutoSettle(r, NOW_MONO + 24 * MIN, NOW_WALL + 24 * MIN), false);
    assert.equal(shouldAutoSettle(r, NOW_MONO + 25 * MIN, NOW_WALL + 25 * MIN), true);
  });

  it('已结算的会话不再自动结算', () => {
    const { state } = settleSession({ state: runner({ plannedMs: MIN }), exitKind: 'NATURAL', ctx: context() });
    assert.equal(shouldAutoSettle(state, NOW_MONO + 10 * MIN, NOW_WALL + 10 * MIN), false);
  });
});

describe('planExit：退出决策三档 [AC-1.4.5 / AC-1.4.6 / AC-1.4.7]', () => {
  it('自然结束不消耗配额', () => {
    const plan = planExit(runner(), { kind: 'NATURAL' }, context());
    assert.equal(plan.exitKind, 'NATURAL');
    assert.equal(plan.decision.type, 'QUOTA');
  });

  it('提前退出：优先扣每日额度', () => {
    const plan = planExit(runner(), { kind: 'EARLY' }, context());
    assert.equal(plan.exitKind, 'QUOTA_DAILY');
    if (plan.decision.type === 'QUOTA') {
      assert.equal(plan.decision.pool, 'DAILY');
      assert.equal(plan.decision.entries.length, 1);
      assert.equal(plan.decision.remaining.daily, 0);
    }
  });

  it('每日用尽后扣月度额度', () => {
    const ledger = [...fullLedger(), { scope: 'FOCUS_DAILY' as const, kind: 'CONSUME' as const, periodKey: KEYS.daily }];
    const plan = planExit(runner(), { kind: 'EARLY' }, context({ quotaLedger: ledger }));
    assert.equal(plan.exitKind, 'QUOTA_MONTHLY');
  });

  it('配额全用尽 → BREACH，并给出罚款与蔫时长', () => {
    const consumed: QuotaEntry[] = [
      ...fullLedger(),
      { scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: KEYS.daily },
      ...Array.from({ length: 5 }, () => ({
        scope: 'FOCUS_MONTHLY' as const,
        kind: 'CONSUME' as const,
        periodKey: KEYS.monthly,
      })),
    ];
    const plan = planExit(runner(), { kind: 'EARLY' }, context({ quotaLedger: consumed }));
    assert.equal(plan.exitKind, 'BREACH');
    if (plan.decision.type === 'BREACH') {
      assert.equal(plan.decision.coinCost, PENALTY.breachCoin);
      assert.equal(plan.decision.wiltingUntil, NOW_WALL + PENALTY.wiltingMs);
    }
  });

  it('锁机越界罚款低于专注', () => {
    const consumed: QuotaEntry[] = [
      ...fullLedger(),
      ...Array.from({ length: 5 }, () => ({
        scope: 'LOCK_MONTHLY' as const,
        kind: 'CONSUME' as const,
        periodKey: KEYS.monthly,
      })),
    ];
    const plan = planExit(runner({ kind: 'LOCK', taskId: null }), { kind: 'EARLY' }, context({ quotaLedger: consumed }));
    assert.equal(plan.exitKind, 'BREACH');
    if (plan.decision.type === 'BREACH') assert.equal(plan.decision.coinCost, PENALTY.breachLockCoin);
  });

  it('本次跳过：不耗月配额，扣固定金币', () => {
    const plan = planExit(runner(), { kind: 'SKIP', reason: 'MEETING' }, context());
    assert.equal(plan.exitKind, 'SKIP');
    if (plan.decision.type === 'SKIP') assert.equal(plan.decision.coinCost, PENALTY.skipCoin);
  });

  it('本次跳过用满后拒绝（每日上限 2 次）', () => {
    const plan = planExit(
      runner(),
      { kind: 'SKIP', reason: 'MEETING' },
      context({ skipsUsedToday: QUOTA.skipDaily }),
    );
    assert.equal(plan.decision.type, 'REJECTED');
  });
});

describe('settleSession：结算与罚款', () => {
  // settlement 存进 RunnerState（便于整体持久化与冷启动恢复），因此从 state.settlement 取
  function settle(state: RunnerState, exitKind: Parameters<typeof settleSession>[0]['exitKind'], ctx: RunnerContext, skipCoin?: number) {
    const result = settleSession(skipCoin === undefined ? { state, exitKind, ctx } : { state, exitKind, ctx, skipCoin });
    const settlement = result.state.settlement;
    assert.ok(settlement, '结算后必须存在 settlement');
    return { state: result.state, settlement };
  }

  it('专注 45 分钟零违规且准时 → 46 币（PRD 算例 1）', () => {
    const state = runner({ plannedMs: 45 * MIN });
    const { settlement } = settle(
      state,
      'NATURAL',
      context({ nowMonotonic: NOW_MONO + 45 * MIN, nowWall: NOW_WALL + 45 * MIN }),
    );
    assert.equal(settlement.effectiveMs, 45 * MIN);
    assert.equal(settlement.reward.total, 46);
    assert.equal(settlement.breachDeduction, 0);
    assert.equal(settlement.balanceAfter, 546);
  });

  it('自由专注打 8 折', () => {
    const state = runner({ plannedMs: 30 * MIN, taskId: null, plannedStartAt: null });
    const { settlement } = settle(
      state,
      'NATURAL',
      context({ nowMonotonic: NOW_MONO + 30 * MIN, nowWall: NOW_WALL + 30 * MIN }),
    );
    assert.equal(settlement.reward.total, 19); // 20 × 0.8 × 1.0 × 1.2 = 19.2 → 19
  });

  it('违规计入结算并影响收益', () => {
    let state = runner({ plannedMs: 60 * MIN });
    state = noteLeave(state, NOW_MONO, NOW_WALL, 'VISIBILITY');
    state = noteReturn(state, NOW_MONO + 18 * MIN, NOW_WALL + 18 * MIN).state; // 违规 18 分钟
    const { settlement } = settle(
      state,
      'NATURAL',
      context({ nowMonotonic: NOW_MONO + 72 * MIN, nowWall: NOW_WALL + 72 * MIN }),
    );
    assert.equal(settlement.violationMs, 18 * MIN);
    assert.ok(settlement.violationRatio > 0.2, `违规占比应 > 20%，实际 ${settlement.violationRatio}`);
  });

  it('越界：收益清零并扣币，余额不为负', () => {
    const state = runner({ plannedMs: 45 * MIN });
    const { settlement } = settle(
      state,
      'BREACH',
      context({
        nowMonotonic: NOW_MONO + 45 * MIN,
        nowWall: NOW_WALL + 45 * MIN,
        coinBalance: 30, // 余额不足罚款
      }),
    );
    assert.equal(settlement.reward.total, 0, '越界收益必须清零');
    assert.equal(settlement.breachDeduction, 30, '只能扣到余额为 0');
    assert.equal(settlement.balanceAfter, 0);
  });

  it('越界：余额充足时扣满罚款', () => {
    const state = runner({ plannedMs: 45 * MIN });
    const { settlement } = settle(
      state,
      'BREACH',
      context({ nowMonotonic: NOW_MONO + 45 * MIN, nowWall: NOW_WALL + 45 * MIN, coinBalance: 500 }),
    );
    assert.equal(settlement.breachDeduction, PENALTY.breachCoin);
    assert.equal(settlement.balanceAfter, 450);
  });

  it('本次跳过：收益按放弃档、**不给准时加成**、扣固定金币', () => {
    const state = runner({ plannedMs: 30 * MIN }); // punctual = true
    const { settlement } = settle(
      state,
      'SKIP',
      context({ nowMonotonic: NOW_MONO + 30 * MIN, nowWall: NOW_WALL + 30 * MIN, coinBalance: 100 }),
      PENALTY.skipCoin,
    );
    // 20 × 1.0 × 0.2 = 4；准时加成必须为 0（跳过不算"真的开始了"）
    assert.equal(settlement.reward.breakdown.qualityFactor, 0.2);
    assert.equal(settlement.reward.breakdown.punctual, 0);
    assert.equal(settlement.reward.total, 4);
    assert.equal(settlement.breachDeduction, PENALTY.skipCoin);
    assert.equal(settlement.balanceAfter, 94);
    assert.equal(settlement.exitKind, 'SKIP');
  });

  it('锁机 90 分钟 → 18 币（PRD 算例 4）', () => {
    const state = runner({ kind: 'LOCK', taskId: null, plannedMs: 90 * MIN });
    const { settlement } = settle(
      state,
      'NATURAL',
      context({ nowMonotonic: NOW_MONO + 90 * MIN, nowWall: NOW_WALL + 90 * MIN }),
    );
    assert.equal(settlement.reward.total, 18);
  });

  it('日上限生效', () => {
    const state = runner({ plannedMs: 45 * MIN });
    const { settlement } = settle(
      state,
      'NATURAL',
      context({
        nowMonotonic: NOW_MONO + 45 * MIN,
        nowWall: NOW_WALL + 45 * MIN,
        dailyEarnedCoin: 395,
      }),
    );
    assert.equal(settlement.reward.total, 5);
    assert.equal(settlement.reward.breakdown.capped, true);
  });

  it('跳过结算后状态为 ABANDONED，正常结算为 SETTLED', () => {
    const skipped = settleSession({ state: runner(), exitKind: 'SKIP', ctx: context() });
    assert.equal(skipped.state.session.status, 'ABANDONED');
    const natural = settleSession({ state: runner(), exitKind: 'NATURAL', ctx: context() });
    assert.equal(natural.state.session.status, 'SETTLED');
  });
});

describe('describeExitOptions：UI 需要的退出代价说明', () => {
  it('每日有余量时说明将消耗今日机会', () => {
    const options = describeExitOptions(runner(), context());
    assert.equal(options.canExitWithQuota, true);
    assert.equal(options.quotaPoolPreference, 'DAILY');
    assert.equal(options.upfrontCost.kind, 'QUOTA');
    assert.match(options.upfrontCost.description, /今日/);
  });

  it('每日用尽后说明将消耗月度机会', () => {
    const ledger = [...fullLedger(), { scope: 'FOCUS_DAILY' as const, kind: 'CONSUME' as const, periodKey: KEYS.daily }];
    const options = describeExitOptions(runner(), context({ quotaLedger: ledger }));
    assert.equal(options.quotaPoolPreference, 'MONTHLY');
    assert.match(options.upfrontCost.description, /本月/);
  });

  it('配额用尽时给出重罚代价（含宠物蔫时长）', () => {
    const consumed: QuotaEntry[] = [
      ...fullLedger(),
      { scope: 'FOCUS_DAILY', kind: 'CONSUME', periodKey: KEYS.daily },
      ...Array.from({ length: 5 }, () => ({
        scope: 'FOCUS_MONTHLY' as const,
        kind: 'CONSUME' as const,
        periodKey: KEYS.monthly,
      })),
    ];
    const options = describeExitOptions(runner(), context({ quotaLedger: consumed }));
    assert.equal(options.canExitWithQuota, false);
    assert.equal(options.upfrontCost.kind, 'BREACH');
    assert.equal(options.upfrontCost.coin, PENALTY.breachCoin);
    assert.match(options.upfrontCost.description, /收益清零/);
    assert.match(options.upfrontCost.description, /蔫/);
  });

  it('跳过剩余次数正确', () => {
    assert.equal(describeExitOptions(runner(), context()).skipsRemainingToday, QUOTA.skipDaily);
    assert.equal(
      describeExitOptions(runner(), context({ skipsUsedToday: 1 })).skipsRemainingToday,
      1,
    );
    assert.equal(
      describeExitOptions(runner(), context({ skipsUsedToday: 5 })).canSkip,
      false,
    );
  });
});

describe('describeProgress：进度与预计收益', () => {
  it('半程进度与预计收益', () => {
    const state = runner({ plannedMs: 45 * MIN });
    const info = describeProgress(state, context({ nowMonotonic: NOW_MONO + 22.5 * MIN, nowWall: NOW_WALL + 22.5 * MIN }));
    assert.equal(info.effectiveMs, 22.5 * MIN);
    assert.equal(Math.round(info.progress * 100), 50);
    assert.equal(info.isPaused, false);
    assert.equal(info.violationCount, 0);
    assert.equal(info.clockAltered, false);
    assert.ok(info.projectedCoin > 0);
  });

  it('暂停中 isPaused 为 true 且有效时长不再增长', () => {
    let state = runner({ plannedMs: 45 * MIN });
    state = noteLeave(state, NOW_MONO, NOW_WALL, 'BLUR');
    const info = describeProgress(state, context({ nowMonotonic: NOW_MONO + 5 * MIN, nowWall: NOW_WALL + 5 * MIN }));
    assert.equal(info.isPaused, true);
    assert.equal(info.effectiveMs, 0);
  });

  it('时钟被改动时如实上报', () => {
    const state = runner();
    const info = describeProgress(state, context({ nowMonotonic: NOW_MONO, nowWall: NOW_WALL + 10 * MIN }));
    assert.equal(info.clockAltered, true);
  });
});

describe('recoverRunner：冷启动恢复', () => {
  it('未超时 → 恢复为 RUNNING', () => {
    const state = runner({ plannedMs: 25 * MIN });
    const r = recoverRunner(state, NOW_MONO + 5 * MIN, NOW_WALL + 5 * MIN);
    assert.equal(r.action, 'RESUME_RUNNING');
    assert.equal(r.state.session.status, 'RUNNING');
  });

  it('已超时 → AUTO_SETTLE 并给出提示', () => {
    const state = runner({ plannedMs: 25 * MIN });
    const r = recoverRunner(state, NOW_MONO + 26 * MIN, NOW_WALL + 26 * MIN);
    assert.equal(r.action, 'AUTO_SETTLE');
    assert.equal(r.state.session.status, 'AWAITING_SETTLEMENT');
    assert.ok(r.message);
  });

  it('时钟被改动 → PROMPT_ABANDONED', () => {
    const state = runner({ plannedMs: 25 * MIN });
    const r = recoverRunner(state, NOW_MONO, NOW_WALL + 30 * MIN);
    assert.equal(r.action, 'PROMPT_ABANDONED');
    assert.equal(r.state.session.status, 'PAUSED');
  });
});

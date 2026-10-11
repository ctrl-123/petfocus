/**
 * 经济系统单测 —— 逐条验证 PRD 第 17.1 节的算例表。
 * 这些算例是文档里的承诺，如果测试挂了，要么实现错、要么文档错，不能改断言糊过去。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFine,
  computeFocusReward,
  computeLockReward,
  durationFactorOf,
  qualityFactorOf,
  violationRatioOf,
} from './economy.ts';
import { ECONOMY } from '../config/index.ts';

const MIN = 60_000;

describe('durationFactorOf：时长系数分档 [PRD 17.1]', () => {
  it('≤15 分钟 → 0.6', () => {
    assert.equal(durationFactorOf(10 * MIN), 0.6);
    assert.equal(durationFactorOf(15 * MIN), 0.6);
  });

  it('16–30 分钟 → 1.0', () => {
    assert.equal(durationFactorOf(16 * MIN), 1.0);
    assert.equal(durationFactorOf(30 * MIN), 1.0);
  });

  it('31–60 分钟 → 1.5', () => {
    assert.equal(durationFactorOf(31 * MIN), 1.5);
    assert.equal(durationFactorOf(60 * MIN), 1.5);
  });

  it('61–120 分钟 → 2.0，>120 分钟封顶 2.3', () => {
    assert.equal(durationFactorOf(90 * MIN), 2.0);
    assert.equal(durationFactorOf(120 * MIN), 2.0);
    assert.equal(durationFactorOf(121 * MIN), 2.3);
    assert.equal(durationFactorOf(600 * MIN), 2.3);
  });

  it('非法输入不产生 NaN（非有限值兜底取最高档）', () => {
    assert.equal(durationFactorOf(0), 0);
    assert.equal(durationFactorOf(-5), 0);
    assert.equal(durationFactorOf(Number.NaN), 2.3);
    assert.equal(durationFactorOf(Number.POSITIVE_INFINITY), 2.3);
  });
});

describe('violationRatioOf：违规占比分母为「有效 + 违规」', () => {
  it('正常计算', () => {
    assert.equal(violationRatioOf(100, 100), 0.5);
    assert.equal(violationRatioOf(90, 10), 0.1);
  });

  it('总时长为 0 时返回 0，不产生 NaN', () => {
    assert.equal(violationRatioOf(0, 0), 0);
  });
});

describe('qualityFactorOf：质量系数分档 [PRD 17.1]', () => {
  it('完成度 100% 且零违规 → 1.2', () => {
    assert.equal(qualityFactorOf(1, 0), 1.2);
    assert.equal(qualityFactorOf(1.5, 0), 1.2);
  });

  it('完成度 ≥80% 且违规 <10% → 1.0', () => {
    assert.equal(qualityFactorOf(0.9, 0.05), 1.0);
    assert.equal(qualityFactorOf(0.8, 0.09), 1.0);
  });

  it('完成度 ≥50% → 0.7（违规占比需 <20% 才不被折减）', () => {
    assert.equal(qualityFactorOf(0.6, 0.1), 0.7);
    assert.equal(qualityFactorOf(0.5, 0), 0.7);
    // 违规 50% 会把 0.7 再打对折
    assert.equal(qualityFactorOf(0.6, 0.5), 0.35);
  });

  it('完成度 <50% → 0.4', () => {
    assert.equal(qualityFactorOf(0.4, 0), 0.4);
    assert.equal(qualityFactorOf(0, 0), 0.4);
  });

  it('违规占比 >20% → 在已落档的基础上再 ×0.5', () => {
    // ⚠️ 常见误解：以为「完成度 100% + 违规 30%」= 满分档 1.2 × 0.5。
    // 实际不是：违规 30% 会让它连「满分档（要求零违规）」和「好档（要求违规<10%）」都进不去，
    // 于是落到半档 0.7，再乘 0.5 → 0.35。
    assert.equal(qualityFactorOf(1, 0.3), 0.35);
    // 零违规才是满分档
    assert.equal(qualityFactorOf(1, 0), 1.2);
    // 完成度 90%：同样进不去好档 → 半档 0.7，再 ×0.5
    assert.equal(qualityFactorOf(0.9, 0.25), 0.35);
    // 违规刚好 20%（不超过阈值）不折减
    assert.equal(qualityFactorOf(0.6, 0.2), 0.7);
  });

  it('越界退出 → 0；本次跳过 → 0.2', () => {
    assert.equal(qualityFactorOf(1, 0, 'BREACH'), 0);
    assert.equal(qualityFactorOf(1, 0, 'SKIP'), 0.2);
  });
});

describe('computeFocusReward：PRD 17.1 算例表逐条复现', () => {
  const base = { dailyEarnedCoin: 0, violationMs: 0, linkedToTask: true, isPunctual: false } as const;

  it('算例1：45 分钟 · 零违规 · 准时 · 关联待办 = 46 币', () => {
    const r = computeFocusReward({
      ...base,
      plannedMs: 45 * MIN,
      effectiveMs: 45 * MIN,
      isPunctual: true,
      exitKind: 'NONE',
    });
    assert.equal(r.total, 46); // 20 × 1.5 × 1.2 + 10
    assert.equal(r.breakdown.base, 20);
    assert.equal(r.breakdown.durationFactor, 1.5);
    assert.equal(r.breakdown.qualityFactor, 1.2);
    assert.equal(r.breakdown.punctual, 10);
  });

  it('算例2：25 分钟 · 违规 8% · 完成 100% = 20 币', () => {
    const planned = 25 * MIN;
    // 违规占比 8% → violationMs = 0.08/(1-0.08) × effectiveMs
    const effectiveMs = planned;
    const violationMs = Math.round((0.08 / 0.92) * effectiveMs);
    const r = computeFocusReward({
      ...base,
      plannedMs: planned,
      effectiveMs,
      violationMs,
      exitKind: 'NONE',
    });
    assert.equal(r.total, 20); // 20 × 1.0 × 1.0
    assert.equal(r.breakdown.durationFactor, 1.0);
  });

  it('算例3：60 分钟 · 违规 25% · 完成 90% = 11 币（完成度落 0.7 档，再 ×0.5）', () => {
    const r = computeFocusReward({
      ...base,
      plannedMs: 60 * MIN,
      effectiveMs: 54 * MIN,
      violationMs: 18 * MIN, // 18/(54+18) = 25%
      exitKind: 'NONE',
    });
    assert.equal(violationRatioOf(54 * MIN, 18 * MIN), 0.25);
    assert.equal(r.breakdown.durationFactor, 1.5);
    // 完成度 0.9 ≥0.5 但违规 25% 不满足「<10%」的好档 → 0.7；违规 >20% → ×0.5
    assert.equal(r.breakdown.qualityFactor, 0.35);
    assert.equal(r.total, 11); // round(20 × 1.5 × 0.35) = round(10.5) = 11
  });

  it('算例4：锁机 90 分钟 = 18 币', () => {
    const r = computeLockReward({
      effectiveMs: 90 * MIN,
      exitKind: 'NONE',
      dailyEarnedCoin: 0,
      priorLockSessionsToday: 0,
    });
    assert.equal(r.total, 18); // 12 × 1.5
  });

  it('算例5：理想一天（2 段专注 + 1 段锁机）= 84 币', () => {
    const first = computeFocusReward({
      ...base,
      plannedMs: 45 * MIN,
      effectiveMs: 45 * MIN,
      isPunctual: true,
      exitKind: 'NONE',
    });
    const second = computeFocusReward({
      ...base,
      plannedMs: 45 * MIN,
      effectiveMs: 45 * MIN,
      isPunctual: true,
      exitKind: 'NONE',
      dailyEarnedCoin: first.total,
    });
    const lock = computeLockReward({
      effectiveMs: 90 * MIN,
      exitKind: 'NONE',
      dailyEarnedCoin: first.total + second.total,
      priorLockSessionsToday: 0,
    });
    assert.equal(first.total, 46);
    assert.equal(second.total, 46);
    assert.equal(lock.total, 18);
    assert.equal(first.total + second.total + lock.total, 110);
  });

  it('理想一天叠加专项模块奖励 = 136 币（对齐 PRD 17.1 算例5 的口径）', () => {
    // PRD 原文 46+46+18+10+10+6 = 136：其中 10+10+6 是健身打卡 + 三餐齐全 + 3 条记账
    const focusAndLock = 46 + 46 + 18;
    const modules = 10 + 10 + 6;
    assert.equal(focusAndLock + modules, 136);
  });

  it('自由专注（未关联待办）打 8 折', () => {
    const withTask = computeFocusReward({
      ...base,
      plannedMs: 30 * MIN,
      effectiveMs: 30 * MIN,
      exitKind: 'NONE',
    });
    const free = computeFocusReward({
      ...base,
      plannedMs: 30 * MIN,
      effectiveMs: 30 * MIN,
      linkedToTask: false,
      exitKind: 'NONE',
    });
    assert.equal(withTask.total, 24); // 20 × 1.0 × 1.2
    // 20 × 0.8 = 16 × 1.0 × 1.2 = 19.2 → 19
    assert.equal(free.total, 19);
  });

  it('越界退出（BREACH）收益归零', () => {
    const r = computeFocusReward({
      ...base,
      plannedMs: 60 * MIN,
      effectiveMs: 60 * MIN,
      exitKind: 'BREACH',
    });
    assert.equal(r.total, 0);
  });

  it('本次跳过（SKIP）按放弃档计算，且不给准时加成', () => {
    const r = computeFocusReward({
      ...base,
      plannedMs: 30 * MIN,
      effectiveMs: 30 * MIN,
      isPunctual: true, // 即使准时也不给加成
      exitKind: 'SKIP',
    });
    assert.equal(r.breakdown.qualityFactor, 0.2);
    assert.equal(r.breakdown.punctual, 0, '跳过不算真的开始了，不应有准时加成');
    assert.equal(r.total, 4); // 20 × 1.0 × 0.2
  });

  it('准时加成在正常情况下照常给出（对照，防止上面那条改坏）', () => {
    const r = computeFocusReward({
      ...base,
      plannedMs: 30 * MIN,
      effectiveMs: 30 * MIN,
      isPunctual: true,
      exitKind: 'NONE',
    });
    assert.equal(r.breakdown.punctual, ECONOMY.punctualBonus);
    assert.equal(r.total, 34); // 20 × 1.0 × 1.2 + 10
  });

  it('每日产出上限生效并被标记', () => {
    const r = computeFocusReward({
      ...base,
      plannedMs: 120 * MIN,
      effectiveMs: 120 * MIN,
      isPunctual: true,
      exitKind: 'NONE',
      dailyEarnedCoin: ECONOMY.dailyCoinCap - 5,
    });
    assert.equal(r.total, 5);
    assert.equal(r.breakdown.capped, true);
  });

  it('日上限已满时产出 0', () => {
    const r = computeFocusReward({
      ...base,
      plannedMs: 120 * MIN,
      effectiveMs: 120 * MIN,
      exitKind: 'NONE',
      dailyEarnedCoin: ECONOMY.dailyCoinCap,
    });
    assert.equal(r.total, 0);
    assert.equal(r.breakdown.capped, true);
  });
});

describe('computeLockReward：锁机计币 [PRD AC-3.2.5 / AC-3.2.7]', () => {
  const base = { exitKind: 'NONE', dailyEarnedCoin: 0, priorLockSessionsToday: 0 } as const;

  it('12 币/小时，按分钟折算', () => {
    assert.equal(computeLockReward({ ...base, effectiveMs: 60 * MIN }).total, 12);
    assert.equal(computeLockReward({ ...base, effectiveMs: 30 * MIN }).total, 6);
    assert.equal(computeLockReward({ ...base, effectiveMs: 120 * MIN }).total, 24);
  });

  it('不足最小结算单位（5 分钟）不计', () => {
    assert.equal(computeLockReward({ ...base, effectiveMs: 4 * MIN }).total, 0);
    assert.equal(computeLockReward({ ...base, effectiveMs: 0 }).total, 0);
  });

  it('恰好 5 分钟开始计（向下取整为 1 币）', () => {
    assert.equal(computeLockReward({ ...base, effectiveMs: 5 * MIN }).total, 1);
  });

  it('同日连续锁机加成：第 2 段 +10，第 3 段 +20，第 4 段仍 +20', () => {
    assert.equal(computeLockReward({ ...base, effectiveMs: 60 * MIN, priorLockSessionsToday: 1 }).total, 22);
    assert.equal(computeLockReward({ ...base, effectiveMs: 60 * MIN, priorLockSessionsToday: 2 }).total, 32);
    assert.equal(computeLockReward({ ...base, effectiveMs: 60 * MIN, priorLockSessionsToday: 3 }).total, 32);
    assert.equal(computeLockReward({ ...base, effectiveMs: 60 * MIN, priorLockSessionsToday: 9 }).total, 32);
  });

  it('越界退出锁机收益归零', () => {
    assert.equal(computeLockReward({ ...base, effectiveMs: 120 * MIN, exitKind: 'BREACH' }).total, 0);
  });
});

describe('applyFine：罚款不得让余额为负 [PRD E17]', () => {
  it('余额充足时全额扣除', () => {
    assert.deepEqual(applyFine(200, 50), { balance: 150, deducted: 50 });
  });

  it('余额不足时扣至 0，不产生负债', () => {
    assert.deepEqual(applyFine(30, 50), { balance: 0, deducted: 30 });
    assert.deepEqual(applyFine(0, 50), { balance: 0, deducted: 0 });
  });

  it('非法罚款额不会增加余额', () => {
    assert.deepEqual(applyFine(100, -10), { balance: 100, deducted: 0 });
  });

  it('不变量：任何输入下余额 ≥ 0', () => {
    for (const balance of [0, 1, 49, 50, 51, 1000]) {
      for (const fine of [0, 10, 50, 9999]) {
        assert.ok(applyFine(balance, fine).balance >= 0);
      }
    }
  });
});

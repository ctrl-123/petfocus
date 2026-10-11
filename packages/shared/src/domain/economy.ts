/**
 * 经济系统：金币产出计算。纯函数，零依赖。
 *
 * 对应 PRD 第 17.1 节。**公式必须与 Supabase Edge Function 完全一致**，
 * 因此实现放在 packages/shared，前端与 Edge Function 引用同一份源码
 * （见技术设计 5.4.1「单一真相源」）。
 */

import {
  DURATION_FACTORS,
  ECONOMY,
  QUALITY_FACTORS,
  TIME_UNITS,
} from '../config/index.ts';
import type {
  ExitKind,
  FocusRewardInput,
  LockRewardInput,
  RewardBreakdown,
  RewardResult,
} from '../types.ts';

/**
 * breakdown.penalty 的语义：**本次收益内被扣掉的金额**（0 或正数）。
 * 越界罚款不走这里（它是对余额的直接扣减，见 applyFine），因为罚款金额与收益无关。
 */
const ZERO_BREAKDOWN: RewardBreakdown = {
  base: 0,
  durationFactor: 0,
  qualityFactor: 0,
  punctual: 0,
  penalty: 0,
  capped: false,
};

/** 超长/异常计划时长的兜底系数（取配置中最高档） */
const FALLBACK_DURATION_FACTOR = DURATION_FACTORS[DURATION_FACTORS.length - 1]?.factor ?? 1;

/** 时长系数：按计划时长落档；>120 分钟取封顶值 */
export function durationFactorOf(plannedMs: number): number {
  // 非有限值（NaN/±Infinity）一律兜底取最高档，避免 Infinity 命中第一档这类错误
  if (!Number.isFinite(plannedMs)) return FALLBACK_DURATION_FACTOR;
  if (plannedMs <= 0) return 0;
  for (const tier of DURATION_FACTORS) {
    if (plannedMs <= tier.maxMs) return tier.factor;
  }
  return FALLBACK_DURATION_FACTOR;
}

/**
 * 质量系数：由完成度与违规占比决定。
 * 注意 exitKind === 'BREACH' 的重罚不在此处理（收益直接归零，见 computeFocusReward）。
 */
export function qualityFactorOf(
  completion: number,
  violationRatio: number,
  exitKind: ExitKind = 'NONE',
): number {
  if (exitKind === 'BREACH') return 0;
  if (exitKind === 'SKIP') return QUALITY_FACTORS.abandoned;

  let factor: number;
  if (completion >= 1 && violationRatio === 0) {
    factor = QUALITY_FACTORS.perfect;
  } else if (completion >= QUALITY_FACTORS.goodCompletion && violationRatio < QUALITY_FACTORS.goodViolationRatio) {
    factor = QUALITY_FACTORS.good;
  } else if (completion >= QUALITY_FACTORS.halfCompletion) {
    factor = QUALITY_FACTORS.half;
  } else {
    factor = QUALITY_FACTORS.low;
  }

  if (violationRatio > QUALITY_FACTORS.violationRatioThreshold) {
    factor *= QUALITY_FACTORS.violationPenalty;
  }
  return factor;
}

/** 计算违规占比：分母为「有效时长 + 违规时长」 */
export function violationRatioOf(effectiveMs: number, violationMs: number): number {
  const total = effectiveMs + violationMs;
  if (total <= 0) return 0;
  return violationMs / total;
}

/** 按每日上限截断 */
function applyDailyCap(total: number, dailyEarnedCoin: number): { total: number; capped: boolean } {
  const remaining = Math.max(0, ECONOMY.dailyCoinCap - Math.max(0, dailyEarnedCoin));
  const capped = total > remaining;
  return { total: Math.min(total, remaining), capped };
}

/**
 * 专注会话奖励。
 * 基础 20 币 × 时长系数 × 质量系数（自由专注再 ×0.8）+ 准时加成 10，最后过日上限。
 */
export function computeFocusReward(input: FocusRewardInput): RewardResult {
  if (input.exitKind === 'BREACH') {
    return { total: 0, breakdown: { ...ZERO_BREAKDOWN } };
  }

  const durationFactor = durationFactorOf(input.plannedMs);
  const completion = input.plannedMs <= 0 ? 1 : input.effectiveMs / input.plannedMs;
  const violationRatio = violationRatioOf(input.effectiveMs, input.violationMs);
  const qualityFactor = qualityFactorOf(completion, violationRatio, input.exitKind);

  const base = input.linkedToTask ? ECONOMY.baseCoin : ECONOMY.baseCoin * ECONOMY.unlinkedTaskFactor;
  // 准时加成的前提是**真的开始了**。「本次跳过」表示没有进入这次专注，
  // 因此不给准时加成——否则会出现「跳过反而比认真做更划算」的荒谬情形。
  const punctual = input.isPunctual && input.exitKind !== 'SKIP' ? ECONOMY.punctualBonus : 0;

  const raw = Math.round(base * durationFactor * qualityFactor) + punctual;
  const { total, capped } = applyDailyCap(raw, input.dailyEarnedCoin);

  return {
    total,
    breakdown: { base, durationFactor, qualityFactor, punctual, penalty: 0, capped },
  };
}

/**
 * 锁机会话奖励：12 币/小时，按分钟线性折算，最小结算单位 5 分钟；
 * 不足最小单位不计；配额用尽强行退出则收益清零。
 */
export function computeLockReward(input: LockRewardInput): RewardResult {
  if (input.exitKind === 'BREACH') {
    return { total: 0, breakdown: { ...ZERO_BREAKDOWN, qualityFactor: 1 } };
  }
  if (input.effectiveMs < ECONOMY.lockMinSettleMs) {
    return { total: 0, breakdown: { ...ZERO_BREAKDOWN, qualityFactor: 1 } };
  }

  const hours = input.effectiveMs / TIME_UNITS.MS_PER_HOUR;
  const base = Math.floor(ECONOMY.lockCoinPerHour * hours);

  // 连续锁机加成：按「当日第几段」查表，索引 1 起才有加成；超过上限后按第 3 段封顶
  const sessionIndexThisDay = Math.max(1, input.priorLockSessionsToday + 1);
  const cappedIndex = Math.min(sessionIndexThisDay, ECONOMY.lockStreakBonusMaxTimes);
  const streakBonus = ECONOMY.lockStreakBonus[cappedIndex] ?? 0;

  const raw = base + streakBonus;
  const { total, capped } = applyDailyCap(raw, input.dailyEarnedCoin);

  return {
    total,
    breakdown: {
      base,
      durationFactor: 1,
      qualityFactor: 1,
      punctual: streakBonus,
      penalty: 0,
      capped,
    },
  };
}

/**
 * 计算罚款后余额，保证不为负（PRD E17：扣至 0 为止，不产生负债）。
 * 罚款金额由 config 的 PENALTY 决定（专注 50 / 锁机 30），调用方按会话类型取用。
 *
 * @param balance 当前余额
 * @param fine 应罚金额（正数）
 */
export function applyFine(balance: number, fine: number): { balance: number; deducted: number } {
  const deducted = Math.min(Math.max(0, balance), Math.max(0, fine));
  return { balance: balance - deducted, deducted };
}

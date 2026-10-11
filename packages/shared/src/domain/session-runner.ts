/**
 * 会话运行器：把会话引擎（单次 tick 的推导）提升为**完整的状态机**。
 *
 * 职责边界：
 * - `session-engine.ts` 负责单次推导（effectiveMs / pausedMs / 时钟偏差）
 * - 本文件负责状态流转：SCHEDULED → RUNNING ⇄ PAUSED → SETTLED / ABANDONED
 *   ，以及退出决策（配额内无损退出 / 本次跳过 / 越界重罚）
 *
 * 纯函数、零依赖，不碰 DOM 也不碰仓储，因此可以被完整单测。
 * 真实时钟与平台能力由 apps/web 的会话钩子注入（见 features/focus/use-session.ts）。
 */
import { PENALTY, PUNCTUAL_TOLERANCE_MS, QUOTA, TIME_UNITS } from '../config/index.ts';
import { computeFocusReward, computeLockReward } from './economy.ts';
import { computeRemaining, consumeQuota } from './quota.ts';
import type {
  ExitKind,
  QuotaEntry,
  QuotaRemaining,
  RewardResult,
  SessionKind,
  SkipReason,
} from '../types.ts';
import {
  closeViolation,
  computeTick,
  createSession,
  openViolation,
  reconstructSession,
  totalViolationMs,
  violationRatio,
  type SessionState,
  type TickResult,
} from './session-engine.ts';

/** 会话完整状态：引擎事实 + 状态机字段 + 结算结果 */
export interface RunnerState {
  session: SessionState;
  /** 关联的待办（自由专注为空） */
  taskId?: string;
  /** 展示用的标题 */
  title: string;
  /** 是否准时开始（计划时间 ±2 分钟内） */
  punctual: boolean;
  /** 已结算结果；未结算时为 undefined */
  settlement?: Settlement;
}

export interface Settlement {
  effectiveMs: number;
  violationMs: number;
  /** 违规占比 0–1 */
  violationRatio: number;
  /** 收益（可能为 0） */
  reward: RewardResult;
  exitKind: ExitKind;
  /** 若是越界，实际扣除的金币（受余额限制） */
  breachDeduction: number;
  /** 结算后的余额 */
  balanceAfter: number;
  settledAt: number;
}

export type ExitRequest =
  /** 正常结束（时间到） */
  | { kind: 'NATURAL' }
  /** 用户主动提前结束 */
  | { kind: 'EARLY' }
  /** 本次跳过（有原因，不耗月配额，扣固定金币） */
  | { kind: 'SKIP'; reason: SkipReason };

export interface RunnerContext {
  nowMonotonic: number;
  nowWall: number;
  /** 当前配额账本（用于判断能否无损退出） */
  quotaLedger: ReadonlyArray<QuotaEntry>;
  /** 当日已产出金币（用于日上限） */
  dailyEarnedCoin: number;
  /** 当前余额（用于越界罚款计算） */
  coinBalance: number;
  /** 今日已用跳过次数 */
  skipsUsedToday: number;
  /** 当日此前已完成的锁机段数（连续加成用） */
  priorLockSessionsToday: number;
  /** 周期键 */
  periodKeys: { daily: string; monthly: string };
}

export interface NewRunnerInput {
  kind: SessionKind;
  plannedMs: number;
  title: string;
  taskId?: string;
  /** 到点自动进入时应传 SCHEDULED（走宽限期） */
  startAsScheduled?: boolean;
  nowMonotonic: number;
  nowWall: number;
  /** 计划开始时间，用于判断是否准时 */
  plannedStartAt?: number;
  /** 准时判定容差（毫秒），默认 ±2 分钟 */
  punctualToleranceMs?: number;
}

const DEFAULT_PUNCTUAL_TOLERANCE_MS = PUNCTUAL_TOLERANCE_MS;

/** 创建会话 */
export function startRunner(input: NewRunnerInput): RunnerState {
  const session = createSession({
    kind: input.kind,
    plannedMs: input.plannedMs,
    nowMonotonic: input.nowMonotonic,
    nowWall: input.nowWall,
    status: input.startAsScheduled === true ? 'SCHEDULED' : 'RUNNING',
  });

  const tolerance = input.punctualToleranceMs ?? DEFAULT_PUNCTUAL_TOLERANCE_MS;
  const punctual =
    input.plannedStartAt === undefined
      ? false
      : Math.abs(input.nowWall - input.plannedStartAt) <= tolerance;

  const state: RunnerState = { session, title: input.title, punctual };
  if (input.taskId !== undefined) state.taskId = input.taskId;
  return state;
}

/** 只读推进：返回最新的 tick 结果，不改变状态（持久化由调用方按需决定） */
export function tickRunner(state: RunnerState, nowMonotonic: number, nowWall: number): TickResult {
  return computeTick({ session: state.session, nowMonotonic, nowWall });
}

/** 宽限期结束、正式开始 */
export function beginRunning(state: RunnerState): RunnerState {
  if (state.session.status !== 'SCHEDULED') return state;
  return { ...state, session: { ...state.session, status: 'RUNNING' } };
}

/** 用户离开（切走/失焦/退出全屏） */
export function noteLeave(
  state: RunnerState,
  nowMonotonic: number,
  nowWall: number,
  source: Parameters<typeof openViolation>[3],
  detail?: string,
): RunnerState {
  const next =
    detail === undefined
      ? openViolation(state.session, nowMonotonic, nowWall, source)
      : openViolation(state.session, nowMonotonic, nowWall, source, detail);
  return { ...state, session: next };
}

/** 用户回来 */
export function noteReturn(
  state: RunnerState,
  nowMonotonic: number,
  nowWall: number,
): { state: RunnerState; counted: boolean; durationMs: number } {
  const result = closeViolation(state.session, nowMonotonic, nowWall);
  return {
    state: { ...state, session: result.session },
    counted: result.counted,
    durationMs: result.durationMs,
  };
}

/** 恢复运行（PAUSED → RUNNING），用于「违规结束但会话继续」 */
export function resumeRunning(state: RunnerState): RunnerState {
  if (state.session.status !== 'PAUSED') return state;
  return { ...state, session: { ...state.session, status: 'RUNNING' } };
}

/**
 * 冷启动恢复：页面重开后重建。
 *
 * 用泛型而不是固定的 `RunnerState`：调用方（web 层）会在 RunnerState 上再挂 UI 相关字段，
 * 若这里收窄成 RunnerState，那些字段会在类型上被丢掉。
 */
export function recoverRunner<T extends RunnerState>(
  stored: T,
  nowMonotonic: number,
  nowWall: number,
): { state: T; action: ReturnType<typeof reconstructSession>['action']; message?: string } {
  const result = reconstructSession(stored.session, nowMonotonic, nowWall);
  if (!result.session) return { state: stored, action: result.action };
  const next = { ...stored, session: result.session };
  return result.message === undefined
    ? { state: next, action: result.action }
    : { state: next, action: result.action, message: result.message };
}

// ─────────────────────────────────────────────────────────────
// 退出与结算
// ─────────────────────────────────────────────────────────────

export type ExitDecision =
  /** 无损退出（消耗了配额） */
  | { type: 'QUOTA'; pool: 'DAILY' | 'MONTHLY'; entries: QuotaEntry[]; remaining: QuotaRemaining }
  /** 本次跳过（不耗月配额，扣固定金币） */
  | { type: 'SKIP'; coinCost: number }
  /** 越界（配额用尽仍要退出，重罚） */
  | { type: 'BREACH'; coinCost: number; wiltingUntil: number }
  /** 不允许（例如跳过次数用尽） */
  | { type: 'REJECTED'; reason: 'SKIP_LIMIT_REACHED' };

export interface ExitPlan {
  decision: ExitDecision;
  exitKind: ExitKind;
}

/**
 * 规划一次退出。**不修改任何状态**，只给出决策与要写入的账本条目。
 *
 * 决策顺序（PRD AC-1.4.5 / AC-1.4.6 / AC-1.4.7）：
 * 1. 「本次跳过」在每日上限内且用户显式选择跳过 → SKIP
 * 2. 配额池还有余额 → QUOTA（专注优先扣每日，再扣月度；锁机仅月度）
 * 3. 配额用尽 → BREACH（重罚：收益清零 + 扣币 + 宠物蔫）
 */
export function planExit(state: RunnerState, request: ExitRequest, ctx: RunnerContext): ExitPlan {
  const kind = state.session.kind;

  if (request.kind === 'NATURAL') {
    return { decision: { type: 'QUOTA', pool: 'DAILY', entries: [], remaining: emptyRemaining() }, exitKind: 'NATURAL' };
  }

  if (request.kind === 'SKIP') {
    if (ctx.skipsUsedToday >= QUOTA.skipDaily) {
      return { decision: { type: 'REJECTED', reason: 'SKIP_LIMIT_REACHED' }, exitKind: 'SKIP' };
    }
    return {
      decision: { type: 'SKIP', coinCost: PENALTY.skipCoin },
      exitKind: 'SKIP',
    };
  }

  // EARLY：走配额。consumeQuota 在配额用尽时返回 BREACH（不抛异常），
  // 由调用方决定是否真的退出——这样 UI 可以先把代价展示给用户。
  const outcome = consumeQuota(ctx.quotaLedger, {
    kind,
    periodKeys: ctx.periodKeys,
    allowBreach: true,
  });

  if (outcome.outcome === 'CONSUMED') {
    return {
      decision: {
        type: 'QUOTA',
        pool: outcome.pool === 'DAILY' ? 'DAILY' : 'MONTHLY',
        entries: outcome.entries,
        remaining: outcome.remaining,
      },
      exitKind: outcome.pool === 'DAILY' ? 'QUOTA_DAILY' : 'QUOTA_MONTHLY',
    };
  }

  const coinCost = breachPenaltyCoinFor(kind);
  return {
    decision: { type: 'BREACH', coinCost, wiltingUntil: ctx.nowWall + PENALTY.wiltingMs },
    exitKind: 'BREACH',
  };
}

/** 越界罚款金额：专注 50 / 锁机 30（取自 config，不在此硬编码） */
export function breachPenaltyCoinFor(kind: SessionKind): number {
  return kind === 'FOCUS' ? PENALTY.breachCoin : PENALTY.breachLockCoin;
}

function emptyRemaining(): QuotaRemaining {
  return { daily: 0, monthly: 0 };
}

export interface SettleInput {
  state: RunnerState;
  exitKind: ExitKind;
  ctx: RunnerContext;
  /** SKIP 时要扣的金币（来自 ExitPlan） */
  skipCoin?: number;
  /** BREACH 时要扣的金币（来自 ExitPlan） */
  breachCoin?: number;
}

/**
 * 结算会话：计算有效时长、违规、金币收益与罚款。
 *
 * 结算结果写入 `state.settlement`（而不是作为并列返回值），
 * 这样整个 RunnerState 可以一次性持久化，冷启动后也能看到上次的结算详情。
 */
export function settleSession(input: SettleInput): { state: RunnerState } {
  const { state, exitKind, ctx } = input;
  const tick = tickRunner(state, ctx.nowMonotonic, ctx.nowWall);
  const violationMs = totalViolationMs(state.session.violations);
  const ratio = violationRatio(tick.effectiveMs, state.session.violations);

  const reward =
    state.session.kind === 'FOCUS'
      ? computeFocusReward({
          plannedMs: state.session.plannedMs,
          effectiveMs: tick.effectiveMs,
          violationMs,
          isPunctual: state.punctual,
          linkedToTask: state.taskId !== undefined,
          exitKind,
          dailyEarnedCoin: ctx.dailyEarnedCoin,
        })
      : computeLockReward({
          effectiveMs: tick.effectiveMs,
          exitKind,
          dailyEarnedCoin: ctx.dailyEarnedCoin,
          priorLockSessionsToday: ctx.priorLockSessionsToday,
        });

  // 罚款：跳过扣固定值；越界按类型扣（专注 50 / 锁机 30），且不得让余额为负
  let deduction = 0;
  if (exitKind === 'SKIP') deduction += Math.min(ctx.coinBalance, input.skipCoin ?? PENALTY.skipCoin);
  if (exitKind === 'BREACH') {
    const fine = input.breachCoin ?? breachPenaltyCoinFor(state.session.kind);
    deduction += Math.min(Math.max(0, ctx.coinBalance - deduction), fine);
  }

  const settlement: Settlement = {
    effectiveMs: tick.effectiveMs,
    violationMs,
    violationRatio: ratio,
    reward,
    exitKind,
    breachDeduction: deduction,
    balanceAfter: Math.max(0, ctx.coinBalance + reward.total - deduction),
    settledAt: ctx.nowWall,
  };

  return {
    state: {
      ...state,
      session: { ...state.session, status: exitKind === 'SKIP' ? 'ABANDONED' : 'SETTLED', endedAt: ctx.nowWall },
      settlement,
    },
  };
}

/** 已结算的会话不应再被推进 */
export function isTerminal(state: RunnerState): boolean {
  return state.session.status === 'SETTLED' || state.session.status === 'ABANDONED';
}

/** 本次会话是否应当自动结算（时间到） */
export function shouldAutoSettle(state: RunnerState, nowMonotonic: number, nowWall: number): boolean {
  if (isTerminal(state)) return false;
  return tickRunner(state, nowMonotonic, nowWall).shouldSettle;
}

/**
 * 计算「当前可用的退出方式」，供 UI 展示与禁用按钮用。
 * 这样 UI 不需要自己判断配额逻辑（避免口径分散）。
 */
export interface ExitOptions {
  canExitWithQuota: boolean;
  quotaRemaining: QuotaRemaining;
  quotaPoolPreference: 'DAILY' | 'MONTHLY' | 'NONE';
  canSkip: boolean;
  skipsRemainingToday: number;
  /** 退出将付出什么代价，直接用于按钮文案 */
  upfrontCost: { kind: 'NONE' | 'QUOTA' | 'SKIP' | 'BREACH'; coin: number; description: string };
}

export function describeExitOptions(state: RunnerState, ctx: RunnerContext): ExitOptions {
  const remaining = computeRemaining(ctx.quotaLedger, state.session.kind, ctx.periodKeys);
  const useMonthlyOnly = state.session.kind === 'LOCK';
  const canDaily = !useMonthlyOnly && remaining.daily > 0;
  const canMonthly = remaining.monthly > 0;
  const canExitWithQuota = canDaily || canMonthly;
  const skipsRemainingToday = Math.max(0, QUOTA.skipDaily - ctx.skipsUsedToday);

  const poolPreference: ExitOptions['quotaPoolPreference'] = canDaily
    ? 'DAILY'
    : canMonthly
      ? 'MONTHLY'
      : 'NONE';

  if (canExitWithQuota) {
    const description =
      poolPreference === 'DAILY'
        ? `将消耗今日 ${QUOTA.focusDaily} 次机会之一（本月还可退出 ${remaining.monthly} 次）`
        : `今日机会已用完，将消耗本月剩余的 ${remaining.monthly} 次之一`;
    return {
      canExitWithQuota,
      quotaRemaining: remaining,
      quotaPoolPreference: poolPreference,
      canSkip: skipsRemainingToday > 0,
      skipsRemainingToday,
      upfrontCost: { kind: 'QUOTA', coin: 0, description },
    };
  }

  return {
    canExitWithQuota,
    quotaRemaining: remaining,
    quotaPoolPreference: 'NONE',
    canSkip: skipsRemainingToday > 0,
    skipsRemainingToday,
    upfrontCost: {
      kind: 'BREACH',
      coin: breachPenaltyCoinFor(state.session.kind),
      description: `配额已用尽：本次收益清零，并扣 ${breachPenaltyCoinFor(state.session.kind)} 金币，宠物会蔫 ${
        PENALTY.wiltingMs / TIME_UNITS.MS_PER_MINUTE
      } 分钟`,
    },
  };
}

/** 供 UI 展示的进度信息 */
export interface ProgressInfo {
  effectiveMs: number;
  plannedMs: number;
  remainingMs: number;
  progress: number;
  isPaused: boolean;
  violationCount: number;
  violationMs: number;
  clockAltered: boolean;
  /** 预计收益（乐观值，最终以结算为准） */
  projectedCoin: number;
}

export function describeProgress(state: RunnerState, ctx: RunnerContext): ProgressInfo {
  const tick = tickRunner(state, ctx.nowMonotonic, ctx.nowWall);
  const violationMs = totalViolationMs(state.session.violations);

  const projected =
    state.session.kind === 'FOCUS'
      ? computeFocusReward({
          plannedMs: state.session.plannedMs,
          effectiveMs: tick.effectiveMs,
          violationMs,
          isPunctual: state.punctual,
          linkedToTask: state.taskId !== undefined,
          exitKind: 'NONE',
          dailyEarnedCoin: ctx.dailyEarnedCoin,
        })
      : computeLockReward({
          effectiveMs: tick.effectiveMs,
          exitKind: 'NONE',
          dailyEarnedCoin: ctx.dailyEarnedCoin,
          priorLockSessionsToday: ctx.priorLockSessionsToday,
        });

  return {
    effectiveMs: tick.effectiveMs,
    plannedMs: state.session.plannedMs,
    remainingMs: tick.remainingMs,
    progress: tick.progress,
    isPaused: tick.isPaused,
    violationCount: state.session.violations.length,
    violationMs,
    clockAltered: tick.clockAltered,
    projectedCoin: projected.total,
  };
}

/**
 * 会话引擎：计时、违规检测、时钟偏差、崩溃恢复。纯函数，零依赖。
 *
 * 核心设计（ADR-003）：**只持久化「事实」，剩余时间永远由事实推导**。
 * - 事实 = 单调时钟起点 + 暂停区间 + 违规记录
 * - 绝不用 setInterval 累加秒数（后台被节流、休眠会偏慢、刷新即丢失）
 * - performance.now() 是单调时钟，不受系统时间改动影响，且随休眠正确前进
 *
 * 对应技术设计 5.1 节，包含 INV-1 ~ INV-7 不变量的实现基础。
 */

import { CLOCK_SKEW_TOLERANCE_MS, PRECISION, TIME_UNITS, VIOLATION_THRESHOLD_MS } from '../config/index.ts';
import type { PauseInterval, SessionFacts, SessionStatus, Violation, ViolationSource } from '../types.ts';

/** 会话引擎可操作的最小状态：事实 + 状态机字段（由调用方持久化） */
export interface SessionState extends SessionFacts {
  status: SessionStatus;
}

export interface TickInput {
  session: SessionState;
  /** 当前单调时钟：performance.timeOrigin + performance.now() */
  nowMonotonic: number;
  /** 当前墙钟：Date.now() */
  nowWall: number;
  /** 违规阈值（毫秒），默认取配置 */
  violationThresholdMs?: number;
}

export interface TickResult {
  /** 已累计的有效时长（扣除暂停，且不超过计划时长） */
  effectiveMs: number;
  /** 已累计的暂停时长（含尚未闭合的区间） */
  pausedMs: number;
  remainingMs: number;
  isPaused: boolean;
  /** 0–1，用于环形进度 */
  progress: number;
  /** 墙钟流逝 − 单调流逝；正常接近 0，绝对值 > 60s 视为系统时间被改动 */
  clockSkewMs: number;
  clockAltered: boolean;
  /** 是否应当进入结算 */
  shouldSettle: boolean;
  /** 原始流逝时长（未扣暂停、未截断），用于诊断 */
  elapsedTotalMs: number;
}

/** 当前暂停区间的起点；无暂停时为 undefined */
export function openPauseFrom(intervals: ReadonlyArray<PauseInterval>): number | undefined {
  for (let i = intervals.length - 1; i >= 0; i -= 1) {
    const iv = intervals[i];
    if (iv && iv.to === undefined) return iv.from;
  }
  return undefined;
}

/** 累计暂停时长（未闭合区间用 nowMonotonic 收口） */
export function pausedMsOf(intervals: ReadonlyArray<PauseInterval>, nowMonotonic: number): number {
  return intervals.reduce((sum, iv) => {
    const to = iv.to ?? nowMonotonic;
    return sum + Math.max(0, to - iv.from);
  }, 0);
}

/**
 * 单次 tick：推导所有派生量。**不修改状态、不产生副作用。**
 */
export function computeTick(input: TickInput): TickResult {
  const { session, nowMonotonic, nowWall } = input;

  const pausedMs = pausedMsOf(session.pausedIntervals, nowMonotonic);
  const elapsedTotalMs = Math.max(0, nowMonotonic - session.startedAtMonotonic);
  const effectiveMs = Math.max(0, Math.min(elapsedTotalMs - pausedMs, session.plannedMs));
  const remainingMs = Math.max(0, session.plannedMs - effectiveMs);

  // 时钟偏差：墙钟流逝 − 单调流逝
  const wallElapsedMs = nowWall - session.startedAtWall;
  const clockSkewMs = wallElapsedMs - elapsedTotalMs;

  return {
    effectiveMs,
    pausedMs,
    remainingMs,
    isPaused: openPauseFrom(session.pausedIntervals) !== undefined,
    progress: session.plannedMs <= 0 ? 1 : effectiveMs / session.plannedMs,
    clockSkewMs,
    clockAltered: Math.abs(clockSkewMs) > CLOCK_SKEW_TOLERANCE_MS,
    shouldSettle: remainingMs <= 0,
    elapsedTotalMs,
  };
}

/** 违规是否达到「计为违规」的门槛（不足阈值视为「瞥了一眼」，撤回） */
export function isViolationCounted(durationMs: number, thresholdMs: number = VIOLATION_THRESHOLD_MS): boolean {
  return durationMs >= thresholdMs;
}

/**
 * 开启一个暂停/违规候选区间。
 * 注意：此时**不写入** violations，只有闭合时达到阈值才真正计入
 * （所以这里同时记录候选，闭合时决定保留或撤回）。
 */
export function openViolation(
  session: SessionState,
  nowMonotonic: number,
  nowWall: number,
  source: ViolationSource,
  detail?: string,
): SessionState {
  if (openPauseFrom(session.pausedIntervals) !== undefined) return session; // 已暂停，忽略重复事件

  const candidate: Violation = {
    startedAt: nowWall,
    durationMs: 0,
    source,
    ...(detail === undefined ? {} : { detail }),
  };
  return {
    ...session,
    pausedIntervals: [...session.pausedIntervals, { from: nowMonotonic }],
    violations: [...session.violations, candidate],
  };
}

export interface CloseViolationResult {
  session: SessionState;
  /** 本次离开是否被计为违规 */
  counted: boolean;
  /** 本次离开的时长（无论是否计入） */
  durationMs: number;
}

/**
 * 闭合最近一次暂停/违规区间。
 * - 未达阈值：撤回暂停区间与违规记录（视为短暂分心，不惩罚）
 * - 达到阈值：保留并写入时长，状态转为 PAUSED
 */
export function closeViolation(
  session: SessionState,
  nowMonotonic: number,
  nowWall: number,
  thresholdMs: number = VIOLATION_THRESHOLD_MS,
): CloseViolationResult {
  const idx = session.pausedIntervals.length - 1;
  const opened = session.pausedIntervals[idx];
  if (!opened || opened.to !== undefined) {
    return { session, counted: false, durationMs: 0 };
  }

  const durationMs = Math.max(0, nowMonotonic - opened.from);
  const intervals = session.pausedIntervals.slice();

  if (!isViolationCounted(durationMs, thresholdMs)) {
    intervals.splice(idx, 1);
    const violations = session.violations.slice(0, -1);
    return { session: { ...session, pausedIntervals: intervals, violations }, counted: false, durationMs };
  }

  intervals[idx] = { from: opened.from, to: nowMonotonic };
  const lastIdx = session.violations.length - 1;
  const violations = session.violations.slice();
  const last = violations[lastIdx];
  if (last) violations[lastIdx] = { ...last, durationMs, endedAt: nowWall };

  return {
    session: { ...session, pausedIntervals: intervals, violations, status: 'PAUSED' },
    counted: true,
    durationMs,
  };
}

/**
 * 违规总时长。
 *
 * 注意：`violations` 里可能含 `durationMs === 0` 的**未闭合候选**——
 * 开启违规时会先写入一条候选记录（保留"什么时候开始离开"这个事实），
 * 闭合时若未达 30 秒阈值再撤回。未闭合候选对总时长的贡献为 0。
 */
export function totalViolationMs(violations: ReadonlyArray<Violation>): number {
  return violations.reduce((sum, v) => sum + Math.max(0, v.durationMs), 0);
}

/** 已计为违规的记录（即已达阈值、有实际时长的那些） */
export function countedViolations(violations: ReadonlyArray<Violation>): Violation[] {
  return violations.filter((v) => v.durationMs > 0);
}

/** 是否存在尚未闭合的违规候选（用于 UI 提示"正在记录离开"） */
export function hasOpenViolationCandidate(violations: ReadonlyArray<Violation>): boolean {
  return violations.some((v) => v.endedAt === undefined);
}

/** 违规占比：分母为「有效 + 违规」（与技术设计 5.4 / economy 保持一致） */
export function violationRatio(effectiveMs: number, violations: ReadonlyArray<Violation>): number {
  const v = totalViolationMs(violations);
  const total = effectiveMs + v;
  return total <= 0 ? 0 : v / total;
}

// ─────────────────────────────────────────────────────────────
// 冷启动恢复（技术设计 5.1.4 / 异常 E2、E3）
// ─────────────────────────────────────────────────────────────

export type RecoveryAction = 'NONE' | 'RESUME_RUNNING' | 'AUTO_SETTLE' | 'PROMPT_ABANDONED';

export interface RecoveryResult {
  session?: SessionState;
  action: RecoveryAction;
  /** 给用户看的说明，UI 直接渲染 */
  message?: string;
}

/**
 * 应用启动时重建会话状态。必须在首次渲染之前调用。
 *
 * 处理三种情况：
 * 1. 已超时 → 进入 AWAITING_SETTLEMENT（等用户看到结算页，不自动发币）
 * 2. 检测到系统时间被改动 → 标记并暂停，提示用户
 * 3. 正常 → 继续运行
 */
export function reconstructSession(
  stored: SessionState | undefined,
  nowMonotonic: number,
  nowWall: number,
): RecoveryResult {
  if (!stored) return { action: 'NONE' };
  if (stored.status === 'SETTLED' || stored.status === 'ABANDONED') return { action: 'NONE' };

  // 页面关闭期间可能留下未闭合的暂停区间：用「计划结束时刻」或 now 收口（保守取较大值）
  const plannedEndMonotonic = stored.startedAtMonotonic + stored.plannedMs;
  const sealedIntervals = stored.pausedIntervals.map((iv) =>
    iv.to === undefined ? { from: iv.from, to: Math.min(nowMonotonic, Math.max(iv.from, plannedEndMonotonic)) } : iv,
  );
  const normalized: SessionState = { ...stored, pausedIntervals: sealedIntervals };

  const tick = computeTick({ session: normalized, nowMonotonic, nowWall });

  if (tick.shouldSettle) {
    return {
      session: { ...normalized, status: 'AWAITING_SETTLEMENT' },
      action: 'AUTO_SETTLE',
      message: '你有一个已到时间的会话，等你确认结算。',
    };
  }

  if (tick.clockAltered) {
    return {
      session: { ...normalized, status: 'PAUSED' },
      action: 'PROMPT_ABANDONED',
      message: '检测到系统时间被改动过。本次会话收益将按服务端时间核算。',
    };
  }

  return { session: { ...normalized, status: 'RUNNING' }, action: 'RESUME_RUNNING' };
}

// ─────────────────────────────────────────────────────────────
// 构造与时钟工具
// ─────────────────────────────────────────────────────────────

export interface NewSessionInput {
  kind: 'FOCUS' | 'LOCK';
  plannedMs: number;
  nowMonotonic: number;
  nowWall: number;
  /** 初始状态：到点自动进入时为 SCHEDULED（宽限期） */
  status?: SessionStatus;
}

export function createSession(input: NewSessionInput): SessionState {
  if (input.plannedMs <= 0) {
    throw new Error('plannedMs 必须为正数');
  }
  return {
    kind: input.kind,
    status: input.status ?? 'RUNNING',
    plannedMs: input.plannedMs,
    startedAtMonotonic: input.nowMonotonic,
    startedAtWall: input.nowWall,
    pausedIntervals: [],
    violations: [],
  };
}

/** 单调时钟可注入：测试用 FakeClock，生产用 performance */
export interface Clock {
  monotonic(): number;
  wall(): number;
}

export function performanceClock(): Clock {
  return {
    monotonic: () => performance.timeOrigin + performance.now(),
    wall: () => Date.now(),
  };
}

/** 把剩余毫秒格式化为 MM:SS（UI 用；不足 1 秒按 0 计） */
export function formatRemaining(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / TIME_UNITS.MS_PER_SECOND));
  const mm = Math.floor(total / TIME_UNITS.SECONDS_PER_MINUTE);
  const ss = total % TIME_UNITS.SECONDS_PER_MINUTE;
  const pad = (n: number): string => (n < PRECISION.SCALE ? `0${n}` : String(n));
  return `${pad(mm)}:${pad(ss)}`;
}

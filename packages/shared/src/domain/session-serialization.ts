/**
 * 会话状态的序列化。
 *
 * 为什么需要它：`RunnerState` 会被存进 KV 以支持冷启动恢复，而它有可选字段。
 * 在 `exactOptionalPropertyTypes` 下「显式 undefined」与「缺省」不等价，
 * 因此反序列化时必须**逐字段校验并只写有值的字段**，不能直接 `{...parsed}` 塞回去。
 *
 * 校验策略：宁可判定为「无法恢复」而丢掉会话，也不要把半截损坏状态当有效状态用
 * ——后者会让界面显示错误的剩余时间，比丢一次会话更糟。
 */
import type { ExitKind, PauseInterval, SessionStatus, SkipReason, Violation, ViolationSource } from '../types.ts';
import type { RunnerState, Settlement } from './session-runner.ts';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const SESSION_STATUSES: ReadonlyArray<SessionStatus> = [
  'SCHEDULED',
  'RUNNING',
  'PAUSED',
  'AWAITING_SETTLEMENT',
  'SETTLED',
  'ABANDONED',
];

const EXIT_KINDS: ReadonlyArray<ExitKind> = ['NONE', 'QUOTA_DAILY', 'QUOTA_MONTHLY', 'SKIP', 'BREACH', 'NATURAL'];

const VIOLATION_SOURCES: ReadonlyArray<ViolationSource> = [
  'VISIBILITY',
  'BLUR',
  'FULLSCREEN_EXIT',
  'NATIVE',
  'MANUAL',
];

const SKIP_REASONS: ReadonlyArray<SkipReason> = ['MEETING', 'CLASS', 'ILLNESS', 'URGENT', 'OTHER'];

function parsePauseIntervals(raw: unknown): PauseInterval[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PauseInterval[] = [];
  for (const item of raw) {
    if (!isObject(item) || !isFiniteNumber(item.from)) return undefined;
    out.push(isFiniteNumber(item.to) ? { from: item.from, to: item.to } : { from: item.from });
  }
  return out;
}

function parseViolations(raw: unknown): Violation[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Violation[] = [];
  for (const item of raw) {
    if (!isObject(item)) return undefined;
    if (!isFiniteNumber(item.startedAt) || !isFiniteNumber(item.durationMs)) return undefined;
    const source = VIOLATION_SOURCES.find((s) => s === item.source);
    if (!source) return undefined;
    const violation: Violation = {
      startedAt: item.startedAt,
      durationMs: item.durationMs,
      source,
    };
    if (isFiniteNumber(item.endedAt)) violation.endedAt = item.endedAt;
    if (typeof item.detail === 'string') violation.detail = item.detail;
    out.push(violation);
  }
  return out;
}

function parseSettlement(raw: unknown): Settlement | undefined {
  if (!isObject(raw)) return undefined;
  const breakdown = isObject(raw.reward) ? raw.reward.breakdown : undefined;
  if (!isObject(raw.reward) || !isObject(breakdown)) return undefined;
  const simple = (v: unknown): v is boolean => typeof v === 'boolean';
  if (
    !isFiniteNumber(raw.effectiveMs) ||
    !isFiniteNumber(raw.violationMs) ||
    !isFiniteNumber(raw.violationRatio) ||
    !isFiniteNumber(raw.breachDeduction) ||
    !isFiniteNumber(raw.balanceAfter) ||
    !isFiniteNumber(raw.settledAt) ||
    !isFiniteNumber(raw.reward.total) ||
    !isFiniteNumber(breakdown.base) ||
    !isFiniteNumber(breakdown.durationFactor) ||
    !isFiniteNumber(breakdown.qualityFactor) ||
    !isFiniteNumber(breakdown.punctual) ||
    !isFiniteNumber(breakdown.penalty) ||
    !simple(breakdown.capped)
  ) {
    return undefined;
  }
  const exitKind = EXIT_KINDS.find((k) => k === raw.exitKind);
  if (!exitKind) return undefined;

  return {
    effectiveMs: raw.effectiveMs,
    violationMs: raw.violationMs,
    violationRatio: raw.violationRatio,
    reward: {
      total: raw.reward.total,
      breakdown: {
        base: breakdown.base,
        durationFactor: breakdown.durationFactor,
        qualityFactor: breakdown.qualityFactor,
        punctual: breakdown.punctual,
        penalty: breakdown.penalty,
        capped: breakdown.capped,
      },
    },
    exitKind,
    breachDeduction: raw.breachDeduction,
    balanceAfter: raw.balanceAfter,
    settledAt: raw.settledAt,
  };
}

/** 序列化为可安全存进 KV 的普通对象 */
export function packRunner(state: RunnerState): Json {
  const out: Json = {
    title: state.title,
    punctual: state.punctual,
    session: {
      kind: state.session.kind,
      status: state.session.status,
      plannedMs: state.session.plannedMs,
      startedAtMonotonic: state.session.startedAtMonotonic,
      startedAtWall: state.session.startedAtWall,
      pausedIntervals: state.session.pausedIntervals.map((iv) =>
        iv.to === undefined ? { from: iv.from } : { from: iv.from, to: iv.to },
      ),
      violations: state.session.violations.map((v) => ({
        startedAt: v.startedAt,
        durationMs: v.durationMs,
        source: v.source,
        ...(v.endedAt === undefined ? {} : { endedAt: v.endedAt }),
        ...(v.detail === undefined ? {} : { detail: v.detail }),
      })),
      ...(state.session.endedAt === undefined ? {} : { endedAt: state.session.endedAt }),
    },
  };
  if (state.taskId !== undefined) out.taskId = state.taskId;
  if (state.settlement !== undefined) out.settlement = state.settlement;
  return out;
}

/**
 * 反序列化。任何字段不合法都返回 undefined（宁丢会话不显示错误时间）。
 */
export function unpackRunner(raw: unknown): RunnerState | undefined {
  if (!isObject(raw)) return undefined;
  const session = raw.session;
  if (!isObject(session)) return undefined;

  if (session.kind !== 'FOCUS' && session.kind !== 'LOCK') return undefined;
  const status = SESSION_STATUSES.find((s) => s === session.status);
  if (!status) return undefined;
  if (
    !isFiniteNumber(session.plannedMs) ||
    session.plannedMs <= 0 ||
    !isFiniteNumber(session.startedAtMonotonic) ||
    !isFiniteNumber(session.startedAtWall)
  ) {
    return undefined;
  }

  const pausedIntervals = parsePauseIntervals(session.pausedIntervals);
  const violations = parseViolations(session.violations);
  if (!pausedIntervals || !violations) return undefined;
  if (typeof raw.title !== 'string' || typeof raw.punctual !== 'boolean') return undefined;

  const state: RunnerState = {
    session: {
      kind: session.kind,
      status,
      plannedMs: session.plannedMs,
      startedAtMonotonic: session.startedAtMonotonic,
      startedAtWall: session.startedAtWall,
      pausedIntervals,
      violations,
    },
    title: raw.title,
    punctual: raw.punctual,
  };
  if (isFiniteNumber(session.endedAt)) state.session.endedAt = session.endedAt;
  if (typeof raw.taskId === 'string' && raw.taskId.length > 0) state.taskId = raw.taskId;

  const settlement = parseSettlement(raw.settlement);
  if (settlement) state.settlement = settlement;

  return state;
}

/** 跳过原因解析（表单与结算共用） */
export function parseSkipReason(value: unknown): SkipReason | undefined {
  return SKIP_REASONS.find((r) => r === value);
}

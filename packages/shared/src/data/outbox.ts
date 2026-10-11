/**
 * 结算队列（outbox）状态机。纯函数，零依赖，可确定性测试。
 *
 * 依据技术设计 5.3.1 / 5.3.2 与 AGENTS.md 第 4 节：
 * - outbox **只承载 4 类出网请求**：SETTLE / CONSUME_QUOTA / CLAIM_GRANT / AI_NUTRITION
 * - 待办、宠物、饮食、记账等纯本地数据**永不进队列**（它们没有远端目的地）
 * - 网络失败按指数退避重试；反复失败进入 DEAD 并在设置页可见（绝不静默丢弃）
 *
 * 状态流转：
 *   PENDING ──claim──▶ IN_FLIGHT ──succeed──▶ (删除)
 *                              └──fail──▶ FAILED ──到期──▶ PENDING（重试）
 *                                            └──超过上限──▶ DEAD
 */
import type { OutboxKind, OutboxRecord } from './db.ts';

/** 出网操作类型白名单：把纯本地数据塞进队列会在编译期被挡住 */
export const OUTBOX_KINDS: ReadonlyArray<OutboxKind> = [
  'SETTLE',
  'CONSUME_QUOTA',
  'CLAIM_GRANT',
  'AI_NUTRITION',
];

export const OUTBOX_POLICY = {
  /** 单条最大尝试次数，超过进 DEAD */
  maxAttempts: 8,
  /** 退避基数（毫秒） */
  baseBackoffMs: 1_000,
  /** 退避上限（毫秒） */
  maxBackoffMs: 5 * 60_000,
  /** 单次批量最多取多少条 */
  batchSize: 20,
  /**
   * IN_FLIGHT 超时：进程崩溃会留下卡在 IN_FLIGHT 的记录，
   * 超过此时长视为可重新领取。
   */
  inFlightTimeoutMs: 2 * 60_000,
} as const;

export interface EnqueueInput {
  kind: OutboxKind;
  payload: unknown;
  /** 幂等键：同一条业务操作重试时必须复用同一个 id */
  id: string;
  now: number;
}

/** 幂等：若同 id 已存在则不重复入队 */
export function enqueue(
  existing: ReadonlyArray<OutboxRecord>,
  input: EnqueueInput,
): OutboxRecord[] {
  if (!OUTBOX_KINDS.includes(input.kind)) {
    throw new Error(`不允许的出网操作类型：${input.kind}（outbox 只承载结算与 AI 请求）`);
  }
  if (existing.some((r) => r.id === input.id)) return [...existing];
  const record: OutboxRecord = {
    id: input.id,
    kind: input.kind,
    payloadJson: JSON.stringify(input.payload),
    status: 'PENDING',
    attempts: 0,
    nextRetryAt: input.now,
    createdAt: input.now,
  };
  return [...existing, record];
}

/**
 * 取出可处理的记录：
 * - PENDING / FAILED 且已到重试时间
 * - IN_FLIGHT 但已超时（上一次进程可能崩了）
 */
export function selectDue(
  records: ReadonlyArray<OutboxRecord>,
  now: number,
  limit: number = OUTBOX_POLICY.batchSize,
): OutboxRecord[] {
  return records
    .filter((r) => {
      if (r.status === 'DEAD') return false;
      if (r.status === 'IN_FLIGHT') return now - r.nextRetryAt >= OUTBOX_POLICY.inFlightTimeoutMs;
      return r.nextRetryAt <= now;
    })
    .sort((a, b) => a.nextRetryAt - b.nextRetryAt)
    .slice(0, Math.max(0, limit));
}

/** 标记为发送中（同时把 nextRetryAt 当作「领取时刻」用于超时判断） */
export function markInFlight(records: ReadonlyArray<OutboxRecord>, id: string, now: number): OutboxRecord[] {
  return records.map((r) =>
    r.id === id ? { ...r, status: 'IN_FLIGHT' as const, attempts: r.attempts + 1, nextRetryAt: now } : r,
  );
}

/** 成功：从队列移除（幂等键随业务记录一起留在业务表里） */
export function markSucceeded(records: ReadonlyArray<OutboxRecord>, id: string): OutboxRecord[] {
  return records.filter((r) => r.id !== id);
}

/** 指数退避：1s、2s、4s … 上限 OUTBOX_POLICY.maxBackoffMs */
export function backoffFor(attempts: number, random: () => number = Math.random): number {
  const a = Math.max(0, attempts);
  // 2^(a-1) 增长，加 ±20% 抖动避免多设备同时重试造成尖峰
  const base = OUTBOX_POLICY.baseBackoffMs * 2 ** Math.min(a, 12);
  const jitter = 0.8 + 0.4 * random();
  return Math.min(OUTBOX_POLICY.maxBackoffMs, Math.round(base * jitter));
}

export interface FailResult {
  records: OutboxRecord[];
  /** 是否已进入 DEAD（需要 UI 提醒用户） */
  dead: boolean;
}

/**
 * 标记失败：
 * - 未超过 maxAttempts → FAILED，并按退避安排下次重试
 * - 超过 → DEAD，必须让用户在设置页看到「N 条数据结算失败」
 */
export function markFailed(
  records: ReadonlyArray<OutboxRecord>,
  id: string,
  error: string,
  now: number,
  random: () => number = Math.random,
): FailResult {
  let dead = false;
  const next = records.map((r) => {
    if (r.id !== id) return r;
    if (r.attempts >= OUTBOX_POLICY.maxAttempts) {
      dead = true;
      return { ...r, status: 'DEAD' as const, lastError: error };
    }
    return {
      ...r,
      status: 'FAILED' as const,
      lastError: error,
      nextRetryAt: now + backoffFor(r.attempts, random),
    };
  });
  return { records: next, dead };
}

/** 需要用户注意的条目（DEAD 或尝试次数较多） */
export function needsAttention(records: ReadonlyArray<OutboxRecord>): OutboxRecord[] {
  return records.filter((r) => r.status === 'DEAD' || r.attempts >= OUTBOX_POLICY.maxAttempts);
}

/** 队列概况，供设置页展示「本月结算调用量」 */
export interface OutboxStats {
  pending: number;
  inFlight: number;
  failed: number;
  dead: number;
  totalAttempts: number;
}

export function summarizeOutbox(records: ReadonlyArray<OutboxRecord>): OutboxStats {
  const stats: OutboxStats = { pending: 0, inFlight: 0, failed: 0, dead: 0, totalAttempts: 0 };
  for (const r of records) {
    if (r.status === 'PENDING') stats.pending += 1;
    else if (r.status === 'IN_FLIGHT') stats.inFlight += 1;
    else if (r.status === 'FAILED') stats.failed += 1;
    else stats.dead += 1;
    stats.totalAttempts += r.attempts;
  }
  return stats;
}

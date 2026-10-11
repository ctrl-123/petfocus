/**
 * 会话钩子：把领域层的会话运行器接到真实时钟、平台能力与仓储。
 *
 * 这是 M4 的关键接线层，遵守以下铁律：
 * - **计时靠单调时钟**（ADR-003）：`performance.timeOrigin + performance.now()`，
 *   绝不信任 `Date.now()` 的增量。`Date.now()` 只用于展示与时钟偏差检测。
 * - **每秒只重绘，不落盘**：持久化只发生在状态变更与 15 秒心跳时（AGENTS.md 第 4 节）。
 * - **页面不可见时降频**：后台标签页会被节流，但我们本来就不依赖定时器计时。
 * - **结算必须落账**：收益/罚款写进 coinLedger，越界还要让宠物「蔫」（永不死亡）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PENALTY,
  dayKeyOf,
  describeExitOptions,
  describeProgress,
  grantEntries,
  isTerminal,
  noteLeave,
  noteReturn,
  packRunner,
  planExit,
  recoverRunner,
  resumeRunning,
  settleSession,
  startRunner,
  unpackRunner,
  type ExitOptions,
  type ProgressInfo,
  type QuotaEntry,
  type RunnerContext,
  type RunnerState,
  type SessionKind,
  type SkipReason,
} from '@petfocus/shared';
import { getRuntime } from '../../app/runtime.ts';
import type { Platform } from '../../platform/index.ts';

/** 活跃会话在 KV 里的键 */
const KV_ACTIVE_SESSION = 'session.active';
/** 心跳落盘间隔（仅兜底，不是计时依据） */
const HEARTBEAT_MS = 15_000;

export interface UseSessionResult {
  state: RunnerState | undefined;
  progress: ProgressInfo | undefined;
  exitOptions: ExitOptions | undefined;
  /** 结算完成后的结果（用于展示结算页） */
  settlement: RunnerState['settlement'] | undefined;
  /** 本次违规被计入的提示文案（用于短暂的红色提示） */
  violationNotice: string | undefined;
  /** 恢复/异常提示 */
  notice: string | undefined;
  start: (input: StartInput) => Promise<void>;
  /** 结束会话。NATURAL 用于时间到；EARLY 为用户提前结束；SKIP 为本次跳过 */
  finish: (request: FinishRequest) => Promise<void>;
  dismissSettlement: () => void;
}

export interface StartInput {
  kind: SessionKind;
  plannedMs: number;
  title: string;
  taskId?: string;
  plannedStartAt?: number;
  startAsScheduled?: boolean;
}

export type FinishRequest =
  | { kind: 'NATURAL' }
  | { kind: 'EARLY' }
  | { kind: 'SKIP'; reason: SkipReason };

/** 单调时钟：与墙钟同量级，便于做偏差检测 */
function monotonicNow(): number {
  if (typeof performance === 'undefined') return Date.now();
  return performance.timeOrigin + performance.now();
}

/** 从仓储汇总出一次会话所需的上下文 */
async function buildContext(nowWall: number, nowMonotonic: number): Promise<RunnerContext> {
  const { repositories } = getRuntime();
  const dayKey = dayKeyOf(nowWall);
  const monthKey = dayKey.slice(0, 7);

  const [ledger, earned, balance, todaySessions] = await Promise.all([
    repositories.quotaLedger.allEntries(),
    repositories.coinLedger.earnedOnDay(dayKey),
    repositories.coinLedger.balance(),
    repositories.sessions.byDay(dayKey),
  ]);

  // 若本周期尚未发放配额，先补发（离线时本地乐观发放，联网后由服务端校正）
  const keys = { daily: dayKey, monthly: monthKey };
  const needsGrant = (['FOCUS_DAILY', 'FOCUS_MONTHLY', 'LOCK_MONTHLY'] as const).filter((scope) => {
    const periodKey = scope === 'FOCUS_DAILY' ? keys.daily : keys.monthly;
    return !ledger.some((e) => e.scope === scope && e.kind === 'GRANT' && e.periodKey === periodKey);
  });
  let effectiveLedger: QuotaEntry[] = ledger;
  if (needsGrant.length > 0) {
    const entries = grantEntries(needsGrant, keys);
    await Promise.all(
      entries.map((entry, index) =>
        repositories.quotaLedger.put({
          id: `grant-${entry.scope}-${entry.periodKey}-${index}`,
          scope: entry.scope,
          kind: 'GRANT',
          periodKey: entry.periodKey,
          ...(entry.amount === undefined ? {} : { amount: entry.amount }),
          serverTime: 0, // 0 = 本地乐观记录，待服务端确认
          confirmed: false,
        }),
      ),
    );
    effectiveLedger = [...ledger, ...entries];
  }

  const priorLockSessionsToday = todaySessions.filter(
    (s) => s.kind === 'LOCK' && (s.status === 'SETTLED' || s.status === 'AWAITING_SETTLEMENT'),
  ).length;

  // 今日已用的「本次跳过」次数：从会话记录里统计（跳过的会话 exitKind 为 SKIP）
  const skipsUsedToday = todaySessions.filter((s) => s.exitKind === 'SKIP').length;

  return {
    nowMonotonic,
    nowWall,
    quotaLedger: effectiveLedger,
    dailyEarnedCoin: earned,
    coinBalance: balance,
    skipsUsedToday,
    priorLockSessionsToday,
    periodKeys: keys,
  };
}

export function useSession(platform: Platform, now: number): UseSessionResult {
  const [state, setState] = useState<RunnerState | undefined>(undefined);
  const [progress, setProgress] = useState<ProgressInfo | undefined>(undefined);
  const [exitOptions, setExitOptions] = useState<ExitOptions | undefined>(undefined);
  const [violationNotice, setViolationNotice] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  /** 用 ref 保存最新状态，避免闭包捕获旧值（事件回调需要它） */
  const runnerRef = useRef<RunnerState | undefined>(undefined);
  const lastPersistRef = useRef<number>(0);
  const settlingRef = useRef(false);

  const persist = useCallback(async (next: RunnerState | undefined): Promise<void> => {
    const { kv } = getRuntime();
    if (!next) {
      await kv.delete(KV_ACTIVE_SESSION);
      return;
    }
    await kv.set(KV_ACTIVE_SESSION, packRunner(next));
    lastPersistRef.current = Date.now();
  }, []);

  const apply = useCallback(
    (next: RunnerState | undefined, options: { persist?: boolean } = {}): void => {
      runnerRef.current = next;
      setState(next);
      if (options.persist !== false) void persist(next);
    },
    [persist],
  );

  /** 启动时恢复未完成的会话 */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { kv } = getRuntime();
      const stored = await kv.get<unknown>(KV_ACTIVE_SESSION);
      if (cancelled || !stored) return;
      const packed = unpackRunner(stored);
      if (!packed) return;
      const recovered = recoverRunner(packed, monotonicNow(), Date.now());
      if (cancelled) return;
      if (recovered.action === 'NONE') return;
      apply(recovered.state, { persist: false });
      if (recovered.message) setNotice(recovered.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const finishInternal = useCallback(
    async (request: FinishRequest): Promise<void> => {
      const current = runnerRef.current;
      if (!current || isTerminal(current)) return;

      const nowWall = Date.now();
      const mono = monotonicNow();
      const ctx = await buildContext(nowWall, mono);

      const plan = planExit(current, request, ctx);
      if (plan.decision.type === 'REJECTED') {
        setNotice('今天的「本次跳过」已用完，请用退出机会或稍后再试。');
        return;
      }

      // 写入配额消耗（越界不写消耗记录）
      const { repositories } = getRuntime();
      if (plan.decision.type === 'QUOTA' && plan.decision.entries.length > 0) {
        // 跳过原因只在 SKIP 时才有值，因此用条件展开而不是传 undefined
        const skipReason =
          request.kind === 'SKIP' && 'reason' in request ? request.reason : undefined;
        for (const entry of plan.decision.entries) {
          await repositories.quotaLedger.put({
            id: `consume-${current.session.startedAtWall}-${entry.scope}`,
            scope: entry.scope,
            kind: entry.kind,
            periodKey: entry.periodKey,
            ...(entry.amount === undefined ? {} : { amount: entry.amount }),
            ...(skipReason === undefined ? {} : { reason: skipReason }),
            serverTime: 0,
            confirmed: false,
          });
        }
      }

      const settled = settleSession({
        state: current,
        exitKind: plan.exitKind,
        ctx,
        ...(plan.decision.type === 'SKIP' ? { skipCoin: plan.decision.coinCost } : {}),
        ...(plan.decision.type === 'BREACH' ? { breachCoin: plan.decision.coinCost } : {}),
      });

      const settlement = settled.state.settlement;
      if (settlement) {
        const dayKey = dayKeyOf(nowWall);
        // 收益入账（>0 才写记录，避免产生一堆 0 币流水）
        if (settlement.reward.total > 0) {
          await repositories.coinLedger.put({
            id: `earn-${current.session.startedAtWall}`,
            kind: current.session.kind === 'FOCUS' ? 'FOCUS_DONE' : 'LOCK_DONE',
            amount: settlement.reward.total,
            balanceAfter: settlement.balanceAfter,
            refId: `${current.session.startedAtWall}`,
            dayKey,
            serverTime: 0,
            confirmed: false,
            note: current.title,
          });
        }
        // 罚款入账
        if (settlement.breachDeduction > 0) {
          await repositories.coinLedger.put({
            id: `penalty-${current.session.startedAtWall}`,
            kind: 'PENALTY',
            amount: -settlement.breachDeduction,
            balanceAfter: settlement.balanceAfter,
            refId: `${current.session.startedAtWall}`,
            dayKey,
            serverTime: 0,
            confirmed: false,
            note: plan.exitKind === 'BREACH' ? '配额用尽强行退出' : '本次跳过',
          });
        }
        // 越界 → 宠物蔫一段时间（**永不死亡**，见 AGENTS.md 原则 3）
        if (plan.exitKind === 'BREACH') {
          const pet = await repositories.pet.get();
          if (pet) {
            await repositories.pet.put({
              ...pet,
              wiltingUntil: nowWall + PENALTY.wiltingMs,
              updatedAt: nowWall,
            });
          }
        }
        // 会话记录落盘（供统计与冷启动恢复）
        await repositories.sessions.put({
          id: `s-${current.session.startedAtWall}`,
          kind: current.session.kind,
          status: settled.state.session.status,
          ...(current.taskId === undefined ? {} : { taskId: current.taskId }),
          title: current.title,
          plannedMs: current.session.plannedMs,
          startedAtMonotonic: current.session.startedAtMonotonic,
          startedAtWall: current.session.startedAtWall,
          endedAt: nowWall,
          pausedIntervals: [...current.session.pausedIntervals],
          violations: [...current.session.violations],
          effectiveMs: settlement.effectiveMs,
          exitKind: plan.exitKind,
          rewardCoin: settlement.reward.total,
          updatedAt: nowWall,
        });
      }

      apply(settled.state);
      await platform.fullscreen.exit();
      await platform.wakeLock.release();
      settlingRef.current = false;
    },
    [apply, platform],
  );

  /** 每秒推进：只做重绘与阈值判定，不落盘 */
  useEffect(() => {
    const current = runnerRef.current;
    if (!current || isTerminal(current)) return;

    let cancelled = false;
    void (async () => {
      const mono = monotonicNow();
      const ctx = await buildContext(Date.now(), mono);
      if (cancelled || !runnerRef.current) return;

      const info = describeProgress(runnerRef.current, ctx);
      setProgress(info);
      setExitOptions(describeExitOptions(runnerRef.current, ctx));

      // 时间到 → 自动结算（只做一次）
      if (info.remainingMs <= 0 && !settlingRef.current) {
        settlingRef.current = true;
        await finishInternal({ kind: 'NATURAL' });
      }

      // 心跳落盘（兜底，防止崩溃丢太多进度）
      if (Date.now() - lastPersistRef.current >= HEARTBEAT_MS) {
        void persist(runnerRef.current);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [now, persist, finishInternal]);

  /** 离开/返回检测：接平台适配器 */
  useEffect(() => {
    const offLeave = platform.visibility.onLeave(() => {
      const current = runnerRef.current;
      if (!current || isTerminal(current)) return;
      apply(noteLeave(current, monotonicNow(), Date.now(), 'VISIBILITY'));
    });
    const offReturn = platform.visibility.onReturn(() => {
      const current = runnerRef.current;
      if (!current || isTerminal(current)) return;
      const mono = monotonicNow();
      const result = noteReturn(current, mono, Date.now());
      if (result.counted) {
        setViolationNotice(`离开超过 30 秒，已暂停计时并计入违规（${Math.round(result.durationMs / 1000)} 秒）`);
        window.setTimeout(() => setViolationNotice(undefined), 6000);
      } else {
        apply(resumeRunning(result.state));
        return;
      }
      apply(result.state);
    });
    return () => {
      offLeave();
      offReturn();
    };
  }, [platform, apply]);

  /** 全屏被 ESC 退出时也记一次违规线索（浏览器保留的逃生通道，无法屏蔽） */
  useEffect(() => {
    const off = platform.fullscreen.onChange(() => {
      const current = runnerRef.current;
      if (!current || isTerminal(current)) return;
      if (platform.fullscreen.isActive()) return;
      setViolationNotice('你退出了全屏。桌面增强包安装后才能彻底阻止这类退出。');
      window.setTimeout(() => setViolationNotice(undefined), 6000);
    });
    return off;
  }, [platform]);

  const start = useCallback(
    async (input: StartInput): Promise<void> => {
      const mono = monotonicNow();
      const wall = Date.now();

      // 按 exactOptionalPropertyTypes 的要求：可选字段用条件展开，不传 undefined
      const started = startRunner({
        kind: input.kind,
        plannedMs: input.plannedMs,
        title: input.title,
        nowMonotonic: mono,
        nowWall: wall,
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        ...(input.plannedStartAt === undefined ? {} : { plannedStartAt: input.plannedStartAt }),
        ...(input.startAsScheduled === undefined ? {} : { startAsScheduled: input.startAsScheduled }),
      });

      settlingRef.current = false;
      apply(started);
      setNotice(undefined);

      // 全屏必须在用户手势中调用，因此由点击事件触发（AC-1.4.4 / E9）
      await platform.fullscreen.request(document.documentElement);
      await platform.wakeLock.acquire();
      // 通知权限也一并申请；被拒绝不影响主流程（AC：通知权限被拒时的降级）
      await platform.notification.request();
    },
    [apply, platform],
  );

  const finish = useCallback(
    async (request: FinishRequest): Promise<void> => {
      await finishInternal(request);
    },
    [finishInternal],
  );

  const dismissSettlement = useCallback((): void => {
    apply(undefined);
    setProgress(undefined);
    setExitOptions(undefined);
  }, [apply]);

  return {
    state,
    progress,
    exitOptions,
    settlement: state?.settlement,
    violationNotice,
    notice,
    start,
    finish,
    dismissSettlement,
  };
}

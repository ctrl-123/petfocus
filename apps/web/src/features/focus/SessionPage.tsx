import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PENALTY,
  formatDuration,
  pickFocusRewardCopy,
  pickCopy,
  rewardTierOf,
  TASK_DONE_COPY,
  LOCK_REWARD_COPY,
  type RunnerState,
  type SkipReason,
} from '@petfocus/shared';
import { Button } from '../../components/Button.tsx';
import { Modal } from '../../components/Modal.tsx';
import type { UseSessionResult } from './use-session.ts';

interface SessionPageProps {
  session: UseSessionResult;
  /** 是否是锁机会话（只影响文案与标题） */
  mode: 'FOCUS' | 'LOCK';
  onClosed: () => void;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(mm)}:${pad(ss)}`;
}

const SKIP_REASONS: ReadonlyArray<{ value: SkipReason; label: string }> = [
  { value: 'MEETING', label: '会议' },
  { value: 'CLASS', label: '上课' },
  { value: 'ILLNESS', label: '身体不适' },
  { value: 'URGENT', label: '紧急事务' },
  { value: 'OTHER', label: '其他' },
];

/**
 * 专注/锁机会话页（PRD FR-1.3 / FR-3）。
 *
 * 关键行为：
 * - 停留在此页时持续尝试保持全屏（用户按 ESC 退出会被记录，见 AC-1.4.4）
 * - **退出前必须看到代价**（AC：点退出前必须显示"将消耗今日唯一一次机会"）
 * - 越界退出需要输入「确认」二字（AC-1.4.7 的强确认）
 * - 不做任何"已拦截应用"的表述——Web 端做不到（AGENTS.md 原则 1）
 */
export function SessionPage({ session, mode, onClosed }: SessionPageProps): JSX.Element | null {
  const { state, progress, exitOptions, violationNotice, notice } = session;
  const [exitOpen, setExitOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const fullscreenRetryRef = useRef(0);

  const title = mode === 'FOCUS' ? '专注中' : '锁机中';

  /** 会话进行中若失去全屏，有限次尝试重新获取（AC-1.4.4：最多 3 次、间隔 5 秒） */
  useEffect(() => {
    if (!state || state.settlement) return;
    const timer = window.setInterval(() => {
      if (fullscreenRetryRef.current >= 3) return;
      if (document.fullscreenElement === null) {
        fullscreenRetryRef.current += 1;
        void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [state]);

  const settlement = state?.settlement;

  /** 结算话术：按档位选取（同一次结算内保持稳定，用 useMemo 固定） */
  const settlementCopy = useMemo(() => {
    if (!settlement) return '';
    const completion =
      settlement.effectiveMs <= 0 || state?.session.plannedMs === 0
        ? 0
        : settlement.effectiveMs / (state?.session.plannedMs ?? 1);
    const tier = rewardTierOf({
      exitKind: settlement.exitKind,
      completion,
      violationRatio: settlement.violationRatio,
    });
    if (mode === 'LOCK') return pickCopy(LOCK_REWARD_COPY);
    if (settlement.exitKind === 'NATURAL' && tier === 'S') return pickFocusRewardCopy(tier);
    return pickFocusRewardCopy(tier);
  }, [settlement, mode, state?.session.plannedMs]);

  if (!state) return null;

  // ── 结算视图 ──────────────────────────────────────────────
  if (settlement) {
    const completion =
      state.session.plannedMs === 0 ? 0 : settlement.effectiveMs / state.session.plannedMs;
    const isBreach = settlement.exitKind === 'BREACH';
    const isSkip = settlement.exitKind === 'SKIP';
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-100 p-4">
        <div className="w-full max-w-md rounded-card bg-white p-5 shadow-xl">
          <h2 className="text-lg font-semibold text-ink-900">
            {isBreach ? '本次已结束' : isSkip ? '已跳过这次' : '完成'}
          </h2>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">有效时长</dt>
              <dd className="font-medium tabular-nums text-ink-900">{formatDuration(settlement.effectiveMs)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">完成度</dt>
              <dd className="font-medium tabular-nums text-ink-900">{Math.round(completion * 100)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">离开累计</dt>
              <dd className="font-medium tabular-nums text-ink-900">
                {settlement.violationMs > 0 ? `${Math.round(settlement.violationMs / 1000)} 秒` : '无'}
              </dd>
            </div>
            <div className="flex justify-between border-t border-ink-200 pt-2">
              <dt className="text-ink-500">获得金币</dt>
              <dd className="font-semibold tabular-nums text-moss-deep">+{settlement.reward.total}</dd>
            </div>
            {settlement.breachDeduction > 0 ? (
              <div className="flex justify-between">
                <dt className="text-ink-500">{isBreach ? '越界扣罚' : '跳过扣罚'}</dt>
                <dd className="font-semibold tabular-nums text-clay-deep">−{settlement.breachDeduction}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-ink-500">余额</dt>
              <dd className="font-medium tabular-nums text-ink-900">{settlement.balanceAfter}</dd>
            </div>
          </dl>

          {isBreach ? (
            <p className="mt-4 rounded-lg bg-clay-soft/25 p-3 text-sm text-clay-deep">
              配额已用尽，本次收益清零。宠物会蔫 {PENALTY.wiltingMs / 60_000} 分钟 —— 它不会离开你。
            </p>
          ) : null}

          {settlementCopy ? (
            <p className="mt-4 rounded-lg bg-amber-soft/25 p-3 text-sm text-ink-700">{settlementCopy}</p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                session.dismissSettlement();
                onClosed();
              }}
            >
              稍后
            </Button>
            <Button
              onClick={() => {
                session.dismissSettlement();
                onClosed();
              }}
            >
              回到首页
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── 进行中视图 ────────────────────────────────────────────
  const remaining = progress?.remainingMs ?? state.session.plannedMs;
  const progressRatio = progress?.progress ?? 0;
  const circumference = 2 * Math.PI * 52;
  const dash = circumference * (1 - progressRatio);

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-ink-100 p-6">
      <p className="text-sm text-ink-500">{title}</p>
      <h2 className="mt-1 max-w-md text-center text-lg font-medium text-ink-900">{state.title}</h2>

      {/* 计时环：剩余时间是页面上最大的元素（PRD 13.3 原则 1） */}
      <div className="relative mt-6">
        <svg width="128" height="128" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" className="text-ink-200" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="currentColor"
            className={progress?.isPaused ? 'text-clay-base' : 'text-amber-base'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dash}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums text-ink-900">{formatClock(remaining)}</span>
          <span className="text-xs text-ink-400">{Math.round(progressRatio * 100)}%</span>
        </div>
      </div>

      {/* 状态：如实标注约束等级（AGENTS.md 原则 1） */}
      <div className="mt-6 w-full max-w-sm space-y-2 text-sm">
        <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-500">
          软约束模式：浏览器无法阻止其他程序启动。切走超过 30 秒会计为违规并暂停计时。
        </p>

        {progress?.isPaused ? (
          <p role="alert" className="rounded-lg bg-clay-soft/25 px-3 py-2 text-clay-deep">
            计时已暂停{progress.violationCount > 0 ? `（已记录 ${progress.violationCount} 次离开）` : ''}
          </p>
        ) : null}

        {violationNotice ? (
          <p role="alert" className="rounded-lg bg-clay-soft/25 px-3 py-2 text-clay-deep">
            {violationNotice}
          </p>
        ) : null}

        {notice ? <p className="rounded-lg bg-amber-soft/25 px-3 py-2 text-ink-700">{notice}</p> : null}

        {progress?.clockAltered ? (
          <p role="alert" className="rounded-lg bg-amber-soft/25 px-3 py-2 text-ink-700">
            检测到系统时间被改动。本次结算以服务端时间为准。
          </p>
        ) : null}

        {exitOptions ? (
          <div className="rounded-lg bg-white/70 px-3 py-2 text-xs text-ink-600 ring-1 ring-ink-200">
            <div className="flex justify-between">
              <span>今日退出机会</span>
              <span className="tabular-nums">
                {exitOptions.quotaRemaining.daily}/{mode === 'FOCUS' ? 1 : 0}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>本月剩余</span>
              <span className="tabular-nums">{exitOptions.quotaRemaining.monthly}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>本次跳过剩余</span>
              <span className="tabular-nums">{exitOptions.skipsRemainingToday}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>预计收益</span>
              <span className="tabular-nums text-moss-deep">+{progress?.projectedCoin ?? 0}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={() => setExitOpen(true)}>
          结束本次
        </Button>
        {mode === 'FOCUS' && exitOptions?.canSkip ? (
          <Button variant="ghost" onClick={() => setSkipOpen(true)}>
            本次跳过
          </Button>
        ) : null}
      </div>

      {/* 退出确认：先展示代价（AC：点退出前必须看到代价） */}
      <ExitConfirmModal
        open={exitOpen}
        exitOptions={exitOptions}
        isBreach={exitOptions?.upfrontCost.kind === 'BREACH'}
        confirmText={confirmText}
        onConfirmTextChange={setConfirmText}
        onCancel={() => {
          setExitOpen(false);
          setConfirmText('');
        }}
        onConfirm={() => {
          setExitOpen(false);
          setConfirmText('');
          void session.finish(exitOptions?.upfrontCost.kind === 'BREACH' ? { kind: 'EARLY' } : { kind: 'EARLY' });
        }}
      />

      {/* 跳过原因选择（AC-1.4.6：跳过不消耗月配额，但要填原因） */}
      <SkipModal
        open={skipOpen}
        onCancel={() => setSkipOpen(false)}
        onConfirm={(reason) => {
          setSkipOpen(false);
          void session.finish({ kind: 'SKIP', reason });
        }}
      />
    </div>
  );
}

interface ExitConfirmModalProps {
  open: boolean;
  exitOptions: UseSessionResult['exitOptions'];
  isBreach: boolean;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function ExitConfirmModal({
  open,
  exitOptions,
  isBreach,
  confirmText,
  onConfirmTextChange,
  onCancel,
  onConfirm,
}: ExitConfirmModalProps): JSX.Element {
  const canConfirm = !isBreach || confirmText.trim() === '确认';
  return (
    <Modal open={open} titleId="exit-confirm-title" dismissOnOverlay onDismiss={onCancel}>
      <h3 id="exit-confirm-title" className="text-base font-semibold text-ink-900">
        确定要结束吗？
      </h3>
      <p className="mt-2 text-sm text-ink-600">
        {exitOptions?.upfrontCost.description ?? '本次会话将立即结束。'}
      </p>

      {isBreach ? (
        <div className="mt-4">
          <label htmlFor="exit-confirm-input" className="text-sm text-ink-700">
            这是不可逆的重罚。请输入「确认」两字继续：
          </label>
          <input
            id="exit-confirm-input"
            type="text"
            value={confirmText}
            onChange={(event) => onConfirmTextChange(event.target.value)}
            className="mt-2 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep"
            placeholder="确认"
          />
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          继续专注
        </Button>
        <Button variant={isBreach ? 'danger' : 'primary'} disabled={!canConfirm} onClick={onConfirm}>
          {isBreach ? '确认结束' : '结束本次'}
        </Button>
      </div>
    </Modal>
  );
}

interface SkipModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: SkipReason) => void;
}

function SkipModal({ open, onCancel, onConfirm }: SkipModalProps): JSX.Element {
  const [reason, setReason] = useState<SkipReason>('MEETING');
  return (
    <Modal open={open} titleId="skip-title" dismissOnOverlay onDismiss={onCancel}>
      <h3 id="skip-title" className="text-base font-semibold text-ink-900">
        本次跳过
      </h3>
      <p className="mt-2 text-sm text-ink-600">
        跳过不消耗本月退出机会，但会扣 {PENALTY.skipCoin} 金币，并计入统计的跳过率。遇到真实情况就该用它。
      </p>
      <fieldset className="mt-4">
        <legend className="text-sm text-ink-700">原因（会记录在案的）</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SKIP_REASONS.map((item) => (
            <label
              key={item.value}
              className={[
                'cursor-pointer rounded-lg border px-3 py-1.5 text-sm',
                reason === item.value
                  ? 'border-amber-base bg-amber-soft/30 text-ink-900'
                  : 'border-ink-300 text-ink-600',
              ].join(' ')}
            >
              <input
                type="radio"
                name="skip-reason"
                value={item.value}
                checked={reason === item.value}
                onChange={() => setReason(item.value)}
                className="sr-only"
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          返回
        </Button>
        <Button onClick={() => onConfirm(reason)}>确认跳过</Button>
      </div>
    </Modal>
  );
}

/** 待办完成时的小提示（可复用于首页） */
export function pickTaskDoneCopy(random?: () => number): string {
  return pickCopy(TASK_DONE_COPY, random);
}

export type { RunnerState };

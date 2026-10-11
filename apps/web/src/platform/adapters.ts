/**
 * 平台能力适配层 —— 「绝不假装有拦截能力」这条产品原则的技术落点。
 *
 * 设计要点（AGENTS.md 第 4 节「约束能力」行 + 技术设计 5.2）：
 * 1. 每个能力都有「真实实现」与「Noop 降级实现」，**降级时不抛异常、不白屏**。
 * 2. 每个适配器都必须如实上报自己的能力状态（`CapabilityReport`），
 *    UI 据此显示「软约束」还是「硬约束已生效」，**绝不允许谎称已拦截**。
 * 3. 浏览器物理上做不到的事（枚举/结束其他进程），这里只留接口与 Noop，
 *    真实实现由 v0.2 的桌面增强包通过本地 WS 提供。
 */

// ─────────────────────────────────────────────────────────────
// 能力状态上报
// ─────────────────────────────────────────────────────────────

export type NativeGuardState = 'CONNECTED' | 'DISCONNECTED' | 'UNSUPPORTED_BROWSER';

/**
 * 通知权限状态。
 * 刻意用大写字面量，避免与 DOM 内置的 `NotificationPermission`（小写 'default'）混淆——
 * 两者形状相同但取值大小写不同，混用会出现难以察觉的类型错误。
 */
export type NotifyPermission = 'GRANTED' | 'DENIED' | 'DEFAULT' | 'UNSUPPORTED';

/** DOM 权限值 → 本项目取值 */
function fromDomPermission(value: string): NotifyPermission {
  if (value === 'granted') return 'GRANTED';
  if (value === 'denied') return 'DENIED';
  return 'DEFAULT';
}

/** 本项目取值 → DOM 权限值 */
export function toDomPermission(value: NotifyPermission): NotificationPermission {
  if (value === 'GRANTED') return 'granted';
  if (value === 'DENIED') return 'denied';
  return 'default';
}

export interface CapabilityReport {
  /** 能否强制全屏接管 */
  fullscreen: boolean;
  /** 能否检测「用户切走」（visibilitychange） */
  visibility: boolean;
  notification: NotifyPermission;
  /** 能否阻止息屏（Wake Lock） */
  wakeLock: boolean;
  /** 桌面增强包连接状态；Web 端恒为 UNSUPPORTED_BROWSER 或 DISCONNECTED */
  nativeGuard: NativeGuardState;
  /**
   * 当前约束等级。
   * - `soft`：软约束（全屏 + 离开检测 + 收益惩罚），**不能阻止其他程序启动**
   * - `hard`：硬约束（桌面增强包在线，能真实结束/挂起非白名单进程）
   */
  restraint: 'soft' | 'hard';
  /** 面对用户的一句如实说明 */
  description: string;
}

// ─────────────────────────────────────────────────────────────
// 全屏
// ─────────────────────────────────────────────────────────────

export interface FullscreenAdapter {
  readonly supported: boolean;
  isActive(): boolean;
  /** 必须在用户手势中调用；失败时返回 false 而不是抛异常 */
  request(element: HTMLElement): Promise<boolean>;
  exit(): Promise<void>;
  /** 监听用户按 ESC 退出全屏（这是浏览器保留的逃生通道，无法屏蔽） */
  onChange(handler: () => void): () => void;
}

export function createNoopFullscreen(): FullscreenAdapter {
  return {
    supported: false,
    isActive: () => false,
    request: () => Promise.resolve(false),
    exit: () => Promise.resolve(),
    onChange: () => () => undefined,
  };
}

export function createBrowserFullscreen(): FullscreenAdapter {
  const supported =
    typeof document !== 'undefined' &&
    (typeof document.documentElement.requestFullscreen === 'function');

  return {
    supported,
    isActive: () => typeof document !== 'undefined' && document.fullscreenElement !== null,
    async request(element: HTMLElement): Promise<boolean> {
      if (!supported) return false;
      try {
        await element.requestFullscreen({ navigationUI: 'hide' });
        return true;
      } catch {
        // 浏览器要求用户手势、或用户/策略拒绝：如实返回失败，由调用方提示「点击进入」
        return false;
      }
    },
    async exit(): Promise<void> {
      if (typeof document === 'undefined' || document.fullscreenElement === null) return;
      try {
        await document.exitFullscreen();
      } catch {
        /* 已经退出或不被允许：无需处理 */
      }
    },
    onChange(handler: () => void): () => void {
      if (typeof document === 'undefined') return () => undefined;
      document.addEventListener('fullscreenchange', handler);
      return () => document.removeEventListener('fullscreenchange', handler);
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 可见性（离开检测）
// ─────────────────────────────────────────────────────────────

export interface VisibilityAdapter {
  readonly supported: boolean;
  isVisible(): boolean;
  hasFocus(): boolean;
  /** 页面隐藏或失焦 */
  onLeave(handler: () => void): () => void;
  /** 页面恢复可见并聚焦 */
  onReturn(handler: () => void): () => void;
}

export function createNoopVisibility(): VisibilityAdapter {
  return {
    supported: false,
    isVisible: () => true,
    hasFocus: () => true,
    onLeave: () => () => undefined,
    onReturn: () => () => undefined,
  };
}

export function createBrowserVisibility(): VisibilityAdapter {
  const supported = typeof document !== 'undefined' && 'visibilityState' in document;

  return {
    supported,
    isVisible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
    hasFocus: () => typeof document === 'undefined' || document.hasFocus(),
    onLeave(handler: () => void): () => void {
      if (typeof document === 'undefined') return () => undefined;
      const onVisibility = (): void => {
        if (document.visibilityState === 'hidden') handler();
      };
      const onBlur = (): void => handler();
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('blur', onBlur);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('blur', onBlur);
      };
    },
    onReturn(handler: () => void): () => void {
      if (typeof document === 'undefined') return () => undefined;
      const onVisibility = (): void => {
        if (document.visibilityState === 'visible') handler();
      };
      const onFocus = (): void => handler();
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('focus', onFocus);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('focus', onFocus);
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 通知
// ─────────────────────────────────────────────────────────────

export interface NotificationAdapter {
  permission(): NotifyPermission;
  /** 必须由用户手势触发；拒绝时返回 false 而不是抛异常 */
  request(): Promise<NotifyPermission>;
  show(title: string, body: string): void;
}

export function createNoopNotification(): NotificationAdapter {
  return {
    permission: () => 'UNSUPPORTED',
    request: () => Promise.resolve('UNSUPPORTED'),
    show: () => undefined,
  };
}

export function createBrowserNotification(): NotificationAdapter {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return createNoopNotification();
  }
  return {
    permission: () => fromDomPermission(window.Notification.permission),
    async request(): Promise<NotifyPermission> {
      try {
        return fromDomPermission(await window.Notification.requestPermission());
      } catch {
        return 'DENIED';
      }
    },
    show(title: string, body: string): void {
      if (window.Notification.permission !== 'granted') return;
      try {
        // 构造即显示，不需要持有引用
        new window.Notification(title, { body });
      } catch {
        /* 通知失败不应影响主流程 */
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 防息屏（Wake Lock）
// ─────────────────────────────────────────────────────────────

export interface WakeLockAdapter {
  readonly supported: boolean;
  acquire(): Promise<boolean>;
  release(): Promise<void>;
  isHeld(): boolean;
}

interface SentinelLike {
  release(): Promise<void>;
  released: boolean;
}

export function createNoopWakeLock(): WakeLockAdapter {
  return {
    supported: false,
    acquire: () => Promise.resolve(false),
    release: () => Promise.resolve(),
    isHeld: () => false,
  };
}

export function createBrowserWakeLock(): WakeLockAdapter {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const supported = Boolean(nav && 'wakeLock' in nav);
  let sentinel: SentinelLike | undefined;

  return {
    supported,
    isHeld: () => sentinel !== undefined && !sentinel.released,
    async acquire(): Promise<boolean> {
      if (!supported || !nav) return false;
      if (sentinel && !sentinel.released) return true;
      try {
        const lock = (nav as Navigator & {
          wakeLock: { request(type: 'screen'): Promise<SentinelLike> };
        }).wakeLock;
        sentinel = await lock.request('screen');
        return true;
      } catch {
        // 常见于页面不可见时申请：如实返回失败，调用方可在回到可见时重试
        return false;
      }
    },
    async release(): Promise<void> {
      if (!sentinel || sentinel.released) return;
      try {
        await sentinel.release();
      } catch {
        /* 忽略 */
      }
      sentinel = undefined;
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 进程拦截（Web 端**物理上不可能**，只有 Noop + 接口）
// ─────────────────────────────────────────────────────────────

export interface ProcessViolation {
  processName: string;
  at: number;
}
export interface ProcessGuardCapabilities {
  canKill: boolean;
  canSuspend: boolean;
  os: string;
  version: string;
}

/**
 * 进程拦截适配器。
 *
 * ⚠️ 浏览器**没有任何 API** 能枚举、挂起或结束其他进程，也无法阻止 exe 启动。
 * 因此 Web 端恒为 Noop：`report()` 返回 UNSUPPORTED_BROWSER，`startSession()` 无效。
 * UI 必须据此显示「软约束」，并且**禁止**任何「已拦截 N 个应用」的表述。
 *
 * 真实实现由 v0.2 的桌面增强包（C#，本地回环 WebSocket）提供，见 ADR-007。
 */
export interface ProcessGuardAdapter {
  report(): Promise<NativeGuardState>;
  capabilities(): Promise<ProcessGuardCapabilities | undefined>;
  /** 下发白名单；Web 端为无效操作 */
  pushAllowlist(processes: ReadonlyArray<string>): Promise<void>;
  startSession(kind: 'FOCUS' | 'LOCK'): Promise<void>;
  stopSession(): Promise<void>;
  onViolation(handler: (violation: ProcessViolation) => void): () => void;
}

export function createNoopProcessGuard(): ProcessGuardAdapter {
  return {
    report: () => Promise.resolve('UNSUPPORTED_BROWSER'),
    capabilities: () => Promise.resolve(undefined),
    pushAllowlist: () => Promise.resolve(),
    startSession: () => Promise.resolve(),
    stopSession: () => Promise.resolve(),
    onViolation: () => () => undefined,
  };
}

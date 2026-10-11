/**
 * 平台能力聚合：把各适配器打包成一个 `Platform` 对象，并生成**如实的**能力描述。
 *
 * ⚠️ 本文件里的文案受产品原则 1 约束（AGENTS.md 1.1）：
 * - 软约束下**禁止**出现「已拦截」「已阻止」等表述
 * - 只有 nativeGuard 真正 CONNECTED 时才可显示「硬约束已生效」
 * - 禁止出现「防作弊」「无法破解」（ADR-010）
 */
import { useEffect, useMemo, useState } from 'react';
import {
  createBrowserFullscreen,
  createBrowserNotification,
  createBrowserVisibility,
  createBrowserWakeLock,
  createNoopFullscreen,
  createNoopNotification,
  createNoopProcessGuard,
  createNoopVisibility,
  createNoopWakeLock,
  type CapabilityReport,
  type FullscreenAdapter,
  type NotificationAdapter,
  type ProcessGuardAdapter,
  type VisibilityAdapter,
  type WakeLockAdapter,
} from './adapters.ts';

export interface Platform {
  fullscreen: FullscreenAdapter;
  visibility: VisibilityAdapter;
  notification: NotificationAdapter;
  wakeLock: WakeLockAdapter;
  processGuard: ProcessGuardAdapter;
}

/** 真实浏览器能力（含对不支持项的自动降级） */
export function createBrowserPlatform(): Platform {
  return {
    fullscreen: typeof document === 'undefined' ? createNoopFullscreen() : createBrowserFullscreen(),
    visibility: typeof document === 'undefined' ? createNoopVisibility() : createBrowserVisibility(),
    notification: createBrowserNotification(),
    wakeLock: createBrowserWakeLock(),
    // 浏览器无法拦截进程：恒为 Noop（见 adapters.ts 的说明）
    processGuard: createNoopProcessGuard(),
  };
}

/** 全降级平台：用于测试与不支持的环境 */
export function createNoopPlatform(): Platform {
  return {
    fullscreen: createNoopFullscreen(),
    visibility: createNoopVisibility(),
    notification: createNoopNotification(),
    wakeLock: createNoopWakeLock(),
    processGuard: createNoopProcessGuard(),
  };
}

export interface CapabilityOptions {
  nativeGuard: CapabilityReport['nativeGuard'];
}

/** 生成能力报告（纯函数，便于测试） */
export function buildCapabilityReport(platform: Platform, options: CapabilityOptions): CapabilityReport {
  const nativeGuard = options.nativeGuard;
  const restraint: CapabilityReport['restraint'] = nativeGuard === 'CONNECTED' ? 'hard' : 'soft';

  return {
    fullscreen: platform.fullscreen.supported,
    visibility: platform.visibility.supported,
    notification: platform.notification.permission(),
    wakeLock: platform.wakeLock.supported,
    nativeGuard,
    restraint,
    description: describeRestraint(restraint, nativeGuard),
  };
}

/**
 * 面对用户的**如实**说明。
 *
 * 措辞刻意保守：明确说出做不到什么，而不是含糊其辞让用户误以为被拦截了。
 */
export function describeRestraint(
  restraint: CapabilityReport['restraint'],
  nativeGuard: CapabilityReport['nativeGuard'],
): string {
  if (restraint === 'hard') {
    return '硬约束已生效：桌面增强包在线，非白名单应用会被结束或挂起。';
  }
  if (nativeGuard === 'DISCONNECTED') {
    return '软约束模式：桌面增强包未连接，无法阻止其他程序启动；仍会记录你切走的时间并影响收益。';
  }
  if (nativeGuard === 'UNSUPPORTED_BROWSER') {
    return '软约束模式：浏览器不允许网页结束其他程序，因此无法阻止你打开微信或游戏。切走会被记录并影响收益。';
  }
  return '软约束模式：网页无法阻止其他程序启动。';
}

/** 启动后探测一次能力（nativeGuard 状态可能随后变化，由 M4 的会话层更新） */
export function usePlatform(): { platform: Platform; report: CapabilityReport; ready: boolean } {
  const platform = useMemo(() => createBrowserPlatform(), []);
  const [nativeGuard, setNativeGuard] = useState<CapabilityReport['nativeGuard']>('UNSUPPORTED_BROWSER');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void platform.processGuard
      .report()
      .then((state) => {
        if (!cancelled) setNativeGuard(state);
      })
      .catch(() => {
        if (!cancelled) setNativeGuard('DISCONNECTED');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const report = useMemo(
    () => buildCapabilityReport(platform, { nativeGuard }),
    [platform, nativeGuard],
  );

  return { platform, report, ready };
}

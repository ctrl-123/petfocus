import { useEffect, useState } from 'react';

/**
 * 每秒推进一次的「当前时间」。
 *
 * 注意：这只是**渲染触发器**，不是计时依据（ADR-003）。
 * 真正的剩余时间永远由会话的 startedAtMonotonic 推导（M4 实现）。
 */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    // 页面从后台回来时立即校正一次，避免显示停留在旧时间
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}

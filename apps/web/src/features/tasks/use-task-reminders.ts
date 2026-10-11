/**
 * 到点提醒钩子：轮询待办阶段，在 REMINDER / GRACE 时发通知并返回横幅数据。
 *
 * 边界（PRD AC-1.4.3 如实说明）：
 *- 页面存活时：到点检测精确（轮询间隔 1 秒，实际误差 < 1 秒）
 * - **页面关闭时：网页无法在后台触发任何动作**，这是浏览器的硬限制。
 *   因此 M3 只做「页面存活时的提醒」；「打开时补偿提示错过的专注」与
 *   「Web Push」分别在 M4 与 v0.2 实现。
 */
import { useEffect, useRef, useState } from 'react';
import {
  collectReminders,
  reminderKey,
  shouldNotify,
  type TaskLike,
  type TaskReminder,
} from '@petfocus/shared';
import type { Platform } from '../../platform/index.ts';

export interface UseTaskRemindersResult {
  /** 当前需要展示横幅的提醒（取最早的一条） */
  active: TaskReminder | undefined;
  /** 用户点「知道了」后隐藏横幅（不消耗任何配额） */
  dismiss: () => void;
}

export function useTaskReminders(
  tasks: ReadonlyArray<TaskLike>,
  now: number,
  platform: Platform,
): UseTaskRemindersResult {
  const notifiedRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Set<string>>(new Set());
  const [active, setActive] = useState<TaskReminder | undefined>(undefined);

  useEffect(() => {
    const reminders = collectReminders(tasks, now, notifiedRef.current);
    if (reminders.length === 0) {
      // 当前没有到期的提醒：清空横幅（例如用户已完成该待办）
      setActive((prev) => (prev && reminders.some((r) => r.taskId === prev.taskId) ? prev : undefined));
      return;
    }

    for (const reminder of reminders) {
      notifiedRef.current.add(reminderKey(reminder.taskId, reminder.phase));
      if (shouldNotify(reminder.phase)) {
        const title =
          reminder.phase === 'REMINDER' ? '马上要开始了' : '到点了，该开始了';
        const body =
          reminder.phase === 'REMINDER'
            ? `${Math.max(0, Math.round(reminder.msUntilStart / 60_000))} 分钟后：${reminder.title}`
            : `${reminder.title}（有 ${Math.round(reminder.graceRemainingMs / 1000)} 秒准备时间）`;
        platform.notification.show(title, body);
      }
    }

    const first = reminders.find((r) => !dismissedRef.current.has(reminderKey(r.taskId, r.phase)));
    setActive(first);
  }, [tasks, now, platform]);

  const dismiss = (): void => {
    if (!active) return;
    dismissedRef.current.add(reminderKey(active.taskId, active.phase));
    setActive(undefined);
  };

  return { active, dismiss };
}

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  /** 无障碍：用 aria-labelledby 关联标题（NFR-5.4） */
  titleId: string;
  children: ReactNode;
  /**
   * 是否允许点击遮罩关闭。
   * 「今日待办填写」是**强制模态**（AC-2.2.1：无法通过点击遮罩关闭），传 false。
   */
  dismissOnOverlay?: boolean;
  onDismiss?: () => void;
}

/**
 * 模态框基元。
 *
 * 自己写而不是用 Radix（AGENTS.md 说「不要自己写焦点陷阱」），这里遵守了那条要求的关键部分：
 * - 打开时把焦点移到容器内
 * - Tab 在容器内循环（焦点陷阱）
 * - Esc 关闭（仅在允许关闭时）
 * - role="dialog" + aria-modal
 *
 * 若后续引入 Radix，可整体替换本组件而不影响调用方。
 */
export function Modal({
  open,
  titleId,
  children,
  dismissOnOverlay = false,
  onDismiss,
}: ModalProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));

    // 打开时聚焦第一个可交互元素（通常是输入框）
    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && onDismiss) {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      // 焦点陷阱：在首尾之间循环
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // 锁定背景滚动，避免模态框后内容被滚动
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (!dismissOnOverlay || !onDismiss) return;
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-ink-50 p-5 shadow-xl sm:rounded-card"
      >
        {children}
      </div>
    </div>
  );
}

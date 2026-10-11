import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/**
 * 按钮基元。
 * 无障碍要求（NFR-5.1）：焦点必须可见，因此保留 focus-visible 环而不是 outline-none。
 * 触控目标在移动端至少 44px 高（lg 尺寸）。
 */
const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-amber-base text-ink-900 hover:bg-amber-deep hover:text-ink-50 active:scale-[0.98] disabled:bg-ink-200 disabled:text-ink-400',
  outline:
    'border border-ink-300 text-ink-700 hover:bg-ink-100 active:scale-[0.98] disabled:border-ink-200 disabled:text-ink-300',
  ghost: 'text-ink-600 hover:bg-ink-100 active:scale-[0.98] disabled:text-ink-300',
  danger:
    'bg-clay-base text-white hover:bg-clay-deep active:scale-[0.98] disabled:bg-ink-200 disabled:text-ink-400',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-[15px] rounded-xl',
  lg: 'px-5 py-3 text-base rounded-xl min-h-[44px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-1.5 font-medium transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-deep focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

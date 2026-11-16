/**
 * src/ui/components/Button.tsx
 * Clinical Ledger Design System Button.
 * - Variants: primary | secondary | ghost | danger (outline mapped to secondary for compatibility)
 * - Touch target >= 44px
 * - Preserves exact width during isLoading (invisible label + centered spinner)
 * - Active press scale(0.96), no transition:all, visible focus ring
 */
import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const normalizedVariant = variant === 'outline' ? 'secondary' : variant;

    const baseClasses =
      'relative inline-flex items-center justify-center font-semibold rounded-[var(--radius-control)] clinical-press clinical-focus select-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px] whitespace-nowrap';

    const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
      sm: 'text-[14px] px-3.5 py-2 gap-1.5',
      md: 'text-[16px] px-4 py-2.5 gap-2',
      lg: 'text-[16px] px-6 py-3 gap-2.5',
    };

    const variantClasses: Record<'primary' | 'secondary' | 'danger' | 'ghost', string> = {
      primary:
        'bg-[var(--color-primary)] hover:bg-[var(--color-primary-strong)] text-[var(--color-surface)] border border-transparent',
      secondary:
        'bg-[var(--color-surface)] hover:bg-[var(--color-surface-subtle)] text-[var(--color-ink)] border border-[var(--color-control-border)]',
      danger:
        'bg-[var(--color-danger-ink)] hover:opacity-95 text-[var(--color-surface)] border border-transparent',
      ghost:
        'bg-transparent hover:bg-[var(--color-surface-subtle)] text-[var(--color-ink)] border border-transparent',
    };

    return (
      <button
        ref={ref}
        type={type}
        className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[normalizedVariant]} ${className}`}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        <span
          className={`inline-flex items-center justify-center gap-inherit ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ gap: 'inherit' }}
        >
          {leftIcon && <span className="shrink-0 inline-flex items-center">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="shrink-0 inline-flex items-center">{rightIcon}</span>}
        </span>

        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.75} />
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

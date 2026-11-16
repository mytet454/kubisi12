/**
 * src/ui/components/StatusBadge.tsx
 * Clinical Ledger StatusBadge:
 * Never expresses status by hue alone — always renders a Lucide icon + clear Arabic word.
 */
import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  MinusCircle,
  XCircle,
} from 'lucide-react';

export type StatusBadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'teal';

export interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
}

const DEFAULT_ICON_MAP: Record<StatusBadgeVariant, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  danger: <XCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  info: <Info className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  teal: <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
  neutral: <MinusCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />,
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  icon,
  className = '',
}) => {
  const sizeClasses: Record<'sm' | 'md', string> = {
    sm: 'text-[14px] px-2.5 py-0.5 gap-1.5',
    md: 'text-[14px] px-3 py-1 gap-1.5',
  };

  const variantClasses: Record<StatusBadgeVariant, string> = {
    success:
      'bg-[var(--color-success-bg)] text-[var(--color-success-ink)] border border-[var(--color-success-border)]',
    warning:
      'bg-[var(--color-warning-bg)] text-[var(--color-warning-ink)] border border-[var(--color-warning-border)]',
    danger:
      'bg-[var(--color-danger-bg)] text-[var(--color-danger-ink)] border border-[var(--color-danger-border)]',
    info:
      'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] border border-[var(--color-primary)]',
    teal:
      'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] border border-[var(--color-primary)]',
    neutral:
      'bg-[var(--color-surface-subtle)] text-[var(--color-ink)] border border-[var(--color-control-border)]',
  };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-[8px] whitespace-nowrap ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {icon !== undefined ? icon : DEFAULT_ICON_MAP[variant]}
      <span>{children}</span>
    </span>
  );
};

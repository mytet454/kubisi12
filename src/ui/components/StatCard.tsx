/**
 * src/ui/components/StatCard.tsx
 * Clinical Ledger KPI Tile (also exported as KpiTile):
 * - Card used only for an independent KPI object (16px radius + layered shadow)
 * - Western tabular numerals, optional action/click target
 */
import React from 'react';

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  variant?: 'teal' | 'slate' | 'amber' | 'rose' | 'success';
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = 'teal',
  onClick,
  className = '',
}) => {
  const iconVariants: Record<NonNullable<StatCardProps['variant']>, string> = {
    teal: 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]',
    slate: 'bg-[var(--color-surface-subtle)] text-[var(--color-ink)]',
    amber: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-ink)]',
    rose: 'bg-[var(--color-danger-bg)] text-[var(--color-danger-ink)]',
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success-ink)]',
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[14px] font-semibold text-[var(--color-muted)]">{title}</span>
        {icon && (
          <div
            className={`w-10 h-10 rounded-[var(--radius-control)] flex items-center justify-center shrink-0 ${iconVariants[variant]}`}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2.5 text-[24px] font-bold text-[var(--color-ink)] num-tabular leading-tight">
        {value}
      </div>

      {(subtitle || trend) && (
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {trend && (
            <span
              className={`text-[14px] font-semibold px-2 py-0.5 rounded-[6px] ${
                trend.isPositive
                  ? 'bg-[var(--color-success-bg)] text-[var(--color-success-ink)]'
                  : 'bg-[var(--color-danger-bg)] text-[var(--color-danger-ink)]'
              }`}
            >
              {trend.value}
            </span>
          )}
          {subtitle && (
            <p className="text-[14px] text-[var(--color-muted)] leading-snug">{subtitle}</p>
          )}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        dir="rtl"
        className={`clinical-card p-5 text-right w-full cursor-pointer clinical-press clinical-focus hover:bg-[var(--color-surface-subtle)]/40 transition-colors duration-150 ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div dir="rtl" className={`clinical-card p-5 text-right ${className}`}>
      {content}
    </div>
  );
};

export const KpiTile = StatCard;

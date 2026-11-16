/**
 * src/ui/components/SegmentedControl.tsx
 * Clinical Ledger Segmented Control for quick mode/filter switching.
 */
import React from 'react';

export interface SegmentedOption {
  value: string;
  label: string;
  count?: number;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  ariaLabel = 'خيارات التصفية',
  className = '',
}) => {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap items-center gap-1 p-1 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] ${className}`}
      dir="rtl"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-[8px] text-[14px] font-semibold transition-colors duration-150 cursor-pointer clinical-focus whitespace-nowrap
              ${
                isActive
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary-strong)] shadow-[var(--shadow-card)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }
            `}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={`num-tabular text-[14px] px-1.5 py-0.5 rounded-[6px] ${
                  isActive
                    ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/**
 * src/ui/components/Select.tsx
 * Clinical Ledger Design System Select with RTL chevron and >= 44px touch target.
 */
import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, className = '', id, 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || `select_${generatedId}`;
    const errorId = `${selectId}_err`;
    const helperId = `${selectId}_help`;
    const describedBy = [ariaDescribedBy, error ? errorId : helperText ? helperId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="w-full space-y-1.5 text-right" dir="rtl">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-[14px] font-semibold text-[var(--color-ink)]"
          >
            {label}
            {props.required && (
              <span className="text-[var(--color-danger-ink)] mr-1" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={`w-full appearance-none bg-[var(--color-surface)] border rounded-[var(--radius-control)] text-[var(--color-ink)] text-[16px] font-medium pr-3.5 pl-10 transition-colors duration-150 min-h-[44px] cursor-pointer clinical-focus
              ${
                error
                  ? 'border-[var(--color-danger-ink)] bg-[var(--color-danger-bg)]/30'
                  : 'border-[var(--color-control-border)] hover:border-[var(--color-primary)] focus:border-[var(--color-primary)]'
              }
              ${props.disabled ? 'bg-[var(--color-surface-subtle)] cursor-not-allowed opacity-75' : ''}
              ${className}
            `}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-muted)]">
            <ChevronDown className="w-5 h-5" strokeWidth={1.75} />
          </div>
        </div>

        {error && (
          <p id={errorId} className="text-[14px] font-medium text-[var(--color-danger-ink)] mt-1" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-[14px] text-[var(--color-muted)] mt-1">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

/**
 * src/ui/components/MoneyInput.tsx
 * Specialized IQD Money Input:
 * - Automatically formats thousands separators while typing (e.g. 1,250,000)
 * - Uses inputMode="numeric" for mobile numeric keypad
 * - Western tabular numerals + lighter "د.ع" suffix
 */
import React, { useId } from 'react';
import { AR_STRINGS } from '../strings/ar';

export interface MoneyInputProps {
  label?: string;
  value: number | string;
  onChangeValue: (numericValue: number) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  currency?: string;
  id?: string;
  className?: string;
  ariaLabel?: string;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function normalizeArabicDigits(raw: string): string {
  const eastern = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  let out = '';
  for (const ch of raw) {
    const eIdx = eastern.indexOf(ch);
    if (eIdx !== -1) {
      out += String(eIdx);
      continue;
    }
    const pIdx = persian.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      out += ch;
    }
  }
  return out;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      label,
      value,
      onChangeValue,
      placeholder = '0',
      error,
      helperText,
      required,
      disabled,
      currency = AR_STRINGS.app.currency,
      id,
      className = '',
      ariaLabel,
      onBlur,
      onKeyDown,
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || `money_${generatedId}`;
    const errorId = `${inputId}_err`;
    const helperId = `${inputId}_help`;
    const describedBy = error ? errorId : helperText ? helperId : undefined;

    const numericValue =
      typeof value === 'number' ? value : Number(String(value).replace(/,/g, '')) || 0;
    const formattedDisplay =
      value === '' || value === undefined || value === null
        ? ''
        : numericValue === 0 && String(value) === ''
        ? ''
        : Math.max(0, Math.round(numericValue)).toLocaleString('en-US');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digitsOnly = normalizeArabicDigits(e.target.value);
      if (!digitsOnly) {
        onChangeValue(0);
        return;
      }
      const parsed = parseInt(digitsOnly, 10);
      onChangeValue(Number.isNaN(parsed) ? 0 : parsed);
    };

    return (
      <div className={`w-full space-y-1.5 text-right ${className}`} dir="rtl">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[14px] font-semibold text-[var(--color-ink)]"
          >
            {label}
            {required && (
              <span className="text-[var(--color-danger-ink)] mr-1" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div className="relative flex items-center">
          <input
            ref={ref}
            id={inputId}
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={formattedDisplay}
            onChange={handleChange}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-label={ariaLabel}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={`w-full bg-[var(--color-surface)] border rounded-[var(--radius-control)] text-[var(--color-ink)] placeholder:text-[var(--color-placeholder)] text-[16px] font-semibold num-tabular text-right pr-3.5 pl-14 transition-colors duration-150 min-h-[44px] clinical-focus
              ${
                error
                  ? 'border-[var(--color-danger-ink)] bg-[var(--color-danger-bg)]/30'
                  : 'border-[var(--color-control-border)] hover:border-[var(--color-primary)] focus:border-[var(--color-primary)]'
              }
              ${disabled ? 'bg-[var(--color-surface-subtle)] cursor-not-allowed opacity-75' : ''}
            `}
          />
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-normal text-[var(--color-muted)] pointer-events-none select-none">
            {currency}
          </span>
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

MoneyInput.displayName = 'MoneyInput';

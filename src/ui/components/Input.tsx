/**
 * src/ui/components/Input.tsx
 * Clinical Ledger Design System Input & Textarea components.
 * - Label always above the input
 * - High-contrast interactive border (--color-control-border)
 * - 10px control radius, >= 44px height, helper and error messaging below
 */
import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', id, 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || `input_${generatedId}`;
    const errorId = `${inputId}_err`;
    const helperId = `${inputId}_help`;
    const describedBy = [ariaDescribedBy, error ? errorId : helperText ? helperId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="w-full space-y-1.5 text-right" dir="rtl">
        {label && (
          <label
            htmlFor={inputId}
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

        <div className="relative flex items-center">
          {rightIcon && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none">
              {rightIcon}
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={`w-full bg-[var(--color-surface)] border rounded-[var(--radius-control)] text-[var(--color-ink)] placeholder:text-[var(--color-placeholder)] text-[16px] font-medium transition-colors duration-150 min-h-[44px] clinical-focus
              ${rightIcon ? 'pr-11' : 'pr-3.5'}
              ${leftIcon ? 'pl-11' : 'pl-3.5'}
              ${
                error
                  ? 'border-[var(--color-danger-ink)] bg-[var(--color-danger-bg)]/30'
                  : 'border-[var(--color-control-border)] hover:border-[var(--color-primary)] focus:border-[var(--color-primary)]'
              }
              ${props.disabled ? 'bg-[var(--color-surface-subtle)] cursor-not-allowed opacity-75' : ''}
              ${className}
            `}
            {...props}
          />

          {leftIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none">
              {leftIcon}
            </div>
          )}
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

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = '', id, rows = 3, 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    const generatedId = useId();
    const areaId = id || `textarea_${generatedId}`;
    const errorId = `${areaId}_err`;
    const helperId = `${areaId}_help`;
    const describedBy = [ariaDescribedBy, error ? errorId : helperText ? helperId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="w-full space-y-1.5 text-right" dir="rtl">
        {label && (
          <label
            htmlFor={areaId}
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

        <textarea
          id={areaId}
          ref={ref}
          rows={rows}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={`w-full bg-[var(--color-surface)] border rounded-[var(--radius-control)] text-[var(--color-ink)] placeholder:text-[var(--color-placeholder)] text-[16px] font-medium p-3.5 transition-colors duration-150 min-h-[88px] clinical-focus
            ${
              error
                ? 'border-[var(--color-danger-ink)] bg-[var(--color-danger-bg)]/30'
                : 'border-[var(--color-control-border)] hover:border-[var(--color-primary)] focus:border-[var(--color-primary)]'
            }
            ${props.disabled ? 'bg-[var(--color-surface-subtle)] cursor-not-allowed opacity-75' : ''}
            ${className}
          `}
          {...props}
        />

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

Textarea.displayName = 'Textarea';

/**
 * src/ui/components/Toast.tsx
 * Standalone Clinical Ledger Toast Component for page-local feedback.
 */
import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  variant?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  variant = 'info',
  onClose,
  duration = 4000,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const borderStyles = {
    success: 'border-[var(--color-success-border)]',
    error: 'border-[var(--color-danger-border)]',
    info: 'border-[var(--color-primary)]',
  };

  const iconWrap = {
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success-ink)]',
    error: 'bg-[var(--color-danger-bg)] text-[var(--color-danger-ink)]',
    info: 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]',
  };

  const icons = {
    success: <CheckCircle2 className="w-5 h-5" strokeWidth={1.75} />,
    error: <AlertCircle className="w-5 h-5" strokeWidth={1.75} />,
    info: <Info className="w-5 h-5" strokeWidth={1.75} />,
  };

  return (
    <div
      className="fixed bottom-20 md:bottom-5 left-4 right-4 md:right-auto md:left-5 z-50 md:max-w-sm"
      dir="rtl"
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 clinical-dialog border ${borderStyles[variant]}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-9 h-9 rounded-[var(--radius-control)] flex items-center justify-center shrink-0 ${iconWrap[variant]}`}
          >
            {icons[variant]}
          </span>
          <p className="text-[14px] font-medium text-[var(--color-ink)] leading-snug clinical-prose">
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الإشعار"
          className="min-w-[44px] min-h-[44px] -ml-2 rounded-[var(--radius-control)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] flex items-center justify-center clinical-press clinical-focus cursor-pointer shrink-0"
        >
          <X className="w-5 h-5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
};

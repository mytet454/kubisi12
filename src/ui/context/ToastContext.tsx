/**
 * src/ui/context/ToastContext.tsx
 * Clinical Ledger Toast notification provider and NavigationIntent wrapper.
 */
import '../styles/tokens.css';
import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { NavigationIntentProvider } from './NavigationIntentContext';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = 'toast_' + Date.now() + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      <NavigationIntentProvider>
        {children}
      </NavigationIntentProvider>
      <div
        className="fixed bottom-20 md:bottom-5 left-4 right-4 md:right-auto md:left-5 z-50 flex flex-col gap-2 md:max-w-sm pointer-events-none"
        dir="rtl"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const styleMap = {
            success:
              'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-success-border)]',
            error:
              'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-danger-border)]',
            info:
              'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-primary)]',
          };

          const iconWrapMap = {
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
              key={toast.id}
              role="status"
              className={`flex items-center justify-between gap-3 px-4 py-3 border pointer-events-auto clinical-dialog ${styleMap[toast.type]}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-9 h-9 rounded-[var(--radius-control)] flex items-center justify-center shrink-0 ${iconWrapMap[toast.type]}`}
                >
                  {icons[toast.type]}
                </span>
                <p className="text-[14px] font-medium leading-snug clinical-prose">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] clinical-press clinical-focus cursor-pointer shrink-0"
                aria-label="إغلاق الإشعار"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

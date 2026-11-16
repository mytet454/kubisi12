/**
 * src/ui/components/Drawer.tsx
 * Clinical Ledger RTL Side Preview Drawer:
 * - Used by DataTable rows for rapid preview without losing list scroll position
 * - Supports optional "فتح الصفحة كاملة" full-view action + "رجوع" close button
 */
import React, { useEffect, useId, useRef } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { Button } from './Button';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  fullPageLabel?: string;
  onOpenFullPage?: () => void;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  fullPageLabel = 'فتح الصفحة كاملة',
  onOpenFullPage,
}) => {
  const titleId = useId();
  const descId = useId();
  const asideRef = useRef<HTMLElement>(null);

  useFocusTrap(isOpen, asideRef, onClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[var(--color-overlay)]" dir="rtl" lang="ar">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <aside
        ref={asideRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        className="relative z-10 w-full max-w-lg h-full bg-[var(--color-surface)] border-r border-[var(--color-line)] shadow-[var(--shadow-elevated)] flex flex-col outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-[var(--color-line)] bg-[var(--color-surface-subtle)] shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="clinical-heading-3 truncate">
              {title}
            </h2>
            {subtitle && (
              <p id={descId} className="text-[14px] text-[var(--color-muted)] mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] px-2.5 rounded-[var(--radius-control)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] inline-flex items-center justify-center gap-1 text-[14px] font-semibold clinical-press clinical-focus cursor-pointer shrink-0"
            aria-label="رجوع"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
            <span>رجوع</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">{children}</div>

        {(footer || onOpenFullPage) && (
          <div className="px-6 py-4 border-t border-[var(--color-line)] bg-[var(--color-surface-subtle)] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2">{footer}</div>
            {onOpenFullPage && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenFullPage();
                }}
                leftIcon={<ExternalLink className="w-5 h-5" strokeWidth={1.75} />}
              >
                {fullPageLabel}
              </Button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};

/**
 * src/ui/components/Modal.tsx
 * Clinical Ledger Modal Dialog:
 * - 20px dialog radius (--radius-dialog)
 * - Accessible role="dialog", aria-modal="true", Escape key handling
 * - 44px close button labeled "رجوع"
 */
import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
}) => {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(isOpen, dialogRef, onClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-overlay)]"
      dir="rtl"
      lang="ar"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={`relative w-full ${maxWidthClasses[maxWidth]} clinical-dialog border border-[var(--color-line)] overflow-hidden z-10 outline-none`}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--color-line)] bg-[var(--color-surface-subtle)]">
          <div className="min-w-0">
            <h2 id={titleId} className="clinical-heading-3 truncate">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-[14px] text-[var(--color-muted)] mt-0.5 clinical-prose">
                {description}
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
            <span className="hidden sm:inline">رجوع</span>
          </button>
        </div>

        <div className="p-6 max-h-[85vh] overflow-y-auto bg-[var(--color-surface)]">{children}</div>
      </div>
    </div>
  );
};

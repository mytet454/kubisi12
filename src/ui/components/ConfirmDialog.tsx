/**
 * src/ui/components/ConfirmDialog.tsx
 * Clinical Ledger Confirmation Dialog:
 * - Uses "رجوع" instead of ambiguous "إلغاء" for closing without saving
 * - Action-oriented confirm label
 */
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'تأكيد الإجراء',
  cancelLabel = 'رجوع',
  isDestructive = true,
  isLoading = false,
  children,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="space-y-5 text-right" dir="rtl">
        <div className="flex items-start gap-4">
          <div
            className={`w-11 h-11 rounded-[var(--radius-control)] flex items-center justify-center shrink-0 border ${
              isDestructive
                ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger-ink)] border-[var(--color-danger-border)]'
                : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-ink)] border-[var(--color-warning-border)]'
            }`}
          >
            <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <p className="text-[16px] text-[var(--color-ink)] leading-relaxed clinical-prose">
            {message}
          </p>
        </div>

        {children}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-line)]">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

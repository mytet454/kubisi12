/**
 * src/ui/components/EmptyState.tsx
 * Clinical Ledger EmptyState:
 * Always explains: what this screen is + why it is empty + 1 clear action button to start.
 */
import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}) => {
  return (
    <div
      className="flex flex-col items-center justify-center p-8 sm:p-10 text-center bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-line)]"
      dir="rtl"
    >
      <div className="w-12 h-12 rounded-[var(--radius-control)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] flex items-center justify-center mb-4">
        {icon || <PackageOpen className="w-6 h-6" strokeWidth={1.75} />}
      </div>
      <h3 className="clinical-heading-3 mb-1.5">{title}</h3>
      <p className="text-[14px] text-[var(--color-muted)] max-w-md leading-relaxed mb-5 clinical-prose">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="primary" size="md">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

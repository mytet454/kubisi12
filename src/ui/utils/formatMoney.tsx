import React from 'react';
import { AR_STRINGS } from '../strings/ar';

/**
 * Formats an integer amount in IQD using Western digits (0-9) and thousands separators.
 */
export function formatWesternInt(amount: number | null | undefined): string {
  const num = Number(amount) || 0;
  return Math.round(num).toLocaleString('en-US');
}

export interface MoneyTextProps {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'ink' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';
  showSign?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<MoneyTextProps['size']>, string> = {
  sm: 'text-[14px] font-semibold',
  md: 'text-[16px] font-semibold',
  lg: 'text-[20px] font-bold',
  xl: 'text-[24px] font-bold',
};

const TONE_COLOR: Record<NonNullable<MoneyTextProps['tone']>, string> = {
  ink: 'text-[var(--color-ink)]',
  primary: 'text-[var(--color-primary-strong)]',
  success: 'text-[var(--color-success-ink)]',
  warning: 'text-[var(--color-warning-ink)]',
  danger: 'text-[var(--color-danger-ink)]',
  muted: 'text-[var(--color-muted)]',
};

/**
 * Displays IQD monetary values with Western tabular digits, thousands separators,
 * a lighter currency suffix ("د.ع"), and consistent column alignment.
 */
export const MoneyText: React.FC<MoneyTextProps> = ({
  amount,
  currency = AR_STRINGS.app.currency,
  className = '',
  size = 'md',
  tone = 'ink',
  showSign = false,
}) => {
  const numeric = Math.round(Number(amount) || 0);
  const absFormatted = Math.abs(numeric).toLocaleString('en-US');
  const sign = numeric < 0 ? '-' : showSign && numeric > 0 ? '+' : '';

  return (
    <span
      className={`inline-flex items-baseline gap-1.5 whitespace-nowrap ${SIZE_CLASSES[size]} ${TONE_COLOR[tone]} ${className}`}
    >
      <span className="num-tabular">
        {sign}
        {absFormatted}
      </span>
      <span className="text-[0.8em] font-normal text-[var(--color-muted)]">{currency}</span>
    </span>
  );
};

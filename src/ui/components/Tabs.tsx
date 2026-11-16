/**
 * src/ui/components/Tabs.tsx
 * Clinical Ledger Tabs with accessible role="tablist", >=44px touch targets, and primary underline.
 */
import React from 'react';

export interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeKey, onChange, className = '' }) => {
  return (
    <div
      role="tablist"
      className={`flex border-b border-[var(--color-line)] overflow-x-auto no-scrollbar gap-1 ${className}`}
      dir="rtl"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 font-semibold text-[16px] border-b-2 transition-colors duration-150 select-none whitespace-nowrap min-h-[44px] cursor-pointer clinical-focus rounded-t-[var(--radius-control)]
              ${
                isActive
                  ? 'border-[var(--color-primary)] text-[var(--color-primary-strong)] bg-[var(--color-primary-soft)]/60'
                  : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]'
              }
            `}
          >
            {tab.icon && <span className="shrink-0 inline-flex items-center">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`num-tabular text-[14px] px-2 py-0.5 rounded-[8px] font-semibold ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-[var(--color-surface)]'
                    : 'bg-[var(--color-surface-subtle)] text-[var(--color-ink)]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/**
 * src/ui/components/Skeletons.tsx
 * Clinical Ledger Skeleton placeholders:
 * Calm, static geometry matching the loaded layout (no entrance/pulse animation).
 */
import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <div
    aria-hidden="true"
    className={`bg-[var(--color-surface-subtle)] rounded-[8px] ${className}`}
  />
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  return (
    <div
      aria-busy="true"
      aria-label="جارٍ تحميل الجدول"
      className="w-full space-y-3"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-[var(--color-line)]">
        <Skeleton className="h-11 w-64 rounded-[var(--radius-control)]" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-11 w-28 rounded-[var(--radius-control)]" />
          <Skeleton className="h-11 w-24 rounded-[var(--radius-control)]" />
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
        <div className="h-11 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] px-4 flex items-center gap-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="divide-y divide-[var(--color-line)]">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-6 w-20 rounded-[8px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div
      aria-busy="true"
      aria-label="جارٍ تحميل البطاقات"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      dir="rtl"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="clinical-card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="w-10 h-10 rounded-[var(--radius-control)]" />
          </div>
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
};

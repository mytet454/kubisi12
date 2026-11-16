/**
 * src/ui/components/DataTable.tsx
 * Clinical Ledger Unified List Pattern:
 * - Sits directly on the canvas (no outer rounded card wrapper; white ledger table surface + 1px hairlines)
 * - Sticky toolbar: search, status chips, optional date range filter, density toggle (مريح / مضغوط), CSV export
 * - Sticky table header (thead)
 * - Row click opens RTL preview Drawer with optional "فتح الصفحة كاملة" button
 * - Visible row actions in a ⋮ menu (never hidden behind hover)
 * - Phone (< md): clean compact card showing the two most important values + zero horizontal overflow
 * - Pagination with total record count
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreVertical,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from './Button';
import { Drawer } from './Drawer';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  searchValue?: (item: T) => string;
  align?: 'right' | 'left' | 'center';
  mobilePriority?: 1 | 2 | 'status' | 'hide';
}

export interface RowAction<T> {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (item: T) => void;
  variant?: 'default' | 'danger';
  hidden?: (item: T) => boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  title?: string;
  actions?: React.ReactNode;
  pageSize?: number;
  filterOptions?: { label: string; value: string }[];
  onFilterChange?: (val: string) => void;
  filterValue?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  exportFileName?: string;
  dateAccessor?: (item: T) => string;
  rowActions?: (item: T) => RowAction<T>[];
  renderPreview?: (item: T, close: () => void) => React.ReactNode;
  previewTitle?: (item: T) => string;
  previewSubtitle?: (item: T) => string;
  previewFullPageLabel?: string;
  onOpenFullPage?: (item: T) => void;
  onRowClick?: (item: T) => void;
  initialSearch?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  title,
  actions,
  pageSize = 10,
  filterOptions,
  filterValue = 'all',
  onFilterChange,
  emptyTitle = 'لا توجد سجلات مطابقة',
  emptyDescription = 'لم يتم العثور على أي سجلات تطابق خيارات البحث أو التصفية الحالية.',
  emptyActionLabel,
  onEmptyAction,
  exportFileName = 'data_export',
  dateAccessor,
  rowActions,
  renderPreview,
  previewTitle,
  previewSubtitle,
  previewFullPageLabel = 'فتح الصفحة كاملة',
  onOpenFullPage,
  onRowClick,
  initialSearch = '',
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  const [previewItem, setPreviewItem] = useState<T | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialSearch !== undefined && initialSearch !== '') {
      setSearchQuery(initialSearch);
      setCurrentPage(1);
    }
  }, [initialSearch]);

  useEffect(() => {
    const closeMenus = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId) {
      document.addEventListener('mousedown', closeMenus);
    }
    return () => document.removeEventListener('mousedown', closeMenus);
  }, [openMenuId]);

  const filteredData = useMemo(() => {
    let result = [...data];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((item) =>
        columns.some((col) => {
          if (col.searchValue) {
            return col.searchValue(item).toLowerCase().includes(q);
          }
          const val = item[col.key];
          if (val === undefined || val === null) return false;
          return String(val).toLowerCase().includes(q);
        })
      );
    }

    if (dateAccessor && (dateFrom || dateTo)) {
      result = result.filter((item) => {
        const raw = dateAccessor(item);
        if (!raw) return false;
        const isoDay = raw.slice(0, 10);
        if (dateFrom && isoDay < dateFrom) return false;
        if (dateTo && isoDay > dateTo) return false;
        return true;
      });
    }

    if (sortKey) {
      result.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }
        return sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB), 'ar')
          : String(valB).localeCompare(String(valA), 'ar');
      });
    }

    return result;
  }, [data, searchQuery, dateAccessor, dateFrom, dateTo, sortKey, sortDirection, columns]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentSafePage = Math.min(currentPage, totalPages);
  const paginatedData = useMemo(() => {
    const start = (currentSafePage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentSafePage, pageSize]);

  const startIndex = filteredData.length === 0 ? 0 : (currentSafePage - 1) * pageSize + 1;
  const endIndex = Math.min(filteredData.length, currentSafePage * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handleExportCSV = () => {
    if (!filteredData.length) return;
    const exportCols = columns.filter((c) => c.key !== 'actions');
    const headers = exportCols.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
    const rows = filteredData.map((item) =>
      exportCols
        .map((col) => {
          let val = item[col.key];
          if (col.searchValue) {
            val = col.searchValue(item);
          }
          if (val === undefined || val === null) val = '';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    );

    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportFileName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenPreview = (item: T) => {
    if (onRowClick) {
      onRowClick(item);
      return;
    }
    setPreviewItem(item);
  };

  // Identify two primary columns + optional status column for clean mobile card rendering
  const mobileColumns = useMemo(() => {
    const nonActionCols = columns.filter((c) => c.key !== 'actions' && c.mobilePriority !== 'hide');
    const primary = nonActionCols.find((c) => c.mobilePriority === 1) || nonActionCols[0];
    const secondary =
      nonActionCols.find((c) => c.mobilePriority === 2 && c !== primary) ||
      nonActionCols.find((c) => c !== primary && c.key !== 'status') ||
      nonActionCols[1];
    const statusCol = nonActionCols.find((c) => c.mobilePriority === 'status' || c.key === 'status');
    const actionCol = columns.find((c) => c.key === 'actions');
    return { primary, secondary, statusCol, actionCol };
  }, [columns]);

  const rowPadding = density === 'compact' ? 'py-2 px-3.5' : 'py-3.5 px-4';

  return (
    <div className="w-full space-y-3" dir="rtl">
      {/* List Header & Toolbar sitting directly on the canvas */}
      <div className="sticky top-0 z-10 bg-[var(--color-canvas)] pt-1 pb-3 border-b border-[var(--color-line)] space-y-3">
        {(title || actions) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              {title && <h2 className="clinical-heading-3">{title}</h2>}
              <span className="text-[14px] text-[var(--color-muted)] num-tabular">
                ({filteredData.length} سجل)
              </span>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search + Status Filter Chips */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0">
            <div className="relative w-full sm:w-72 shrink-0">
              <Search
                className="w-5 h-5 text-[var(--color-muted)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="بحث في القائمة..."
                aria-label="بحث في القائمة"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-control-border)] rounded-[var(--radius-control)] pr-10 pl-9 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-placeholder)] min-h-[44px] clinical-focus"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  aria-label="مسح البحث"
                  className="absolute left-2 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer hit-target-44"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
              )}
            </div>

            {filterOptions && onFilterChange && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onFilterChange('all');
                    setCurrentPage(1);
                  }}
                  aria-pressed={filterValue === 'all'}
                  className={`px-3 min-h-[44px] rounded-[var(--radius-control)] text-[14px] font-semibold whitespace-nowrap border transition-colors duration-150 cursor-pointer clinical-focus
                    ${
                      filterValue === 'all'
                        ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] border-[var(--color-primary)]'
                        : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-control-border)] hover:bg-[var(--color-surface-subtle)]'
                    }
                  `}
                >
                  الكل
                </button>
                {filterOptions.map((opt) => {
                  const active = filterValue === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onFilterChange(opt.value);
                        setCurrentPage(1);
                      }}
                      aria-pressed={active}
                      className={`px-3 min-h-[44px] rounded-[var(--radius-control)] text-[14px] font-semibold whitespace-nowrap border transition-colors duration-150 cursor-pointer clinical-focus
                        ${
                          active
                            ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] border-[var(--color-primary)]'
                            : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-control-border)] hover:bg-[var(--color-surface-subtle)]'
                        }
                      `}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Controls: Date range, Density Toggle, CSV */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {dateAccessor && (
              <Button
                variant={showDateFilter || dateFrom || dateTo ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setShowDateFilter((s) => !s)}
                leftIcon={<Calendar className="w-5 h-5" strokeWidth={1.75} />}
              >
                التاريخ
              </Button>
            )}

            <button
              type="button"
              onClick={() =>
                setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))
              }
              title="تبديل كثافة عرض الجدول"
              className="hidden md:inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-[var(--radius-control)] bg-[var(--color-surface)] border border-[var(--color-control-border)] text-[14px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] cursor-pointer clinical-press clinical-focus"
            >
              <SlidersHorizontal className="w-4 h-4 text-[var(--color-muted)]" strokeWidth={1.75} />
              <span>{density === 'comfortable' ? 'كثافة: مريح' : 'كثافة: مضغوط'}</span>
            </button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCSV}
              disabled={filteredData.length === 0}
              leftIcon={<Download className="w-5 h-5" strokeWidth={1.75} />}
            >
              تصدير CSV
            </Button>
          </div>
        </div>

        {/* Optional Date Range Row */}
        {dateAccessor && showDateFilter && (
          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-[var(--color-line)]">
            <div className="space-y-1">
              <label className="block text-[14px] font-semibold text-[var(--color-muted)]">
                من تاريخ
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-[var(--color-surface)] border border-[var(--color-control-border)] rounded-[var(--radius-control)] px-3 min-h-[44px] text-[14px] num-tabular text-[var(--color-ink)] clinical-focus"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[14px] font-semibold text-[var(--color-muted)]">
                إلى تاريخ
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-[var(--color-surface)] border border-[var(--color-control-border)] rounded-[var(--radius-control)] px-3 min-h-[44px] text-[14px] num-tabular text-[var(--color-ink)] clinical-focus"
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                مسح التاريخ
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {paginatedData.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
        />
      ) : (
        <>
          {/* Desktop Table View directly on canvas with crisp white rows + 1px lines */}
          <div className="hidden md:block bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="sticky top-0 z-10 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)]">
                <tr className="text-[14px] font-semibold text-[var(--color-ink)] select-none">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      onClick={() => col.sortable && handleSort(col.key)}
                      className={`py-3 px-4 whitespace-nowrap ${
                        col.align === 'left'
                          ? 'text-left'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-right'
                      } ${
                        col.sortable
                          ? 'cursor-pointer hover:bg-[var(--color-primary-soft)]/60 transition-colors duration-150'
                          : ''
                      }`}
                    >
                      <div
                        className={`inline-flex items-center gap-1.5 ${
                          col.align === 'left'
                            ? 'flex-row-reverse'
                            : col.align === 'center'
                            ? 'justify-center'
                            : ''
                        }`}
                      >
                        <span>{col.header}</span>
                        {col.sortable && (
                          <ArrowUpDown
                            className={`w-4 h-4 ${
                              sortKey === col.key
                                ? 'text-[var(--color-primary)]'
                                : 'text-[var(--color-muted)]'
                            }`}
                            strokeWidth={1.75}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                  {rowActions && (
                    <th scope="col" className="py-3 px-3 text-left w-14">
                      إجراء
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)] text-[16px] text-[var(--color-ink)]">
                {(() => {
                  const seenKeys = new Map<string, number>();
                  return paginatedData.map((item) => {
                    const rawId = String(keyExtractor(item) ?? '');
                    const count = seenKeys.get(rawId) || 0;
                    seenKeys.set(rawId, count + 1);
                    const itemId = count === 0 ? rawId : `${rawId}__dup_${count}`;
                    const visibleRowActions = rowActions
                      ? rowActions(item).filter((a) => !a.hidden || !a.hidden(item))
                      : [];

                    return (
                      <tr
                        key={itemId}
                        onClick={() => handleOpenPreview(item)}
                        className="hover:bg-[var(--color-primary-soft)]/35 transition-colors duration-150 cursor-pointer"
                      >
                        {columns.map((col) => (
                          <td
                            key={col.key}
                          onClick={(e) => {
                            if (col.key === 'actions') e.stopPropagation();
                          }}
                          className={`${rowPadding} align-middle ${
                            col.align === 'left'
                              ? 'text-left'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-right'
                          }`}
                        >
                          {col.render ? col.render(item) : item[col.key]}
                        </td>
                      ))}

                      {rowActions && (
                        <td
                          className={`${rowPadding} align-middle text-left relative`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {visibleRowActions.length > 0 && (
                            <div
                              ref={openMenuId === itemId ? menuContainerRef : undefined}
                              className="inline-block relative"
                            >
                              <button
                                type="button"
                                aria-label="إجراءات السجل"
                                aria-expanded={openMenuId === itemId}
                                onClick={() =>
                                  setOpenMenuId((prev) => (prev === itemId ? null : itemId))
                                }
                                className="min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] inline-flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] clinical-press clinical-focus cursor-pointer"
                              >
                                <MoreVertical className="w-5 h-5" strokeWidth={1.75} />
                              </button>

                              {openMenuId === itemId && (
                                <div className="absolute left-0 top-full mt-1 w-48 clinical-dialog border border-[var(--color-line)] py-1 z-30">
                                  {visibleRowActions.map((act) => (
                                    <button
                                      key={act.key}
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        act.onClick(item);
                                      }}
                                      className={`w-full flex items-center gap-2.5 px-3.5 min-h-[44px] text-[14px] font-semibold text-right cursor-pointer transition-colors duration-150 ${
                                        act.variant === 'danger'
                                          ? 'text-[var(--color-danger-ink)] hover:bg-[var(--color-danger-bg)]'
                                          : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]'
                                      }`}
                                    >
                                      {act.icon && <span className="shrink-0">{act.icon}</span>}
                                      <span>{act.label}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>

          {/* Phone Card View (< md): Two most important values clearly shown, zero horizontal overflow */}
          <div className="md:hidden divide-y divide-[var(--color-line)] bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
            {(() => {
              const seenMobileKeys = new Map<string, number>();
              return paginatedData.map((item) => {
                const rawId = String(keyExtractor(item) ?? '');
                const count = seenMobileKeys.get(rawId) || 0;
                seenMobileKeys.set(rawId, count + 1);
                const itemId = count === 0 ? rawId : `${rawId}__dup_${count}`;
                const visibleRowActions = rowActions
                  ? rowActions(item).filter((a) => !a.hidden || !a.hidden(item))
                  : [];

                return (
                  <div
                    key={itemId}
                    onClick={() => handleOpenPreview(item)}
                    className="p-4 flex items-start justify-between gap-3 active:bg-[var(--color-surface-subtle)] cursor-pointer"
                  >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {mobileColumns.primary && (
                      <div className="text-[16px] font-semibold text-[var(--color-ink)]">
                        {mobileColumns.primary.render
                          ? mobileColumns.primary.render(item)
                          : item[mobileColumns.primary.key]}
                      </div>
                    )}
                    {mobileColumns.statusCol && (
                      <div>
                        {mobileColumns.statusCol.render
                          ? mobileColumns.statusCol.render(item)
                          : item[mobileColumns.statusCol.key]}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {mobileColumns.secondary && (
                      <div className="text-left text-[16px] font-semibold text-[var(--color-ink)]">
                        {mobileColumns.secondary.render
                          ? mobileColumns.secondary.render(item)
                          : item[mobileColumns.secondary.key]}
                      </div>
                    )}

                    {visibleRowActions.length > 0 && (
                      <div
                        ref={openMenuId === itemId ? menuContainerRef : undefined}
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label="إجراءات السجل"
                          onClick={() =>
                            setOpenMenuId((prev) => (prev === itemId ? null : itemId))
                          }
                          className="min-w-[44px] min-h-[44px] -ml-2 rounded-[var(--radius-control)] flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] clinical-focus cursor-pointer"
                        >
                          <MoreVertical className="w-5 h-5" strokeWidth={1.75} />
                        </button>

                        {openMenuId === itemId && (
                          <div className="absolute left-0 top-full mt-1 w-48 clinical-dialog border border-[var(--color-line)] py-1 z-30">
                            {visibleRowActions.map((act) => (
                              <button
                                key={act.key}
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  act.onClick(item);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3.5 min-h-[44px] text-[14px] font-semibold text-right cursor-pointer ${
                                  act.variant === 'danger'
                                    ? 'text-[var(--color-danger-ink)] hover:bg-[var(--color-danger-bg)]'
                                    : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]'
                                }`}
                              >
                                {act.icon && <span className="shrink-0">{act.icon}</span>}
                                <span>{act.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-[14px] text-[var(--color-muted)]">
            <span className="num-tabular">
              عرض {startIndex}–{endIndex} من أصل {filteredData.length} سجل
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentSafePage <= 1}
                  leftIcon={<ChevronRight className="w-5 h-5" strokeWidth={1.75} />}
                >
                  السابق
                </Button>
                <span className="px-2 font-semibold text-[var(--color-ink)] num-tabular">
                  {currentSafePage} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentSafePage >= totalPages}
                  rightIcon={<ChevronLeft className="w-5 h-5" strokeWidth={1.75} />}
                >
                  التالي
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Row Preview Drawer */}
      <Drawer
        isOpen={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        title={previewItem && previewTitle ? previewTitle(previewItem) : title || 'معاينة السجل'}
        subtitle={previewItem && previewSubtitle ? previewSubtitle(previewItem) : undefined}
        fullPageLabel={previewFullPageLabel}
        onOpenFullPage={
          previewItem && onOpenFullPage ? () => onOpenFullPage(previewItem) : undefined
        }
      >
        {previewItem &&
          (renderPreview ? (
            renderPreview(previewItem, () => setPreviewItem(null))
          ) : (
            <div className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
              {columns
                .filter((c) => c.key !== 'actions')
                .map((col) => (
                  <div
                    key={col.key}
                    className="p-3.5 bg-[var(--color-surface)] flex items-start justify-between gap-4"
                  >
                    <span className="text-[14px] font-semibold text-[var(--color-muted)] shrink-0">
                      {col.header}
                    </span>
                    <div className="text-[16px] text-[var(--color-ink)] text-left">
                      {col.render ? col.render(previewItem) : previewItem[col.key]}
                    </div>
                  </div>
                ))}
            </div>
          ))}
      </Drawer>
    </div>
  );
}

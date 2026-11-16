/**
 * src/ui/components/SearchableSelect.tsx
 * Accessible searchable dropdown with keyboard navigation (ArrowUp/Down/Enter/Escape).
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  meta?: string;
}

export interface SearchableSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
  onBlur?: () => void;
  onAfterSelect?: (selectedValue: string) => void;
  size?: 'md' | 'lg';
}

export const SearchableSelect = React.forwardRef<HTMLButtonElement, SearchableSelectProps>(
  (
    {
      label,
      value,
      onChange,
      options,
      placeholder = 'اختر من القائمة...',
      searchPlaceholder = 'اكتب للبحث...',
      error,
      helperText,
      required,
      disabled,
      className = '',
      triggerClassName = '',
      ariaLabel,
      onBlur,
      onAfterSelect,
      size = 'md',
    },
    ref
  ) => {
    const id = useId();
    const errorId = `${id}_err`;
    const helperId = `${id}_help`;
    const describedBy = error ? errorId : helperText ? helperId : undefined;

    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlightedIdx, setHighlightedIdx] = useState(0);

    const setMergedRef = (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    const selectedOption = useMemo(
      () => options.find((o) => o.value === value) || null,
      [options, value]
    );

    const filteredOptions = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return options;
      return options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(q) ||
          (opt.meta && opt.meta.toLowerCase().includes(q))
      );
    }, [options, query]);

    useEffect(() => {
      setHighlightedIdx(0);
    }, [query, isOpen]);

    useEffect(() => {
      if (isOpen) {
        setTimeout(() => searchInputRef.current?.focus(), 20);
      } else {
        setQuery('');
      }
    }, [isOpen]);

    useEffect(() => {
      const handleOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          if (isOpen) {
            setIsOpen(false);
            onBlur?.();
          }
        }
      };
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }, [isOpen, onBlur]);

    const selectOption = (optValue: string, advance = false) => {
      onChange(optValue);
      setIsOpen(false);
      if (advance && onAfterSelect) {
        requestAnimationFrame(() => onAfterSelect(optValue));
      } else {
        onAfterSelect?.(optValue);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === ' ') {
          e.preventDefault();
          if (!disabled) setIsOpen(true);
        } else if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
          // If already has value and user didn't want to open, let Enter open or move if needed:
          // Opening on Enter lets keyboard users pick or confirm directly
          e.preventDefault();
          if (!disabled) setIsOpen(true);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((prev) => Math.min(filteredOptions.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filteredOptions[highlightedIdx];
        if (target) {
          selectOption(target.value, true);
        }
      }
    };

    return (
      <div ref={containerRef} className={`relative w-full space-y-1.5 text-right ${className}`} dir="rtl">
        {label && (
          <label htmlFor={id} className="block text-[14px] font-semibold text-[var(--color-ink)]">
            {label}
            {required && (
              <span className="text-[var(--color-danger-ink)] mr-1" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <button
          ref={setMergedRef}
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((o) => !o)}
          onBlur={() => {
            if (!isOpen) onBlur?.();
          }}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={`w-full flex items-center justify-between gap-2 bg-[var(--color-surface)] border rounded-[var(--radius-control)] px-3.5 text-right transition-colors duration-150 cursor-pointer clinical-focus
            ${size === 'lg' ? 'min-h-[52px]' : 'min-h-[44px]'}
            ${
              error
                ? 'border-[var(--color-danger-ink)]'
                : 'border-[var(--color-control-border)] hover:border-[var(--color-primary)]'
            }
            ${disabled ? 'bg-[var(--color-surface-subtle)] cursor-not-allowed opacity-75' : ''}
            ${triggerClassName}
          `}
        >
          <span
            className={`${size === 'lg' ? 'text-[17px]' : 'text-[16px]'} truncate ${
              selectedOption ? 'text-[var(--color-ink)] font-medium' : 'text-[var(--color-placeholder)]'
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown
            className={`w-5 h-5 text-[var(--color-muted)] shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
            strokeWidth={1.75}
          />
        </button>

        {isOpen && (
          <div
            className="absolute z-40 mt-1.5 w-full clinical-dialog border border-[var(--color-line)] overflow-hidden"
            onKeyDown={handleKeyDown}
          >
            <div className="p-2 border-b border-[var(--color-line)] bg-[var(--color-surface-subtle)]">
              <div className="relative flex items-center">
                <Search
                  className="w-5 h-5 text-[var(--color-muted)] absolute right-3 pointer-events-none"
                  strokeWidth={1.75}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-control-border)] rounded-[var(--radius-control)] pr-10 pl-8 py-2 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-placeholder)] min-h-[44px] clinical-focus"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute left-2 p-1 text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                    aria-label="مسح البحث"
                  >
                    <X className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            </div>

            <ul role="listbox" className="max-h-60 overflow-y-auto divide-y divide-[var(--color-line)]">
              {filteredOptions.length === 0 ? (
                <li className="px-4 py-4 text-[14px] text-[var(--color-muted)] text-center">
                  لا توجد خيارات مطابقة
                </li>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlightedIdx;
                  return (
                    <li key={opt.value} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        onClick={() => selectOption(opt.value, true)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-right min-h-[44px] cursor-pointer transition-colors duration-150
                          ${
                            isSelected
                              ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] font-semibold'
                              : isHighlighted
                              ? 'bg-[var(--color-surface-subtle)] text-[var(--color-ink)]'
                              : 'bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]'
                          }
                        `}
                      >
                        <div className="min-w-0">
                          <span className="block text-[14px] truncate">{opt.label}</span>
                          {opt.meta && (
                            <span className="block text-[14px] text-[var(--color-muted)] truncate">
                              {opt.meta}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check
                            className="w-5 h-5 text-[var(--color-primary)] shrink-0"
                            strokeWidth={1.75}
                          />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}

        {error && (
          <p id={errorId} className="text-[14px] font-medium text-[var(--color-danger-ink)] mt-1" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-[14px] text-[var(--color-muted)] mt-1">{helperText}</p>
        )}
      </div>
    );
  }
);

SearchableSelect.displayName = 'SearchableSelect';

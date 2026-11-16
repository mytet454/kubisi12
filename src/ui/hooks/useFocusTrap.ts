/**
 * src/ui/hooks/useFocusTrap.ts
 * Accessible dialog/drawer focus trap and focus restoration hook:
 * - Saves the element that had focus before opening.
 * - Moves focus inside the container on open.
 * - Traps Tab / Shift+Tab within focusable descendants.
 * - Handles Escape cleanly and restores focus to the trigger on close.
 */
import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0
  );
}

export function useFocusTrap(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose?: () => void
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const raf = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      // Prefer an explicitly auto-focused element inside the dialog, else first non-close field/control, else first focusable
      const autoFocused = container.querySelector<HTMLElement>('[data-autofocus], [autofocus]');
      if (autoFocused) {
        autoFocused.focus();
        return;
      }

      const focusables = getFocusableElements(container);
      const firstInput = focusables.find((el) =>
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
      );
      const target = firstInput || focusables[0] || container;
      target?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (e.key === 'Escape') {
        if (onCloseRef.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!active || active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleKeyDown);

      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        requestAnimationFrame(() => prev.focus());
      }
      previousFocusRef.current = null;
    };
  }, [isOpen, containerRef]);
}

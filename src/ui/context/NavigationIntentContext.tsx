import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { NavItemKey } from '../../domain/types';

export interface NavigationIntent {
  target: NavItemKey;
  subTab?: string;
  filter?: string;
  action?: 'new_sale' | 'new_purchase' | 'new_receipt' | 'new_payout' | 'new_expense' | 'new_request' | 'focus_id';
  focusId?: string;
  nonce: number;
}

interface NavigationIntentContextValue {
  intent: NavigationIntent | null;
  navigateWithIntent: (
    target: NavItemKey,
    options?: Omit<NavigationIntent, 'target' | 'nonce'>
  ) => void;
  consumeIntent: (target: NavItemKey) => NavigationIntent | null;
  clearIntent: () => void;
  registerNavigator: (fn: (tab: NavItemKey) => void) => void;
}

const NavigationIntentContext = createContext<NavigationIntentContextValue | null>(null);

export const NavigationIntentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [intent, setIntent] = useState<NavigationIntent | null>(null);
  const navigatorRef = useRef<((tab: NavItemKey) => void) | null>(null);

  const registerNavigator = useCallback((fn: (tab: NavItemKey) => void) => {
    navigatorRef.current = fn;
  }, []);

  const navigateWithIntent = useCallback(
    (target: NavItemKey, options?: Omit<NavigationIntent, 'target' | 'nonce'>) => {
      const nextIntent: NavigationIntent = {
        target,
        ...options,
        nonce: Date.now() + Math.random(),
      };
      setIntent(nextIntent);
      if (navigatorRef.current) {
        navigatorRef.current(target);
      }
    },
    []
  );

  const consumeIntent = useCallback(
    (target: NavItemKey): NavigationIntent | null => {
      if (!intent || intent.target !== target) return null;
      const current = intent;
      setIntent(null);
      return current;
    },
    [intent]
  );

  const clearIntent = useCallback(() => {
    setIntent(null);
  }, []);

  return (
    <NavigationIntentContext.Provider
      value={{ intent, navigateWithIntent, consumeIntent, clearIntent, registerNavigator }}
    >
      {children}
    </NavigationIntentContext.Provider>
  );
};

export const useNavigationIntent = (): NavigationIntentContextValue => {
  const ctx = useContext(NavigationIntentContext);
  if (!ctx) {
    return {
      intent: null,
      navigateWithIntent: () => {},
      consumeIntent: () => null,
      clearIntent: () => {},
      registerNavigator: () => {},
    };
  }
  return ctx;
};

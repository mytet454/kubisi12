/**
 * src/ui/context/AuthContext.tsx
 * Authentication context providing active user, role, office details, and session handlers.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Office, User } from '../../domain/types';
import { services } from '../../services';

interface AuthContextValue {
  user: User | null;
  office: Office | null;
  isLoading: boolean;
  login: (identifier: string, passwordPlain: string, twoFactorCode?: string) => Promise<{ requiresTwoFactor?: boolean; user?: User }>;
  logout: () => Promise<void>;
  switchDemoUser: (targetUserId: string) => Promise<User>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = async () => {
    try {
      const current = await services.getCurrentUser();
      setUser(current);
      if (current?.officeId) {
        try {
          const off = await services.getOffice(current, current.officeId);
          setOffice(off);
        } catch {
          setOffice(null);
        }
      } else {
        setOffice(null);
      }
    } catch {
      setUser(null);
      setOffice(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  // Session expiry after inactivity (30 minutes)
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    let timer: any = null;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        logout();
        alert('انتهت الجلسة لعدم وجود نشاط تفاعلي حفاظاً على سرية وأمان البيانات المالية للمكتب.');
      }, INACTIVITY_TIMEOUT_MS);
    };

    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [user]);

  const login = async (identifier: string, passwordPlain: string, twoFactorCode?: string) => {
    const res = await services.login(identifier, passwordPlain, twoFactorCode);
    if (!res.requiresTwoFactor && res.user) {
      setUser(res.user);
      if (res.user.officeId) {
        try {
          const off = await services.getOffice(res.user, res.user.officeId);
          setOffice(off);
        } catch {
          setOffice(null);
        }
      }
    }
    return res;
  };

  const logout = async () => {
    await services.logout();
    setUser(null);
    setOffice(null);
  };

  const switchDemoUser = async (targetUserId: string) => {
    const switched = await services.switchDemoUser(targetUserId);
    setUser(switched);
    if (switched.officeId) {
      try {
        const off = await services.getOffice(switched, switched.officeId);
        setOffice(off);
      } catch {
        setOffice(null);
      }
    } else {
      setOffice(null);
    }
    return switched;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        office,
        isLoading,
        login,
        logout,
        switchDemoUser,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

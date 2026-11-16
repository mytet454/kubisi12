/**
 * src/App.tsx
 * Master Application Root for "سوق المستلزمات الطبية" (Iraq) - Step 1 Foundation.
 */
import React, { useEffect, useState } from 'react';
import { getAllowedNavItems, NavItemKey } from './domain/types';
import { AuthProvider, useAuth } from './ui/context/AuthContext';
import { ToastProvider } from './ui/context/ToastContext';
import { AppShell } from './ui/layouts/AppShell';
import { Login } from './ui/pages/Login';
import { Employees } from './ui/pages/Employees';
import { Inventory } from './ui/pages/Inventory';
import { Parties } from './ui/pages/Parties';
import { Invoices } from './ui/pages/Invoices';
import { Accounting } from './ui/pages/Accounting';
import { Expenses } from './ui/pages/Expenses';
import { Settings } from './ui/pages/Settings';
import { AdminMerchants } from './ui/pages/AdminMerchants';
import { SelfTest } from './ui/pages/SelfTest';
import { Dashboard } from './ui/pages/Dashboard';
import { AuditLogPage } from './ui/pages/AuditLog';
import { CustomerPortal } from './ui/pages/CustomerPortal';
import { Market } from './ui/pages/Market';
import { EmptyState } from './ui/components/EmptyState';
import { Construction } from 'lucide-react';
import { AR_STRINGS } from './ui/strings/ar';

const MainRouter: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavItemKey>('self_test');

  useEffect(() => {
    if (!user) return;
    const allowed = getAllowedNavItems(user.role);
    if (!allowed.some((item) => item.key === activeTab)) {
      if (allowed.length > 0) {
        setActiveTab(allowed[0].key);
      }
    }
  }, [user, activeTab]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4" dir="rtl">
        <div className="w-16 h-16 rounded-3xl bg-teal-600 text-white flex items-center justify-center font-black text-2xl animate-bounce shadow-lg">
          س
        </div>
        <p className="mt-4 text-sm font-bold text-slate-600">{AR_STRINGS.common.loading}</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Render view corresponding to activeTab
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'market':
        return <Market />;
      case 'invoices':
        return <Invoices />;
      case 'inventory':
        return <Inventory />;
      case 'parties':
        return <Parties />;
      case 'accounting':
        return <Accounting />;
      case 'expenses':
        return <Expenses />;
      case 'employees':
        return <Employees />;
      case 'settings':
        return <Settings />;
      case 'audit_log':
        return <AuditLogPage />;
      case 'customer_portal':
        return <CustomerPortal />;
      case 'merchants_admin':
        return <AdminMerchants />;
      case 'self_test':
        return <SelfTest />;
      default:
        return (
          <div className="p-6 max-w-4xl mx-auto" dir="rtl">
            <EmptyState
              icon={<Construction className="w-8 h-8 text-amber-600" />}
              title={`شاشة: ${AR_STRINGS.nav[activeTab] || activeTab}`}
              description="هذه الشاشة مخصصة للخطوات اللاحقة من البريف (مثل لوحة التحكم التراكمية وسوق العرض والطلب)."
              actionLabel="الانتقال إلى فحص الاعتمادية (/self-test)"
              onAction={() => setActiveTab('self_test')}
            />
          </div>
        );
    }
  };

  return (
    <AppShell currentTab={activeTab} onNavigate={setActiveTab}>
      {renderContent()}
    </AppShell>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainRouter />
      </AuthProvider>
    </ToastProvider>
  );
}

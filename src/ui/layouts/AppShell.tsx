/**
 * src/ui/layouts/AppShell.tsx
 * Clinical Ledger RTL AppShell:
 * - Desktop: collapsible right sidebar grouped by job (اليوم · المبيعات · المشتريات · المخزون · الحسابات · الإدارة),
 *   strictly filtered by getAllowedNavItems(user.role).
 * - Desktop top bar: Global Search (Ctrl/Cmd + K), "+ فاتورة بيع" primary button, notification bell + popover,
 *   office name, and user menu.
 * - Mobile (< md): compact top header + fixed bottom nav with 4 destinations + centered "+" Quick Actions sheet.
 */
import '../styles/tokens.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  Receipt,
  Scale,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { getAllowedNavItems, NavItemKey, Notification } from '../../domain/types';
import { useAuth } from '../context/AuthContext';
import { useNavigationIntent } from '../context/NavigationIntentContext';
import { AR_STRINGS } from '../strings/ar';
import { services } from '../../services';
import { MoneyText } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface AppShellProps {
  currentTab: NavItemKey;
  onNavigate: (tab: NavItemKey) => void;
  children: React.ReactNode;
}

interface SidebarEntry {
  id: string;
  navKey: NavItemKey;
  label: string;
  icon: React.ReactNode;
  intentOptions?: { subTab?: string; filter?: string; action?: any };
  badgeCount?: number;
}

interface SidebarGroup {
  id: string;
  label: string;
  entries: SidebarEntry[];
}

const MOBILE_SHORT_LABELS: Partial<Record<NavItemKey, string>> = {
  dashboard: 'الرئيسية',
  market: 'السوق',
  invoices: 'الفواتير',
  inventory: 'المخزون',
  parties: 'العملاء',
  accounting: 'الحسابات',
  expenses: 'المصاريف',
  employees: 'الموظفون',
  settings: 'الإعدادات',
  audit_log: 'التدقيق',
  merchants_admin: 'المكاتب',
  self_test: 'الفحص',
  customer_portal: 'حسابي',
};

export const AppShell: React.FC<AppShellProps> = ({ currentTab, onNavigate, children }) => {
  const { user, office, logout } = useAuth();
  const { navigateWithIntent, registerNavigator } = useNavigationIntent();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifPopover, setShowNotifPopover] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showQuickSheet, setShowQuickSheet] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    products: any[];
    parties: any[];
    invoices: any[];
  } | null>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const mobileNotifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const quickSheetRef = useRef<HTMLDivElement>(null);

  useFocusTrap(showQuickSheet, quickSheetRef, () => setShowQuickSheet(false));

  useEffect(() => {
    registerNavigator(onNavigate);
  }, [onNavigate, registerNavigator]);

  // Ctrl/Cmd + K global search shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        if (searchResults) setShowSearchDropdown(true);
      } else if (e.key === 'Escape') {
        setShowSearchDropdown(false);
        setShowNotifPopover(false);
        setShowUserMenu(false);
        setShowQuickSheet(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchResults]);

  // Close popovers on outside click
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) {
        setShowSearchDropdown(false);
      }
      const clickedInsideDesktopNotif = notifRef.current?.contains(target);
      const clickedInsideMobileNotif = mobileNotifRef.current?.contains(target);
      if (!clickedInsideDesktopNotif && !clickedInsideMobileNotif) {
        setShowNotifPopover(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Load alerts/notifications
  const refreshNotifications = useCallback(() => {
    if (!user) return;
    services
      .getNotifications(user)
      .then((notifs) => setNotifications(notifs))
      .catch(() => setNotifications([]));
  }, [user]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications, currentTab]);

  // Global search debounce
  useEffect(() => {
    if (!user || searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await services.globalSearch(user, searchQuery);
        setSearchResults(results);
        setShowSearchDropdown(true);
      } catch {
        setSearchResults(null);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery, user]);

  const unreadAlertsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  if (!user) return null;

  const allowedNavItems = getAllowedNavItems(user.role);
  const allowedKeys = new Set(allowedNavItems.map((i) => i.key));
  const canCreateSale = allowedKeys.has('invoices');
  const canCreatePurchase = allowedKeys.has('invoices') && user.role !== 'cashier';
  const canRecordMoney = allowedKeys.has('expenses');

  // Role-filtered grouped navigation: اليوم · المبيعات · المشتريات · المخزون · الحسابات · الإدارة
  const sidebarGroups: SidebarGroup[] = useMemo(() => {
    const groups: SidebarGroup[] = [];

    const todayEntries: SidebarEntry[] = [];
    if (allowedKeys.has('dashboard')) {
      todayEntries.push({
        id: 'dashboard',
        navKey: 'dashboard',
        label: AR_STRINGS.nav.dashboard,
        icon: <LayoutDashboard className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (allowedKeys.has('customer_portal')) {
      todayEntries.push({
        id: 'customer_portal',
        navKey: 'customer_portal',
        label: AR_STRINGS.nav.customer_portal,
        icon: <Store className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (allowedKeys.has('market')) {
      todayEntries.push({
        id: 'market',
        navKey: 'market',
        label: AR_STRINGS.nav.market,
        icon: <ShoppingBag className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (todayEntries.length > 0) {
      groups.push({ id: 'today', label: 'اليوم', entries: todayEntries });
    }

    const salesEntries: SidebarEntry[] = [];
    if (allowedKeys.has('invoices')) {
      salesEntries.push({
        id: 'sales_invoices',
        navKey: 'invoices',
        label: 'فواتير البيع',
        icon: <FileText className="w-5 h-5" strokeWidth={1.75} />,
        intentOptions: { subTab: 'sales' },
      });
    }
    if (allowedKeys.has('parties')) {
      salesEntries.push({
        id: 'parties',
        navKey: 'parties',
        label: AR_STRINGS.nav.parties,
        icon: <Users className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (salesEntries.length > 0) {
      groups.push({ id: 'sales', label: 'المبيعات', entries: salesEntries });
    }

    if (canCreatePurchase) {
      groups.push({
        id: 'purchases',
        label: 'المشتريات',
        entries: [
          {
            id: 'purchase_invoices',
            navKey: 'invoices',
            label: 'فواتير الشراء',
            icon: <ShoppingCart className="w-5 h-5" strokeWidth={1.75} />,
            intentOptions: { subTab: 'purchases' },
          },
        ],
      });
    }

    if (allowedKeys.has('inventory')) {
      groups.push({
        id: 'inventory',
        label: 'المخزون',
        entries: [
          {
            id: 'inventory_main',
            navKey: 'inventory',
            label: AR_STRINGS.nav.inventory,
            icon: <Package className="w-5 h-5" strokeWidth={1.75} />,
            badgeCount: unreadAlertsCount,
          },
        ],
      });
    }

    const accountingEntries: SidebarEntry[] = [];
    if (allowedKeys.has('accounting')) {
      accountingEntries.push({
        id: 'accounting',
        navKey: 'accounting',
        label: AR_STRINGS.nav.accounting,
        icon: <Scale className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (allowedKeys.has('expenses')) {
      accountingEntries.push({
        id: 'expenses',
        navKey: 'expenses',
        label: AR_STRINGS.nav.expenses,
        icon: <Receipt className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (accountingEntries.length > 0) {
      groups.push({ id: 'accounting_group', label: 'الحسابات', entries: accountingEntries });
    }

    const adminEntries: SidebarEntry[] = [];
    if (allowedKeys.has('employees')) {
      adminEntries.push({
        id: 'employees',
        navKey: 'employees',
        label: AR_STRINGS.nav.employees,
        icon: <UserCheck className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (allowedKeys.has('settings')) {
      adminEntries.push({
        id: 'settings',
        navKey: 'settings',
        label: AR_STRINGS.nav.settings,
        icon: <Settings className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (allowedKeys.has('audit_log')) {
      adminEntries.push({
        id: 'audit_log',
        navKey: 'audit_log',
        label: AR_STRINGS.nav.audit_log,
        icon: <ShieldAlert className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (allowedKeys.has('merchants_admin')) {
      adminEntries.push({
        id: 'merchants_admin',
        navKey: 'merchants_admin',
        label: AR_STRINGS.nav.merchants_admin,
        icon: <Building2 className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (allowedKeys.has('self_test')) {
      adminEntries.push({
        id: 'self_test',
        navKey: 'self_test',
        label: AR_STRINGS.nav.self_test,
        icon: <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />,
      });
    }
    if (adminEntries.length > 0) {
      groups.push({ id: 'admin', label: 'الإدارة', entries: adminEntries });
    }

    return groups;
  }, [allowedKeys, canCreatePurchase, unreadAlertsCount]);

  // Mobile bottom navigation: up to 4 destinations split around central + button
  const mobileDestinations = useMemo(() => {
    return allowedNavItems.slice(0, 4);
  }, [allowedNavItems]);

  const firstTwoMobile = mobileDestinations.slice(0, 2);
  const lastTwoMobile = mobileDestinations.slice(2, 4);

  const quickActions = useMemo(() => {
    const items: Array<{
      key: string;
      label: string;
      description: string;
      icon: React.ReactNode;
      onSelect: () => void;
    }> = [];

    if (canCreateSale) {
      items.push({
        key: 'sale',
        label: 'فاتورة بيع',
        description: 'بيع بضاعة لعميل أو مستشفى',
        icon: <ShoppingBag className="w-5 h-5" strokeWidth={1.75} />,
        onSelect: () =>
          navigateWithIntent('invoices', { subTab: 'sales', action: 'new_sale' }),
      });
    }
    if (canCreatePurchase) {
      items.push({
        key: 'purchase',
        label: 'فاتورة شراء',
        description: 'إدخال وجبة شراء جديدة من مورد',
        icon: <ShoppingCart className="w-5 h-5" strokeWidth={1.75} />,
        onSelect: () =>
          navigateWithIntent('invoices', { subTab: 'purchases', action: 'new_purchase' }),
      });
    }
    if (canRecordMoney) {
      items.push(
        {
          key: 'receipt',
          label: 'سند قبض',
          description: 'استلام دفعة مالية من عميل',
          icon: <Wallet className="w-5 h-5" strokeWidth={1.75} />,
          onSelect: () =>
            navigateWithIntent('expenses', { subTab: 'payments', action: 'new_receipt' }),
        },
        {
          key: 'payout',
          label: 'سند دفع',
          description: 'سداد دفعة مستحقة لمورد',
          icon: <DollarSign className="w-5 h-5" strokeWidth={1.75} />,
          onSelect: () =>
            navigateWithIntent('expenses', { subTab: 'payments', action: 'new_payout' }),
        },
        {
          key: 'expense',
          label: 'مصروف',
          description: 'تسجيل مصروف تشغيلي للصندوق',
          icon: <Receipt className="w-5 h-5" strokeWidth={1.75} />,
          onSelect: () =>
            navigateWithIntent('expenses', { subTab: 'expenses', action: 'new_expense' }),
        }
      );
    }

    if (user.role === 'customer' && allowedKeys.has('market')) {
      items.push({
        key: 'new_request',
        label: 'طلب شراء جديد',
        description: 'إرسال طلب شراء للمكاتب المعتمدة ومقارنة العروض',
        icon: <ShoppingBag className="w-5 h-5" strokeWidth={1.75} />,
        onSelect: () => navigateWithIntent('market', { subTab: 'my_requests', action: 'new_request' }),
      });
    }

    if (items.length === 0 && allowedKeys.has('inventory')) {
      items.push({
        key: 'alerts',
        label: 'تنبيهات المخزون',
        description: 'مراجعة النواقص والوجبات قريبة الانتهاء',
        icon: <Package className="w-5 h-5" strokeWidth={1.75} />,
        onSelect: () => navigateWithIntent('inventory', { subTab: 'alerts' }),
      });
    }

    return items;
  }, [canCreateSale, canCreatePurchase, canRecordMoney, allowedKeys, navigateWithIntent, user.role]);

  const handleEntryClick = (entry: SidebarEntry) => {
    if (entry.intentOptions) {
      navigateWithIntent(entry.navKey, entry.intentOptions);
    } else {
      onNavigate(entry.navKey);
    }
  };

  const handleGlobalSearchOpen = (target: NavItemKey, subTab?: string) => {
    setShowSearchDropdown(false);
    if (subTab) {
      navigateWithIntent(target, { subTab });
    } else {
      onNavigate(target);
    }
  };

  const renderMobileNavIcon = (iconName: string) => {
    switch (iconName) {
      case 'LayoutDashboard':
        return <LayoutDashboard className="w-5 h-5" strokeWidth={1.75} />;
      case 'FileText':
        return <FileText className="w-5 h-5" strokeWidth={1.75} />;
      case 'Package':
        return <Package className="w-5 h-5" strokeWidth={1.75} />;
      case 'Users':
        return <Users className="w-5 h-5" strokeWidth={1.75} />;
      case 'Scale':
        return <Scale className="w-5 h-5" strokeWidth={1.75} />;
      case 'Receipt':
        return <Receipt className="w-5 h-5" strokeWidth={1.75} />;
      case 'UserCheck':
        return <UserCheck className="w-5 h-5" strokeWidth={1.75} />;
      case 'Settings':
        return <Settings className="w-5 h-5" strokeWidth={1.75} />;
      case 'ShieldAlert':
        return <ShieldAlert className="w-5 h-5" strokeWidth={1.75} />;
      case 'Building2':
        return <Building2 className="w-5 h-5" strokeWidth={1.75} />;
      case 'Store':
        return <Store className="w-5 h-5" strokeWidth={1.75} />;
      case 'ShoppingBag':
        return <ShoppingBag className="w-5 h-5" strokeWidth={1.75} />;
      default:
        return <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />;
    }
  };

  return (
    <div
      className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] flex flex-col md:flex-row text-right"
      dir="rtl"
      lang="ar"
    >
      {/* Desktop Right Sidebar (Collapsible to Icon Rail) */}
      <aside
        className={`hidden md:flex flex-col bg-[var(--color-surface)] border-l border-[var(--color-line)] shrink-0 z-30 transition-[width] duration-150 ${
          sidebarCollapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        {/* Brand & Collapse Button */}
        <div className="h-16 px-3 border-b border-[var(--color-line)] flex items-center justify-between gap-1.5">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-[var(--radius-control)] bg-[var(--color-primary)] text-[var(--color-surface)] flex items-center justify-center font-bold text-[16px] shrink-0">
                س
              </div>
              <div className="min-w-0">
                <span className="block text-[13.5px] font-bold text-[var(--color-ink)] truncate leading-tight">
                  {AR_STRINGS.app.title}
                </span>
                <span className="block text-[13px] text-[var(--color-muted)] truncate leading-tight">
                  {office ? office.city : AR_STRINGS.app.country}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
            title={sidebarCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
            className="min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] flex items-center justify-center clinical-press clinical-focus cursor-pointer mx-auto"
          >
            {sidebarCollapsed ? (
              <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="w-5 h-5" strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* Grouped Navigation Menu */}
        <nav
          className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
          aria-label="التنقل الرئيسي"
        >
          {sidebarGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-3 pb-1 text-[14px] font-semibold text-[var(--color-muted)]">
                  {group.label}
                </div>
              )}

              {group.entries.map((entry) => {
                const isPurchaseEntry = entry.id === 'purchase_invoices';
                const isActive =
                  currentTab === entry.navKey && !isPurchaseEntry;

                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleEntryClick(entry)}
                    title={sidebarCollapsed ? entry.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3'
                    } min-h-[44px] rounded-[var(--radius-control)] text-[15px] font-semibold transition-colors duration-150 cursor-pointer clinical-focus
                      ${
                        isActive
                          ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
                          : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)]'
                      }
                    `}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span
                        className={`shrink-0 ${
                          isActive
                            ? 'text-[var(--color-primary)]'
                            : 'text-[var(--color-muted)]'
                        }`}
                      >
                        {entry.icon}
                      </span>
                      {!sidebarCollapsed && <span className="truncate">{entry.label}</span>}
                    </span>

                    {!sidebarCollapsed &&
                      entry.badgeCount !== undefined &&
                      entry.badgeCount > 0 && (
                        <span className="num-tabular text-[14px] font-bold px-2 py-0.5 rounded-[8px] bg-[var(--color-warning-bg)] text-[var(--color-warning-ink)]">
                          {entry.badgeCount}
                        </span>
                      )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom Logout */}
        <div className="p-3 border-t border-[var(--color-line)]">
          <button
            type="button"
            onClick={logout}
            title={sidebarCollapsed ? AR_STRINGS.auth.logout : undefined}
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center' : 'justify-center gap-2'
            } min-h-[44px] px-3 rounded-[var(--radius-control)] text-[14px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-ink)] border border-[var(--color-control-border)] clinical-press clinical-focus cursor-pointer`}
          >
            <LogOut className="w-5 h-5 shrink-0" strokeWidth={1.75} />
            {!sidebarCollapsed && <span>{AR_STRINGS.auth.logout}</span>}
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header (< md) */}
        <header className="md:hidden sticky top-0 z-20 bg-[var(--color-surface)] border-b border-[var(--color-line)] px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-[var(--radius-control)] bg-[var(--color-primary)] text-[var(--color-surface)] flex items-center justify-center font-bold text-[18px] shrink-0">
              س
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-[var(--color-ink)] truncate">
                {office ? office.name : AR_STRINGS.app.title}
              </div>
              <div className="text-[14px] text-[var(--color-muted)] truncate">
                {AR_STRINGS.roles[user.role]}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <div ref={mobileNotifRef} className="relative">
              <button
                type="button"
                onClick={() => setShowNotifPopover((v) => !v)}
                aria-label="التنبيهات والإشعارات"
                aria-expanded={showNotifPopover}
                className="relative min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] clinical-focus cursor-pointer"
              >
                <Bell className="w-5 h-5" strokeWidth={1.75} />
                {unreadAlertsCount > 0 && (
                  <span
                    data-testid="mobile-unread-badge"
                    className="absolute top-1.5 left-1.5 min-w-[18px] h-[18px] px-1 rounded-[6px] bg-[var(--color-danger-ink)] text-[var(--color-surface)] text-[12px] font-bold num-tabular flex items-center justify-center"
                  >
                    {unreadAlertsCount}
                  </span>
                )}
              </button>

              {showNotifPopover && (
                <div className="absolute left-0 top-full mt-2 w-72 clinical-dialog border border-[var(--color-line)] overflow-hidden z-40">
                  <div className="px-3.5 py-2.5 border-b border-[var(--color-line)] bg-[var(--color-surface-subtle)] flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-[var(--color-ink)]">
                      الإشعارات ({unreadAlertsCount})
                    </span>
                    {unreadAlertsCount > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          await services.markAllNotificationsRead(user).catch(() => {});
                          refreshNotifications();
                        }}
                        className="text-[13px] font-semibold text-[var(--color-primary-strong)] hover:underline cursor-pointer"
                      >
                        تحديد كمقروء
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-line)]">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-[14px] text-[var(--color-muted)] text-center">
                        لا توجد إشعارات حالياً
                      </div>
                    ) : (
                      notifications.slice(0, 6).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={async () => {
                            setShowNotifPopover(false);
                            await services.markNotificationRead(user, n.id).catch(() => {});
                            refreshNotifications();
                            if (n.text.includes('الترخيص') || n.text.includes('ترخيص')) {
                              if (allowedKeys.has('merchants_admin')) onNavigate('merchants_admin');
                              else if (allowedKeys.has('settings')) onNavigate('settings');
                            } else if (
                              n.text.includes('الشكوى') ||
                              n.text.includes('شكوى')
                            ) {
                              if (allowedKeys.has('market')) navigateWithIntent('market', { subTab: 'complaints' });
                            } else if (
                              n.text.includes('تحديث الطلب') ||
                              n.text.includes('تأكيد الطلب')
                            ) {
                              if (allowedKeys.has('market')) navigateWithIntent('market', { subTab: 'orders' });
                            } else if (
                              n.text.includes('طلب شراء') ||
                              n.text.includes('عرض سعر') ||
                              n.text.includes('تم قبول') ||
                              n.text.includes('محادثة') ||
                              n.text.includes('رسالة جديدة')
                            ) {
                              if (allowedKeys.has('market')) onNavigate('market');
                            } else if (allowedKeys.has('inventory')) {
                              navigateWithIntent('inventory', { subTab: 'alerts' });
                            }
                          }}
                          className={`w-full text-right p-3 hover:bg-[var(--color-surface-subtle)] text-[14px] text-[var(--color-ink)] block cursor-pointer ${
                            !n.read ? 'bg-[var(--color-primary-soft)]/30 font-semibold' : ''
                          }`}
                        >
                          <span className="block leading-snug">{n.text}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label={AR_STRINGS.auth.logout}
              className="min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-ink)] clinical-focus cursor-pointer"
            >
              <LogOut className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        {/* Desktop Top Bar (md+) */}
        <header className="hidden md:flex sticky top-0 z-20 h-16 px-6 lg:px-8 bg-[var(--color-surface)] border-b border-[var(--color-line)] items-center justify-between gap-4">
          {/* Global Search with Ctrl/Cmd + K */}
          <div ref={searchBoxRef} className="relative w-full max-w-md">
            <div className="relative flex items-center">
              <Search
                className="w-5 h-5 text-[var(--color-muted)] absolute right-3 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults) setShowSearchDropdown(true);
                }}
                placeholder="بحث عام (مواد، عملاء، فواتير)... Ctrl+K"
                aria-label="بحث عام في النظام"
                className="w-full pr-10 pl-9 bg-[var(--color-canvas)] border border-[var(--color-control-border)] rounded-[var(--radius-control)] text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-placeholder)] min-h-[44px] focus:bg-[var(--color-surface)] clinical-focus"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults(null);
                    setShowSearchDropdown(false);
                  }}
                  aria-label="مسح البحث العام"
                  className="absolute left-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer hit-target-44"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
              )}
            </div>

            {showSearchDropdown && searchResults && (
              <div className="absolute top-full mt-2 w-full clinical-dialog border border-[var(--color-line)] overflow-hidden z-50 divide-y divide-[var(--color-line)]">
                {searchResults.products.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-[14px] font-semibold text-[var(--color-primary-strong)] bg-[var(--color-primary-soft)] rounded-[8px]">
                      المواد الطبية ({searchResults.products.length})
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {searchResults.products.slice(0, 4).map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleGlobalSearchOpen('inventory')}
                          className="w-full text-right px-2.5 min-h-[44px] rounded-[var(--radius-control)] hover:bg-[var(--color-surface-subtle)] flex items-center justify-between gap-2 text-[14px] cursor-pointer"
                        >
                          <span className="font-semibold text-[var(--color-ink)] truncate">
                            {p.name}
                          </span>
                          <span className="num-tabular text-[var(--color-primary-strong)] shrink-0">
                            {p.stock} وحدة
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.parties.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-[14px] font-semibold text-[var(--color-primary-strong)] bg-[var(--color-primary-soft)] rounded-[8px]">
                      العملاء والموردون ({searchResults.parties.length})
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {searchResults.parties.slice(0, 4).map((pt: any) => (
                        <button
                          key={pt.id}
                          type="button"
                          onClick={() => handleGlobalSearchOpen('parties')}
                          className="w-full text-right px-2.5 min-h-[44px] rounded-[var(--radius-control)] hover:bg-[var(--color-surface-subtle)] flex items-center justify-between gap-2 text-[14px] cursor-pointer"
                        >
                          <span className="font-semibold text-[var(--color-ink)] truncate">
                            {pt.name}
                          </span>
                          <MoneyText amount={pt.balance} size="sm" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.invoices.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-[14px] font-semibold text-[var(--color-primary-strong)] bg-[var(--color-primary-soft)] rounded-[8px]">
                      الفواتير ({searchResults.invoices.length})
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {searchResults.invoices.slice(0, 4).map((inv: any) => (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => handleGlobalSearchOpen('invoices')}
                          className="w-full text-right px-2.5 min-h-[44px] rounded-[var(--radius-control)] hover:bg-[var(--color-surface-subtle)] flex items-center justify-between gap-2 text-[14px] cursor-pointer"
                        >
                          <span className="num-tabular font-semibold text-[var(--color-ink)]">
                            {inv.invoiceNumber} — {inv.partyName}
                          </span>
                          <MoneyText amount={inv.total} size="sm" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.products.length === 0 &&
                  searchResults.parties.length === 0 &&
                  searchResults.invoices.length === 0 && (
                    <div className="p-4 text-center text-[14px] text-[var(--color-muted)]">
                      لا توجد نتائج مطابقة للبحث
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Right Controls: + فاتورة بيع, Notification Bell, Office & User Menu */}
          <div className="flex items-center gap-3 shrink-0">
            {canCreateSale && (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  navigateWithIntent('invoices', { subTab: 'sales', action: 'new_sale' })
                }
                leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
              >
                فاتورة بيع
              </Button>
            )}

            {/* Notification Bell + Popover (Visible for EVERY role) */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setShowNotifPopover((v) => !v)}
                aria-label="مركز التنبيهات"
                aria-expanded={showNotifPopover}
                data-testid="desktop-notif-bell"
                className="relative min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] border border-[var(--color-control-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-subtle)] flex items-center justify-center text-[var(--color-ink)] clinical-press clinical-focus cursor-pointer"
              >
                <Bell className="w-5 h-5" strokeWidth={1.75} />
                {unreadAlertsCount > 0 && (
                  <span
                    data-testid="desktop-unread-badge"
                    className="absolute -top-1.5 -left-1.5 min-w-[20px] h-[20px] px-1 rounded-[6px] bg-[var(--color-danger-ink)] text-[var(--color-surface)] text-[12px] font-bold num-tabular flex items-center justify-center"
                  >
                    {unreadAlertsCount}
                  </span>
                )}
              </button>

              {showNotifPopover && (
                <div className="absolute left-0 top-full mt-2 w-80 clinical-dialog border border-[var(--color-line)] overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-[var(--color-line)] bg-[var(--color-surface-subtle)] flex items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold text-[var(--color-ink)]">
                      الإشعارات ({unreadAlertsCount})
                    </span>
                    <div className="flex items-center gap-2">
                      {unreadAlertsCount > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            await services.markAllNotificationsRead(user).catch(() => {});
                            refreshNotifications();
                          }}
                          className="text-[13px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                        >
                          تحديد كمقروء
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifPopover(false);
                          if (allowedKeys.has('merchants_admin')) {
                            onNavigate('merchants_admin');
                          } else if (allowedKeys.has('inventory')) {
                            navigateWithIntent('inventory', { subTab: 'alerts' });
                          } else if (allowedKeys.has('market')) {
                            onNavigate('market');
                          }
                        }}
                        className="text-[14px] font-semibold text-[var(--color-primary-strong)] hover:underline cursor-pointer"
                      >
                        عرض الكل
                      </button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-line)]">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-[14px] text-[var(--color-muted)] text-center">
                        لا توجد تنبيهات نشطة حالياً
                      </div>
                    ) : (
                      notifications.slice(0, 6).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={async () => {
                            setShowNotifPopover(false);
                            await services.markNotificationRead(user, n.id).catch(() => {});
                            refreshNotifications();
                            if (n.text.includes('الترخيص') || n.text.includes('ترخيص')) {
                              if (allowedKeys.has('merchants_admin')) onNavigate('merchants_admin');
                              else if (allowedKeys.has('settings')) onNavigate('settings');
                            } else if (n.text.includes('الشكوى') || n.text.includes('شكوى')) {
                              if (allowedKeys.has('market')) {
                                navigateWithIntent('market', { subTab: 'complaints' });
                              }
                            } else if (
                              n.text.includes('تحديث الطلب') ||
                              n.text.includes('تأكيد الطلب')
                            ) {
                              if (allowedKeys.has('market')) {
                                navigateWithIntent('market', { subTab: 'orders' });
                              }
                            } else if (
                              n.text.includes('طلب شراء') ||
                              n.text.includes('عرض سعر') ||
                              n.text.includes('تم قبول') ||
                              n.text.includes('محادثة') ||
                              n.text.includes('رسالة جديدة')
                            ) {
                              if (allowedKeys.has('market')) onNavigate('market');
                            } else if (allowedKeys.has('inventory')) {
                              navigateWithIntent('inventory', { subTab: 'alerts' });
                            }
                          }}
                          className={`w-full text-right p-3.5 hover:bg-[var(--color-surface-subtle)] text-[14px] text-[var(--color-ink)] block cursor-pointer ${
                            !n.read ? 'bg-[var(--color-primary-soft)]/30 font-semibold' : ''
                          }`}
                        >
                          <span className="block leading-snug">{n.text}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Office + User Menu */}
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu((v) => !v)}
                aria-expanded={showUserMenu}
                className="flex items-center gap-2.5 px-3 min-h-[44px] rounded-[var(--radius-control)] border border-[var(--color-control-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-subtle)] clinical-press clinical-focus cursor-pointer"
              >
                <div className="text-right">
                  <div className="text-[14px] font-semibold text-[var(--color-ink)] leading-tight max-w-[230px] truncate">
                    {office ? office.name : user.name}
                  </div>
                  <div className="text-[13px] text-[var(--color-muted)] leading-tight">
                    {AR_STRINGS.roles[user.role]}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-[var(--color-muted)]" strokeWidth={1.75} />
              </button>

              {showUserMenu && (
                <div className="absolute left-0 top-full mt-2 w-64 clinical-dialog border border-[var(--color-line)] py-2 z-40">
                  <div className="px-4 py-2.5 border-b border-[var(--color-line)] space-y-1">
                    <div className="text-[15px] font-semibold text-[var(--color-ink)]">
                      {user.name}
                    </div>
                    <StatusBadge variant="teal" size="sm">
                      {AR_STRINGS.roles[user.role]}
                    </StatusBadge>
                  </div>

                  {allowedKeys.has('settings') && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        onNavigate('settings');
                      }}
                      className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-[14px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] cursor-pointer"
                    >
                      <Settings className="w-5 h-5 text-[var(--color-muted)]" strokeWidth={1.75} />
                      <span>{AR_STRINGS.nav.settings}</span>
                    </button>
                  )}

                  {allowedKeys.has('self_test') && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        onNavigate('self_test');
                      }}
                      className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-[14px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] cursor-pointer"
                    >
                      <ShieldCheck
                        className="w-5 h-5 text-[var(--color-muted)]"
                        strokeWidth={1.75}
                      />
                      <span>{AR_STRINGS.nav.self_test}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-[14px] font-semibold text-[var(--color-danger-ink)] hover:bg-[var(--color-danger-bg)] cursor-pointer border-t border-[var(--color-line)] mt-1"
                  >
                    <LogOut className="w-5 h-5" strokeWidth={1.75} />
                    <span>{AR_STRINGS.auth.logout}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Workspace Canvas */}
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Bar (< md): 4 Destinations + Center "+" Quick Action Button */}
      <nav
        aria-label="شريط التنقل السريع للهاتف"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--color-surface)] border-t border-[var(--color-line)] px-1 h-16 grid grid-cols-5 items-center"
      >
        {firstTwoMobile.map((item) => {
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 rounded-[var(--radius-control)] cursor-pointer clinical-focus ${
                isActive
                  ? 'text-[var(--color-primary-strong)] font-bold'
                  : 'text-[var(--color-muted)] font-medium'
              }`}
            >
              {renderMobileNavIcon(item.iconName)}
              <span className="text-[12px] truncate max-w-full mt-0.5">
                {MOBILE_SHORT_LABELS[item.key] || item.label}
              </span>
            </button>
          );
        })}

        {/* Central "+" Button */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => setShowQuickSheet(true)}
            aria-label="إجراء سريع"
            className="w-12 h-12 rounded-[14px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-strong)] text-[var(--color-surface)] flex items-center justify-center shadow-[var(--shadow-card)] clinical-press clinical-focus cursor-pointer"
          >
            <Plus className="w-6 h-6" strokeWidth={2} />
          </button>
        </div>

        {lastTwoMobile.map((item) => {
          const isActive = currentTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 rounded-[var(--radius-control)] cursor-pointer clinical-focus ${
                isActive
                  ? 'text-[var(--color-primary-strong)] font-bold'
                  : 'text-[var(--color-muted)] font-medium'
              }`}
            >
              {renderMobileNavIcon(item.iconName)}
              <span className="text-[12px] truncate max-w-full mt-0.5">
                {MOBILE_SHORT_LABELS[item.key] || item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Quick Actions Sheet */}
      {showQuickSheet && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end bg-[var(--color-overlay)]"
          dir="rtl"
          lang="ar"
        >
          <div
            className="fixed inset-0"
            onClick={() => setShowQuickSheet(false)}
            aria-hidden="true"
          />
          <div
            ref={quickSheetRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="لوحة الإجراءات السريعة"
            className="relative z-10 w-full bg-[var(--color-surface)] rounded-t-[var(--radius-dialog)] border-t border-[var(--color-line)] p-5 space-y-3 outline-none"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-line)]">
              <h2 className="clinical-heading-3">إجراء سريع جديد</h2>
              <button
                type="button"
                aria-label="رجوع"
                onClick={() => setShowQuickSheet(false)}
                className="min-w-[44px] min-h-[44px] px-2.5 rounded-[var(--radius-control)] text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] inline-flex items-center gap-1 text-[14px] font-semibold clinical-focus cursor-pointer"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
                <span>رجوع</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {quickActions.map((act) => (
                <button
                  key={act.key}
                  type="button"
                  onClick={() => {
                    setShowQuickSheet(false);
                    act.onSelect();
                  }}
                  className="w-full flex items-center gap-3.5 p-3.5 min-h-[52px] rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] hover:bg-[var(--color-primary-soft)]/50 text-right clinical-press clinical-focus cursor-pointer"
                >
                  <span className="w-10 h-10 rounded-[var(--radius-control)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] flex items-center justify-center shrink-0">
                    {act.icon}
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[16px] font-semibold text-[var(--color-ink)]">
                      {act.label}
                    </span>
                    <span className="block text-[14px] text-[var(--color-muted)] truncate">
                      {act.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

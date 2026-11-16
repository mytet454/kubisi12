/**
 * src/ui/pages/CustomerPortal.tsx
 * Clinical Ledger Customer Area (Hospital & Individual Buyer Portal):
 * - Profile overview + linked office switcher (Clinical card, no gradient washes)
 * - 3 KpiTiles, Tabs for Invoices & Account Statement, RTL Print Modal (#printable-section)
 * - Uses StatusBadge (icon + word), MoneyText, TableSkeleton, EmptyState, and error recovery
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  FileCheck,
  FileText,
  Printer,
  Receipt,
  RefreshCw,
  ShoppingBag,
  User as UserIcon,
} from 'lucide-react';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useNavigationIntent } from '../context/NavigationIntentContext';
import { useToast } from '../context/ToastContext';
import { MoneyText, formatWesternInt } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { TableSkeleton } from '../components/Skeletons';
import { KpiTile } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs } from '../components/Tabs';

export const CustomerPortal: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { navigateWithIntent } = useNavigationIntent();

  const [portalData, setPortalData] = useState<{
    profile: { id: string; name: string; phone: string; email?: string; role: string };
    linkedMerchants: Array<{
      id: string;
      name: string;
      city: string;
      phone: string;
      partyId: string;
      balance: number;
    }>;
    invoices: Array<{
      id: string;
      number: string;
      date: string;
      officeName: string;
      total: number;
      paid: number;
      paymentMethod: string;
      status: string;
      lines: any[];
    }>;
    statements: Array<{
      officeId: string;
      officeName: string;
      totalOwed: number;
      totalPaid: number;
      currentBalance: number;
      transactions: any[];
    }>;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'invoices' | 'statements'>('invoices');
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('');

  const loadPortal = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await services.getCustomerPortalData(user);
      setPortalData(res);
      if (res.linkedMerchants.length > 0 && !selectedMerchantId) {
        setSelectedMerchantId(res.linkedMerchants[0].id);
      }
    } catch (err: any) {
      const msg = err.message || 'تعذر تحميل بيانات بوابة المشتري. أعد المحاولة.';
      setLoadError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedMerchantId]);

  useEffect(() => {
    loadPortal();
  }, [user]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
        <TableSkeleton rows={5} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-6xl mx-auto" dir="rtl">
        <div
          role="alert"
          className="clinical-card p-6 border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="w-6 h-6 text-[var(--color-danger-ink)] shrink-0"
              strokeWidth={1.75}
            />
            <div>
              <h1 className="text-[18px] font-semibold text-[var(--color-danger-ink)]">
                تعذر تحميل بوابة المشتري
              </h1>
              <p className="text-[14px] text-[var(--color-ink)] mt-0.5">{loadError}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={loadPortal}
            leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
          >
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  if (!portalData || portalData.linkedMerchants.length === 0) {
    return (
      <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
        <div className="clinical-card p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[var(--radius-control)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] flex items-center justify-center">
              <UserIcon className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="clinical-heading-2">{user?.name}</h1>
              <p className="text-[14px] text-[var(--color-muted)] num-tabular">
                هاتف: {user?.phone} · حساب مشتري / مستشفى
              </p>
            </div>
          </div>
          <StatusBadge variant="teal">بوابة المشتري</StatusBadge>
        </div>

        <EmptyState
          icon={<Building2 className="w-8 h-8" strokeWidth={1.75} />}
          title="لا توجد مكاتب طبية مرتبطة بحسابك حالياً"
          description="عندما يسجل أي مكتب مستلزمات طبية فاتورة باسمك ورقم هاتفك، أو عند قبول عرض سعر في السوق، ستظهر فواتيرك وكشوفات حساباتك هنا تلقائياً."
          actionLabel="الانتقال إلى سوق العرض والطلب"
          onAction={() => navigateWithIntent('market')}
        />
      </div>
    );
  }

  const currentMerchant =
    portalData.linkedMerchants.find((m) => m.id === selectedMerchantId) ||
    portalData.linkedMerchants[0];

  const currentStatement = portalData.statements.find(
    (s) => s.officeId === currentMerchant.id
  ) || {
    officeId: currentMerchant.id,
    officeName: currentMerchant.name,
    totalOwed: 0,
    totalPaid: 0,
    currentBalance: currentMerchant.balance,
    transactions: [],
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header Card (Clean Clinical Ledger surface, no gradient) */}
      <section className="clinical-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant="teal" size="sm">
              منطقة المشتري والمستشفيات
            </StatusBadge>
          </div>
          <h1 className="clinical-heading-1">{portalData.profile.name}</h1>
          <p className="text-[14px] text-[var(--color-muted)]">
            الهاتف: <span className="num-tabular font-semibold">{portalData.profile.phone}</span> ·
            المكاتب الموردة المرتبطة:{' '}
            <span className="num-tabular font-semibold">{portalData.linkedMerchants.length}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 w-full md:w-auto">
          <div className="w-full md:w-72">
            <Select
              label="المكتب المورد النشط"
              value={selectedMerchantId}
              onChange={(e) => setSelectedMerchantId(e.target.value)}
              options={portalData.linkedMerchants.map((m) => ({
                value: m.id,
                label: `${m.name} (${m.city})`,
              }))}
            />
          </div>
          <Button
            variant="primary"
            onClick={() => navigateWithIntent('market')}
            leftIcon={<ShoppingBag className="w-4 h-4" strokeWidth={1.75} />}
          >
            سوق العرض والطلب
          </Button>
        </div>
      </section>

      {/* 3 KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile
          title="الرصيد القائم لدى المكتب المختار"
          value={
            <MoneyText
              amount={Math.abs(currentMerchant.balance)}
              size="xl"
              tone={currentMerchant.balance > 0 ? 'warning' : 'success'}
            />
          }
          subtitle={
            currentMerchant.balance > 0
              ? 'مطلوب سداده للمكتب'
              : currentMerchant.balance < 0
              ? 'رصيد دائن لصالحكم'
              : 'الحساب خالص بالكامل'
          }
          variant={currentMerchant.balance > 0 ? 'amber' : 'success'}
        />
        <KpiTile
          title="إجمالي الفواتير الصادرة"
          value={`${portalData.invoices.length} فاتورة`}
          subtitle="من المكاتب العلمية المرتبطة"
          variant="teal"
        />
        <KpiTile
          title="بيانات التواصل مع المكتب"
          value={<span className="num-tabular text-[20px]">{currentMerchant.phone}</span>}
          subtitle={`${currentMerchant.city} — مكتب طبي معتمد`}
          variant="slate"
        />
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          {
            key: 'invoices',
            label: 'الفواتير والطلبات',
            icon: <Receipt className="w-5 h-5" strokeWidth={1.75} />,
            count: portalData.invoices.length,
          },
          {
            key: 'statements',
            label: 'كشف الحساب المالي',
            icon: <FileText className="w-5 h-5" strokeWidth={1.75} />,
          },
        ]}
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'invoices' | 'statements')}
      />

      {/* Invoices Table */}
      {activeTab === 'invoices' && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
          <div className="px-5 py-3.5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] flex flex-wrap items-center justify-between gap-2">
            <h2 className="clinical-heading-3">سجل الفواتير من المكاتب الطبية</h2>
            <span className="text-[14px] text-[var(--color-muted)]">الأحدث أولاً</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-[14px]">
              <thead className="bg-[var(--color-canvas)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    رقم الفاتورة
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    المكتب المجهز
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    التاريخ
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-left">
                    الإجمالي
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-left">
                    المدفوع
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-left">
                    المتبقي
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    الحالة
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-center">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {portalData.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-muted)]">
                      لا توجد فواتير صادرة لحسابك حتى الآن.
                    </td>
                  </tr>
                ) : (
                  portalData.invoices.map((inv) => {
                    const remaining = Math.max(0, inv.total - inv.paid);
                    const isVoid = inv.status === 'void';
                    return (
                      <tr key={inv.id}>
                        <td className="px-4 py-3 num-tabular font-bold text-[var(--color-ink)]">
                          {inv.number}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[var(--color-primary-strong)]">
                          {inv.officeName}
                        </td>
                        <td className="px-4 py-3 num-tabular text-[var(--color-muted)]">
                          {new Date(inv.date).toLocaleDateString('ar-IQ')}
                        </td>
                        <td className="px-4 py-3 text-left">
                          <MoneyText amount={inv.total} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-left">
                          <MoneyText amount={inv.paid} size="sm" tone="success" />
                        </td>
                        <td className="px-4 py-3 text-left">
                          <MoneyText
                            amount={remaining}
                            size="sm"
                            tone={remaining > 0 && !isVoid ? 'warning' : 'muted'}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {isVoid ? (
                            <StatusBadge variant="danger" size="sm">
                              ملغاة
                            </StatusBadge>
                          ) : remaining <= 0 ? (
                            <StatusBadge variant="success" size="sm">
                              مدفوعة بالكامل
                            </StatusBadge>
                          ) : inv.paid > 0 ? (
                            <StatusBadge variant="warning" size="sm">
                              مدفوعة جزئياً
                            </StatusBadge>
                          ) : (
                            <StatusBadge variant="danger" size="sm">
                              آجلة
                            </StatusBadge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedInvoice(inv)}
                            leftIcon={<FileCheck className="w-4 h-4" strokeWidth={1.75} />}
                          >
                            عرض الفاتورة
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Statement View */}
      {activeTab === 'statements' && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
          <div className="px-5 py-4 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="clinical-heading-3">كشف حساب مع: {currentMerchant.name}</h2>
              <p className="text-[14px] text-[var(--color-muted)] mt-0.5 num-tabular">
                إجمالي المشتريات: {formatWesternInt(currentStatement.totalOwed)} د.ع · المسدد:{' '}
                {formatWesternInt(currentStatement.totalPaid)} د.ع · الرصيد القائم:{' '}
                <strong className="text-[var(--color-ink)]">
                  {formatWesternInt(currentStatement.currentBalance)} د.ع
                </strong>
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.print()}
              leftIcon={<Printer className="w-4 h-4" strokeWidth={1.75} />}
            >
              طباعة كشف الحساب
            </Button>
          </div>

          <div id="printable-section" className="overflow-x-auto" dir="rtl" lang="ar">
            <table className="w-full text-right text-[14px]">
              <thead className="bg-[var(--color-canvas)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    التاريخ
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    البيان
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    المرجع
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-left">
                    مدين (مشترياتك)
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-left">
                    دائن (مدفوعاتك)
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-left">
                    الرصيد التراكمي
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {currentStatement.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center px-4 py-8 text-[var(--color-muted)]">
                      لا توجد حركات مسجلة في كشف الحساب حتى الآن.
                    </td>
                  </tr>
                ) : (
                  currentStatement.transactions.map((t: any, idx: number) => (
                    <tr key={t.id || idx}>
                      <td className="px-4 py-3 num-tabular">
                        {new Date(t.date).toLocaleDateString('ar-IQ')}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                        {t.description}
                      </td>
                      <td className="px-4 py-3 num-tabular text-[var(--color-muted)]">
                        {t.ref || '—'}
                      </td>
                      <td className="px-4 py-3 text-left">
                        {t.debit > 0 ? <MoneyText amount={t.debit} size="sm" tone="danger" /> : '—'}
                      </td>
                      <td className="px-4 py-3 text-left">
                        {t.credit > 0 ? (
                          <MoneyText amount={t.credit} size="sm" tone="success" />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <MoneyText amount={t.runningBalance} size="sm" tone="primary" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice Details Modal (Focus-trapped) */}
      <Modal
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        title={selectedInvoice ? `فاتورة مبيعات: ${selectedInvoice.number}` : 'تفاصيل الفاتورة'}
        description={selectedInvoice ? `المكتب المجهز: ${selectedInvoice.officeName}` : undefined}
        maxWidth="lg"
      >
        {selectedInvoice && (
          <div className="space-y-5">
            <div
              id="printable-section"
              className="space-y-4 text-[14px]"
              dir="rtl"
              lang="ar"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--color-surface-subtle)] border border-[var(--color-line)] p-4 rounded-[var(--radius-control)]">
                <div>
                  <span className="text-[var(--color-muted)] block">التاريخ:</span>
                  <span className="num-tabular font-semibold text-[var(--color-ink)]">
                    {new Date(selectedInvoice.date).toLocaleDateString('ar-IQ')}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-muted)] block">طريقة الدفع:</span>
                  <span className="font-semibold text-[var(--color-ink)]">
                    {selectedInvoice.paymentMethod === 'cash'
                      ? 'نقدي'
                      : selectedInvoice.paymentMethod === 'transfer'
                      ? 'تحويل مصرفي'
                      : 'آجل'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-muted)] block">المدفوع:</span>
                  <MoneyText amount={selectedInvoice.paid} size="sm" tone="success" />
                </div>
                <div>
                  <span className="text-[var(--color-muted)] block">المتبقي:</span>
                  <MoneyText
                    amount={Math.max(0, selectedInvoice.total - selectedInvoice.paid)}
                    size="sm"
                    tone={selectedInvoice.total - selectedInvoice.paid > 0 ? 'warning' : 'muted'}
                  />
                </div>
              </div>

              <div className="overflow-x-auto border border-[var(--color-line)] rounded-[var(--radius-control)]">
                <table className="w-full text-right text-[14px]">
                  <thead className="bg-[var(--color-canvas)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
                    <tr>
                      <th scope="col" className="p-3 font-semibold">
                        المادة الطبية
                      </th>
                      <th scope="col" className="p-3 font-semibold text-center">
                        الكمية
                      </th>
                      <th scope="col" className="p-3 font-semibold text-left">
                        السعر
                      </th>
                      <th scope="col" className="p-3 font-semibold text-left">
                        الخصم
                      </th>
                      <th scope="col" className="p-3 font-semibold text-left">
                        الإجمالي
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {selectedInvoice.lines.map((l: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-3 font-semibold text-[var(--color-ink)]">
                          {l.productName || l.productId}
                        </td>
                        <td className="p-3 text-center num-tabular">{l.quantity}</td>
                        <td className="p-3 text-left num-tabular">
                          {formatWesternInt(l.unitPrice)} د.ع
                        </td>
                        <td className="p-3 text-left num-tabular">
                          {formatWesternInt(l.discount || 0)} د.ع
                        </td>
                        <td className="p-3 text-left font-bold num-tabular">
                          {formatWesternInt(l.total)} د.ع
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--color-line)]">
              <Button
                variant="primary"
                size="sm"
                onClick={() => window.print()}
                leftIcon={<Printer className="w-4 h-4" strokeWidth={1.75} />}
              >
                طباعة الفاتورة
              </Button>
              <Button variant="secondary" onClick={() => setSelectedInvoice(null)}>
                رجوع
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

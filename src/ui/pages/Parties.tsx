/**
 * src/ui/pages/Parties.tsx
 * Clinical Ledger Customers & Suppliers Screen:
 * - Consumes NavigationIntent (subTab: 'customers' | 'suppliers')
 * - Unified List Pattern with Drawer preview -> full Detail Page (Header + StatusBadge + KPIs + Tabs: كشف الحساب / الفواتير المرتبطة)
 * - Blur validation with 3-part errors (what + why + fix) & inputMode="tel"
 * - Error state with retry + RTL A4 Print Modal (#printable-section)
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Invoice, Party } from '../../domain/types';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useNavigationIntent } from '../context/NavigationIntentContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { exportToCsv } from '../utils/exportCsv';
import { MoneyText, formatWesternInt } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { Column, DataTable, RowAction } from '../components/DataTable';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import { TableSkeleton } from '../components/Skeletons';
import { KpiTile } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs } from '../components/Tabs';

export const Parties: React.FC = () => {
  const { user, office } = useAuth();
  const { intent, consumeIntent } = useNavigationIntent();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add Party Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [partyName, setPartyName] = useState<string>('');
  const [partyPhone, setPartyPhone] = useState<string>('');
  const [partyCity, setPartyCity] = useState<string>('بغداد');
  const [partyOpeningBalance, setPartyOpeningBalance] = useState<number>(0);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Detail Page State
  const [detailParty, setDetailParty] = useState<Party | null>(null);
  const [detailTab, setDetailTab] = useState<'statement' | 'invoices'>('statement');
  const [statementData, setStatementData] = useState<any | null>(null);
  const [partyInvoices, setPartyInvoices] = useState<Invoice[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  const loadParties = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setLoadError(null);
      const data = await services.getParties(
        user,
        activeTab === 'customers' ? 'customer' : 'supplier'
      );
      setParties(data);
    } catch (err: any) {
      const msg = err.message || 'تعذر تحميل قائمة الجهات. أعد المحاولة.';
      setLoadError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    loadParties();
  }, [loadParties]);

  useEffect(() => {
    if (!intent || intent.target !== 'parties') return;
    const consumed = consumeIntent('parties');
    if (!consumed) return;
    if (consumed.subTab === 'customers' || consumed.subTab === 'suppliers') {
      setActiveTab(consumed.subTab);
      setDetailParty(null);
    }
  }, [intent, consumeIntent]);

  const handleOpenDetail = async (party: Party) => {
    if (!user) return;
    setDetailParty(party);
    setDetailTab('statement');
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const [stmt, invs] = await Promise.all([
        services.getPartyStatement(user, party.id),
        services.getInvoices(user, { partyId: party.id }),
      ]);
      setStatementData(stmt);
      setPartyInvoices(invs);
    } catch (err: any) {
      const msg = err.message || 'تعذر تحميل كشف حساب الجهة.';
      setDetailError(msg);
      showToast(msg, 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  const validatePartyName = (val: string) =>
    !val.trim()
      ? 'الاسم التجاري مطلوب؛ لأن النظام يعتمده في الفواتير وكشف الحساب. أدخل اسم العميل أو المورد.'
      : undefined;

  const validatePartyPhone = (val: string) =>
    !val.trim() || val.trim().length < 7
      ? 'رقم الهاتف مطلوب؛ لربط بوابة المشتري والتواصل. أدخل رقماً صحيحاً (مثال: 07701112233).'
      : undefined;

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const nErr = validatePartyName(partyName);
    const pErr = validatePartyPhone(partyPhone);
    setNameError(nErr);
    setPhoneError(pErr);
    if (nErr || pErr) {
      setFormError('تعذر حفظ الجهة لوجود أخطاء في الحقول المطلوبة. راجع التنبيهات أسفل كل حقل.');
      return;
    }

    try {
      setSubmitting(true);
      await services.createParty(user, {
        kind: activeTab === 'customers' ? 'customer' : 'supplier',
        name: partyName.trim(),
        phone: partyPhone.trim(),
        city: partyCity.trim() || 'بغداد',
        openingBalance: Number(partyOpeningBalance) || 0,
      });

      showToast(
        activeTab === 'customers'
          ? AR_STRINGS.parties.createdCustomerSuccess
          : AR_STRINGS.parties.createdSupplierSuccess,
        'success'
      );
      setIsAddModalOpen(false);
      setPartyName('');
      setPartyPhone('');
      setPartyCity('بغداد');
      setPartyOpeningBalance(0);
      setNameError(undefined);
      setPhoneError(undefined);
      loadParties();
    } catch (err: any) {
      setFormError(err.message || 'تعذر حفظ بيانات الجهة.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportStatementCsv = () => {
    if (!detailParty || !statementData) return;
    exportToCsv(
      `statement_${detailParty.id}_${new Date().toISOString().slice(0, 10)}`,
      statementData.transactions.map((tx: any) => ({
        date: new Date(tx.date).toLocaleDateString('ar-IQ'),
        description: tx.description,
        ref: tx.ref,
        debit: tx.debit,
        credit: tx.credit,
        runningBalance: tx.runningBalance,
      })),
      [
        { key: 'date', header: 'التاريخ' },
        { key: 'description', header: 'البيان' },
        { key: 'ref', header: 'المرجع' },
        { key: 'debit', header: 'مدين (د.ع)' },
        { key: 'credit', header: 'دائن (د.ع)' },
        { key: 'runningBalance', header: 'الرصيد التراكمي (د.ع)' },
      ]
    );
  };

  const columns: Column<Party>[] = [
    {
      key: 'name',
      header: AR_STRINGS.parties.name,
      sortable: true,
      mobilePriority: 1,
      searchValue: (item) => `${item.name} ${item.city} ${item.phone}`,
      render: (item) => (
        <div>
          <span className="font-semibold text-[var(--color-ink)] block">{item.name}</span>
          <span className="text-[14px] text-[var(--color-muted)]">{item.city}</span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: AR_STRINGS.parties.phone,
      mobilePriority: 2,
      render: (item) => (
        <span className="num-tabular text-[var(--color-ink)] inline-block">{item.phone}</span>
      ),
    },
    {
      key: 'openingBalance',
      header: AR_STRINGS.parties.openingBalance,
      align: 'left',
      mobilePriority: 'hide',
      render: (item) => <MoneyText amount={item.openingBalance} size="sm" />,
    },
    {
      key: 'status',
      header: 'الربط',
      mobilePriority: 'status',
      render: (item) =>
        item.linkedUserId ? (
          <StatusBadge variant="teal" size="sm">
            حساب مرتبط
          </StatusBadge>
        ) : (
          <StatusBadge variant="neutral" size="sm">
            سجل محلي
          </StatusBadge>
        ),
    },
  ];

  const getRowActions = (item: Party): RowAction<Party>[] => [
    {
      key: 'statement',
      label: AR_STRINGS.parties.statement,
      icon: <FileSpreadsheet className="w-4 h-4" strokeWidth={1.75} />,
      onClick: () => handleOpenDetail(item),
    },
  ];

  // ==========================================
  // DETAIL VIEW
  // ==========================================
  if (detailParty) {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDetailParty(null);
                setStatementData(null);
                setPartyInvoices([]);
              }}
              leftIcon={<ArrowRight className="w-5 h-5" strokeWidth={1.75} />}
            >
              رجوع
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="clinical-heading-1">{detailParty.name}</h1>
                {detailParty.linkedUserId ? (
                  <StatusBadge variant="teal" size="sm">
                    حساب مرتبط
                  </StatusBadge>
                ) : (
                  <StatusBadge variant="neutral" size="sm">
                    سجل محلي
                  </StatusBadge>
                )}
              </div>
              <p className="text-[14px] text-[var(--color-muted)] mt-1">
                {detailParty.kind === 'customer' ? 'عميل / مستشفى' : 'مورد / شركة'} ·{' '}
                {detailParty.city} · <span className="num-tabular">{detailParty.phone}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportStatementCsv}
              disabled={!statementData}
              leftIcon={<Download className="w-4 h-4" strokeWidth={1.75} />}
            >
              تصدير CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsPrintModalOpen(true)}
              disabled={!statementData}
              leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
            >
              طباعة كشف الحساب
            </Button>
          </div>
        </div>

        {detailError ? (
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
                <h2 className="text-[16px] font-semibold text-[var(--color-danger-ink)]">
                  تعذر تحميل بيانات الجهة
                </h2>
                <p className="text-[14px] text-[var(--color-ink)] mt-0.5">{detailError}</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => handleOpenDetail(detailParty)}
              leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : loadingDetail || !statementData ? (
          <TableSkeleton rows={5} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiTile
                title={detailParty.kind === 'customer' ? 'إجمالي المستحق' : 'إجمالي المشتريات'}
                value={<MoneyText amount={statementData.totalOwed} size="xl" />}
                variant="slate"
              />
              <KpiTile
                title={detailParty.kind === 'customer' ? 'إجمالي المسدد' : 'إجمالي المدفوع'}
                value={<MoneyText amount={statementData.totalPaid} size="xl" tone="success" />}
                variant="success"
              />
              <KpiTile
                title="الرصيد المتبقي"
                value={<MoneyText amount={statementData.balance} size="xl" tone="primary" />}
                variant="teal"
              />
            </div>

            <Tabs
              tabs={[
                {
                  key: 'statement',
                  label: 'كشف الحساب',
                  icon: <FileSpreadsheet className="w-5 h-5" strokeWidth={1.75} />,
                  count: statementData.transactions.length,
                },
                {
                  key: 'invoices',
                  label: 'الفواتير المرتبطة',
                  icon: <FileText className="w-5 h-5" strokeWidth={1.75} />,
                  count: partyInvoices.length,
                },
              ]}
              activeKey={detailTab}
              onChange={(k) => setDetailTab(k as 'statement' | 'invoices')}
            />

            {detailTab === 'statement' ? (
              <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[14px]">
                    <thead className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
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
                          مدين
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          دائن
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          الرصيد
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)]">
                      {statementData.transactions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-8 text-center text-[var(--color-muted)]"
                          >
                            لا توجد حركات مالية مسجلة لهذه الجهة بعد.
                          </td>
                        </tr>
                      ) : (
                        statementData.transactions.map((tx: any) => (
                          <tr
                            key={tx.id}
                            className={
                              tx.status === 'void'
                                ? 'bg-[var(--color-danger-bg)]/40 text-[var(--color-muted)]'
                                : ''
                            }
                          >
                            <td className="px-4 py-3 num-tabular">
                              {new Date(tx.date).toLocaleDateString('ar-IQ')}
                            </td>
                            <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                              {tx.description}
                            </td>
                            <td className="px-4 py-3 text-[var(--color-muted)] num-tabular">
                              {tx.ref}
                            </td>
                            <td className="px-4 py-3 text-left num-tabular">
                              {tx.debit > 0 ? <MoneyText amount={tx.debit} size="sm" /> : '—'}
                            </td>
                            <td className="px-4 py-3 text-left num-tabular">
                              {tx.credit > 0 ? (
                                <MoneyText amount={tx.credit} size="sm" tone="success" />
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-3 text-left num-tabular font-semibold">
                              <MoneyText amount={tx.runningBalance} size="sm" tone="primary" />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[14px]">
                    <thead className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          رقم الفاتورة
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          التاريخ
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          الإجمالي
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          المسدد
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          الحالة
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)]">
                      {partyInvoices.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-8 text-center text-[var(--color-muted)]"
                          >
                            لا توجد فواتير مسجلة لهذه الجهة.
                          </td>
                        </tr>
                      ) : (
                        partyInvoices.map((inv) => (
                          <tr key={inv.id}>
                            <td className="px-4 py-3 font-semibold num-tabular text-[var(--color-ink)]">
                              {inv.number}
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
                            <td className="px-4 py-3">
                              {inv.status === 'void' ? (
                                <StatusBadge variant="danger" size="sm">
                                  ملغاة
                                </StatusBadge>
                              ) : inv.total - inv.paid > 0 ? (
                                <StatusBadge variant="warning" size="sm">
                                  غير مسددة بالكامل
                                </StatusBadge>
                              ) : (
                                <StatusBadge variant="success" size="sm">
                                  معتمدة
                                </StatusBadge>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Print Preview Modal */}
        <Modal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          title="معاينة طباعة كشف الحساب (RTL)"
          maxWidth="xl"
        >
          {statementData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-[var(--color-primary-soft)] border border-[var(--color-primary)] rounded-[var(--radius-control)] text-[14px] text-[var(--color-primary-strong)]">
                <span>كشف حساب رسمي منسق للطباعة باللغة العربية A4.</span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.print()}
                  leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
                >
                  طباعة الآن
                </Button>
              </div>

              <div
                id="printable-section"
                className="p-8 bg-white border border-[var(--color-line)] rounded-[var(--radius-control)] text-[var(--color-ink)] space-y-6"
                dir="rtl"
                lang="ar"
              >
                <div className="flex items-center justify-between border-b-2 border-[var(--color-ink)] pb-4">
                  <div>
                    <h1 className="text-[20px] font-bold">{office?.name || 'مكتب المستلزمات الطبية'}</h1>
                    <p className="text-[14px] text-[var(--color-muted)] mt-1">
                      {office?.city || 'بغداد'} | هاتف:{' '}
                      <span className="num-tabular">{office?.phone || '07701234567'}</span>
                    </p>
                  </div>
                  <div className="text-left text-[14px]">
                    <div className="font-bold">كشف حساب تفصيلي</div>
                    <div className="font-semibold text-[var(--color-primary-strong)]">
                      {detailParty.name}
                    </div>
                    <div className="text-[var(--color-muted)] num-tabular">
                      التاريخ: {new Date().toLocaleDateString('ar-IQ')}
                    </div>
                  </div>
                </div>

                <table className="w-full text-right text-[14px] border border-[var(--color-line)]">
                  <thead className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] font-bold">
                    <tr>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)]">
                        التاريخ
                      </th>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)]">
                        البيان
                      </th>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)]">
                        المرجع
                      </th>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)] text-left">
                        مدين (د.ع)
                      </th>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)] text-left">
                        دائن (د.ع)
                      </th>
                      <th scope="col" className="p-2.5 text-left">
                        الرصيد (د.ع)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {statementData.transactions.map((tx: any) => (
                      <tr key={tx.id}>
                        <td className="p-2.5 border-l border-[var(--color-line)] num-tabular">
                          {new Date(tx.date).toLocaleDateString('ar-IQ')}
                        </td>
                        <td className="p-2.5 border-l border-[var(--color-line)]">{tx.description}</td>
                        <td className="p-2.5 border-l border-[var(--color-line)] num-tabular">
                          {tx.ref}
                        </td>
                        <td className="p-2.5 border-l border-[var(--color-line)] text-left num-tabular">
                          {tx.debit > 0 ? formatWesternInt(tx.debit) : '—'}
                        </td>
                        <td className="p-2.5 border-l border-[var(--color-line)] text-left num-tabular">
                          {tx.credit > 0 ? formatWesternInt(tx.credit) : '—'}
                        </td>
                        <td className="p-2.5 text-left font-bold num-tabular">
                          {formatWesternInt(tx.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[var(--color-surface-subtle)] border-t-2 border-[var(--color-ink)] font-bold">
                    <tr>
                      <td colSpan={5} className="p-2.5 border-l border-[var(--color-line)]">
                        الرصيد النهائي المتبقي:
                      </td>
                      <td className="p-2.5 text-left num-tabular">
                        {formatWesternInt(statementData.balance)} د.ع
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setIsPrintModalOpen(false)}>
                  رجوع
                </Button>
                <Button
                  variant="primary"
                  onClick={() => window.print()}
                  leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
                >
                  طباعة كشف الحساب
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    );
  }

  // ==========================================
  // LIST VIEW
  // ==========================================
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
        <div>
          <h1 className="clinical-heading-1">{AR_STRINGS.parties.title}</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
            {AR_STRINGS.parties.subtitle}
          </p>
        </div>

        {user?.role !== 'cashier' && (
          <Button
            variant="primary"
            onClick={() => {
              setFormError(null);
              setNameError(undefined);
              setPhoneError(undefined);
              setIsAddModalOpen(true);
            }}
            leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
          >
            {activeTab === 'customers'
              ? AR_STRINGS.parties.addCustomer
              : AR_STRINGS.parties.addSupplier}
          </Button>
        )}
      </div>

      <Tabs
        tabs={[
          {
            key: 'customers',
            label: AR_STRINGS.parties.customersTab,
            icon: <Building className="w-5 h-5" strokeWidth={1.75} />,
          },
          {
            key: 'suppliers',
            label: AR_STRINGS.parties.suppliersTab,
            icon: <Users className="w-5 h-5" strokeWidth={1.75} />,
          },
        ]}
        activeKey={activeTab}
        onChange={(tab) => setActiveTab(tab as 'customers' | 'suppliers')}
      />

      {loadError ? (
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
              <h2 className="text-[16px] font-semibold text-[var(--color-danger-ink)]">
                تعذر تحميل السجل
              </h2>
              <p className="text-[14px] text-[var(--color-ink)] mt-0.5">{loadError}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={loadParties}
            leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <DataTable<Party>
          title={
            activeTab === 'customers' ? 'سجل المستشفيات والعملاء' : 'سجل الموردين والشركات'
          }
          columns={columns}
          data={parties}
          keyExtractor={(p) => p.id}
          exportFileName={`parties_${activeTab}`}
          rowActions={getRowActions}
          previewTitle={(p) => p.name}
          previewSubtitle={(p) => `${p.city} • ${p.phone}`}
          previewFullPageLabel="فتح كشف الحساب"
          onOpenFullPage={handleOpenDetail}
          renderPreview={(p, closePreview) => (
            <div className="space-y-4">
              <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] space-y-2.5 text-[14px]">
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">النوع:</span>
                  <span className="font-semibold text-[var(--color-ink)]">
                    {p.kind === 'customer' ? 'عميل / مستشفى' : 'مورد / شركة'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">الهاتف:</span>
                  <span className="num-tabular font-semibold">{p.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">المدينة:</span>
                  <span className="font-semibold">{p.city}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">الرصيد الافتتاحي:</span>
                  <MoneyText amount={p.openingBalance} size="sm" />
                </div>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  closePreview();
                  handleOpenDetail(p);
                }}
                leftIcon={<FileSpreadsheet className="w-4 h-4" strokeWidth={1.75} />}
              >
                فتح صفحة كشف الحساب
              </Button>
            </div>
          )}
          emptyTitle={AR_STRINGS.parties.emptyTitle}
          emptyDescription={AR_STRINGS.parties.emptyDesc}
          emptyActionLabel={
            user?.role !== 'cashier'
              ? activeTab === 'customers'
                ? AR_STRINGS.parties.addCustomer
                : AR_STRINGS.parties.addSupplier
              : undefined
          }
          onEmptyAction={user?.role !== 'cashier' ? () => setIsAddModalOpen(true) : undefined}
        />
      )}

      {/* Add Party Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={
          activeTab === 'customers'
            ? AR_STRINGS.parties.addCustomer
            : AR_STRINGS.parties.addSupplier
        }
      >
        <form onSubmit={handleCreateParty} noValidate className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="p-3 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-[var(--radius-control)] text-[14px] text-[var(--color-danger-ink)]"
            >
              {formError}
            </div>
          )}

          <Input
            label={AR_STRINGS.parties.name}
            placeholder={
              activeTab === 'customers'
                ? 'مثال: مستشفى الكندي الأهلي'
                : 'مثال: شركة النقاء للاستيراد الطبي'
            }
            value={partyName}
            onChange={(e) => {
              setPartyName(e.target.value);
              if (nameError) setNameError(validatePartyName(e.target.value));
            }}
            onBlur={() => setNameError(validatePartyName(partyName))}
            error={nameError}
            required
          />

          <Input
            label={AR_STRINGS.parties.phone}
            placeholder="مثال: 07701112233"
            inputMode="tel"
            value={partyPhone}
            onChange={(e) => {
              setPartyPhone(e.target.value);
              if (phoneError) setPhoneError(validatePartyPhone(e.target.value));
            }}
            onBlur={() => setPhoneError(validatePartyPhone(partyPhone))}
            error={phoneError}
            required
          />

          <Input
            label={AR_STRINGS.parties.city}
            placeholder="مثال: بغداد - الكرادة"
            value={partyCity}
            onChange={(e) => setPartyCity(e.target.value)}
          />

          <MoneyInput
            label={AR_STRINGS.parties.openingBalance}
            value={partyOpeningBalance}
            onChangeValue={setPartyOpeningBalance}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddModalOpen(false)}
              disabled={submitting}
            >
              {AR_STRINGS.common.back}
            </Button>
            <Button type="submit" variant="primary" isLoading={submitting}>
              {AR_STRINGS.parties.saveParty}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

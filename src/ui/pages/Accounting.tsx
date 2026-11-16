/**
 * src/ui/pages/Accounting.tsx
 * Clinical Ledger Accounting Engine Screen (Owner & Accountant only):
 * 1. Journal Viewer (دفتر اليومية مع الفلترة حسب التاريخ والنوع وإظهار الفاتورة المرجعية)
 * 2. Chart of Accounts (دليل الحسابات)
 * 3. Cash Box (حركة الصندوق ورصيد الخزينة 101)
 * 4. Profit & Loss (قائمة الأرباح والخسائر لفترة محددة مع الطباعة)
 * 5. Trial Balance (ميزان المراجعة الشامل مع فحص التوازن والطباعة)
 * 6. Statements (كشوفات حسابات العملاء والموردين مع الطباعة)
 * - Uses Clinical Ledger tokens, KpiTile, StatusBadge, MoneyText, TableSkeleton, EmptyState, and useToast()
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Download,
  Layers,
  Printer,
  RefreshCw,
  Scale,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Account, JournalEntry, Party } from '../../domain/types';
import { ProfitAndLossResult, TrialBalanceResult } from '../../domain/accounting';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { exportToCsv } from '../utils/exportCsv';
import { MoneyText, formatWesternInt } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { Column, DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { TableSkeleton } from '../components/Skeletons';
import { KpiTile } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs } from '../components/Tabs';

type AccountingTab =
  | 'journal'
  | 'accounts'
  | 'cash_box'
  | 'profit_loss'
  | 'trial_balance'
  | 'statements';

export const Accounting: React.FC = () => {
  const { user, office } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<AccountingTab>('journal');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Data states
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceResult | null>(null);
  const [cashBoxData, setCashBoxData] = useState<{
    currentBalance: number;
    transactions: any[];
  } | null>(null);
  const [parties, setParties] = useState<Party[]>([]);

  // Journal Filters
  const [journalFilterType, setJournalFilterType] = useState<string>('all');
  const [journalStartDate, setJournalStartDate] = useState<string>('');
  const [journalEndDate, setJournalEndDate] = useState<string>('');

  // Profit and Loss Period State
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];
  const [plStartDate, setPlStartDate] = useState<string>(defaultStart);
  const [plEndDate, setPlEndDate] = useState<string>(defaultEnd);
  const [plData, setPlData] = useState<ProfitAndLossResult | null>(null);
  const [loadingPl, setLoadingPl] = useState<boolean>(false);

  // Statement Tab State
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [selectedPartyStatement, setSelectedPartyStatement] = useState<any | null>(null);
  const [loadingStatement, setLoadingStatement] = useState<boolean>(false);

  // Printable Document Modal State
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);
  const [printDocType, setPrintDocType] = useState<
    'trial_balance' | 'profit_loss' | 'statement' | null
  >(null);

  const loadAllData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setLoadError(null);
      const [jeData, accData, tbData, cbData, custData, suppData] = await Promise.all([
        services.getJournalEntries(user),
        services.getAccounts(user),
        services.getTrialBalance(user),
        services.getCashBoxTransactions(user),
        services.getParties(user, 'customer'),
        services.getParties(user, 'supplier'),
      ]);

      setEntries(jeData);
      setAccounts(accData);
      setTrialBalance(tbData);
      setCashBoxData(cbData);
      const combinedParties = [...custData, ...suppData];
      setParties(combinedParties);
      if (combinedParties.length > 0 && !selectedPartyId) {
        setSelectedPartyId(combinedParties[0].id);
      }
    } catch (err: any) {
      const msg = err.message || 'تعذر تحميل السجلات المحاسبية.';
      setLoadError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, selectedPartyId]);

  const loadProfitAndLoss = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingPl(true);
      const startIso = plStartDate
        ? new Date(`${plStartDate}T00:00:00.000Z`).toISOString()
        : undefined;
      const endIso = plEndDate ? new Date(`${plEndDate}T23:59:59.999Z`).toISOString() : undefined;
      const res = await services.getProfitAndLoss(user, startIso, endIso);
      setPlData(res);
    } catch (err: any) {
      showToast(err.message || 'تعذر احتساب قائمة الأرباح والخسائر.', 'error');
    } finally {
      setLoadingPl(false);
    }
  }, [user, plStartDate, plEndDate]);

  const loadStatementForParty = useCallback(
    async (partyId: string) => {
      if (!user || !partyId) return;
      try {
        setLoadingStatement(true);
        const res = await services.getPartyStatement(user, partyId);
        setSelectedPartyStatement(res);
      } catch (err: any) {
        showToast(err.message || 'تعذر تحميل كشف حساب الجهة.', 'error');
      } finally {
        setLoadingStatement(false);
      }
    },
    [user]
  );

  useEffect(() => {
    loadAllData();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'profit_loss') {
      loadProfitAndLoss();
    }
  }, [activeTab, loadProfitAndLoss]);

  useEffect(() => {
    if (activeTab === 'statements' && selectedPartyId) {
      loadStatementForParty(selectedPartyId);
    }
  }, [activeTab, selectedPartyId, loadStatementForParty]);

  const getAccountName = (accId: string) => {
    return accounts.find((a) => a.id === accId)?.name || accId;
  };

  const getRefTypeLabel = (refType: string) => {
    const map: Record<string, string> = {
      sale_invoice: 'فاتورة بيع',
      purchase_invoice: 'فاتورة شراء',
      customer_payment: 'سند قبض',
      supplier_payment: 'سند دفع',
      expense: 'مصروف تشغيلي',
      void_reversal: 'قيد عكسي',
    };
    return map[refType] || refType;
  };

  const getAccountTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      asset: 'أصول',
      liability: 'خصوم',
      equity: 'حقوق ملكية',
      revenue: 'إيرادات',
      expense: 'مصاريف',
    };
    return map[type] || type;
  };

  const handlePrint = (type: 'trial_balance' | 'profit_loss' | 'statement') => {
    setPrintDocType(type);
    setPrintModalOpen(true);
  };

  const filteredJournalEntries = useMemo(() => {
    return entries.filter((e) => {
      if (journalFilterType !== 'all') {
        if (journalFilterType === 'sale_invoice' && e.refType !== 'sale_invoice') return false;
        if (journalFilterType === 'purchase_invoice' && e.refType !== 'purchase_invoice')
          return false;
        if (
          journalFilterType === 'payment' &&
          !['customer_payment', 'supplier_payment'].includes(e.refType)
        )
          return false;
        if (journalFilterType === 'expense' && e.refType !== 'expense') return false;
        if (journalFilterType === 'reversal' && !e.reversalOf) return false;
      }
      if (journalStartDate && e.date.slice(0, 10) < journalStartDate) return false;
      if (journalEndDate && e.date.slice(0, 10) > journalEndDate) return false;
      return true;
    });
  }, [entries, journalFilterType, journalStartDate, journalEndDate]);

  // CSV Exporters
  const exportJournalCsv = () => {
    exportToCsv(
      `journal_entries_${new Date().toISOString().slice(0, 10)}`,
      filteredJournalEntries.map((e) => ({
        date: new Date(e.date).toLocaleDateString('ar-IQ'),
        refType: getRefTypeLabel(e.refType),
        refId: e.refId || '',
        memo: e.memo,
        debitSum: e.lines.reduce((s, l) => s + l.debit, 0),
        creditSum: e.lines.reduce((s, l) => s + l.credit, 0),
        details: e.lines
          .map((l) => `${getAccountName(l.accountId)} (مدين: ${l.debit}, دائن: ${l.credit})`)
          .join(' | '),
      })),
      [
        { key: 'date', header: 'التاريخ' },
        { key: 'refType', header: 'نوع الحركة' },
        { key: 'refId', header: 'المرجع' },
        { key: 'memo', header: 'البيان' },
        { key: 'debitSum', header: 'مجموع المدين (د.ع)' },
        { key: 'creditSum', header: 'مجموع الدائن (د.ع)' },
        { key: 'details', header: 'تفاصيل الحسابات' },
      ]
    );
  };

  const exportAccountsCsv = () => {
    exportToCsv(`chart_of_accounts_${new Date().toISOString().slice(0, 10)}`, accounts, [
      { key: 'code', header: 'رمز الحساب' },
      { key: 'name', header: 'اسم الحساب' },
      { key: 'type', header: 'النوع' },
    ]);
  };

  const exportCashBoxCsv = () => {
    if (!cashBoxData) return;
    exportToCsv(
      `cash_box_statement_${new Date().toISOString().slice(0, 10)}`,
      cashBoxData.transactions.map((t) => ({
        date: new Date(t.date).toLocaleDateString('ar-IQ'),
        refType: getRefTypeLabel(t.refType),
        memo: t.memo,
        debit: t.debit,
        credit: t.credit,
        runningBalance: t.runningBalance,
      })),
      [
        { key: 'date', header: 'التاريخ' },
        { key: 'refType', header: 'النوع' },
        { key: 'memo', header: 'البيان' },
        { key: 'debit', header: 'مقبوضات واردة (د.ع)' },
        { key: 'credit', header: 'مدفوعات صادرة (د.ع)' },
        { key: 'runningBalance', header: 'الرصيد بعد الحركة (د.ع)' },
      ]
    );
  };

  const exportTrialBalanceCsv = () => {
    if (!trialBalance) return;
    exportToCsv(`trial_balance_${new Date().toISOString().slice(0, 10)}`, trialBalance.rows, [
      { key: 'code', header: 'رمز الحساب' },
      { key: 'name', header: 'اسم الحساب' },
      { key: 'type', header: 'النوع' },
      { key: 'debit', header: 'مجموع المدين (د.ع)' },
      { key: 'credit', header: 'مجموع الدائن (د.ع)' },
      { key: 'balanceDebit', header: 'الرصيد المدين (د.ع)' },
      { key: 'balanceCredit', header: 'الرصيد الدائن (د.ع)' },
    ]);
  };

  const journalColumns: Column<JournalEntry>[] = [
    {
      key: 'date',
      header: AR_STRINGS.accounting.date,
      mobilePriority: 2,
      render: (item) => (
        <div>
          <span className="num-tabular text-[14px] text-[var(--color-muted)] block">
            {new Date(item.date).toLocaleDateString('ar-IQ')}
          </span>
          <span className="text-[14px] font-medium text-[var(--color-ink)]">
            {getRefTypeLabel(item.refType)}
          </span>
        </div>
      ),
    },
    {
      key: 'memo',
      header: AR_STRINGS.accounting.memo,
      mobilePriority: 1,
      searchValue: (item) => `${item.memo} ${item.refId || ''}`,
      render: (item) => (
        <div className="space-y-1">
          <span className="font-semibold text-[var(--color-ink)] block">{item.memo}</span>
          {item.refId && (
            <span className="text-[14px] num-tabular text-[var(--color-primary-strong)] block">
              مرجع: {item.refId}
            </span>
          )}
          {item.reversalOf && (
            <StatusBadge variant="warning" size="sm">
              قيد عكسي لإلغاء: {item.reversalOf}
            </StatusBadge>
          )}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'أطراف القيد (المدين والدائن)',
      mobilePriority: 'hide',
      render: (item) => (
        <div className="space-y-1 text-[14px]">
          {item.lines.map((l, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 py-0.5 border-b border-[var(--color-line)] last:border-none"
            >
              <span className="text-[var(--color-ink)]">
                {l.debit > 0 ? 'من ح/' : 'إلى ح/'} {getAccountName(l.accountId)}
              </span>
              <div className="flex gap-4 num-tabular font-semibold">
                {l.debit > 0 && (
                  <span className="text-[var(--color-ink)]">
                    {formatWesternInt(l.debit)} مدين
                  </span>
                )}
                {l.credit > 0 && (
                  <span className="text-[var(--color-success-ink)]">
                    {formatWesternInt(l.credit)} دائن
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  const selectedParty = parties.find((p) => p.id === selectedPartyId);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
        <div>
          <h1 className="clinical-heading-1">{AR_STRINGS.accounting.title}</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
            دفتر الأستاذ العام، ميزان المراجعة، الأرباح والخسائر، والصندوق المالي لـ{' '}
            {office?.name || 'المكتب'}
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={loadAllData}
          leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
        >
          تحديث السجلات
        </Button>
      </div>

      {/* Navigation Tabs */}
      <Tabs
        tabs={[
          {
            key: 'journal',
            label: AR_STRINGS.accounting.journalTab,
            icon: <BookOpen className="w-5 h-5" strokeWidth={1.75} />,
          },
          {
            key: 'accounts',
            label: 'دليل الحسابات',
            icon: <Layers className="w-5 h-5" strokeWidth={1.75} />,
          },
          {
            key: 'cash_box',
            label: 'الصندوق (101)',
            icon: <Wallet className="w-5 h-5" strokeWidth={1.75} />,
          },
          {
            key: 'profit_loss',
            label: 'الأرباح والخسائر',
            icon: <TrendingUp className="w-5 h-5" strokeWidth={1.75} />,
          },
          {
            key: 'trial_balance',
            label: AR_STRINGS.accounting.trialBalanceTab,
            icon: <Scale className="w-5 h-5" strokeWidth={1.75} />,
          },
          {
            key: 'statements',
            label: 'كشوفات الحسابات',
            icon: <Users className="w-5 h-5" strokeWidth={1.75} />,
          },
        ]}
        activeKey={activeTab}
        onChange={(tab) => setActiveTab(tab as AccountingTab)}
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
                تعذر تحميل السجلات المحاسبية
              </h2>
              <p className="text-[14px] text-[var(--color-ink)] mt-0.5">{loadError}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={loadAllData}
            leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          {/* TAB 1: JOURNAL VIEWER */}
          {activeTab === 'journal' && (
            <div className="space-y-4">
              <div className="clinical-card p-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                  <Select
                    label="نوع القيد"
                    value={journalFilterType}
                    onChange={(e) => setJournalFilterType(e.target.value)}
                    options={[
                      { value: 'all', label: 'كافة أنواع القيود' },
                      { value: 'sale_invoice', label: 'فواتير البيع' },
                      { value: 'purchase_invoice', label: 'فواتير الشراء' },
                      { value: 'payment', label: 'سندات القبض والدفع' },
                      { value: 'expense', label: 'سندات المصاريف' },
                      { value: 'reversal', label: 'القيود العكسية (الإلغاء)' },
                    ]}
                  />
                  <Input
                    label="من تاريخ"
                    type="date"
                    value={journalStartDate}
                    onChange={(e) => setJournalStartDate(e.target.value)}
                  />
                  <Input
                    label="إلى تاريخ"
                    type="date"
                    value={journalEndDate}
                    onChange={(e) => setJournalEndDate(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(journalFilterType !== 'all' || journalStartDate || journalEndDate) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setJournalFilterType('all');
                        setJournalStartDate('');
                        setJournalEndDate('');
                      }}
                    >
                      مسح التصفية
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={exportJournalCsv}
                    leftIcon={<Download className="w-4 h-4" strokeWidth={1.75} />}
                  >
                    تصدير CSV
                  </Button>
                </div>
              </div>

              <DataTable<JournalEntry>
                title={`دفتر اليومية والقيود المزدوجة (${filteredJournalEntries.length} قيد)`}
                columns={journalColumns}
                data={filteredJournalEntries}
                keyExtractor={(item) => item.id}
                previewTitle={(item) => item.memo}
                previewSubtitle={(item) =>
                  `${getRefTypeLabel(item.refType)} · ${new Date(item.date).toLocaleDateString('ar-IQ')}`
                }
                renderPreview={(item) => (
                  <div className="space-y-3">
                    {item.lines.map((l, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] flex items-center justify-between text-[14px]"
                      >
                        <span className="font-medium text-[var(--color-ink)]">
                          {getAccountName(l.accountId)}
                        </span>
                        <div className="num-tabular font-semibold">
                          {l.debit > 0 ? (
                            <span className="text-[var(--color-ink)]">
                              مدين: {formatWesternInt(l.debit)} د.ع
                            </span>
                          ) : (
                            <span className="text-[var(--color-success-ink)]">
                              دائن: {formatWesternInt(l.credit)} د.ع
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                emptyTitle={AR_STRINGS.accounting.emptyTitle}
                emptyDescription={AR_STRINGS.accounting.emptyDesc}
              />
            </div>
          )}

          {/* TAB 2: CHART OF ACCOUNTS */}
          {activeTab === 'accounts' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportAccountsCsv}
                  leftIcon={<Download className="w-4 h-4" strokeWidth={1.75} />}
                >
                  تصدير دليل الحسابات CSV
                </Button>
              </div>

              {accounts.length === 0 ? (
                <EmptyState
                  title="لا توجد حسابات مسجلة"
                  description="تعرض هذه الشاشة شجرة الحسابات القياسية للمكتب الطبي."
                />
              ) : (
                <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
                  <div className="px-5 py-3.5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] flex items-center justify-between">
                    <h2 className="clinical-heading-3">دليل الحسابات الموحد المعتمد</h2>
                    <span className="text-[14px] text-[var(--color-muted)] num-tabular">
                      {accounts.length} حساباً
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-[14px]">
                      <thead className="bg-[var(--color-canvas)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            رمز الحساب
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            اسم الحساب
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            التصنيف المحاسبي
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-line)]">
                        {accounts.map((acc) => (
                          <tr key={acc.id}>
                            <td className="px-4 py-3 font-bold num-tabular text-[var(--color-primary-strong)]">
                              {acc.code}
                            </td>
                            <td className="px-4 py-3 font-semibold text-[var(--color-ink)]">
                              {acc.name}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                variant={
                                  acc.type === 'asset'
                                    ? 'teal'
                                    : acc.type === 'liability'
                                    ? 'danger'
                                    : acc.type === 'revenue'
                                    ? 'success'
                                    : 'warning'
                                }
                                size="sm"
                              >
                                {getAccountTypeLabel(acc.type)}
                              </StatusBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CASH BOX TRANSACTIONS */}
          {activeTab === 'cash_box' && cashBoxData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KpiTile
                  title="رصيد الصندوق الحالي (حساب 101)"
                  value={<MoneyText amount={cashBoxData.currentBalance} size="xl" tone="primary" />}
                  subtitle="النقد الفعلي المتاح في الخزينة"
                  icon={<Wallet className="w-5 h-5" strokeWidth={1.75} />}
                  variant="teal"
                />
                <KpiTile
                  title="إجمالي الحركات النقدية"
                  value={`${cashBoxData.transactions.length} حركة`}
                  subtitle="مقبوضات ومدفوعات معتمدة"
                  variant="slate"
                />
                <div className="clinical-card p-5 flex flex-col justify-between gap-3">
                  <span className="text-[14px] font-semibold text-[var(--color-muted)]">
                    تصدير كشف الصندوق
                  </span>
                  <Button
                    variant="secondary"
                    onClick={exportCashBoxCsv}
                    leftIcon={<Download className="w-4 h-4" strokeWidth={1.75} />}
                  >
                    تنزيل كشف الصندوق CSV
                  </Button>
                </div>
              </div>

              <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
                <div className="px-5 py-3.5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] font-semibold text-[var(--color-ink)]">
                  سجل مقبوضات ومدفوعات الصندوق التفصيلي
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[14px]">
                    <thead className="bg-[var(--color-canvas)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          التاريخ
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          النوع
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          البيان
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          مقبوضات (د.ع)
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          مدفوعات (د.ع)
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          الرصيد (د.ع)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)]">
                      {cashBoxData.transactions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-8 text-center text-[var(--color-muted)]"
                          >
                            لا توجد حركات نقدية مسجلة في الصندوق بعد.
                          </td>
                        </tr>
                      ) : (
                        cashBoxData.transactions.map((t: any) => (
                          <tr key={t.id}>
                            <td className="px-4 py-3 num-tabular text-[var(--color-muted)]">
                              {new Date(t.date).toLocaleDateString('ar-IQ')}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge variant={t.debit > 0 ? 'success' : 'danger'} size="sm">
                                {getRefTypeLabel(t.refType)}
                              </StatusBadge>
                            </td>
                            <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                              {t.memo}
                            </td>
                            <td className="px-4 py-3 text-left num-tabular font-semibold">
                              {t.debit > 0 ? (
                                <MoneyText amount={t.debit} size="sm" tone="success" />
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-3 text-left num-tabular font-semibold">
                              {t.credit > 0 ? (
                                <MoneyText amount={t.credit} size="sm" tone="danger" />
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-3 text-left num-tabular font-bold">
                              <MoneyText amount={t.runningBalance} size="sm" tone="primary" />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PROFIT AND LOSS */}
          {activeTab === 'profit_loss' && (
            <div className="space-y-6">
              <div className="clinical-card p-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-xl">
                  <Input
                    label="من تاريخ"
                    type="date"
                    value={plStartDate}
                    onChange={(e) => setPlStartDate(e.target.value)}
                  />
                  <Input
                    label="إلى تاريخ"
                    type="date"
                    value={plEndDate}
                    onChange={(e) => setPlEndDate(e.target.value)}
                  />
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handlePrint('profit_loss')}
                  leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
                >
                  طباعة قائمة الدخل
                </Button>
              </div>

              {loadingPl ? (
                <TableSkeleton rows={4} />
              ) : plData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiTile
                      title="إجمالي إيرادات المبيعات"
                      value={<MoneyText amount={plData.salesRevenue} size="xl" />}
                      subtitle="صافي فواتير المبيعات"
                      variant="slate"
                    />
                    <KpiTile
                      title="تكلفة البضاعة المباعة (COGS)"
                      value={<MoneyText amount={plData.costOfGoodsSold} size="xl" />}
                      subtitle="محسوبة بالمتوسط المرجح"
                      variant="teal"
                    />
                    <KpiTile
                      title="صافي ربح / (خسارة) الفترة"
                      value={
                        <MoneyText
                          amount={plData.netProfit}
                          size="xl"
                          tone={plData.netProfit >= 0 ? 'success' : 'danger'}
                        />
                      }
                      subtitle="مجمل الربح مطروحاً منه المصاريف"
                      variant={plData.netProfit >= 0 ? 'success' : 'rose'}
                    />
                  </div>

                  <div className="clinical-card overflow-hidden">
                    <div className="px-5 py-3.5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] font-semibold text-[var(--color-ink)] flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
                      <span>قائمة الدخل والأرباح التفصيلية</span>
                    </div>
                    <div className="p-5 space-y-4 text-[15px]">
                      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)]">
                        <span className="font-semibold text-[var(--color-ink)]">
                          1. إيرادات المبيعات (حساب 401)
                        </span>
                        <MoneyText amount={plData.salesRevenue} size="md" />
                      </div>

                      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)] text-[var(--color-muted)]">
                        <span>يُطرح: تكلفة البضاعة المباعة (حساب 501)</span>
                        <MoneyText amount={plData.costOfGoodsSold} size="md" tone="danger" />
                      </div>

                      <div className="flex items-center justify-between p-3.5 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] font-semibold">
                        <span>= مجمل الربح التشغيلي</span>
                        <MoneyText amount={plData.grossProfit} size="md" tone="primary" />
                      </div>

                      <div className="space-y-2 pt-1">
                        <div className="font-semibold text-[var(--color-ink)]">
                          2. المصاريف التشغيلية والإدارية:
                        </div>
                        {plData.expensesBreakdown.length === 0 ? (
                          <p className="text-[14px] text-[var(--color-muted)] pr-4">
                            لا توجد مصاريف تشغيلية مسجلة خلال هذه الفترة.
                          </p>
                        ) : (
                          <div className="space-y-1.5 pr-4 text-[14px]">
                            {plData.expensesBreakdown.map((item: any) => (
                              <div
                                key={item.code}
                                className="flex items-center justify-between py-1 border-b border-[var(--color-line)]"
                              >
                                <span className="text-[var(--color-muted)]">مصروف {item.name}</span>
                                <MoneyText amount={item.amount} size="sm" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)]">
                        <span className="font-semibold text-[var(--color-ink)]">
                          إجمالي المصاريف التشغيلية
                        </span>
                        <MoneyText amount={plData.operatingExpenses} size="md" tone="danger" />
                      </div>

                      <div
                        className={`flex items-center justify-between p-4 rounded-[var(--radius-control)] border font-bold ${
                          plData.netProfit >= 0
                            ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success-ink)]'
                            : 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger-ink)]'
                        }`}
                      >
                        <span>= صافي الربح المحاسبي النهائي:</span>
                        <MoneyText
                          amount={plData.netProfit}
                          size="lg"
                          tone={plData.netProfit >= 0 ? 'success' : 'danger'}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 5: TRIAL BALANCE */}
          {activeTab === 'trial_balance' && trialBalance && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handlePrint('trial_balance')}
                  leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
                >
                  طباعة ميزان المراجعة
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportTrialBalanceCsv}
                  leftIcon={<Download className="w-4 h-4" strokeWidth={1.75} />}
                >
                  تصدير CSV
                </Button>
              </div>

              <div
                className={`p-5 rounded-[var(--radius-card)] border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  trialBalance.isBalanced
                    ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success-ink)]'
                    : 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger-ink)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-7 h-7 shrink-0" strokeWidth={1.75} />
                  <div>
                    <div className="font-bold text-[18px]">
                      {trialBalance.isBalanced
                        ? AR_STRINGS.accounting.isBalanced
                        : AR_STRINGS.accounting.isUnbalanced}
                    </div>
                    <p className="text-[14px] opacity-90 mt-0.5">
                      تطابق إجمالي الجانب المدين مع الجانب الدائن لكافة القيود المرحلة
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-[14px] block">إجمالي المدين</span>
                    <MoneyText amount={trialBalance.totalDebit} size="md" />
                  </div>
                  <div>
                    <span className="text-[14px] block">إجمالي الدائن</span>
                    <MoneyText amount={trialBalance.totalCredit} size="md" />
                  </div>
                </div>
              </div>

              <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
                <div className="px-5 py-3.5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] font-semibold text-[var(--color-ink)]">
                  أرصدة الحسابات وميزان المراجعة الشامل
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[14px]">
                    <thead className="bg-[var(--color-canvas)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          الرمز
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          اسم الحساب
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          النوع
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          مجموع المدين
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          مجموع الدائن
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          الرصيد المدين
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold text-left">
                          الرصيد الدائن
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)]">
                      {trialBalance.rows.map((row: any) => (
                        <tr key={row.accountId}>
                          <td className="px-4 py-3 font-bold num-tabular text-[var(--color-ink)]">
                            {row.code}
                          </td>
                          <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                            {row.name}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge variant="neutral" size="sm">
                              {getAccountTypeLabel(row.type)}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-left num-tabular">
                            {row.debit > 0 ? formatWesternInt(row.debit) : '—'}
                          </td>
                          <td className="px-4 py-3 text-left num-tabular">
                            {row.credit > 0 ? formatWesternInt(row.credit) : '—'}
                          </td>
                          <td className="px-4 py-3 text-left num-tabular font-bold text-[var(--color-primary-strong)]">
                            {row.balanceDebit > 0 ? formatWesternInt(row.balanceDebit) : '—'}
                          </td>
                          <td className="px-4 py-3 text-left num-tabular font-bold text-[var(--color-success-ink)]">
                            {row.balanceCredit > 0 ? formatWesternInt(row.balanceCredit) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[var(--color-surface-subtle)] border-t-2 border-[var(--color-ink)] font-bold">
                      <tr>
                        <td colSpan={3} className="px-4 py-3">
                          الإجمالي العام المتوازن:
                        </td>
                        <td className="px-4 py-3 text-left">
                          <MoneyText amount={trialBalance.totalDebit} size="md" tone="primary" />
                        </td>
                        <td className="px-4 py-3 text-left">
                          <MoneyText amount={trialBalance.totalCredit} size="md" tone="primary" />
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: PARTY STATEMENTS */}
          {activeTab === 'statements' && (
            <div className="space-y-6">
              <div className="clinical-card p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="w-full sm:w-96">
                  <Select
                    label="اختر العميل أو المورد لاستعراض كشف الحساب"
                    value={selectedPartyId}
                    onChange={(e) => setSelectedPartyId(e.target.value)}
                    options={parties.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.kind === 'customer' ? 'عميل/مستشفى' : 'مورد/شركة'})`,
                    }))}
                  />
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handlePrint('statement')}
                  disabled={!selectedPartyStatement}
                  leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
                >
                  طباعة كشف الحساب
                </Button>
              </div>

              {loadingStatement ? (
                <TableSkeleton rows={5} />
              ) : selectedPartyStatement && selectedParty ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiTile
                      title="الرصيد الافتتاحي"
                      value={
                        <MoneyText amount={selectedPartyStatement.openingBalance ?? 0} size="lg" />
                      }
                      variant="slate"
                    />
                    <KpiTile
                      title="إجمالي المستحق"
                      value={<MoneyText amount={selectedPartyStatement.totalOwed ?? 0} size="lg" />}
                      variant="slate"
                    />
                    <KpiTile
                      title="إجمالي المسدد"
                      value={
                        <MoneyText
                          amount={selectedPartyStatement.totalPaid ?? 0}
                          size="lg"
                          tone="success"
                        />
                      }
                      variant="success"
                    />
                    <KpiTile
                      title="الرصيد الصافي المتبقي"
                      value={
                        <MoneyText
                          amount={selectedPartyStatement.balance ?? 0}
                          size="lg"
                          tone="primary"
                        />
                      }
                      variant="teal"
                    />
                  </div>

                  <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
                    <div className="px-5 py-3.5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--color-ink)]">
                        سجل المعاملات والفواتير لـ: {selectedParty.name}
                      </span>
                      <span className="text-[14px] text-[var(--color-muted)] num-tabular">
                        هاتف: {selectedParty.phone}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
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
                          {selectedPartyStatement.transactions.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-4 py-8 text-center text-[var(--color-muted)]"
                              >
                                لا توجد حركات مالية مسجلة لهذه الجهة.
                              </td>
                            </tr>
                          ) : (
                            selectedPartyStatement.transactions.map((tx: any) => (
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
                                <td className="px-4 py-3 num-tabular text-[var(--color-muted)]">
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
                                <td className="px-4 py-3 text-left num-tabular font-bold">
                                  <MoneyText amount={tx.runningBalance} size="sm" tone="primary" />
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* PRINT PREVIEW MODAL (#printable-section RTL A4) */}
      <Modal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="معاينة الطباعة والمستند الرسمي (RTL)"
        maxWidth="xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-[var(--color-primary-soft)] border border-[var(--color-primary)] rounded-[var(--radius-control)] text-[14px] text-[var(--color-primary-strong)]">
            <span>مستند منسق للطباعة الرسمية على ورق A4 بالاتجاه العربي من اليمين إلى اليسار.</span>
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
                <h1 className="text-[20px] font-bold">{office?.name || 'سوق المستلزمات الطبية'}</h1>
                <p className="text-[14px] text-[var(--color-muted)] mt-1">
                  الجمهورية العراقية - {office?.city || 'بغداد'} | هاتف:{' '}
                  <span className="num-tabular">{office?.phone || '07701234567'}</span>
                </p>
              </div>
              <div className="text-left text-[14px] num-tabular">
                <div>التاريخ: {new Date().toLocaleDateString('ar-IQ')}</div>
                <div className="text-[var(--color-muted)]">النظام المحاسبي المعتمد</div>
              </div>
            </div>

            {printDocType === 'trial_balance' && trialBalance && (
              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-[18px] font-bold">ميزان المراجعة الشامل</h2>
                  <p className="text-[14px] text-[var(--color-muted)] mt-0.5">
                    حالة التوازن: {trialBalance.isBalanced ? 'متوازن' : 'غير متوازن'}
                  </p>
                </div>

                <table className="w-full text-right text-[14px] border border-[var(--color-line)]">
                  <thead className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] font-bold">
                    <tr>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)]">
                        الرمز
                      </th>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)]">
                        اسم الحساب
                      </th>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)] text-left">
                        مجموع المدين
                      </th>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)] text-left">
                        مجموع الدائن
                      </th>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)] text-left">
                        رصيد مدين
                      </th>
                      <th scope="col" className="p-2.5 text-left">
                        رصيد دائن
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {trialBalance.rows.map((r: any) => (
                      <tr key={r.accountId}>
                        <td className="p-2.5 border-l border-[var(--color-line)] num-tabular">
                          {r.code}
                        </td>
                        <td className="p-2.5 border-l border-[var(--color-line)] font-medium">
                          {r.name}
                        </td>
                        <td className="p-2.5 border-l border-[var(--color-line)] text-left num-tabular">
                          {r.debit > 0 ? formatWesternInt(r.debit) : '—'}
                        </td>
                        <td className="p-2.5 border-l border-[var(--color-line)] text-left num-tabular">
                          {r.credit > 0 ? formatWesternInt(r.credit) : '—'}
                        </td>
                        <td className="p-2.5 border-l border-[var(--color-line)] text-left font-bold num-tabular">
                          {r.balanceDebit > 0 ? formatWesternInt(r.balanceDebit) : '—'}
                        </td>
                        <td className="p-2.5 text-left font-bold num-tabular">
                          {r.balanceCredit > 0 ? formatWesternInt(r.balanceCredit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[var(--color-surface-subtle)] font-bold border-t-2 border-[var(--color-ink)]">
                    <tr>
                      <td colSpan={2} className="p-2.5 border-l border-[var(--color-line)]">
                        الإجمالي المتطابق:
                      </td>
                      <td className="p-2.5 border-l border-[var(--color-line)] text-left num-tabular">
                        {formatWesternInt(trialBalance.totalDebit)}
                      </td>
                      <td className="p-2.5 border-l border-[var(--color-line)] text-left num-tabular">
                        {formatWesternInt(trialBalance.totalCredit)}
                      </td>
                      <td colSpan={2} className="p-2.5"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {printDocType === 'profit_loss' && plData && (
              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-[18px] font-bold">قائمة الأرباح والخسائر</h2>
                  <p className="text-[14px] text-[var(--color-muted)] num-tabular mt-0.5">
                    عن الفترة من {plStartDate} إلى {plEndDate}
                  </p>
                </div>

                <div className="border border-[var(--color-line)] rounded-[var(--radius-control)] p-4 space-y-3 text-[14px]">
                  <div className="flex justify-between font-bold border-b border-[var(--color-line)] pb-2">
                    <span>إيرادات المبيعات:</span>
                    <span className="num-tabular">{formatWesternInt(plData.salesRevenue)} د.ع</span>
                  </div>
                  <div className="flex justify-between border-b border-[var(--color-line)] pb-2">
                    <span>يُطرح: تكلفة البضاعة المباعة (COGS):</span>
                    <span className="num-tabular text-[var(--color-danger-ink)]">
                      ({formatWesternInt(plData.costOfGoodsSold)}) د.ع
                    </span>
                  </div>
                  <div className="flex justify-between font-bold bg-[var(--color-surface-subtle)] p-2.5 rounded">
                    <span>مجمل الربح:</span>
                    <span className="num-tabular text-[var(--color-primary-strong)]">
                      {formatWesternInt(plData.grossProfit)} د.ع
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[var(--color-line)] pb-2">
                    <span>يُطرح: إجمالي المصاريف التشغيلية:</span>
                    <span className="num-tabular text-[var(--color-danger-ink)]">
                      ({formatWesternInt(plData.operatingExpenses)}) د.ع
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-[16px] bg-[var(--color-surface-subtle)] p-3 rounded border border-[var(--color-line)]">
                    <span>صافي الربح النهائي:</span>
                    <span className="num-tabular">{formatWesternInt(plData.netProfit)} د.ع</span>
                  </div>
                </div>
              </div>
            )}

            {printDocType === 'statement' && selectedPartyStatement && selectedParty && (
              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-[18px] font-bold">كشف حساب مالي رسمي</h2>
                  <p className="text-[14px] text-[var(--color-muted)] mt-0.5">
                    الجهة: {selectedParty.name} ({selectedParty.kind === 'customer' ? 'عميل' : 'مورد'}) |
                    هاتف: <span className="num-tabular">{selectedParty.phone}</span>
                  </p>
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
                        مدين
                      </th>
                      <th scope="col" className="p-2.5 border-l border-[var(--color-line)] text-left">
                        دائن
                      </th>
                      <th scope="col" className="p-2.5 text-left">
                        الرصيد
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {selectedPartyStatement.transactions.map((tx: any) => (
                      <tr key={tx.id}>
                        <td className="p-2.5 border-l border-[var(--color-line)] num-tabular">
                          {new Date(tx.date).toLocaleDateString('ar-IQ')}
                        </td>
                        <td className="p-2.5 border-l border-[var(--color-line)]">
                          {tx.description}
                        </td>
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
                  <tfoot className="bg-[var(--color-surface-subtle)] font-bold border-t-2 border-[var(--color-ink)]">
                    <tr>
                      <td colSpan={5} className="p-2.5 border-l border-[var(--color-line)]">
                        الرصيد النهائي المستحق:
                      </td>
                      <td className="p-2.5 text-left num-tabular">
                        {formatWesternInt(selectedPartyStatement.balance ?? 0)} د.ع
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="pt-6 border-t border-[var(--color-line)] flex flex-wrap justify-between gap-4 text-[14px] text-[var(--color-muted)]">
              <div>المحاسب المسؤول: {user?.name}</div>
              <div>ختم وتوقيع الإدارة: ___________________</div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setPrintModalOpen(false)}>
              رجوع
            </Button>
            <Button
              variant="primary"
              onClick={() => window.print()}
              leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
            >
              طباعة
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

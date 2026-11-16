/**
 * src/ui/pages/Expenses.tsx
 * Clinical Ledger Expenses & Payments Screen:
 * - Consumes NavigationIntent (subTab: 'expenses' | 'payments', action: 'new_expense' | 'new_receipt' | 'new_payout')
 * - Unified List Pattern with date range filtering, Drawer preview, ⋮ menu
 * - Uses MoneyInput, SearchableSelect, SegmentedControl, and StatusBadge
 */
import React, { useEffect, useState } from 'react';
import { Banknote, DollarSign, Plus } from 'lucide-react';
import { Expense, Party, Payment } from '../../domain/types';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useNavigationIntent } from '../context/NavigationIntentContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { MoneyText } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { Column, DataTable } from '../components/DataTable';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import { SearchableSelect } from '../components/SearchableSelect';
import { SegmentedControl } from '../components/SegmentedControl';
import { Select } from '../components/Select';
import { TableSkeleton } from '../components/Skeletons';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs } from '../components/Tabs';

export const Expenses: React.FC = () => {
  const { user } = useAuth();
  const { intent, consumeIntent } = useNavigationIntent();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'expenses' | 'payments'>('expenses');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState<boolean>(false);
  const [expCategory, setExpCategory] = useState<string>('مصاريف إيجار المستودعات');
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expPaidFrom, setExpPaidFrom] = useState<string>('cash');
  const [expMemo, setExpMemo] = useState<string>('');
  const [expFieldErrors, setExpFieldErrors] = useState<{ amount?: string }>({});

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [payPartyId, setPayPartyId] = useState<string>('');
  const [payDirection, setPayDirection] = useState<'in' | 'out'>('in');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer'>('cash');
  const [payMemo, setPayMemo] = useState<string>('');
  const [payFieldErrors, setPayFieldErrors] = useState<{ partyId?: string; amount?: string }>({});

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const validateExpAmount = (val: number) =>
    !val || val <= 0
      ? 'مبلغ المصروف غير صحيح لأن القيمة يجب أن تفوق الصفر. أدخل المبلغ بالدينار العراقي.'
      : undefined;

  const validatePayParty = (val: string) =>
    !val
      ? 'الطرف غير محدد لأنه مطلوب لربط السند بالحساب. اختر العميل أو المورد من القائمة.'
      : undefined;

  const validatePayAmount = (val: number) =>
    !val || val <= 0
      ? 'مبلغ السند غير صحيح لأن القيمة يجب أن تفوق الصفر. أدخل المبلغ بالدينار العراقي.'
      : undefined;

  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setLoadError(null);
      const [expData, payData, partData] = await Promise.all([
        services.getExpenses(user),
        services.getPayments(user),
        services.getParties(user),
      ]);
      setExpenses(expData);
      setPayments(payData);
      setParties(partData);
    } catch (err: any) {
      setLoadError(
        err.message ||
          'تعذر تحميل سجل المصاريف والسندات بسبب خطأ في الاتصال بالبيانات. اضغط على إعادة المحاولة.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, activeTab]);

  useEffect(() => {
    if (!intent || intent.target !== 'expenses') return;
    const consumed = consumeIntent('expenses');
    if (!consumed) return;

    if (consumed.subTab === 'payments' || consumed.subTab === 'expenses') {
      setActiveTab(consumed.subTab);
    }

    if (consumed.action === 'new_expense') {
      setActiveTab('expenses');
      setFormError(null);
      setExpFieldErrors({});
      setIsExpenseModalOpen(true);
    } else if (consumed.action === 'new_receipt') {
      setActiveTab('payments');
      setPayDirection('in');
      setPayPartyId('');
      setFormError(null);
      setPayFieldErrors({});
      setIsPaymentModalOpen(true);
    } else if (consumed.action === 'new_payout') {
      setActiveTab('payments');
      setPayDirection('out');
      setPayPartyId('');
      setFormError(null);
      setPayFieldErrors({});
      setIsPaymentModalOpen(true);
    }
  }, [intent, consumeIntent]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const amountErr = validateExpAmount(expAmount);
    setExpFieldErrors({ amount: amountErr });
    if (amountErr) {
      setFormError(amountErr);
      return;
    }

    try {
      setSubmitting(true);
      await services.createExpense(user, {
        category: expCategory,
        amount: expAmount,
        date: new Date().toISOString(),
        paidFrom: expPaidFrom === 'bank' ? 'bank' : 'cash',
        memo: expMemo.trim(),
      });

      showToast(AR_STRINGS.expenses.createdSuccess, 'success');
      setIsExpenseModalOpen(false);
      setExpAmount(0);
      setExpMemo('');
      setExpFieldErrors({});
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'تعذر حفظ المصروف. تحقق من البيانات وأعد المحاولة.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const partyErr = validatePayParty(payPartyId);
    const amountErr = validatePayAmount(payAmount);
    setPayFieldErrors({ partyId: partyErr, amount: amountErr });
    if (partyErr || amountErr) {
      setFormError(partyErr || amountErr || null);
      return;
    }

    try {
      setSubmitting(true);
      await services.createPayment(user, {
        partyId: payPartyId,
        direction: payDirection,
        amount: payAmount,
        method: payMethod,
        date: new Date().toISOString(),
        memo: payMemo.trim(),
      });

      showToast(AR_STRINGS.payments.createdSuccess, 'success');
      setIsPaymentModalOpen(false);
      setPayAmount(0);
      setPayMemo('');
      setPayFieldErrors({});
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'تعذر حفظ السند. تحقق من البيانات وأعد المحاولة.');
    } finally {
      setSubmitting(false);
    }
  };

  const expenseColumns: Column<Expense>[] = [
    {
      key: 'category',
      header: AR_STRINGS.expenses.category,
      mobilePriority: 1,
      searchValue: (item) => `${item.category} ${item.memo || ''}`,
      render: (item) => (
        <div>
          <span className="font-semibold text-[var(--color-ink)] block">{item.category}</span>
          {item.memo && (
            <span className="text-[14px] text-[var(--color-muted)]">{item.memo}</span>
          )}
        </div>
      ),
    },
    {
      key: 'date',
      header: AR_STRINGS.expenses.date,
      sortable: true,
      mobilePriority: 'hide',
      render: (item) => (
        <span className="num-tabular text-[14px] text-[var(--color-muted)]">
          {new Date(item.date).toLocaleDateString('ar-IQ')}
        </span>
      ),
    },
    {
      key: 'amount',
      header: AR_STRINGS.expenses.amount,
      sortable: true,
      align: 'left',
      mobilePriority: 2,
      render: (item) => <MoneyText amount={item.amount} size="md" />,
    },
    {
      key: 'paidFrom',
      header: AR_STRINGS.expenses.paidFrom,
      mobilePriority: 'status',
      render: (item) => (
        <StatusBadge variant={item.paidFrom === 'bank' ? 'teal' : 'neutral'} size="sm">
          {item.paidFrom === 'bank' ? 'تحويل مصرفي' : 'صندوق النقد'}
        </StatusBadge>
      ),
    },
  ];

  const paymentColumns: Column<Payment>[] = [
    {
      key: 'partyId',
      header: AR_STRINGS.payments.party,
      mobilePriority: 1,
      searchValue: (item) =>
        `${parties.find((p) => p.id === item.partyId)?.name || item.partyId} ${item.memo || ''}`,
      render: (item) => (
        <div>
          <span className="font-semibold text-[var(--color-ink)] block">
            {parties.find((p) => p.id === item.partyId)?.name || item.partyId}
          </span>
          <span className="text-[14px] text-[var(--color-muted)] num-tabular">
            {new Date(item.date).toLocaleDateString('ar-IQ')}
          </span>
        </div>
      ),
    },
    {
      key: 'direction',
      header: 'نوع السند',
      mobilePriority: 'status',
      render: (item) => (
        <StatusBadge variant={item.direction === 'in' ? 'success' : 'warning'} size="sm">
          {item.direction === 'in' ? 'سند قبض' : 'سند دفع'}
        </StatusBadge>
      ),
    },
    {
      key: 'amount',
      header: AR_STRINGS.payments.amount,
      sortable: true,
      align: 'left',
      mobilePriority: 2,
      render: (item) => <MoneyText amount={item.amount} size="md" />,
    },
    {
      key: 'method',
      header: AR_STRINGS.payments.method,
      mobilePriority: 'hide',
      render: (item) => (
        <span className="text-[14px] text-[var(--color-muted)]">
          {item.method === 'cash' ? 'نقداً' : 'تحويل مصرفي'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
        <div>
          <h1 className="clinical-heading-1">{AR_STRINGS.expenses.title}</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
            {AR_STRINGS.expenses.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'expenses' ? (
            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setExpFieldErrors({});
                setIsExpenseModalOpen(true);
              }}
              leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
            >
              {AR_STRINGS.expenses.addExpense}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setPayFieldErrors({});
                setIsPaymentModalOpen(true);
              }}
              leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
            >
              {AR_STRINGS.payments.addPayment}
            </Button>
          )}
        </div>
      </div>

      <Tabs
        tabs={[
          {
            key: 'expenses',
            label: 'المصاريف التشغيلية',
            icon: <DollarSign className="w-5 h-5" strokeWidth={1.75} />,
          },
          {
            key: 'payments',
            label: 'سندات القبض والدفع',
            icon: <Banknote className="w-5 h-5" strokeWidth={1.75} />,
          },
        ]}
        activeKey={activeTab}
        onChange={(tab) => setActiveTab(tab as 'expenses' | 'payments')}
      />

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-[var(--radius-control)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-between gap-3"
        >
          <span className="text-[14px] font-semibold text-[var(--color-danger-ink)]">
            {loadError}
          </span>
          <Button variant="secondary" size="sm" onClick={loadData}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : activeTab === 'expenses' ? (
        <DataTable<Expense>
          title="سجل المصاريف التشغيلية"
          columns={expenseColumns}
          data={expenses}
          keyExtractor={(item) => item.id}
          exportFileName="expenses"
          dateAccessor={(item) => item.date}
          emptyTitle="لا توجد مصاريف مسجلة"
          emptyDescription="تعرض هذه الشاشة مصاريف المكتب التشغيلية؛ سجّل أول مصروف لتحديث الصندوق."
          emptyActionLabel={AR_STRINGS.expenses.addExpense}
          onEmptyAction={() => {
            setFormError(null);
            setExpFieldErrors({});
            setIsExpenseModalOpen(true);
          }}
        />
      ) : (
        <DataTable<Payment>
          title="سجل سندات القبض والدفع"
          columns={paymentColumns}
          data={payments}
          keyExtractor={(item) => item.id}
          exportFileName="payments"
          dateAccessor={(item) => item.date}
          emptyTitle="لا توجد سندات مسجلة"
          emptyDescription="تعرض هذه الشاشة سندات القبض من العملاء وسندات الدفع للموردين؛ سجّل أول سند للبدء."
          emptyActionLabel={AR_STRINGS.payments.addPayment}
          onEmptyAction={() => {
            setFormError(null);
            setPayFieldErrors({});
            setIsPaymentModalOpen(true);
          }}
        />
      )}

      {/* Add Expense Modal */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title={AR_STRINGS.expenses.addExpense}
      >
        <form onSubmit={handleCreateExpense} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="p-3 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-[var(--radius-control)] text-[14px] text-[var(--color-danger-ink)]"
            >
              {formError}
            </div>
          )}

          <Select
            label={AR_STRINGS.expenses.category}
            value={expCategory}
            onChange={(e) => setExpCategory(e.target.value)}
            options={[
              { value: 'مصاريف إيجار المستودعات', label: 'مصاريف إيجار المستودعات (502)' },
              { value: 'رواتب وأجور الكادر', label: 'رواتب وأجور الكادر (503)' },
              { value: 'مصاريف نقل وتوزيع وتفريغ', label: 'مصاريف نقل وتوزيع وتفريغ (504)' },
              { value: 'مصاريف كهرباء ومولدات', label: 'مصاريف كهرباء ومولدات (505)' },
              { value: 'مصاريف صيانة وتشغيل عامة', label: 'مصاريف صيانة وتشغيل عامة' },
            ]}
          />

          <MoneyInput
            label={AR_STRINGS.expenses.amount}
            value={expAmount}
            onChangeValue={(val) => {
              setExpAmount(val);
              if (expFieldErrors.amount) setExpFieldErrors({ amount: validateExpAmount(val) });
            }}
            onBlur={() => setExpFieldErrors({ amount: validateExpAmount(expAmount) })}
            error={expFieldErrors.amount}
            required
          />

          <Select
            label={AR_STRINGS.expenses.paidFrom}
            value={expPaidFrom}
            onChange={(e) => setExpPaidFrom(e.target.value)}
            options={[
              { value: 'cash', label: 'صندوق النقد الرئيسي (101)' },
              { value: 'bank', label: 'الحساب المصرفي (102)' },
            ]}
          />

          <Input
            label={AR_STRINGS.expenses.memo}
            placeholder="مثال: إيجار مستودع شارع الرشيد"
            value={expMemo}
            onChange={(e) => setExpMemo(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsExpenseModalOpen(false)}
              disabled={submitting}
            >
              {AR_STRINGS.common.back}
            </Button>
            <Button type="submit" variant="primary" isLoading={submitting}>
              {AR_STRINGS.expenses.saveExpense}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={AR_STRINGS.payments.addPayment}
      >
        <form onSubmit={handleCreatePayment} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="p-3 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-[var(--radius-control)] text-[14px] text-[var(--color-danger-ink)]"
            >
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <span className="block text-[14px] font-semibold text-[var(--color-ink)]">
              نوع السند
            </span>
            <SegmentedControl
              ariaLabel="تحديد نوع السند"
              value={payDirection}
              onChange={(v) => {
                setPayDirection(v as 'in' | 'out');
                setPayPartyId('');
                setPayFieldErrors((p) => ({ ...p, partyId: undefined }));
              }}
              options={[
                { value: 'in', label: 'سند قبض (من عميل)' },
                { value: 'out', label: 'سند دفع (لمورد)' },
              ]}
            />
          </div>

          <SearchableSelect
            label={AR_STRINGS.payments.party}
            value={payPartyId}
            onChange={(val) => {
              setPayPartyId(val);
              if (payFieldErrors.partyId) {
                setPayFieldErrors((p) => ({ ...p, partyId: validatePayParty(val) }));
              }
            }}
            onBlur={() => setPayFieldErrors((p) => ({ ...p, partyId: validatePayParty(payPartyId) }))}
            error={payFieldErrors.partyId}
            options={parties
              .filter((p) => p.kind === (payDirection === 'in' ? 'customer' : 'supplier'))
              .map((p) => ({
                value: p.id,
                label: `${p.name} (${p.city})`,
                meta: p.phone,
              }))}
            placeholder="اختر الطرف المعني..."
            searchPlaceholder="ابحث بالاسم أو الهاتف..."
            required
          />

          <MoneyInput
            label={AR_STRINGS.payments.amount}
            value={payAmount}
            onChangeValue={(val) => {
              setPayAmount(val);
              if (payFieldErrors.amount) {
                setPayFieldErrors((p) => ({ ...p, amount: validatePayAmount(val) }));
              }
            }}
            onBlur={() => setPayFieldErrors((p) => ({ ...p, amount: validatePayAmount(payAmount) }))}
            error={payFieldErrors.amount}
            required
          />

          <Select
            label={AR_STRINGS.payments.method}
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value as 'cash' | 'transfer')}
            options={[
              { value: 'cash', label: 'نقداً (صندوق النقد)' },
              { value: 'transfer', label: 'تحويل مصرفي' },
            ]}
          />

          <Input
            label={AR_STRINGS.payments.memo}
            placeholder="مثال: دفعة تحت الحساب"
            value={payMemo}
            onChange={(e) => setPayMemo(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsPaymentModalOpen(false)}
              disabled={submitting}
            >
              {AR_STRINGS.common.back}
            </Button>
            <Button type="submit" variant="primary" isLoading={submitting}>
              {AR_STRINGS.payments.savePayment}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

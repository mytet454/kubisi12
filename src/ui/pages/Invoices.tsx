/**
 * src/ui/pages/Invoices.tsx
 * Clinical Ledger Sales & Purchase Invoices Screen:
 * - Fast single-screen New Sale / New Purchase form (no wizard) with keyboard-only flow:
 *   Enter advances across fields and appends a new line at the end; Ctrl/Cmd+Enter saves.
 * - Inline quick-add party ("عميل جديد" / "مورد جديد") for permitted roles
 * - FEFO batch display + "تغيير الدفعة" toggle (cost, profit, and batch controls hidden for Cashier)
 * - Inline stock shortage errors directly under the offending line
 * - Sticky summary bar + Unsaved changes ConfirmDialog + Post-save 3-button success state
 * - Full Invoice Detail Page with Tabs ("بنود الفاتورة" + role-restricted "القيود المحاسبية") & Void ConfirmDialog
 * - Unified List Pattern with error state, Drawer preview, and RTL A4 Print Modal
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  Package,
  Plus,
  Printer,
  RefreshCw,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { Account, Invoice, Party, ProductStockInfo, Warehouse } from '../../domain/types';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useNavigationIntent } from '../context/NavigationIntentContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { MoneyText, formatWesternInt } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Column, DataTable, RowAction } from '../components/DataTable';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import { SearchableSelect } from '../components/SearchableSelect';
import { SegmentedControl } from '../components/SegmentedControl';
import { Select } from '../components/Select';
import { TableSkeleton } from '../components/Skeletons';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, TabItem } from '../components/Tabs';

type ViewMode = 'list' | 'new_sale' | 'new_purchase' | 'detail';

interface SaleDraftLine {
  uid: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  manualBatchId?: string;
  showBatchPicker?: boolean;
}

interface PurchaseDraftLine {
  uid: string;
  productId: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  discount: number;
}

function makeUid(): string {
  return 'line_' + Math.random().toString(36).slice(2, 9);
}

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultExpiryInput(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().slice(0, 10);
}

export const Invoices: React.FC = () => {
  const { user, office } = useAuth();
  const { intent, consumeIntent } = useNavigationIntent();
  const { showToast } = useToast();

  const isCashier = user?.role === 'cashier';
  const canViewAccounting = user?.role === 'owner' || user?.role === 'accountant';
  const canCreateParty = user?.role === 'owner' || user?.role === 'accountant';

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases'>('sales');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductStockInfo[]>([]);
  const [customers, setCustomers] = useState<Party[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Detail Page State
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailTab, setDetailTab] = useState<'lines' | 'journal'>('lines');
  const [invoiceJournalEntries, setInvoiceJournalEntries] = useState<any[]>([]);
  const [loadingJournal, setLoadingJournal] = useState<boolean>(false);

  // Print & Void Dialog State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [voiding, setVoiding] = useState<boolean>(false);

  // ==========================================
  // New Sale / Purchase Form State
  // ==========================================
  const [formKind, setFormKind] = useState<'sale' | 'purchase'>('sale');
  const [formPartyId, setFormPartyId] = useState<string>('');
  const [formPartyError, setFormPartyError] = useState<string | undefined>(undefined);
  const [formDate, setFormDate] = useState<string>(todayDateInput());
  const [formWarehouseId, setFormWarehouseId] = useState<string>('');
  const [formPaymentMethod, setFormPaymentMethod] = useState<'cash' | 'transfer' | 'credit'>('cash');
  const [formDiscount, setFormDiscount] = useState<number>(0);
  const [formNotes, setFormNotes] = useState<string>('');

  const [saleLines, setSaleLines] = useState<SaleDraftLine[]>([]);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseDraftLine[]>([]);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [savedSuccessInvoice, setSavedSuccessInvoice] = useState<Invoice | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState<boolean>(false);

  // Inline quick-add customer/supplier
  const [showInlinePartyForm, setShowInlinePartyForm] = useState<boolean>(false);
  const [newPartyName, setNewPartyName] = useState<string>('');
  const [newPartyPhone, setNewPartyPhone] = useState<string>('');
  const [newPartyCity, setNewPartyCity] = useState<string>('بغداد');
  const [newPartyNameErr, setNewPartyNameErr] = useState<string | undefined>(undefined);
  const [newPartyPhoneErr, setNewPartyPhoneErr] = useState<string | undefined>(undefined);
  const [savingInlineParty, setSavingInlineParty] = useState<boolean>(false);

  // Keyboard flow refs per line UID
  const productRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lotRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const expiryRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const priceRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const discountRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setLoadError(null);
      const [invData, prodData, custData, suppData, whData] = await Promise.all([
        services.getInvoices(user, { kind: activeTab === 'sales' ? 'sale' : 'purchase' }),
        services.getProducts(user),
        services.getParties(user, 'customer'),
        services.getParties(user, 'supplier'),
        services.getWarehouses(user),
      ]);

      setInvoices(invData);
      setProducts(prodData);
      setCustomers(custData);
      setSuppliers(suppData);
      setWarehouses(whData);

      if (whData.length > 0 && !formWarehouseId) {
        const def = whData.find((w) => w.isDefault) || whData[0];
        setFormWarehouseId(def.id);
      }

      if (canViewAccounting) {
        try {
          const accs = await services.getAccounts(user);
          setAccounts(accs);
        } catch {
          setAccounts([]);
        }
      }
    } catch (err: any) {
      const msg = err.message || 'تعذر تحميل الفواتير بسبب خطأ بالخدمة. أعد المحاولة.';
      setLoadError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, activeTab, canViewAccounting]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const initNewForm = useCallback(
    (kind: 'sale' | 'purchase', currentProducts?: ProductStockInfo[], currentWhs?: Warehouse[]) => {
      const prods = currentProducts || products;
      const whs = currentWhs || warehouses;
      setFormKind(kind);
      setFormPartyId('');
      setFormPartyError(undefined);
      setFormDate(todayDateInput());
      setFormPaymentMethod(kind === 'sale' ? 'cash' : 'credit');
      setFormDiscount(0);
      setFormNotes('');
      setFormError(null);
      setLineErrors({});
      setSavedSuccessInvoice(null);
      setShowInlinePartyForm(false);
      setNewPartyName('');
      setNewPartyPhone('');
      setNewPartyCity('بغداد');
      setIsDirty(false);

      if (whs.length > 0) {
        const def = whs.find((w) => w.isDefault) || whs[0];
        setFormWarehouseId(def.id);
      }

      const activeProds = prods.filter((p) => p.active);
      if (kind === 'sale') {
        setSaleLines([
          {
            uid: makeUid(),
            productId: activeProds[0]?.id || '',
            quantity: 1,
            unitPrice: activeProds[0]?.salePrice || 0,
            discount: 0,
          },
        ]);
      } else {
        setPurchaseLines([
          {
            uid: makeUid(),
            productId: activeProds[0]?.id || '',
            lotNumber: 'LOT-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 900 + 100),
            expiryDate: defaultExpiryInput(),
            quantity: 10,
            purchasePrice: activeProds[0]?.purchasePrice || 5000,
            discount: 0,
          },
        ]);
      }
      setViewMode(kind === 'sale' ? 'new_sale' : 'new_purchase');
    },
    [products, warehouses]
  );

  // Sync first default line once products arrive if user opened new form via intent before products loaded
  useEffect(() => {
    if (viewMode === 'new_sale' && saleLines.length > 0 && !saleLines[0].productId) {
      const activeProds = products.filter((p) => p.active);
      if (activeProds.length > 0) {
        setSaleLines((prev) =>
          prev.map((l, i) =>
            i === 0 ? { ...l, productId: activeProds[0].id, unitPrice: activeProds[0].salePrice } : l
          )
        );
      }
    }
    if (viewMode === 'new_purchase' && purchaseLines.length > 0 && !purchaseLines[0].productId) {
      const activeProds = products.filter((p) => p.active);
      if (activeProds.length > 0) {
        setPurchaseLines((prev) =>
          prev.map((l, i) =>
            i === 0
              ? { ...l, productId: activeProds[0].id, purchasePrice: activeProds[0].purchasePrice || 5000 }
              : l
          )
        );
      }
    }
  }, [viewMode, products]);

  // Handle cross-page navigation intent (from Dashboard, Topbar, or Mobile Quick Sheet)
  useEffect(() => {
    if (!intent || intent.target !== 'invoices') return;
    const consumed = consumeIntent('invoices');
    if (!consumed) return;

    if (consumed.subTab === 'purchases' && !isCashier) {
      setActiveTab('purchases');
    } else if (consumed.subTab === 'sales') {
      setActiveTab('sales');
    }

    if (consumed.filter) {
      setStatusFilter(consumed.filter);
    }

    if (consumed.action === 'new_sale') {
      setActiveTab('sales');
      initNewForm('sale');
    } else if (consumed.action === 'new_purchase' && !isCashier) {
      setActiveTab('purchases');
      initNewForm('purchase');
    }
  }, [intent, consumeIntent, isCashier, initNewForm]);

  // Warn before browser tab unload if unsaved changes exist
  useEffect(() => {
    const inForm = viewMode === 'new_sale' || viewMode === 'new_purchase';
    if (!inForm || !isDirty || savedSuccessInvoice) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [viewMode, isDirty, savedSuccessInvoice]);

  const handleOpenDetails = async (inv: Invoice) => {
    if (!user) return;
    setSelectedInvoice(inv);
    setDetailTab('lines');
    setViewMode('detail');

    if (canViewAccounting) {
      setLoadingJournal(true);
      try {
        const allEntries = await services.getJournalEntries(user);
        setInvoiceJournalEntries(allEntries.filter((e) => e.refId === inv.id));
      } catch {
        setInvoiceJournalEntries([]);
      } finally {
        setLoadingJournal(false);
      }
    } else {
      setInvoiceJournalEntries([]);
    }
  };

  const handleRequestLeaveForm = () => {
    if (isDirty && !savedSuccessInvoice) {
      setShowUnsavedConfirm(true);
    } else {
      setViewMode('list');
      setSavedSuccessInvoice(null);
    }
  };

  const activePartiesList = formKind === 'sale' ? customers : suppliers;
  const allKnownParties = useMemo(() => [...customers, ...suppliers], [customers, suppliers]);

  const getPartyName = (partyId: string) =>
    allKnownParties.find((p) => p.id === partyId)?.name || 'جهة مسجلة';

  const getAccountLabel = (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    return acc ? `${acc.code} — ${acc.name}` : accountId;
  };

  // Inline quick-add party handler
  const handleSaveInlineParty = async () => {
    if (!user) return;
    let valid = true;
    if (!newPartyName.trim()) {
      setNewPartyNameErr('اسم الجهة مطلوب؛ أدخل الاسم التجاري أو اسم المستشفى.');
      valid = false;
    } else {
      setNewPartyNameErr(undefined);
    }
    if (!newPartyPhone.trim() || newPartyPhone.trim().length < 7) {
      setNewPartyPhoneErr('رقم الهاتف مطلوب؛ أدخل رقم هاتف عراقي صحيح للتواصل والربط.');
      valid = false;
    } else {
      setNewPartyPhoneErr(undefined);
    }
    if (!valid) return;

    setSavingInlineParty(true);
    try {
      const created = await services.createParty(user, {
        kind: formKind === 'sale' ? 'customer' : 'supplier',
        name: newPartyName.trim(),
        phone: newPartyPhone.trim(),
        city: newPartyCity.trim() || 'بغداد',
        openingBalance: 0,
      });

      if (formKind === 'sale') {
        setCustomers((prev) => [created, ...prev]);
      } else {
        setSuppliers((prev) => [created, ...prev]);
      }
      setFormPartyId(created.id);
      setFormPartyError(undefined);
      setIsDirty(true);
      setShowInlinePartyForm(false);
      setNewPartyName('');
      setNewPartyPhone('');
      setNewPartyCity('بغداد');
      showToast(
        formKind === 'sale'
          ? 'تم حفظ العميل الجديد واختياره في الفاتورة'
          : 'تم حفظ المورد الجديد واختياره في الفاتورة',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'تعذر حفظ بيانات الجهة الجديدة.', 'error');
    } finally {
      setSavingInlineParty(false);
    }
  };

  // Line helpers
  const appendSaleLine = (focusNewProduct = false) => {
    const newUid = makeUid();
    const activeProds = products.filter((p) => p.active);
    const defaultProd = activeProds[0];
    setSaleLines((prev) => [
      ...prev,
      {
        uid: newUid,
        productId: defaultProd?.id || '',
        quantity: 1,
        unitPrice: defaultProd?.salePrice || 0,
        discount: 0,
      },
    ]);
    setIsDirty(true);
    if (focusNewProduct) {
      requestAnimationFrame(() => {
        productRefs.current[newUid]?.focus();
      });
    }
  };

  const appendPurchaseLine = (focusNewProduct = false) => {
    const newUid = makeUid();
    const activeProds = products.filter((p) => p.active);
    const defaultProd = activeProds[0];
    setPurchaseLines((prev) => [
      ...prev,
      {
        uid: newUid,
        productId: defaultProd?.id || '',
        lotNumber: 'LOT-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 900 + 100),
        expiryDate: defaultExpiryInput(),
        quantity: 10,
        purchasePrice: defaultProd?.purchasePrice || 5000,
        discount: 0,
      },
    ]);
    setIsDirty(true);
    if (focusNewProduct) {
      requestAnimationFrame(() => {
        productRefs.current[newUid]?.focus();
      });
    }
  };

  // FEFO batch helper for sale line
  const getFefoSummaryForLine = (line: SaleDraftLine, prod?: ProductStockInfo) => {
    if (!prod) return { chosenBatch: null, availableBatches: [], availableQty: 0 };
    const positiveBatches = [...prod.batches]
      .filter((b) => b.quantityOnHand > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    if (line.manualBatchId) {
      const manual = prod.batches.find((b) => b.id === line.manualBatchId) || null;
      return {
        chosenBatch: manual,
        availableBatches: positiveBatches,
        availableQty: manual ? manual.quantityOnHand : 0,
      };
    }
    return {
      chosenBatch: positiveBatches[0] || null,
      availableBatches: positiveBatches,
      availableQty: prod.quantityOnHand,
    };
  };

  // Compute totals for active form
  const formTotals = useMemo(() => {
    if (formKind === 'sale') {
      const grossLines = saleLines.reduce((s, l) => s + Math.round(l.quantity * l.unitPrice), 0);
      const lineDiscSum = saleLines.reduce((s, l) => s + Math.round(l.discount || 0), 0);
      const subtotalAfterLineDisc = saleLines.reduce(
        (s, l) => s + Math.max(0, Math.round(l.quantity * l.unitPrice) - Math.round(l.discount || 0)),
        0
      );
      const totalDiscount = lineDiscSum + Math.round(formDiscount || 0);
      const netTotal = Math.max(0, subtotalAfterLineDisc - Math.round(formDiscount || 0));
      const paid = formPaymentMethod === 'credit' ? 0 : netTotal;
      const remaining = netTotal - paid;
      return { grossLines, subtotalAfterLineDisc, totalDiscount, netTotal, paid, remaining };
    }

    const grossLines = purchaseLines.reduce(
      (s, l) => s + Math.round(l.quantity * l.purchasePrice),
      0
    );
    const lineDiscSum = purchaseLines.reduce((s, l) => s + Math.round(l.discount || 0), 0);
    const subtotalAfterLineDisc = purchaseLines.reduce(
      (s, l) =>
        s + Math.max(0, Math.round(l.quantity * l.purchasePrice) - Math.round(l.discount || 0)),
      0
    );
    const totalDiscount = lineDiscSum + Math.round(formDiscount || 0);
    const netTotal = Math.max(0, subtotalAfterLineDisc - Math.round(formDiscount || 0));
    const paid = formPaymentMethod === 'credit' ? 0 : netTotal;
    const remaining = netTotal - paid;
    return { grossLines, subtotalAfterLineDisc, totalDiscount, netTotal, paid, remaining };
  }, [formKind, saleLines, purchaseLines, formDiscount, formPaymentMethod]);

  const handleSaveInvoice = async (shouldPrintAfter = false) => {
    if (!user || submitting) return;
    setFormError(null);
    setLineErrors({});

    if (!formPartyId) {
      const msg =
        formKind === 'sale'
          ? 'تعذر حفظ الفاتورة لأن العميل غير محدد. اختر العميل أو أضف عميلاً جديداً ثم أعد الحفظ.'
          : 'تعذر حفظ الفاتورة لأن المورد غير محدد. اختر المورد ثم أعد الحفظ.';
      setFormPartyError(msg);
      setFormError(msg);
      return;
    }

    const isoDate = formDate ? new Date(`${formDate}T12:00:00.000Z`).toISOString() : new Date().toISOString();

    if (formKind === 'sale') {
      if (saleLines.length === 0) {
        setFormError('تعذر حفظ فاتورة البيع لعدم وجود بنود. أضف مادة طبية واحدة على الأقل.');
        return;
      }

      // Validate lines locally for clear field errors
      const nextLineErrors: Record<string, string> = {};
      for (const l of saleLines) {
        if (!l.productId) {
          nextLineErrors[l.uid] = 'اختر المادة الطبية لهذا السطر قبل الحفظ.';
        } else if (!l.quantity || l.quantity <= 0) {
          nextLineErrors[l.uid] = 'الكمية يجب أن تكون 1 على الأقل.';
        }
      }
      if (Object.keys(nextLineErrors).length > 0) {
        setLineErrors(nextLineErrors);
        setFormError('تعذر حفظ الفاتورة لوجود أخطاء في أحد البنود. راجع التنبيهات أسفل الأسطر.');
        return;
      }

      try {
        setSubmitting(true);
        const created = await services.createSaleInvoice(user, {
          date: isoDate,
          partyId: formPartyId,
          paymentMethod: formPaymentMethod,
          invoiceDiscount: Math.round(formDiscount || 0),
          notes: formNotes.trim(),
          lines: saleLines.map((l) => ({
            productId: l.productId,
            quantity: Math.round(l.quantity),
            unitPrice: Math.round(l.unitPrice),
            discount: Math.round(l.discount || 0),
            manualBatchId: !isCashier ? l.manualBatchId || undefined : undefined,
          })),
        });

        showToast(AR_STRINGS.invoices.saleCreatedSuccess, 'success');
        setIsDirty(false);
        setActiveTab('sales');
        setSavedSuccessInvoice(created);
        await loadData();

        if (shouldPrintAfter) {
          setInvoiceToPrint(created);
          setIsPrintModalOpen(true);
        }
      } catch (err: any) {
        const msg = err.message || 'تعذر حفظ فاتورة البيع. راجع الكميات والبيانات وحاول مجدداً.';
        setFormError(msg);
        // Match stock error to specific line if product name appears in service error
        if (err.code === 'INSUFFICIENT_STOCK' || err.code === 'NEGATIVE_STOCK_BLOCKED') {
          const matchedErrors: Record<string, string> = {};
          for (const l of saleLines) {
            const prod = products.find((p) => p.id === l.productId);
            if (prod && msg.includes(prod.name)) {
              matchedErrors[l.uid] = msg;
            }
          }
          if (Object.keys(matchedErrors).length === 0 && saleLines[0]) {
            matchedErrors[saleLines[0].uid] = msg;
          }
          setLineErrors(matchedErrors);
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Purchase Invoice Save
    if (!formWarehouseId) {
      setFormError('تعذر حفظ فاتورة الشراء لعدم تحديد المستودع المستلم. اختر المستودع.');
      return;
    }
    if (purchaseLines.length === 0) {
      setFormError('تعذر حفظ فاتورة الشراء لعدم وجود بنود. أضف مادة طبية واحدة على الأقل.');
      return;
    }

    const nextPurchaseErrs: Record<string, string> = {};
    for (const l of purchaseLines) {
      if (!l.productId) {
        nextPurchaseErrs[l.uid] = 'اختر المادة الطبية لهذا السطر.';
      } else if (!l.lotNumber.trim()) {
        nextPurchaseErrs[l.uid] = 'رقم الوجبة مطلوب لتتبع الصلاحية.';
      } else if (!l.expiryDate) {
        nextPurchaseErrs[l.uid] = 'تاريخ الانتهاء مطلوب.';
      } else if (!l.quantity || l.quantity <= 0) {
        nextPurchaseErrs[l.uid] = 'الكمية يجب أن تكون أكبر من صفر.';
      }
    }
    if (Object.keys(nextPurchaseErrs).length > 0) {
      setLineErrors(nextPurchaseErrs);
      setFormError('تعذر حفظ فاتورة الشراء لعدم إكمال حقول الوجبة أو الكمية.');
      return;
    }

    try {
      setSubmitting(true);
      const created = await services.createPurchaseInvoice(user, {
        date: isoDate,
        partyId: formPartyId,
        warehouseId: formWarehouseId,
        paymentMethod: formPaymentMethod,
        invoiceDiscount: Math.round(formDiscount || 0),
        notes: formNotes.trim(),
        lines: purchaseLines.map((l) => ({
          productId: l.productId,
          lotNumber: l.lotNumber.trim(),
          expiryDate: l.expiryDate,
          quantity: Math.round(l.quantity),
          purchasePrice: Math.round(l.purchasePrice),
          discount: Math.round(l.discount || 0),
        })),
      });

      showToast(AR_STRINGS.invoices.purchaseCreatedSuccess, 'success');
      setIsDirty(false);
      setActiveTab('purchases');
      setSavedSuccessInvoice(created);
      await loadData();

      if (shouldPrintAfter) {
        setInvoiceToPrint(created);
        setIsPrintModalOpen(true);
      }
    } catch (err: any) {
      setFormError(err.message || 'تعذر حفظ فاتورة الشراء. راجع رقم الوجبة والصلاحية.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveInvoice(false);
    }
  };

  const handleConfirmVoid = async () => {
    if (!user || !invoiceToVoid) return;
    try {
      setVoiding(true);
      const updated = await services.voidInvoice(
        user,
        invoiceToVoid.id,
        voidReason.trim() || 'تم الإلغاء بطلب من الإدارة'
      );
      showToast(AR_STRINGS.invoices.voidSuccess, 'success');
      setInvoiceToVoid(null);
      setVoidReason('');
      if (selectedInvoice?.id === updated.id) {
        await handleOpenDetails(updated);
      }
      loadData();
    } catch (err: any) {
      showToast(err.message || 'تعذر إلغاء الفاتورة.', 'error');
    } finally {
      setVoiding(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'all') return invoices;
    if (statusFilter === 'posted') return invoices.filter((i) => i.status === 'posted');
    if (statusFilter === 'void') return invoices.filter((i) => i.status === 'void');
    if (statusFilter === 'unpaid')
      return invoices.filter((i) => i.status !== 'void' && i.total - i.paid > 0);
    return invoices;
  }, [invoices, statusFilter]);

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: AR_STRINGS.invoices.invoiceNumber,
      sortable: true,
      mobilePriority: 1,
      searchValue: (item) => `${item.number} ${getPartyName(item.partyId)}`,
      render: (item) => (
        <div>
          <span className="num-tabular font-semibold text-[var(--color-ink)] block">
            {item.number}
          </span>
          <span className="text-[14px] text-[var(--color-muted)] block md:hidden">
            {getPartyName(item.partyId)}
          </span>
          <span className="text-[14px] text-[var(--color-muted)] num-tabular hidden md:block">
            {new Date(item.date).toLocaleDateString('ar-IQ')}
          </span>
        </div>
      ),
    },
    {
      key: 'partyId',
      header: AR_STRINGS.invoices.party,
      mobilePriority: 'hide',
      searchValue: (item) => getPartyName(item.partyId),
      render: (item) => (
        <span className="font-medium text-[var(--color-ink)]">{getPartyName(item.partyId)}</span>
      ),
    },
    {
      key: 'total',
      header: AR_STRINGS.invoices.total,
      sortable: true,
      align: 'left',
      mobilePriority: 2,
      render: (item) => <MoneyText amount={item.total} size="md" />,
    },
    {
      key: 'remaining',
      header: AR_STRINGS.invoices.remaining,
      align: 'left',
      mobilePriority: 'hide',
      render: (item) => {
        const rem = Math.max(0, item.total - item.paid);
        return (
          <MoneyText
            amount={rem}
            size="sm"
            tone={item.status !== 'void' && rem > 0 ? 'warning' : 'muted'}
          />
        );
      },
    },
    {
      key: 'paymentMethod',
      header: AR_STRINGS.invoices.paymentMethod,
      mobilePriority: 'hide',
      render: (item) => {
        if (item.paymentMethod === 'cash') {
          return (
            <StatusBadge variant="success" size="sm">
              نقدي
            </StatusBadge>
          );
        }
        if (item.paymentMethod === 'transfer') {
          return (
            <StatusBadge variant="teal" size="sm">
              تحويل
            </StatusBadge>
          );
        }
        return (
          <StatusBadge variant="warning" size="sm">
            آجل
          </StatusBadge>
        );
      },
    },
    {
      key: 'status',
      header: AR_STRINGS.invoices.status,
      mobilePriority: 'status',
      render: (item) =>
        item.status === 'void' ? (
          <StatusBadge variant="danger" size="sm">
            {AR_STRINGS.invoices.statusVoid}
          </StatusBadge>
        ) : item.total - item.paid > 0 ? (
          <StatusBadge variant="warning" size="sm">
            غير مسددة بالكامل
          </StatusBadge>
        ) : (
          <StatusBadge variant="success" size="sm">
            {AR_STRINGS.invoices.statusPosted}
          </StatusBadge>
        ),
    },
  ];

  const getRowActions = (item: Invoice): RowAction<Invoice>[] => [
    {
      key: 'details',
      label: AR_STRINGS.invoices.viewDetails,
      icon: <Eye className="w-4 h-4" strokeWidth={1.75} />,
      onClick: () => handleOpenDetails(item),
    },
    {
      key: 'print',
      label: 'طباعة الفاتورة',
      icon: <Printer className="w-4 h-4" strokeWidth={1.75} />,
      onClick: () => {
        setInvoiceToPrint(item);
        setIsPrintModalOpen(true);
      },
    },
    {
      key: 'void',
      label: AR_STRINGS.invoices.voidInvoice,
      icon: <Ban className="w-4 h-4" strokeWidth={1.75} />,
      variant: 'danger',
      hidden: (row) => isCashier || row.status === 'void',
      onClick: () => {
        setVoidReason('');
        setInvoiceToVoid(item);
      },
    },
  ];

  const partyOptions = activePartiesList.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.city})`,
    meta: p.phone,
  }));

  const productSearchOptions = products
    .filter((p) => p.active)
    .map((p) => ({
      value: p.id,
      label: p.name,
      meta: `المتاح: ${p.quantityOnHand} ${p.unit} · ${formatWesternInt(
        formKind === 'sale' ? p.salePrice : p.purchasePrice
      )} د.ع`,
    }));

  // ==========================================
  // RENDER SUB-VIEWS
  // ==========================================
  const renderFormView = () => {
    if (savedSuccessInvoice) {
      return (
        <div className="max-w-2xl mx-auto py-8" dir="rtl">
          <div className="clinical-card p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-[var(--radius-card)] bg-[var(--color-success-bg)] border border-[var(--color-success-border)] text-[var(--color-success-ink)] flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" strokeWidth={1.75} />
            </div>

            <div className="space-y-1.5">
              <h1 className="clinical-heading-1">
                {savedSuccessInvoice.kind === 'sale'
                  ? 'تم حفظ فاتورة البيع بنجاح'
                  : 'تم حفظ فاتورة الشراء بنجاح'}
              </h1>
              <p className="text-[16px] text-[var(--color-muted)]">
                رقم الفاتورة المعتمد:{' '}
                <span className="num-tabular font-bold text-[var(--color-ink)]">
                  {savedSuccessInvoice.number}
                </span>
              </p>
            </div>

            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] flex flex-wrap items-center justify-around gap-4 text-[15px]">
              <div>
                <span className="text-[var(--color-muted)] block text-[14px]">الجهة</span>
                <span className="font-semibold text-[var(--color-ink)]">
                  {getPartyName(savedSuccessInvoice.partyId)}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-muted)] block text-[14px]">صافي الفاتورة</span>
                <MoneyText amount={savedSuccessInvoice.total} size="lg" tone="primary" />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                variant="primary"
                onClick={() => {
                  setInvoiceToPrint(savedSuccessInvoice);
                  setIsPrintModalOpen(true);
                }}
                leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
              >
                طباعة
              </Button>
              <Button
                variant="secondary"
                onClick={() => initNewForm(savedSuccessInvoice.kind)}
                leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
              >
                فاتورة جديدة
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const inv = savedSuccessInvoice;
                  setSavedSuccessInvoice(null);
                  handleOpenDetails(inv);
                }}
                leftIcon={<Eye className="w-5 h-5" strokeWidth={1.75} />}
              >
                فتح الفاتورة
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <form onSubmit={(e) => { e.preventDefault(); handleSaveInvoice(false); }} onKeyDown={handleFormKeyDown} className="space-y-5 pb-28 sm:pb-24" dir="rtl" noValidate>
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--color-line)]">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRequestLeaveForm}
              leftIcon={<ArrowRight className="w-5 h-5" strokeWidth={1.75} />}
            >
              رجوع
            </Button>
            <div>
              <h1 className="clinical-heading-1">
                {formKind === 'sale'
                  ? isCashier
                    ? 'فاتورة بيع سريعة'
                    : 'إنشاء فاتورة بيع'
                  : 'إنشاء فاتورة شراء'}
              </h1>
              <p className="text-[14px] text-[var(--color-muted)]">
                {isCashier
                  ? 'ابحث عن المادة الطبية وأدخل الكمية؛ ينقلك زر Enter للسطر التالي و Ctrl+Enter للحفظ.'
                  : 'شاشة موحدة سريعة: زر Enter يتنقل بين الحقول ويضيف سطراً جديداً، و Ctrl+Enter يحفظ الفاتورة.'}
              </p>
            </div>
          </div>

          {!isCashier && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={formKind === 'sale' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  if (formKind !== 'sale') initNewForm('sale');
                }}
              >
                فاتورة بيع
              </Button>
              <Button
                type="button"
                variant={formKind === 'purchase' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  if (formKind !== 'purchase') initNewForm('purchase');
                }}
              >
                فاتورة شراء
              </Button>
            </div>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="p-4 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-[var(--radius-control)] text-[14px] font-semibold text-[var(--color-danger-ink)] flex items-start gap-2.5"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span>{formError}</span>
          </div>
        )}

        {/* Section 1: Party, Date, Warehouse (purchase), Payment Method (<= 6 fields) */}
        <section className="clinical-card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {/* Customer / Supplier + inline add */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-[var(--color-ink)]">
                  {formKind === 'sale' ? 'العميل / المستشفى' : 'المورد / الشركة'}{' '}
                  <span className="text-[var(--color-danger-ink)]" aria-hidden="true">
                    *
                  </span>
                </span>
                {canCreateParty && (
                  <button
                    type="button"
                    onClick={() => setShowInlinePartyForm((prev) => !prev)}
                    className="text-[14px] font-semibold text-[var(--color-primary-strong)] hover:underline cursor-pointer clinical-focus rounded px-1.5 py-0.5 min-h-[32px]"
                  >
                    {showInlinePartyForm
                      ? 'إغلاق الإضافة'
                      : formKind === 'sale'
                      ? '+ عميل جديد'
                      : '+ مورد جديد'}
                  </button>
                )}
              </div>

              <SearchableSelect
                ariaLabel={formKind === 'sale' ? 'العميل أو المستشفى' : 'المورد أو الشركة'}
                value={formPartyId}
                onChange={(v) => {
                  setFormPartyId(v);
                  setFormPartyError(undefined);
                  setIsDirty(true);
                }}
                onBlur={() => {
                  if (!formPartyId) {
                    setFormPartyError(
                      formKind === 'sale'
                        ? 'اختيار العميل مطلوب لحساب الذمم والربط.'
                        : 'اختيار المورد مطلوب لتوثيق المشتريات.'
                    );
                  }
                }}
                error={formPartyError}
                options={partyOptions}
                placeholder={formKind === 'sale' ? 'اختر العميل أو المستشفى...' : 'اختر المورد...'}
                searchPlaceholder="اكتب الاسم أو رقم الهاتف..."
                size={isCashier ? 'lg' : 'md'}
                required
              />
            </div>

            <Input
              label="تاريخ الفاتورة"
              type="date"
              value={formDate}
              onChange={(e) => {
                setFormDate(e.target.value);
                setIsDirty(true);
              }}
              required
            />

            <div className="space-y-1.5">
              <span className="block text-[14px] font-semibold text-[var(--color-ink)]">
                طريقة الدفع
              </span>
              <SegmentedControl
                ariaLabel="طريقة دفع الفاتورة"
                value={formPaymentMethod}
                onChange={(v) => {
                  setFormPaymentMethod(v as 'cash' | 'transfer' | 'credit');
                  setIsDirty(true);
                }}
                options={[
                  { value: 'cash', label: 'نقدي' },
                  { value: 'transfer', label: 'تحويل' },
                  { value: 'credit', label: 'آجل' },
                ]}
              />
            </div>

            {formKind === 'purchase' && (
              <Select
                label="المستودع المستلم"
                value={formWarehouseId}
                onChange={(e) => {
                  setFormWarehouseId(e.target.value);
                  setIsDirty(true);
                }}
                options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.city})` }))}
                required
              />
            )}
          </div>

          {/* Inline Quick Add Customer / Supplier */}
          {showInlinePartyForm && canCreateParty && (
            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">
                  {formKind === 'sale' ? 'إضافة عميل جديد سريع' : 'إضافة مورد جديد سريع'}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="الاسم التجاري / اسم الجهة"
                  placeholder={formKind === 'sale' ? 'مثال: صيدلية الشفاء' : 'مثال: شركة دجلة الطبية'}
                  value={newPartyName}
                  onChange={(e) => {
                    setNewPartyName(e.target.value);
                    if (newPartyNameErr) setNewPartyNameErr(undefined);
                  }}
                  onBlur={() => {
                    if (!newPartyName.trim()) {
                      setNewPartyNameErr('اسم الجهة مطلوب؛ أدخل الاسم التجاري.');
                    }
                  }}
                  error={newPartyNameErr}
                  required
                />

                <Input
                  label="رقم الهاتف"
                  placeholder="مثال: 07701234567"
                  inputMode="tel"
                  value={newPartyPhone}
                  onChange={(e) => {
                    setNewPartyPhone(e.target.value);
                    if (newPartyPhoneErr) setNewPartyPhoneErr(undefined);
                  }}
                  onBlur={() => {
                    if (!newPartyPhone.trim() || newPartyPhone.trim().length < 7) {
                      setNewPartyPhoneErr('رقم الهاتف مطلوب؛ أدخل رقماً صحيحاً.');
                    }
                  }}
                  error={newPartyPhoneErr}
                  required
                />

                <Input
                  label="المدينة"
                  placeholder="بغداد"
                  value={newPartyCity}
                  onChange={(e) => setNewPartyCity(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowInlinePartyForm(false)}
                >
                  رجوع
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={savingInlineParty}
                  onClick={handleSaveInlineParty}
                >
                  {formKind === 'sale' ? 'حفظ العميل' : 'حفظ المورد'}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Invoice Lines */}
        <section className="clinical-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--color-line)]">
            <div>
              <h2 className="clinical-heading-3">بنود الفاتورة</h2>
              <p className="text-[14px] text-[var(--color-muted)]">
                {formKind === 'sale'
                  ? isCashier
                    ? 'اختر المادة وأدخل الكمية والسعر.'
                    : 'يتم اختيار الدفعة تلقائياً حسب الأقرب انتهاءً (FEFO) مع إمكانية التعديل.'
                  : 'أدخل رقم الوجبة وتاريخ الانتهاء لكل مادة مستلمة.'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                formKind === 'sale' ? appendSaleLine(true) : appendPurchaseLine(true)
              }
            >
              + سطر
            </Button>
          </div>

          {formKind === 'sale' ? (
            <div className="space-y-3">
              {saleLines.map((line, idx) => {
                const prod = products.find((p) => p.id === line.productId);
                const { chosenBatch, availableBatches, availableQty } = getFefoSummaryForLine(
                  line,
                  prod
                );
                const lineTotal = Math.max(
                  0,
                  Math.round(line.quantity * line.unitPrice) - Math.round(line.discount || 0)
                );
                const localShortageError =
                  prod && !office?.allowNegativeStock && line.quantity > availableQty
                    ? `تعذر صرف ${line.quantity} ${prod.unit} لأن المتاح في ${
                        line.manualBatchId ? 'هذه الدفعة' : 'المخزن'
                      } هو ${availableQty} فقط. خفّض الكمية${
                        line.manualBatchId ? ' أو أعد اختيار الأقرب انتهاءً' : ''
                      }.`
                    : undefined;
                const displayLineError = lineErrors[line.uid] || localShortageError;

                return (
                  <div
                    key={line.uid}
                    className={`p-4 rounded-[var(--radius-control)] border space-y-3 ${
                      displayLineError
                        ? 'bg-[var(--color-danger-bg)]/30 border-[var(--color-danger-ink)]'
                        : 'bg-[var(--color-canvas)] border-[var(--color-line)]'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      {/* Product Search */}
                      <div className={isCashier ? 'md:col-span-5' : 'md:col-span-4'}>
                        <SearchableSelect
                          ref={(el) => {
                            productRefs.current[line.uid] = el;
                          }}
                          label={`المادة الطبية (${idx + 1})`}
                          value={line.productId}
                          onChange={(pId) => {
                            const pr = products.find((p) => p.id === pId);
                            setSaleLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid
                                  ? {
                                      ...item,
                                      productId: pId,
                                      unitPrice: pr?.salePrice || 0,
                                      manualBatchId: undefined,
                                    }
                                  : item
                              )
                            );
                            setLineErrors((prev) => {
                              const copy = { ...prev };
                              delete copy[line.uid];
                              return copy;
                            });
                            setIsDirty(true);
                          }}
                          onAfterSelect={() => qtyRefs.current[line.uid]?.focus()}
                          options={productSearchOptions}
                          placeholder="ابحث عن مادة طبية..."
                          searchPlaceholder="اكتب اسم المادة الطبية..."
                          size={isCashier ? 'lg' : 'md'}
                          required
                        />
                      </div>

                      {/* Quantity */}
                      <div className="md:col-span-2">
                        <Input
                          ref={(el) => {
                            qtyRefs.current[line.uid] = el;
                          }}
                          label="الكمية"
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(e) => {
                            const q = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setSaleLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid ? { ...item, quantity: q } : item
                              )
                            );
                            setLineErrors((prev) => {
                              if (!prev[line.uid]) return prev;
                              const copy = { ...prev };
                              delete copy[line.uid];
                              return copy;
                            });
                            setFormError(null);
                            setIsDirty(true);
                          }}
                          onBlur={() => {
                            if (line.quantity < 1) {
                              setSaleLines((prev) =>
                                prev.map((item) =>
                                  item.uid === line.uid ? { ...item, quantity: 1 } : item
                                )
                              );
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              priceRefs.current[line.uid]?.focus();
                            }
                          }}
                          required
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="md:col-span-2">
                        <MoneyInput
                          ref={(el) => {
                            priceRefs.current[line.uid] = el;
                          }}
                          label="سعر الوحدة"
                          value={line.unitPrice}
                          onChangeValue={(val) => {
                            setSaleLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid ? { ...item, unitPrice: val } : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              discountRefs.current[line.uid]?.focus();
                            }
                          }}
                        />
                      </div>

                      {/* Line Discount */}
                      <div className="md:col-span-2">
                        <MoneyInput
                          ref={(el) => {
                            discountRefs.current[line.uid] = el;
                          }}
                          label="خصم السطر"
                          value={line.discount}
                          onChangeValue={(val) => {
                            setSaleLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid ? { ...item, discount: val } : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              if (idx < saleLines.length - 1) {
                                const nextUid = saleLines[idx + 1].uid;
                                productRefs.current[nextUid]?.focus();
                              } else {
                                appendSaleLine(true);
                              }
                            }
                          }}
                        />
                      </div>

                      {/* Remove Row */}
                      <div className="md:col-span-1 flex items-center justify-between md:justify-end gap-2">
                        <div className="md:hidden text-[14px]">
                          <span className="text-[var(--color-muted)]">الإجمالي: </span>
                          <MoneyText amount={lineTotal} size="md" tone="primary" />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (saleLines.length <= 1) return;
                            setSaleLines((prev) => prev.filter((item) => item.uid !== line.uid));
                            setIsDirty(true);
                          }}
                          disabled={saleLines.length <= 1}
                          aria-label={`حذف السطر ${idx + 1}`}
                          className="min-w-[44px] min-h-[44px] text-[var(--color-danger-ink)] hover:bg-[var(--color-danger-bg)] disabled:opacity-40 rounded-[var(--radius-control)] flex items-center justify-center clinical-focus cursor-pointer"
                        >
                          <Trash2 className="w-5 h-5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>

                    {/* Availability + Batch FEFO row (Batch controls hidden for Cashier) */}
                    {prod && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-line)] text-[14px]">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="text-[var(--color-muted)]">
                            المتاح:{' '}
                            <strong
                              className={`num-tabular ${
                                availableQty === 0
                                  ? 'text-[var(--color-danger-ink)]'
                                  : 'text-[var(--color-ink)]'
                              }`}
                            >
                              {availableQty} {prod.unit}
                            </strong>
                          </span>

                          {!isCashier && chosenBatch && (
                            <span className="text-[var(--color-muted)]">
                              الدفعة:{' '}
                              <strong className="num-tabular text-[var(--color-ink)]">
                                {chosenBatch.lotNumber}
                              </strong>{' '}
                              · الانتهاء:{' '}
                              <strong className="num-tabular text-[var(--color-ink)]">
                                {chosenBatch.expiryDate}
                              </strong>
                            </span>
                          )}

                          {!isCashier && availableBatches.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setSaleLines((prev) =>
                                  prev.map((item) =>
                                    item.uid === line.uid
                                      ? { ...item, showBatchPicker: !item.showBatchPicker }
                                      : item
                                  )
                                )
                              }
                              className="text-[14px] font-semibold text-[var(--color-primary-strong)] hover:underline cursor-pointer clinical-focus rounded px-1.5 py-0.5 min-h-[36px]"
                            >
                              {line.showBatchPicker ? 'إخفاء الدفعات' : 'تغيير الدفعة'}
                            </button>
                          )}
                        </div>

                        <div className="hidden md:flex items-center gap-2">
                          <span className="text-[var(--color-muted)]">إجمالي السطر:</span>
                          <MoneyText amount={lineTotal} size="md" tone="primary" />
                        </div>
                      </div>
                    )}

                    {/* Optional Batch Picker when "تغيير الدفعة" clicked (non-Cashier only) */}
                    {!isCashier && line.showBatchPicker && prod && (
                      <div className="pt-1">
                        <Select
                          label="اختيار الدفعة يدوياً (الافتراضي: الأقرب انتهاءً أولاً)"
                          value={line.manualBatchId || ''}
                          onChange={(e) => {
                            const bId = e.target.value || undefined;
                            setSaleLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid ? { ...item, manualBatchId: bId } : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          options={[
                            { value: '', label: 'تلقائي — الأقرب انتهاءً أولاً (FEFO)' },
                            ...availableBatches.map((b) => ({
                              value: b.id,
                              label: `${b.lotNumber} — المتاح: ${b.quantityOnHand} ${prod.unit} — الانتهاء: ${b.expiryDate}`,
                            })),
                          ]}
                        />
                      </div>
                    )}

                    {/* Inline Stock Error under that line */}
                    {displayLineError && (
                      <p
                        role="alert"
                        className="text-[14px] font-semibold text-[var(--color-danger-ink)] flex items-start gap-2 pt-1"
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                        <span>{displayLineError}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {purchaseLines.map((line, idx) => {
                const prod = products.find((p) => p.id === line.productId);
                const lineTotal = Math.max(
                  0,
                  Math.round(line.quantity * line.purchasePrice) - Math.round(line.discount || 0)
                );
                const displayLineError = lineErrors[line.uid];

                return (
                  <div
                    key={line.uid}
                    className={`p-4 rounded-[var(--radius-control)] border space-y-3 ${
                      displayLineError
                        ? 'bg-[var(--color-danger-bg)]/30 border-[var(--color-danger-ink)]'
                        : 'bg-[var(--color-canvas)] border-[var(--color-line)]'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-3">
                        <SearchableSelect
                          ref={(el) => {
                            productRefs.current[line.uid] = el;
                          }}
                          label={`المادة الطبية (${idx + 1})`}
                          value={line.productId}
                          onChange={(pId) => {
                            const pr = products.find((p) => p.id === pId);
                            setPurchaseLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid
                                  ? {
                                      ...item,
                                      productId: pId,
                                      purchasePrice: pr?.purchasePrice || item.purchasePrice,
                                    }
                                  : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          onAfterSelect={() => lotRefs.current[line.uid]?.focus()}
                          options={productSearchOptions}
                          placeholder="ابحث عن مادة..."
                          searchPlaceholder="اسم المادة..."
                          required
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Input
                          ref={(el) => {
                            lotRefs.current[line.uid] = el;
                          }}
                          label="رقم الوجبة"
                          value={line.lotNumber}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPurchaseLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid ? { ...item, lotNumber: val } : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              expiryRefs.current[line.uid]?.focus();
                            }
                          }}
                          required
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Input
                          ref={(el) => {
                            expiryRefs.current[line.uid] = el;
                          }}
                          label="تاريخ الانتهاء"
                          type="date"
                          value={line.expiryDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPurchaseLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid ? { ...item, expiryDate: val } : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              qtyRefs.current[line.uid]?.focus();
                            }
                          }}
                          required
                        />
                      </div>

                      <div className="md:col-span-1">
                        <Input
                          ref={(el) => {
                            qtyRefs.current[line.uid] = el;
                          }}
                          label="الكمية"
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(e) => {
                            const q = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setPurchaseLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid ? { ...item, quantity: q } : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              priceRefs.current[line.uid]?.focus();
                            }
                          }}
                          required
                        />
                      </div>

                      <div className="md:col-span-2">
                        <MoneyInput
                          ref={(el) => {
                            priceRefs.current[line.uid] = el;
                          }}
                          label="سعر الشراء"
                          value={line.purchasePrice}
                          onChangeValue={(val) => {
                            setPurchaseLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid ? { ...item, purchasePrice: val } : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              discountRefs.current[line.uid]?.focus();
                            }
                          }}
                        />
                      </div>

                      <div className="md:col-span-1">
                        <MoneyInput
                          ref={(el) => {
                            discountRefs.current[line.uid] = el;
                          }}
                          label="الخصم"
                          value={line.discount}
                          onChangeValue={(val) => {
                            setPurchaseLines((prev) =>
                              prev.map((item) =>
                                item.uid === line.uid ? { ...item, discount: val } : item
                              )
                            );
                            setIsDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              if (idx < purchaseLines.length - 1) {
                                productRefs.current[purchaseLines[idx + 1].uid]?.focus();
                              } else {
                                appendPurchaseLine(true);
                              }
                            }
                          }}
                        />
                      </div>

                      <div className="md:col-span-1 flex items-center justify-between md:justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (purchaseLines.length <= 1) return;
                            setPurchaseLines((prev) => prev.filter((item) => item.uid !== line.uid));
                            setIsDirty(true);
                          }}
                          disabled={purchaseLines.length <= 1}
                          aria-label={`حذف السطر ${idx + 1}`}
                          className="min-w-[44px] min-h-[44px] text-[var(--color-danger-ink)] hover:bg-[var(--color-danger-bg)] disabled:opacity-40 rounded-[var(--radius-control)] flex items-center justify-center clinical-focus cursor-pointer"
                        >
                          <Trash2 className="w-5 h-5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-line)] text-[14px]">
                      <span className="text-[var(--color-muted)]">
                        {prod ? `المتوفر حالياً: ${prod.quantityOnHand} ${prod.unit}` : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--color-muted)]">إجمالي السطر:</span>
                        <MoneyText amount={lineTotal} size="md" tone="primary" />
                      </div>
                    </div>

                    {displayLineError && (
                      <p
                        role="alert"
                        className="text-[14px] font-semibold text-[var(--color-danger-ink)] flex items-start gap-2 pt-1"
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                        <span>{displayLineError}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Discount & Notes */}
        <section className="clinical-card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <MoneyInput
            label={AR_STRINGS.invoices.invoiceDiscount}
            value={formDiscount}
            onChangeValue={(val) => {
              setFormDiscount(val);
              setIsDirty(true);
            }}
          />

          <Input
            label={AR_STRINGS.invoices.notes}
            placeholder="ملاحظات التسليم أو رقم أمر التجهيز..."
            value={formNotes}
            onChange={(e) => {
              setFormNotes(e.target.value);
              setIsDirty(true);
            }}
          />
        </section>

        {/* Bottom Summary Bar (sticky on desktop, natural flow on mobile so fields remain unobstructed) */}
        <div className="md:sticky md:bottom-0 z-20 clinical-card border border-[var(--color-primary)]/40 p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-5 text-right flex-1">
              <div>
                <span className="text-[14px] text-[var(--color-muted)] block">المجموع الفرعي</span>
                <MoneyText amount={formTotals.grossLines} size="md" />
              </div>
              <div>
                <span className="text-[14px] text-[var(--color-muted)] block">الخصم</span>
                <MoneyText amount={formTotals.totalDiscount} size="md" tone="muted" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[14px] font-semibold text-[var(--color-primary-strong)] block">
                  الإجمالي النهائي
                </span>
                <MoneyText
                  amount={formTotals.netTotal}
                  size={isCashier ? 'xl' : 'lg'}
                  tone="primary"
                />
              </div>
              <div>
                <span className="text-[14px] text-[var(--color-muted)] block">المدفوع</span>
                <MoneyText amount={formTotals.paid} size="md" tone="success" />
              </div>
              <div>
                <span className="text-[14px] text-[var(--color-muted)] block">المتبقي</span>
                <MoneyText
                  amount={formTotals.remaining}
                  size="md"
                  tone={formTotals.remaining > 0 ? 'warning' : 'muted'}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 shrink-0">
              <Button
                type="button"
                variant="ghost"
                onClick={handleRequestLeaveForm}
                disabled={submitting}
              >
                رجوع
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleSaveInvoice(true)}
                isLoading={submitting}
                leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
              >
                حفظ وطباعة
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting}>
                حفظ الفاتورة
              </Button>
            </div>
          </div>
        </div>
      </form>
    );
  };

  const renderDetailView = () => {
    if (!selectedInvoice) return null;
    const remaining = Math.max(0, selectedInvoice.total - selectedInvoice.paid);
    const detailTabs: TabItem[] = [
      {
        key: 'lines',
        label: 'بنود الفاتورة',
        icon: <FileText className="w-5 h-5" strokeWidth={1.75} />,
        count: selectedInvoice.lines.length,
      },
      ...(canViewAccounting
        ? [
            {
              key: 'journal',
              label: 'القيود المحاسبية',
              icon: <BookOpen className="w-5 h-5" strokeWidth={1.75} />,
              count: invoiceJournalEntries.length,
            },
          ]
        : []),
    ];

    return (
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedInvoice(null);
                setViewMode('list');
              }}
              leftIcon={<ArrowRight className="w-5 h-5" strokeWidth={1.75} />}
            >
              رجوع
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="clinical-heading-1 num-tabular">{selectedInvoice.number}</h1>
                {selectedInvoice.status === 'void' ? (
                  <StatusBadge variant="danger">ملغاة</StatusBadge>
                ) : remaining > 0 ? (
                  <StatusBadge variant="warning">غير مسددة بالكامل</StatusBadge>
                ) : (
                  <StatusBadge variant="success">معتمدة</StatusBadge>
                )}
              </div>
              <p className="text-[14px] text-[var(--color-muted)] mt-1">
                {selectedInvoice.kind === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء'} ·{' '}
                {getPartyName(selectedInvoice.partyId)}
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => {
              setInvoiceToPrint(selectedInvoice);
              setIsPrintModalOpen(true);
            }}
            leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
          >
            طباعة الفاتورة
          </Button>
        </div>

        {/* Void notice */}
        {selectedInvoice.status === 'void' && (
          <div
            role="status"
            className="p-4 rounded-[var(--radius-control)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] text-[var(--color-danger-ink)] flex items-start gap-3"
          >
            <Ban className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <p className="font-semibold">هذه الفاتورة ملغاة محاسبياً ومخزنياً</p>
              <p className="text-[14px] mt-0.5">
                السبب: {selectedInvoice.voidReason || 'إلغاء معتمد'}
                {selectedInvoice.voidedAt &&
                  ` · بتاريخ ${new Date(selectedInvoice.voidedAt).toLocaleDateString('ar-IQ')}`}
              </p>
            </div>
          </div>
        )}

        {/* Key Facts Card */}
        <section className="clinical-card p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-[14px]">
          <div>
            <span className="text-[var(--color-muted)] block">التاريخ</span>
            <span className="font-semibold text-[var(--color-ink)] num-tabular mt-0.5 block">
              {new Date(selectedInvoice.date).toLocaleDateString('ar-IQ')}
            </span>
          </div>
          <div>
            <span className="text-[var(--color-muted)] block">
              {selectedInvoice.kind === 'sale' ? 'العميل' : 'المورد'}
            </span>
            <span className="font-semibold text-[var(--color-ink)] mt-0.5 block">
              {getPartyName(selectedInvoice.partyId)}
            </span>
          </div>
          <div>
            <span className="text-[var(--color-muted)] block">طريقة الدفع</span>
            <span className="font-semibold text-[var(--color-ink)] mt-0.5 block">
              {selectedInvoice.paymentMethod === 'cash'
                ? 'نقدي'
                : selectedInvoice.paymentMethod === 'transfer'
                ? 'تحويل مصرفي'
                : 'آجل'}
            </span>
          </div>
          <div>
            <span className="text-[var(--color-muted)] block">الصافي الإجمالي</span>
            <div className="mt-0.5">
              <MoneyText amount={selectedInvoice.total} size="md" />
            </div>
          </div>
          <div>
            <span className="text-[var(--color-muted)] block">المسدد</span>
            <div className="mt-0.5">
              <MoneyText amount={selectedInvoice.paid} size="md" tone="success" />
            </div>
          </div>
          <div>
            <span className="text-[var(--color-muted)] block">المتبقي</span>
            <div className="mt-0.5">
              <MoneyText
                amount={remaining}
                size="md"
                tone={remaining > 0 && selectedInvoice.status !== 'void' ? 'warning' : 'muted'}
              />
            </div>
          </div>
        </section>

        {/* Tabs */}
        <Tabs
          tabs={detailTabs}
          activeKey={detailTab}
          onChange={(k) => setDetailTab(k as 'lines' | 'journal')}
        />

        {detailTab === 'lines' && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[15px]">
                <thead className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] text-[14px] text-[var(--color-muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      المادة الطبية
                    </th>
                    {!isCashier && (
                      <th scope="col" className="px-4 py-3 font-semibold">
                        الوجبة والصلاحية
                      </th>
                    )}
                    <th scope="col" className="px-4 py-3 font-semibold text-center">
                      الكمية
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-left">
                      سعر الوحدة
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-left">
                      الخصم
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-left">
                      الإجمالي
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]">
                  {selectedInvoice.lines.map((l, idx) => {
                    const prod = products.find((p) => p.id === l.productId);
                    const batch = prod?.batches.find((b) => b.id === l.batchId);
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-3.5 font-semibold text-[var(--color-ink)]">
                          {prod?.name || l.productId}
                        </td>
                        {!isCashier && (
                          <td className="px-4 py-3.5 text-[14px] text-[var(--color-muted)] num-tabular">
                            {batch ? `${batch.lotNumber} · ${batch.expiryDate}` : l.batchId}
                          </td>
                        )}
                        <td className="px-4 py-3.5 text-center num-tabular font-semibold">
                          {l.quantity}
                        </td>
                        <td className="px-4 py-3.5 text-left num-tabular">
                          <MoneyText amount={l.unitPrice} size="sm" />
                        </td>
                        <td className="px-4 py-3.5 text-left num-tabular">
                          <MoneyText amount={l.discount || 0} size="sm" tone="muted" />
                        </td>
                        <td className="px-4 py-3.5 text-left">
                          <MoneyText amount={l.total} size="md" tone="primary" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Journal Entries Tab — Owner & Accountant Only */}
        {detailTab === 'journal' && canViewAccounting && (
          <div className="space-y-4">
            {loadingJournal ? (
              <TableSkeleton rows={4} />
            ) : invoiceJournalEntries.length === 0 ? (
              <div className="clinical-card p-6 text-center text-[var(--color-muted)]">
                لا توجد قيود محاسبية مسجلة لهذه الفاتورة.
              </div>
            ) : (
              invoiceJournalEntries.map((je) => {
                const sumDr = je.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
                const sumCr = je.lines.reduce((s: number, l: any) => s + (l.credit || 0), 0);
                return (
                  <div
                    key={je.id}
                    className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--color-ink)]">{je.memo}</span>
                      <span className="text-[14px] text-[var(--color-muted)] num-tabular">
                        {new Date(je.date).toLocaleDateString('ar-IQ')}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-[14px]">
                        <thead className="bg-[var(--color-canvas)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
                          <tr>
                            <th scope="col" className="px-4 py-2.5 font-semibold">
                              الحساب
                            </th>
                            <th scope="col" className="px-4 py-2.5 font-semibold text-left">
                              مدين
                            </th>
                            <th scope="col" className="px-4 py-2.5 font-semibold text-left">
                              دائن
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-line)]">
                          {je.lines.map((jl: any, i: number) => (
                            <tr key={i}>
                              <td className="px-4 py-2.5 text-[var(--color-ink)] font-medium">
                                {getAccountLabel(jl.accountId)}
                              </td>
                              <td className="px-4 py-2.5 text-left num-tabular font-semibold">
                                {jl.debit > 0 ? <MoneyText amount={jl.debit} size="sm" /> : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-left num-tabular font-semibold">
                                {jl.credit > 0 ? (
                                  <MoneyText amount={jl.credit} size="sm" tone="success" />
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-[var(--color-surface-subtle)] border-t border-[var(--color-line)] font-semibold">
                          <tr>
                            <td className="px-4 py-2.5 text-[var(--color-ink)]">الإجمالي</td>
                            <td className="px-4 py-2.5 text-left">
                              <MoneyText amount={sumDr} size="sm" />
                            </td>
                            <td className="px-4 py-2.5 text-left">
                              <MoneyText amount={sumCr} size="sm" tone="success" />
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Visually Separated Danger Zone for Void Action */}
        {!isCashier && selectedInvoice.status !== 'void' && (
          <section className="p-5 rounded-[var(--radius-card)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-[16px] font-semibold text-[var(--color-danger-ink)]">
                إجراء حساس: إلغاء الفاتورة
              </h2>
              <p className="text-[14px] text-[var(--color-ink)] clinical-prose">
                يؤدي إلغاء الفاتورة إلى إنشاء قيد عكسي وإرجاع الكميات إلى المستودع مع بقاء السجل ظاهراً.
              </p>
            </div>
            <Button
              variant="danger"
              onClick={() => {
                setVoidReason('');
                setInvoiceToVoid(selectedInvoice);
              }}
              leftIcon={<Ban className="w-5 h-5" strokeWidth={1.75} />}
            >
              إلغاء الفاتورة
            </Button>
          </section>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {viewMode === 'new_sale' || viewMode === 'new_purchase' ? (
        renderFormView()
      ) : viewMode === 'detail' && selectedInvoice ? (
        renderDetailView()
      ) : (
        <>
          {/* List Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
            <div>
              <h1 className="clinical-heading-1">{AR_STRINGS.invoices.title}</h1>
              <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
                {AR_STRINGS.invoices.subtitle}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'sales' ? (
                <Button
                  variant="primary"
                  onClick={() => initNewForm('sale')}
                  leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
                >
                  {AR_STRINGS.invoices.newSaleInvoice}
                </Button>
              ) : (
                !isCashier && (
                  <Button
                    variant="primary"
                    onClick={() => initNewForm('purchase')}
                    leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
                  >
                    {AR_STRINGS.invoices.newPurchaseInvoice}
                  </Button>
                )
              )}
            </div>
          </div>

          {!isCashier && (
            <Tabs
              tabs={[
                {
                  key: 'sales',
                  label: 'فواتير البيع',
                  icon: <ShoppingCart className="w-5 h-5" strokeWidth={1.75} />,
                },
                {
                  key: 'purchases',
                  label: 'فواتير الشراء',
                  icon: <Package className="w-5 h-5" strokeWidth={1.75} />,
                },
              ]}
              activeKey={activeTab}
              onChange={(tab) => {
                setActiveTab(tab as 'sales' | 'purchases');
                setStatusFilter('all');
              }}
            />
          )}

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
                    تعذر تحميل سجل الفواتير
                  </h2>
                  <p className="text-[14px] text-[var(--color-ink)] mt-0.5">{loadError}</p>
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={loadData}
                leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : loading ? (
            <TableSkeleton rows={6} />
          ) : (
            <DataTable<Invoice>
              title={activeTab === 'sales' ? 'سجل فواتير البيع' : 'سجل فواتير الشراء'}
              columns={columns}
              data={filteredInvoices}
              keyExtractor={(item) => item.id}
              exportFileName={`invoices_${activeTab}`}
              dateAccessor={(item) => item.date}
              filterOptions={[
                { label: 'معتمدة', value: 'posted' },
                { label: 'غير مسددة', value: 'unpaid' },
                { label: 'ملغاة', value: 'void' },
              ]}
              filterValue={statusFilter}
              onFilterChange={setStatusFilter}
              rowActions={getRowActions}
              previewTitle={(item) => `فاتورة ${item.number}`}
              previewSubtitle={(item) =>
                `${getPartyName(item.partyId)} • ${new Date(item.date).toLocaleDateString('ar-IQ')}`
              }
              previewFullPageLabel="فتح الصفحة كاملة"
              onOpenFullPage={handleOpenDetails}
              renderPreview={(item, closePreview) => (
                <div className="space-y-4">
                  <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] space-y-2.5 text-[14px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-muted)]">الجهة:</span>
                      <span className="font-semibold text-[var(--color-ink)]">
                        {getPartyName(item.partyId)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-muted)]">الإجمالي:</span>
                      <MoneyText amount={item.total} size="md" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-muted)]">المسدد:</span>
                      <MoneyText amount={item.paid} size="sm" tone="success" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-muted)]">المتبقي:</span>
                      <MoneyText
                        amount={Math.max(0, item.total - item.paid)}
                        size="sm"
                        tone={item.total - item.paid > 0 ? 'warning' : 'muted'}
                      />
                    </div>
                  </div>

                  <div className="border border-[var(--color-line)] rounded-[var(--radius-control)] overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] text-[14px] font-semibold">
                      البنود ({item.lines.length})
                    </div>
                    <div className="divide-y divide-[var(--color-line)]">
                      {item.lines.map((l, idx) => (
                        <div
                          key={idx}
                          className="p-3 flex items-center justify-between gap-3 text-[14px]"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-[var(--color-ink)] block truncate">
                              {products.find((p) => p.id === l.productId)?.name || l.productId}
                            </span>
                            <span className="text-[var(--color-muted)] num-tabular">
                              الكمية: {l.quantity} × {formatWesternInt(l.unitPrice)}
                            </span>
                          </div>
                          <MoneyText amount={l.total} size="sm" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        closePreview();
                        setInvoiceToPrint(item);
                        setIsPrintModalOpen(true);
                      }}
                      leftIcon={<Printer className="w-4 h-4" strokeWidth={1.75} />}
                    >
                      طباعة الفاتورة
                    </Button>
                    {!isCashier && item.status !== 'void' && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          closePreview();
                          setVoidReason('');
                          setInvoiceToVoid(item);
                        }}
                        leftIcon={<Ban className="w-4 h-4" strokeWidth={1.75} />}
                      >
                        {AR_STRINGS.invoices.voidInvoice}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              emptyTitle={AR_STRINGS.invoices.emptyTitle}
              emptyDescription={AR_STRINGS.invoices.emptyDesc}
              emptyActionLabel={
                activeTab === 'sales'
                  ? 'إنشاء فاتورة بيع'
                  : !isCashier
                  ? 'إنشاء فاتورة شراء'
                  : undefined
              }
              onEmptyAction={
                activeTab === 'sales'
                  ? () => initNewForm('sale')
                  : !isCashier
                  ? () => initNewForm('purchase')
                  : undefined
              }
            />
          )}
        </>
      )}

      {/* Unsaved Changes Confirm Dialog */}
      <ConfirmDialog
        isOpen={showUnsavedConfirm}
        onClose={() => setShowUnsavedConfirm(false)}
        onConfirm={() => {
          setShowUnsavedConfirm(false);
          setIsDirty(false);
          setViewMode('list');
        }}
        title="مغادرة دون حفظ"
        message="لديك تعديلات غير محفوظة في هذه الفاتورة. هل تريد الرجوع وفقدان البيانات المدخلة؟"
        confirmLabel="مغادرة دون حفظ"
        cancelLabel="البقاء في الفاتورة"
        isDestructive
      />

      {/* Void Invoice Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!invoiceToVoid}
        onClose={() => setInvoiceToVoid(null)}
        onConfirm={handleConfirmVoid}
        title="إلغاء الفاتورة"
        message={
          invoiceToVoid
            ? `سيتم إلغاء الفاتورة ${invoiceToVoid.number} وإرجاع الكمية إلى المخزن. لا يمكن التراجع.`
            : ''
        }
        confirmLabel="إلغاء الفاتورة"
        cancelLabel="رجوع"
        isDestructive
        isLoading={voiding}
      >
        <Input
          label="سبب الإلغاء (اختياري)"
          placeholder="مثال: خطأ في الكمية أو ألغى العميل الطلب"
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
        />
      </ConfirmDialog>

      {/* Official Print Preview Modal (A4 RTL #printable-section unchanged) */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false);
          setInvoiceToPrint(null);
        }}
        title="معاينة طباعة الفاتورة (RTL)"
        maxWidth="xl"
      >
        {invoiceToPrint && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-[var(--color-primary-soft)] border border-[var(--color-primary)] rounded-[var(--radius-control)] text-[14px] text-[var(--color-primary-strong)]">
              <span>فاتورة رسمية منسقة للطباعة باللغة العربية A4.</span>
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
                  <h1 className="text-[20px] font-bold text-[var(--color-ink)]">
                    {office?.name || 'مكتب المستلزمات الطبية'}
                  </h1>
                  <p className="text-[14px] text-[var(--color-muted)] mt-1">
                    الجمهورية العراقية - {office?.city || 'بغداد'} | هاتف:{' '}
                    <span className="num-tabular">{office?.phone || '07701234567'}</span>
                  </p>
                </div>
                <div className="text-left text-[14px]">
                  <div className="font-bold text-[var(--color-ink)]">
                    {invoiceToPrint.kind === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء'}
                  </div>
                  <div className="font-bold text-[var(--color-primary-strong)] mt-0.5 num-tabular">
                    رقم: {invoiceToPrint.number}
                  </div>
                  <div className="text-[var(--color-muted)] mt-0.5 num-tabular">
                    التاريخ: {new Date(invoiceToPrint.date).toLocaleDateString('ar-IQ')}
                  </div>
                </div>
              </div>

              {invoiceToPrint.status === 'void' && (
                <div className="p-3 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] text-[var(--color-danger-ink)] font-bold text-center text-[15px] rounded-[var(--radius-control)]">
                  *** فاتورة ملغاة محاسبياً ***
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 p-3 bg-[var(--color-surface-subtle)] border border-[var(--color-line)] rounded-[var(--radius-control)] text-[14px]">
                <div>
                  <span className="text-[var(--color-muted)] block">
                    {invoiceToPrint.kind === 'sale' ? 'العميل / المشتري:' : 'المورد:'}
                  </span>
                  <span className="font-bold text-[var(--color-ink)]">
                    {getPartyName(invoiceToPrint.partyId)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-muted)] block">طريقة السداد:</span>
                  <span className="font-bold text-[var(--color-ink)]">
                    {invoiceToPrint.paymentMethod === 'cash'
                      ? 'نقدي'
                      : invoiceToPrint.paymentMethod === 'transfer'
                      ? 'تحويل مصرفي'
                      : 'آجل'}
                  </span>
                </div>
              </div>

              <table className="w-full text-right text-[14px] border border-[var(--color-line)]">
                <thead className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] font-bold">
                  <tr>
                    <th scope="col" className="p-2.5 border-l border-[var(--color-line)]">
                      ت
                    </th>
                    <th scope="col" className="p-2.5 border-l border-[var(--color-line)]">
                      المادة الطبية
                    </th>
                    <th scope="col" className="p-2.5 border-l border-[var(--color-line)] text-center">
                      الكمية
                    </th>
                    <th scope="col" className="p-2.5 border-l border-[var(--color-line)] text-left">
                      سعر الوحدة (د.ع)
                    </th>
                    <th scope="col" className="p-2.5 text-left">
                      المجموع (د.ع)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]">
                  {invoiceToPrint.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 border-l border-[var(--color-line)] text-center num-tabular">
                        {idx + 1}
                      </td>
                      <td className="p-2.5 border-l border-[var(--color-line)] font-medium">
                        {products.find((p) => p.id === l.productId)?.name || l.productId}
                      </td>
                      <td className="p-2.5 border-l border-[var(--color-line)] text-center num-tabular">
                        {l.quantity}
                      </td>
                      <td className="p-2.5 border-l border-[var(--color-line)] text-left num-tabular">
                        {formatWesternInt(l.unitPrice)}
                      </td>
                      <td className="p-2.5 text-left font-bold num-tabular">
                        {formatWesternInt(l.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-2">
                <div className="text-[14px] text-[var(--color-muted)] max-w-sm">
                  {invoiceToPrint.notes && (
                    <p className="bg-[var(--color-surface-subtle)] p-2.5 rounded-[var(--radius-control)] border border-[var(--color-line)]">
                      <strong>ملاحظات:</strong> {invoiceToPrint.notes}
                    </p>
                  )}
                </div>

                <div className="w-full sm:w-64 space-y-1.5 text-[14px] border border-[var(--color-line)] p-3 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)]">
                  <div className="flex justify-between text-[var(--color-ink)]">
                    <span>المجموع الفرعي:</span>
                    <span className="num-tabular">
                      {formatWesternInt(invoiceToPrint.total + (invoiceToPrint.discount || 0))} د.ع
                    </span>
                  </div>
                  {invoiceToPrint.discount > 0 && (
                    <div className="flex justify-between text-[var(--color-danger-ink)]">
                      <span>خصم الفاتورة:</span>
                      <span className="num-tabular">
                        - {formatWesternInt(invoiceToPrint.discount)} د.ع
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-[var(--color-ink)] font-bold text-[15px] border-t border-[var(--color-line)] pt-1.5">
                    <span>الصافي الإجمالي:</span>
                    <span className="num-tabular">
                      {formatWesternInt(invoiceToPrint.total)} د.ع
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-[var(--color-line)] flex flex-wrap justify-between gap-4 text-[14px] text-[var(--color-muted)]">
                <div>منظم الفاتورة: {user?.name}</div>
                <div>توقيع المستلم: ___________________</div>
                <div>ختم المكتب: ___________________</div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsPrintModalOpen(false);
                  setInvoiceToPrint(null);
                }}
              >
                {AR_STRINGS.common.back}
              </Button>
              <Button
                variant="primary"
                onClick={() => window.print()}
                leftIcon={<Printer className="w-5 h-5" strokeWidth={1.75} />}
              >
                طباعة الفاتورة
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
